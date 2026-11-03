import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { libreOfficeAdapter } from './libreoffice.adapter.js';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('WordToPdfService');

export interface WordToPdfOptions {
  engine?: 'auto' | 'native' | 'libreoffice';
  author?: string;
  title?: string;
  [key: string]: unknown;
}

export interface WordToPdfResult {
  outputPath: string;
  fileSize: number;
  pageCount: number;
  paragraphCount: number;
  tableCount: number;
  imageCount: number;
  engineUsed: string;
  durationMs: number;
}

interface ParsedRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSizePt?: number;
  colorHex?: string;
  fontFamily?: string;
  isPageBreak?: boolean;
}

interface ParsedDrawing {
  imageBuffer: Buffer;
  widthPt: number;
  heightPt: number;
  alignment: 'left' | 'center' | 'right';
}

interface ParsedParagraph {
  type: 'paragraph';
  style?: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  indentLeftPt: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  pageBreakBefore?: boolean;
  runs: ParsedRun[];
  drawings: ParsedDrawing[];
}

interface ParsedTableCell {
  text: string;
  bold?: boolean;
  backgroundColorHex?: string;
  widthPt?: number;
}

interface ParsedTable {
  type: 'table';
  colWidthsPt: number[];
  rows: ParsedTableCell[][];
  indentPt: number;
  alignment: 'left' | 'center' | 'right';
}

type ParsedBlock = ParsedParagraph | ParsedTable;

interface PageSettings {
  widthPt: number;
  heightPt: number;
  isLandscape: boolean;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  headerText?: string;
  footerText?: string;
}

export class WordToPdfService {
  /**
   * Converts a Word document (.docx or .doc) into a high-fidelity PDF document.
   * Employs headless LibreOffice if available on the system, and seamlessly
   * falls back to our dedicated native OpenXML/PDFKit rendering engine.
   */
  public async convert(
    inputPath: string,
    outputPath: string,
    options: WordToPdfOptions = {}
  ): Promise<WordToPdfResult> {
    const startTime = Date.now();
    const ext = path.extname(inputPath).toLowerCase();

    if (!fsSync.existsSync(inputPath)) {
      throw new ValidationError(`Source Word document not found at: ${inputPath}`);
    }

    const inputStats = await fs.stat(inputPath);
    if (inputStats.size === 0) {
      throw new ValidationError('Source Word document is empty (0 bytes).');
    }

    const preferEngine = options.engine || 'auto';
    const isLibreOfficeAvailable = await libreOfficeAdapter.isAvailable();

    // 1. If LibreOffice is preferred or available in the runtime environment
    if (
      (preferEngine === 'libreoffice' && isLibreOfficeAvailable) ||
      (preferEngine === 'auto' && isLibreOfficeAvailable)
    ) {
      logger.info('Executing Word-to-PDF via LibreOffice engine', { inputPath, outputPath });
      try {
        const loResult = await libreOfficeAdapter.convert(
          inputPath,
          outputPath,
          ext.replace('.', ''),
          'pdf',
          options
        );
        const pdfBytes = await fs.readFile(outputPath);
        const pdfLibDoc = await PDFLibDocument.load(pdfBytes);

        return {
          outputPath,
          fileSize: loResult.fileSize,
          pageCount: pdfLibDoc.getPageCount(),
          paragraphCount: 0,
          tableCount: 0,
          imageCount: 0,
          engineUsed: 'LibreOfficeHeadlessEngine',
          durationMs: Date.now() - startTime
        };
      } catch (loErr) {
        logger.warn('LibreOffice conversion failed, falling back to Native engine', { loErr });
        if (ext === '.doc') {
          // Attempt legacy text extraction fallback
          return this.convertLegacyDocNatively(inputPath, outputPath, startTime);
        }
        return this.convertDocxNatively(inputPath, outputPath, options, startTime);
      }
    }

    // 2. Legacy .doc in environment without LibreOffice
    if (ext === '.doc') {
      return this.convertLegacyDocNatively(inputPath, outputPath, startTime);
    }

    // 3. Modern .docx using Native OpenXML Rendering Engine
    return this.convertDocxNatively(inputPath, outputPath, options, startTime);
  }

  /**
   * High-fidelity native DOCX-to-PDF converter.
   * Parses the OpenXML package and renders directly using PDFKit and Sharp.
   */
  private async convertDocxNatively(
    inputPath: string,
    outputPath: string,
    options: WordToPdfOptions,
    startTime: number
  ): Promise<WordToPdfResult> {
    logger.info('Executing Native OpenXML Word-to-PDF conversion', { inputPath, outputPath });

    const docxBuffer = await fs.readFile(inputPath);

    // Check if it is a password-protected/encrypted DOCX (stored as an OLE Compound File)
    const headHex = docxBuffer.subarray(0, 8).toString('hex');
    if (headHex === 'd0cf11e0a1b11ae1') {
      throw new ValidationError(
        'This Word document is password-protected or encrypted. Please remove password protection before converting to PDF.'
      );
    }

    let directory: unzipper.CentralDirectory;
    try {
      directory = await unzipper.Open.buffer(docxBuffer);
    } catch (zipErr) {
      throw new ValidationError(`Input file is not a valid OpenXML DOCX archive: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`);
    }

    // 1. Parse Relationships (word/_rels/document.xml.rels)
    const relsMap = new Map<string, string>();
    const relsEntry = directory.files.find((f) => f.path.replace(/\\/g, '/') === 'word/_rels/document.xml.rels');
    if (relsEntry) {
      const relsXml = (await relsEntry.buffer()).toString('utf8');
      const relRegex = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g;
      let rm: RegExpExecArray | null;
      while ((rm = relRegex.exec(relsXml)) !== null) {
        let target = rm[2].replace(/\\/g, '/');
        if (!target.startsWith('word/') && !target.startsWith('/')) {
          target = `word/${target}`;
        }
        relsMap.set(rm[1], target);
      }
    }

    // 2. Extract Embedded Media (word/media/*)
    const mediaMap = new Map<string, Buffer>();
    for (const file of directory.files) {
      const normalizedPath = file.path.replace(/\\/g, '/');
      if (normalizedPath.startsWith('word/media/')) {
        mediaMap.set(normalizedPath, await file.buffer());
      }
    }

    // 3. Extract Headers & Footers
    let headerText = '';
    let footerText = '';
    for (const [rId, target] of relsMap.entries()) {
      if (target.includes('header')) {
        const hEntry = directory.files.find((f) => f.path.replace(/\\/g, '/') === target);
        if (hEntry) {
          const hXml = (await hEntry.buffer()).toString('utf8');
          const tMatches = hXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
          const text = tMatches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ').trim();
          if (text) headerText = text;
        }
      } else if (target.includes('footer')) {
        const fEntry = directory.files.find((f) => f.path.replace(/\\/g, '/') === target);
        if (fEntry) {
          const fXml = (await fEntry.buffer()).toString('utf8');
          const tMatches = fXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
          const text = tMatches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ').trim();
          if (text) footerText = text;
        }
      }
    }

    // 4. Extract word/document.xml
    const docEntry = directory.files.find((f) => f.path.replace(/\\/g, '/') === 'word/document.xml');
    if (!docEntry) {
      throw new ValidationError('Malformed DOCX file: missing word/document.xml');
    }
    const docXml = (await docEntry.buffer()).toString('utf8');

    // 5. Parse Page Geometry & Margins (<w:sectPr>)
    const pageSettings = this.parseSectionProperties(docXml, headerText, footerText);

    // 6. Parse Document Body Blocks (Paragraphs & Tables in sequence)
    const blocks = await this.parseDocumentBlocks(docXml, relsMap, mediaMap);

    // 7. Render to PDF via PDFKit
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const { pageCount, paragraphCount, tableCount, imageCount } = await this.renderPdfDocument(
      blocks,
      pageSettings,
      outputPath,
      options
    );

    const outStats = await fs.stat(outputPath);
    const durationMs = Date.now() - startTime;

    logger.info('Native Word-to-PDF conversion completed successfully', {
      outputPath,
      fileSize: outStats.size,
      pageCount,
      durationMs
    });

    return {
      outputPath,
      fileSize: outStats.size,
      pageCount,
      paragraphCount,
      tableCount,
      imageCount,
      engineUsed: 'NativeWordToPdfEngine',
      durationMs
    };
  }

  /**
   * Fallback for legacy .doc (Word 97-2003) when LibreOffice is not installed.
   * Extracts text, sections, and paragraphs and produces a clean PDF.
   */
  private async convertLegacyDocNatively(
    inputPath: string,
    outputPath: string,
    startTime: number
  ): Promise<WordToPdfResult> {
    logger.info('Processing legacy .doc file using native structural text extractor', { inputPath });
    const buffer = await fs.readFile(inputPath);

    // Check if it's an RTF file named .doc
    const head = buffer.subarray(0, 10).toString('utf8');
    let text = '';

    if (head.startsWith('{\\rtf')) {
      // Clean RTF markup to plain text
      const rtfStr = buffer.toString('utf8');
      text = rtfStr
        .replace(/\\par[d]?/g, '\n')
        .replace(/\\line/g, '\n')
        .replace(/\\[a-zA-Z0-9\-]+/g, '')
        .replace(/[{}]/g, '')
        .trim();
    } else {
      // Binary Compound Document / WordDocument stream: extract UTF-16LE and ASCII text runs
      const str16 = buffer.toString('utf16le');
      const str8 = buffer.toString('utf8');

      // Filter meaningful text blocks (>= 4 alphabetic characters)
      const runs16 = str16.match(/[\x20-\x7E\s]{4,}/g) || [];
      const runs8 = str8.match(/[\x20-\x7E\s]{4,}/g) || [];

      const combined = runs16.length > runs8.length ? runs16.join('\n') : runs8.join('\n');
      text = combined
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    if (!text || text.length < 5) {
      throw new ValidationError(
        'The legacy .doc file contains no readable text, is password-protected/encrypted, or is corrupted. Please remove password protection or convert it to modern .docx format.'
      );
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    const doc = new PDFDocument({
      size: [595.28, 841.89],
      margins: { top: 54, right: 54, bottom: 54, left: 54 },
      bufferPages: true
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const writeStream = fsSync.createWriteStream(outputPath);
    doc.pipe(writeStream);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0F172A').text(path.basename(inputPath, '.doc'), { align: 'left' });
    doc.moveDown(0.8);

    let paraCount = 0;
    for (const line of lines) {
      if (doc.y > 841.89 - 54 - 30) {
        doc.addPage();
      }
      doc.font('Helvetica').fontSize(11).fillColor('#334155').text(line, {
        align: 'left',
        lineGap: 3
      });
      doc.moveDown(0.3);
      paraCount++;
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    const outStats = await fs.stat(outputPath);
    const pdfLibDoc = await PDFLibDocument.load(await fs.readFile(outputPath));

    return {
      outputPath,
      fileSize: outStats.size,
      pageCount: pdfLibDoc.getPageCount(),
      paragraphCount: paraCount,
      tableCount: 0,
      imageCount: 0,
      engineUsed: 'NativeLegacyDocEngine',
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Parses page geometry, orientation, and margins from OpenXML section properties.
   */
  private parseSectionProperties(docXml: string, headerText?: string, footerText?: string): PageSettings {
    const sectMatch = /<w:sectPr[^>]*>([\s\S]*?)<\/w:sectPr>/.exec(docXml);
    let widthPt = 595.28; // Standard A4 portrait
    let heightPt = 841.89;
    let isLandscape = false;
    let margins = { top: 54, right: 54, bottom: 54, left: 54 };

    if (sectMatch) {
      const sXml = sectMatch[1];
      const pgSzMatch = /<w:pgSz\s+([^>]*)\/?>/.exec(sXml);
      if (pgSzMatch) {
        const attrs = pgSzMatch[1];
        const wDxa = Number(this.extractAttr(attrs, 'w:w')) || 11906;
        const hDxa = Number(this.extractAttr(attrs, 'w:h')) || 16838;
        const orient = this.extractAttr(attrs, 'w:orient');
        const rawW = Math.round((wDxa / 20) * 10) / 10;
        const rawH = Math.round((hDxa / 20) * 10) / 10;
        isLandscape = orient === 'landscape' || rawW > rawH;
        widthPt = Math.min(rawW, rawH);
        heightPt = Math.max(rawW, rawH);
      }

      const pgMarMatch = /<w:pgMar\s+([^>]*)\/?>/.exec(sXml);
      if (pgMarMatch) {
        const attrs = pgMarMatch[1];
        const topDxa = Number(this.extractAttr(attrs, 'w:top')) || 1080;
        const rightDxa = Number(this.extractAttr(attrs, 'w:right')) || 1080;
        const bottomDxa = Number(this.extractAttr(attrs, 'w:bottom')) || 1080;
        const leftDxa = Number(this.extractAttr(attrs, 'w:left')) || 1080;

        margins = {
          top: Math.max(24, Math.round(topDxa / 20)),
          right: Math.max(24, Math.round(rightDxa / 20)),
          bottom: Math.max(24, Math.round(bottomDxa / 20)),
          left: Math.max(24, Math.round(leftDxa / 20))
        };
      }
    }

    return {
      widthPt,
      heightPt,
      isLandscape,
      margins,
      headerText,
      footerText
    };
  }

  /**
   * Sequentially parses top-level children of <w:body> into typed paragraph and table blocks.
   */
  private async parseDocumentBlocks(
    docXml: string,
    relsMap: Map<string, string>,
    mediaMap: Map<string, Buffer>
  ): Promise<ParsedBlock[]> {
    const bodyMatch = /<w:body[^>]*>([\s\S]*?)<\/w:body>/.exec(docXml);
    if (!bodyMatch) {
      throw new ValidationError('Malformed OpenXML DOCX: missing <w:body> tag.');
    }

    const bodyXml = bodyMatch[1];
    const blocks: ParsedBlock[] = [];
    let pos = 0;

    while (pos < bodyXml.length) {
      const nextP = bodyXml.indexOf('<w:p', pos);
      const nextTbl = bodyXml.indexOf('<w:tbl', pos);
      const nextSect = bodyXml.indexOf('<w:sectPr', pos);

      const candidates = [
        { type: 'p', idx: nextP },
        { type: 'tbl', idx: nextTbl },
        { type: 'sectPr', idx: nextSect }
      ].filter((c) => c.idx !== -1).sort((a, b) => a.idx - b.idx);

      if (candidates.length === 0) break;
      const first = candidates[0];

      if (first.type === 'sectPr') {
        // Section properties reached
        break;
      }

      const extracted = this.extractMatchingTag(bodyXml, first.idx, first.type);
      if (!extracted) {
        pos = first.idx + 1;
        continue;
      }

      if (first.type === 'p') {
        const para = await this.parseParagraph(extracted.content, relsMap, mediaMap);
        if (para) blocks.push(para);
      } else if (first.type === 'tbl') {
        const table = this.parseTable(extracted.content);
        if (table) blocks.push(table);
      }

      pos = extracted.endIdx;
    }

    return blocks;
  }

  /**
   * Parses a single <w:p> element.
   */
  private async parseParagraph(
    pXml: string,
    relsMap: Map<string, string>,
    mediaMap: Map<string, Buffer>
  ): Promise<ParsedParagraph | null> {
    // 1. Paragraph properties
    const pPrMatch = /<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/.exec(pXml);
    const pPrXml = pPrMatch ? pPrMatch[1] : '';

    let alignment: 'left' | 'center' | 'right' | 'justify' = 'left';
    const jcVal = this.extractAttr(pPrXml, 'w:val', 'w:jc');
    if (jcVal === 'center') alignment = 'center';
    else if (jcVal === 'right') alignment = 'right';
    else if (jcVal === 'both') alignment = 'justify';

    let indentLeftPt = 0;
    const indLeftVal = this.extractAttr(pPrXml, 'w:left', 'w:ind');
    if (indLeftVal) {
      indentLeftPt = Math.round(Number(indLeftVal) / 20);
    }

    let spaceBeforePt = 0;
    let spaceAfterPt = 3;
    const beforeVal = this.extractAttr(pPrXml, 'w:before', 'w:spacing');
    if (beforeVal) spaceBeforePt = Math.round(Number(beforeVal) / 20);
    const afterVal = this.extractAttr(pPrXml, 'w:after', 'w:spacing');
    if (afterVal) spaceAfterPt = Math.round(Number(afterVal) / 20);

    const styleVal = this.extractAttr(pPrXml, 'w:val', 'w:pStyle') || undefined;
    const pageBreakBefore = pPrXml.includes('<w:pageBreakBefore/>');

    // 2. Extract Drawings / Images
    const drawings: ParsedDrawing[] = [];
    const drawingRegex = /<w:drawing[\s>][\s\S]*?<\/w:drawing>/g;
    let dm: RegExpExecArray | null;
    while ((dm = drawingRegex.exec(pXml)) !== null) {
      const dXml = dm[0];
      const blipMatch = /<a:blip[^>]*r:embed="([^"]*)"/.exec(dXml);
      const extentMatch = /<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(dXml);

      if (blipMatch) {
        const rId = blipMatch[1];
        const target = relsMap.get(rId);
        const rawBuffer = target ? mediaMap.get(target) : null;

        if (rawBuffer && rawBuffer.length > 0) {
          let widthPt = 200;
          let heightPt = 150;
          if (extentMatch) {
            widthPt = Math.round(Number(extentMatch[1]) / 12700);
            heightPt = Math.round(Number(extentMatch[2]) / 12700);
          }

          // Normalize image through sharp to ensure PDFKit compatibility
          let normalizedBuffer: Buffer | null = null;
          try {
            if (rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8) {
              normalizedBuffer = rawBuffer;
            } else {
              normalizedBuffer = await sharp(rawBuffer).jpeg({ quality: 95 }).toBuffer();
            }
          } catch {
            try {
              normalizedBuffer = await sharp(rawBuffer).png().toBuffer();
            } catch (sharpErr) {
              logger.warn('Failed to parse embedded image with sharp, skipping image', { sharpErr });
            }
          }

          if (normalizedBuffer) {
            drawings.push({
              imageBuffer: normalizedBuffer,
              widthPt,
              heightPt,
              alignment: alignment === 'justify' ? 'left' : alignment
            });
          }
        }
      }
    }

    // 3. Extract Runs
    const runs: ParsedRun[] = [];
    const runRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
    let rm: RegExpExecArray | null;

    while ((rm = runRegex.exec(pXml)) !== null) {
      const rXml = rm[0];

      if (rXml.includes('<w:br w:type="page"/>')) {
        runs.push({ text: '', isPageBreak: true });
        continue;
      }

      const tMatch = /<w:t[^>]*>([\s\S]*?)<\/w:t>/.exec(rXml);
      if (!tMatch) continue;

      const rawText = tMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

      if (!rawText && !rXml.includes('<w:drawing')) continue;

      const rPrMatch = /<w:rPr[^>]*>([\s\S]*?)<\/w:rPr>/.exec(rXml);
      const rPrXml = rPrMatch ? rPrMatch[1] : '';

      const bold = /<w:b(\s|\/|>)/.test(rPrXml) || (styleVal && styleVal.startsWith('Heading'));
      const italic = /<w:i(\s|\/|>)/.test(rPrXml);
      const underline = /<w:u(\s|\/|>)/.test(rPrXml);

      let fontSizePt = 11;
      const szVal = this.extractAttr(rPrXml, 'w:val', 'w:sz');
      if (szVal) {
        fontSizePt = Number(szVal) / 2;
      } else if (styleVal === 'Heading1') {
        fontSizePt = 18;
      } else if (styleVal === 'Heading2') {
        fontSizePt = 14;
      } else if (styleVal === 'Heading3') {
        fontSizePt = 12;
      }

      const colorVal = this.extractAttr(rPrXml, 'w:val', 'w:color');
      const colorHex = colorVal ? `#${colorVal}` : undefined;
      const fontName = this.extractAttr(rPrXml, 'w:ascii', 'w:rFonts') || undefined;

      runs.push({
        text: rawText,
        bold: !!bold,
        italic: !!italic,
        underline: !!underline,
        fontSizePt,
        colorHex,
        fontFamily: fontName
      });
    }

    if (runs.length === 0 && drawings.length === 0 && !pageBreakBefore) {
      return null;
    }

    return {
      type: 'paragraph',
      style: styleVal,
      alignment,
      indentLeftPt,
      spaceBeforePt,
      spaceAfterPt,
      pageBreakBefore,
      runs,
      drawings
    };
  }

  /**
   * Parses a single <w:tbl> element.
   */
  private parseTable(tblXml: string): ParsedTable | null {
    // 1. Grid column widths
    const colWidthsPt: number[] = [];
    const gridRegex = /<w:gridCol[^>]*w:w="(\d+)"/g;
    let gm: RegExpExecArray | null;
    while ((gm = gridRegex.exec(tblXml)) !== null) {
      colWidthsPt.push(Math.round(Number(gm[1]) / 20));
    }

    // 2. Table properties
    let indentPt = 0;
    const indMatch = /<w:tblInd[^>]*w:w="(\d+)"/.exec(tblXml);
    if (indMatch) {
      indentPt = Math.round(Number(indMatch[1]) / 20);
    }

    let alignment: 'left' | 'center' | 'right' = 'left';
    const jcMatch = /<w:tblPr[\s\S]*?<w:jc[^>]*w:val="([^"]*)"/.exec(tblXml);
    if (jcMatch) {
      const val = jcMatch[1].toLowerCase();
      if (val === 'center') alignment = 'center';
      else if (val === 'right') alignment = 'right';
    }

    // 3. Rows & Cells
    const rows: ParsedTableCell[][] = [];
    const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
    let rm: RegExpExecArray | null;

    while ((rm = rowRegex.exec(tblXml)) !== null) {
      const trXml = rm[0];
      const cells: ParsedTableCell[] = [];
      const cellRegex = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
      let cm: RegExpExecArray | null;

      while ((cm = cellRegex.exec(trXml)) !== null) {
        const tcXml = cm[0];

        // Background color / Shading
        let backgroundColorHex: string | undefined;
        const shdMatch = /<w:shd[^>]*w:fill="([A-Fa-f0-9]{6})"/.exec(tcXml);
        if (shdMatch && shdMatch[1].toUpperCase() !== 'AUTO') {
          backgroundColorHex = `#${shdMatch[1]}`;
        }

        // Cell width
        let widthPt: number | undefined;
        const wMatch = /<w:tcW[^>]*w:w="(\d+)"/.exec(tcXml);
        if (wMatch) {
          widthPt = Math.round(Number(wMatch[1]) / 20);
        }

        // Text content
        const textMatches = tcXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
        const text = textMatches
          .map((m) =>
            m
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
          )
          .join(' ')
          .trim();

        const bold = /<w:b(\s|\/|>)/.test(tcXml);

        cells.push({
          text,
          bold,
          backgroundColorHex,
          widthPt
        });
      }

      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) return null;

    return {
      type: 'table',
      colWidthsPt,
      rows,
      indentPt,
      alignment
    };
  }

  /**
   * Renders parsed OpenXML blocks into a high-fidelity PDF via PDFKit.
   */
  private async renderPdfDocument(
    blocks: ParsedBlock[],
    pageSettings: PageSettings,
    outputPath: string,
    options: WordToPdfOptions
  ): Promise<{ pageCount: number; paragraphCount: number; tableCount: number; imageCount: number }> {
    const { widthPt, heightPt, isLandscape, margins, headerText, footerText } = pageSettings;
    const usableWidth = widthPt - margins.left - margins.right;

    const doc = new PDFDocument({
      size: [widthPt, heightPt],
      layout: isLandscape ? 'landscape' : 'portrait',
      margins,
      bufferPages: true,
      info: {
        Title: options.title || 'DocuSuite Converted Document',
        Author: options.author || 'DocuSuite Precision Engine'
      }
    });

    const writeStream = fsSync.createWriteStream(outputPath);
    doc.pipe(writeStream);

    let paragraphCount = 0;
    let tableCount = 0;
    let imageCount = 0;

    for (const block of blocks) {
      if (block.type === 'paragraph') {
        if (block.pageBreakBefore) {
          doc.addPage();
        }

        if (block.spaceBeforePt > 0) {
          doc.moveDown(Math.min(2.0, block.spaceBeforePt / 12));
        }

        // 1. Render inline images
        for (const drawing of block.drawings) {
          let imgW = drawing.widthPt;
          let imgH = drawing.heightPt;

          if (imgW > usableWidth) {
            const scale = usableWidth / imgW;
            imgW = usableWidth;
            imgH = Math.round(imgH * scale);
          }

          if (doc.y + imgH > heightPt - margins.bottom) {
            doc.addPage();
          }

          let imgX = margins.left;
          if (drawing.alignment === 'center') {
            imgX = margins.left + (usableWidth - imgW) / 2;
          } else if (drawing.alignment === 'right') {
            imgX = margins.left + usableWidth - imgW;
          }

          try {
            doc.image(drawing.imageBuffer, imgX, doc.y, { width: imgW, height: imgH });
            doc.y += imgH + 8;
            imageCount++;
          } catch (imgErr) {
            logger.warn('Failed to render image in PDFKit, skipping image', { imgErr });
          }
        }

        // 2. Render text runs
        let hasRenderedText = false;
        for (let i = 0; i < block.runs.length; i++) {
          const run = block.runs[i];

          if (run.isPageBreak) {
            doc.addPage();
            continue;
          }

          if (!run.text) continue;
          hasRenderedText = true;

          // Select font
          const font = this.resolveFont(run.fontFamily, run.bold, run.italic);
          const fontSize = run.fontSizePt || 11;
          const color = run.colorHex || '#1E293B';

          doc.font(font).fontSize(fontSize).fillColor(color);

          const isLastRun = i === block.runs.length - 1;
          const align = block.alignment;

          doc.text(run.text, {
            align,
            indent: block.indentLeftPt > 0 ? block.indentLeftPt : undefined,
            lineGap: 2.5,
            underline: run.underline,
            continued: !isLastRun
          });
        }

        if (hasRenderedText) {
          paragraphCount++;
          if (block.spaceAfterPt > 0) {
            doc.moveDown(Math.min(1.5, block.spaceAfterPt / 12));
          } else {
            doc.moveDown(0.3);
          }
        }
      } else if (block.type === 'table') {
        const rows = block.rows;
        if (rows.length === 0) continue;

        tableCount++;
        const colCount = Math.max(...rows.map((r) => r.length), block.colWidthsPt.length || 1);
        const colWidths: number[] = [];

        for (let c = 0; c < colCount; c++) {
          colWidths.push(block.colWidthsPt[c] || Math.floor(usableWidth / colCount));
        }

        // Normalize column widths to fit page width
        const totalW = colWidths.reduce((a, b) => a + b, 0);
        if (totalW > usableWidth || totalW < usableWidth * 0.5) {
          const scale = usableWidth / (totalW || 1);
          for (let c = 0; c < colWidths.length; c++) {
            colWidths[c] = Math.floor(colWidths[c] * scale);
          }
        }

        const tableStartX = Math.max(margins.left, margins.left + (block.indentPt || 0));

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const isHeader = rIdx === 0;

          // Calculate dynamic row height based on cell text lengths
          let rowH = 22;
          for (let c = 0; c < row.length; c++) {
            const cell = row[c];
            const cWidth = colWidths[c] || 100;
            const textLen = (cell.text || '').length;
            const approxLines = Math.max(1, Math.ceil(textLen / Math.max(1, Math.floor((cWidth - 14) / 6.5))));
            rowH = Math.max(rowH, approxLines * 13 + 12);
          }

          if (doc.y + rowH > heightPt - margins.bottom) {
            doc.addPage();
          }

          let currentX = tableStartX;
          const currentY = doc.y;

          for (let c = 0; c < colCount; c++) {
            const cell = row[c] || { text: '' };
            const cWidth = colWidths[c] || 100;

            // Cell background
            if (cell.backgroundColorHex) {
              doc.rect(currentX, currentY, cWidth, rowH).fill(cell.backgroundColorHex);
            } else if (isHeader) {
              doc.rect(currentX, currentY, cWidth, rowH).fill('#F1F5F9');
            }

            // Cell border
            doc.rect(currentX, currentY, cWidth, rowH).lineWidth(0.5).strokeColor('#CBD5E1').stroke();

            // Cell text
            const font = isHeader || cell.bold ? 'Helvetica-Bold' : 'Helvetica';
            doc.fillColor('#0F172A').fontSize(9.5).font(font);

            doc.text(cell.text || '', currentX + 6, currentY + 6, {
              width: cWidth - 12,
              height: rowH - 12,
              ellipsis: true
            });

            currentX += cWidth;
          }

          doc.y = currentY + rowH;
        }

        doc.moveDown(0.6);
      }
    }

    // 8. Headers & Footers Pass (Across all buffered pages)
    const range = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const savedBottom = doc.page.margins.bottom;
      const savedTop = doc.page.margins.top;
      doc.page.margins.bottom = 0;
      doc.page.margins.top = 0;

      // Render Header
      if (headerText) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#94A3B8')
          .text(headerText, margins.left, Math.max(16, margins.top / 2), {
            width: usableWidth,
            align: 'center',
            lineBreak: false
          });
      }

      // Render Footer
      if (footerText || totalPages > 1) {
        const footerDisplay = footerText
          ? `${footerText}  |  Page ${i + 1} of ${totalPages}`
          : `Page ${i + 1} of ${totalPages}`;

        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#94A3B8')
          .text(footerDisplay, margins.left, heightPt - Math.max(20, margins.bottom / 1.6), {
            width: usableWidth,
            align: 'center',
            lineBreak: false
          });
      }

      doc.page.margins.bottom = savedBottom;
      doc.page.margins.top = savedTop;
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    return {
      pageCount: totalPages,
      paragraphCount,
      tableCount,
      imageCount
    };
  }

  /**
   * Resolves Word font names into standard PDFKit fonts.
   */
  private resolveFont(fontFamily?: string, bold?: boolean, italic?: boolean): string {
    const name = (fontFamily || '').toLowerCase();

    if (name.includes('times') || name.includes('roman') || name.includes('georgia')) {
      if (bold && italic) return 'Times-BoldItalic';
      if (bold) return 'Times-Bold';
      if (italic) return 'Times-Italic';
      return 'Times-Roman';
    }

    if (name.includes('courier') || name.includes('mono') || name.includes('consolas')) {
      if (bold && italic) return 'Courier-BoldOblique';
      if (bold) return 'Courier-Bold';
      if (italic) return 'Courier-Oblique';
      return 'Courier';
    }

    // Default to Helvetica / Arial / Calibri
    if (bold && italic) return 'Helvetica-BoldOblique';
    if (bold) return 'Helvetica-Bold';
    if (italic) return 'Helvetica-Oblique';
    return 'Helvetica';
  }

  /**
   * Helper to extract an XML attribute value.
   */
  private extractAttr(xml: string, attrName: string, enclosingTag?: string): string | null {
    let targetXml = xml;
    if (enclosingTag) {
      const match = new RegExp(`<${enclosingTag}[^>]*>`).exec(xml);
      if (match) targetXml = match[0];
      else return null;
    }
    const attrMatch = new RegExp(`${attrName}="([^"]*)"`).exec(targetXml);
    return attrMatch ? attrMatch[1] : null;
  }

  /**
   * Helper to extract matching nested XML tags.
   */
  private extractMatchingTag(
    xml: string,
    startIdx: number,
    tag: string
  ): { content: string; endIdx: number } | null {
    const openTag = `<w:${tag}`;
    const closeTag = `</w:${tag}>`;
    let depth = 0;
    let pos = startIdx;

    while (pos < xml.length) {
      const nextOpen = xml.indexOf(openTag, pos);
      const nextClose = xml.indexOf(closeTag, pos);

      if (nextClose === -1) return null;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + openTag.length;
      } else {
        depth--;
        pos = nextClose + closeTag.length;
        if (depth === 0) {
          return {
            content: xml.substring(startIdx, pos),
            endIdx: pos
          };
        }
      }
    }
    return null;
  }
}

export const wordToPdfConverter = new WordToPdfService();
