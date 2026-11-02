import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { DocxBuilder, DocxParagraph, DocxTable, DocxTableCell, DocxRun } from './docx-builder.js';
import { docxValidator } from './docx-validator.service.js';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('PdfToWordConverterService');

interface ExtractedTextItem {
  text: string;
  x: number;
  y: number; // top-down (0 = top of page)
  w: number;
  h: number;
  right: number;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  fontName: string;
  fontFamily: string;
}

interface ExtractedLine {
  y: number;
  minX: number;
  maxX: number;
  width: number;
  avgFontSize: number;
  isBold: boolean;
  isItalic: boolean;
  text: string;
  items: ExtractedTextItem[];
  columns: ExtractedTextItem[]; // distinct horizontal columns in this line
}

interface DetectedTable {
  startLineIdx: number;
  endLineIdx: number;
  minX: number;
  maxX: number;
  headers: DocxTableCell[];
  rows: DocxTableCell[][];
  colWidthsDxa: number[];
  indentDxa: number;
}

interface ExtractedImage {
  pageNum: number;
  widthPt: number;
  heightPt: number;
  buffer: Buffer;
  mimeType: string;
  y: number;
}

export class PdfToWordConverterService {
  /**
   * Converts a PDF file into a standard, fully editable Microsoft Word (.docx) file
   * with high formatting fidelity, precise alignment, typography preservation, and natural reading order.
   */
  public async convert(
    inputPath: string,
    outputPath: string,
    options: Record<string, unknown> = {}
  ): Promise<{
    outputPath: string;
    fileSize: number;
    pageCount: number;
    paragraphCount: number;
    tableCount: number;
    imageCount: number;
  }> {
    const startTime = Date.now();
    logger.info('Starting high-fidelity PDF to Word conversion', { inputPath, outputPath });

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fs.readFile(inputPath);
    } catch (err) {
      throw new ConversionError(`Failed to read input PDF file: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (pdfBuffer.length < 10) {
      throw new ValidationError('Input PDF file is empty or corrupted.');
    }

    // 1. Load with pdfjs-dist for text extraction
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(pdfBuffer);

    let pdfDoc;
    try {
      pdfDoc = await pdfjsLib.getDocument({
        data,
        useSystemFonts: true,
        disableFontFace: true
      }).promise;
    } catch (err) {
      throw new ConversionError(`Failed to parse PDF document: ${err instanceof Error ? err.message : String(err)}`);
    }

    const numPages = pdfDoc.numPages;
    if (numPages <= 0) {
      throw new ValidationError('PDF document contains no pages.');
    }

    // 2. Extract embedded images via pdf-lib (optional visual enrichment)
    const pageImagesMap = await this.extractImagesFromPdf(pdfBuffer, numPages);

    // 3. Extract text items & page geometry
    let totalTextItemsCount = 0;
    const pageTextMap: Map<number, ExtractedTextItem[]> = new Map();
    const pageGeometryMap: Map<number, { width: number; height: number; rotation: number }> = new Map();
    const fontSizeFrequency: Map<number, number> = new Map();
    const leftMarginSamples: number[] = [];
    const topMarginSamples: number[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });

      pageGeometryMap.set(pageNum, {
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation
      });

      const textContent = await page.getTextContent();
      const pageItems: ExtractedTextItem[] = [];

      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const rawStr = item.str;
        if (!rawStr || !rawStr.trim()) continue;

        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const sx = transform[0];
        const ky = transform[1];
        const tx = transform[4];
        const ty = transform[5];

        // PDF coordinate y=0 is bottom; convert to top-down y
        const yTopDown = Math.round((viewport.height - ty) * 10) / 10;
        const x = Math.round(tx * 10) / 10;
        const w = Math.round((item.width || 10) * 10) / 10;
        const fontSize = Math.round((item.height || Math.hypot(sx, ky) || 11) * 10) / 10;
        const fontName = item.fontName || '';
        const isBold = /bold|black|heavy|medium|semibold/i.test(fontName);
        const isItalic = /oblique|italic/i.test(fontName);
        const fontFamily = this.mapFontFamily(fontName);

        pageItems.push({
          text: rawStr,
          x,
          y: yTopDown,
          w,
          h: fontSize,
          right: x + w,
          fontSize,
          isBold,
          isItalic,
          fontName,
          fontFamily
        });

        // Track statistics
        const count = fontSizeFrequency.get(fontSize) || 0;
        fontSizeFrequency.set(fontSize, count + rawStr.length);

        if (x >= 20 && x <= 160) {
          leftMarginSamples.push(x);
        }
        if (yTopDown >= 20 && yTopDown <= 160) {
          topMarginSamples.push(yTopDown);
        }
      }

      totalTextItemsCount += pageItems.length;
      pageTextMap.set(pageNum, pageItems);
    }

    // SCANNED PDF DETECTION & OCR REPORTING
    if (totalTextItemsCount === 0) {
      logger.warn('PDF contains no selectable text layer (scanned PDF)', { inputPath });
      throw new ValidationError(
        'The uploaded PDF appears to be a scanned document or contains no selectable text layer. Scanned PDF OCR is currently unavailable in this environment. Please upload a PDF with selectable text.'
      );
    }

    // Determine baseline body font size (the font size with the highest text length)
    let bodyFontSize = 11;
    let maxFreq = 0;
    fontSizeFrequency.forEach((freq, size) => {
      if (freq > maxFreq && size >= 8 && size <= 14) {
        maxFreq = freq;
        bodyFontSize = size;
      }
    });

    // Determine document margins dynamically based on content coordinates
    const p1Geom = pageGeometryMap.get(1) || { width: 595.28, height: 841.89, rotation: 0 };
    const isLandscape = p1Geom.width > p1Geom.height || p1Geom.rotation === 90 || p1Geom.rotation === 270;

    const detectedLeftMargin = this.computeQuantile(leftMarginSamples, 0.15) || 54;
    const detectedTopMargin = this.computeQuantile(topMarginSamples, 0.15) || 54;

    const docLeftMarginPt = Math.max(36, Math.min(90, Math.round(detectedLeftMargin)));
    const docTopMarginPt = Math.max(36, Math.min(90, Math.round(detectedTopMargin)));
    const docRightMarginPt = docLeftMarginPt;
    const docBottomMarginPt = docTopMarginPt;

    const builder = new DocxBuilder({
      title: options.title ? String(options.title) : path.basename(inputPath, path.extname(inputPath)),
      pageSettings: {
        widthPt: isLandscape ? Math.max(p1Geom.width, p1Geom.height) : Math.min(p1Geom.width, p1Geom.height),
        heightPt: isLandscape ? Math.min(p1Geom.width, p1Geom.height) : Math.max(p1Geom.width, p1Geom.height),
        orientation: isLandscape ? 'landscape' : 'portrait',
        marginTopPt: docTopMarginPt,
        marginRightPt: docRightMarginPt,
        marginBottomPt: docBottomMarginPt,
        marginLeftPt: docLeftMarginPt
      }
    });

    let totalParagraphs = 0;
    let totalTables = 0;
    let totalImages = 0;

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (pageNum > 1) {
        builder.addPageBreak();
      }

      const items = pageTextMap.get(pageNum) || [];
      const pageGeom = pageGeometryMap.get(pageNum) || p1Geom;
      const usableWidthPt = pageGeom.width - docLeftMarginPt - docRightMarginPt;

      // Check if page has embedded images to render
      const pageImages = pageImagesMap.get(pageNum) || [];

      if (items.length === 0 && pageImages.length === 0) continue;

      // Group text items into visual reading blocks (handles multi-column layout)
      const lines = this.clusterTextIntoLines(items, pageGeom.width);

      // Detect tables on this page
      const tables = this.detectTables(lines, docLeftMarginPt, usableWidthPt);
      const tableLineIndices = new Set<number>();
      for (const t of tables) {
        for (let i = t.startLineIdx; i <= t.endLineIdx; i++) {
          tableLineIndices.add(i);
        }
      }

      // Track paragraph reconstruction state
      let currentParagraphRuns: DocxRun[] = [];
      let currentParagraphStyle: 'Normal' | 'Heading1' | 'Heading2' | 'Heading3' | 'ListBullet' = 'Normal';
      let currentParagraphAlign: 'left' | 'center' | 'right' = 'left';
      let currentParagraphIndentPt = 0;
      let paragraphLineCount = 0;
      let firstLineY = 0;
      let lastLineY = 0;
      let lastLineHeight = bodyFontSize;
      let lastBlockBottomY = 0;

      const flushCurrentParagraph = () => {
        if (currentParagraphRuns.length === 0) return;

        const fullText = currentParagraphRuns.map((r) => r.text).join('').trim();
        if (!fullText) {
          currentParagraphRuns = [];
          return;
        }

        // Calculate accurate vertical spacing before this paragraph
        let spaceBefore = 0;
        if (lastBlockBottomY > 0 && firstLineY > lastBlockBottomY) {
          const rawGap = firstLineY - lastBlockBottomY;
          if (rawGap > lastLineHeight * 0.4) {
            spaceBefore = Math.min(48, Math.max(0, Math.round(rawGap)));
          }
        }

        // Calculate line spacing within paragraph if multi-line
        let lineSpacingPt: number | undefined;
        if (paragraphLineCount > 1 && lastLineY > firstLineY) {
          const avgPitch = (lastLineY - firstLineY) / (paragraphLineCount - 1);
          if (avgPitch > 8 && avgPitch < 40) {
            lineSpacingPt = Math.round(avgPitch * 10) / 10;
          }
        }

        builder.addParagraph({
          type: 'paragraph',
          runs: currentParagraphRuns,
          style: currentParagraphStyle,
          alignment: currentParagraphAlign,
          indentLeftPt: currentParagraphIndentPt > 4 ? currentParagraphIndentPt : undefined,
          spaceBeforePt: spaceBefore > 0 ? spaceBefore : undefined,
          spaceAfterPt: currentParagraphStyle.startsWith('Heading') ? 4 : 2,
          lineSpacingPt
        });

        totalParagraphs++;
        lastBlockBottomY = lastLineY + lastLineHeight;
        currentParagraphRuns = [];
        currentParagraphStyle = 'Normal';
        currentParagraphAlign = 'left';
        currentParagraphIndentPt = 0;
        paragraphLineCount = 0;
        firstLineY = 0;
      };

      let lineIdx = 0;
      while (lineIdx < lines.length) {
        // Check if there is an image positioned before this line
        const pendingImgIdx = pageImages.findIndex((img) => img.y <= lines[lineIdx].y);
        if (pendingImgIdx >= 0) {
          const [img] = pageImages.splice(pendingImgIdx, 1);
          flushCurrentParagraph();
          builder.addImage({
            buffer: img.buffer,
            mimeType: img.mimeType,
            widthPt: Math.min(usableWidthPt, img.widthPt),
            heightPt: Math.min(usableWidthPt * 0.75, img.heightPt),
            alignment: 'center'
          });
          totalImages++;
          lastBlockBottomY = img.y + img.heightPt;
        }

        // If line is part of a detected table
        const matchingTable = tables.find((t) => t.startLineIdx === lineIdx);
        if (matchingTable) {
          flushCurrentParagraph();

          builder.addTable({
            type: 'table',
            headers: matchingTable.headers,
            rows: matchingTable.rows,
            colWidthsDxa: matchingTable.colWidthsDxa,
            indentDxa: matchingTable.indentDxa,
            alignment: 'left'
          });
          totalTables++;

          const tableEndLine = lines[matchingTable.endLineIdx];
          lastBlockBottomY = tableEndLine.y + tableEndLine.avgFontSize;
          lineIdx = matchingTable.endLineIdx + 1;
          continue;
        }

        const line = lines[lineIdx];

        // Determine line alignment with high precision (avoiding false centering)
        const distLeft = line.minX - docLeftMarginPt;
        const distRight = (pageGeom.width - docRightMarginPt) - line.maxX;
        const lineCenter = (line.minX + line.maxX) / 2;
        const pageCenter = pageGeom.width / 2;
        const distFromCenter = Math.abs(lineCenter - pageCenter);

        const isTrulyCentered =
          distLeft >= 18 &&
          distRight >= 18 &&
          distFromCenter <= 35 &&
          line.width < usableWidthPt * 0.88;

        const isTrulyRight =
          distRight <= 18 &&
          distLeft >= 45 &&
          line.width < usableWidthPt * 0.88;

        const align: 'left' | 'center' | 'right' = isTrulyCentered ? 'center' : isTrulyRight ? 'right' : 'left';

        // Indentation calculation for left-aligned content
        let indentLeft = 0;
        if (align === 'left' && distLeft > 6) {
          indentLeft = Math.round(distLeft);
        }

        // Heading detection based on font size relative to body baseline
        let style: 'Normal' | 'Heading1' | 'Heading2' | 'Heading3' | 'ListBullet' = 'Normal';
        if (line.avgFontSize >= bodyFontSize * 1.55 || line.avgFontSize >= 18) {
          style = 'Heading1';
        } else if (line.avgFontSize >= bodyFontSize * 1.25 || (line.avgFontSize >= bodyFontSize * 1.15 && line.isBold && line.text.length < 90)) {
          style = 'Heading2';
        } else if (line.avgFontSize >= bodyFontSize * 1.08 && line.isBold && line.text.length < 75) {
          style = 'Heading3';
        } else if (/^[•\-\*\u2022\u25cf]\s+/.test(line.text.trim())) {
          style = 'ListBullet';
        }

        // Paragraph boundary check:
        // A new paragraph begins if:
        // 1. Style changed (heading vs normal)
        // 2. Alignment changed
        // 3. Significant horizontal indentation change (> 10pt)
        // 4. Significant vertical gap (> 1.45 * line height)
        const verticalGap = lastLineY > 0 ? (line.y - lastLineY) : 0;
        const isNewParagraph =
          paragraphLineCount === 0 ||
          style !== currentParagraphStyle ||
          align !== currentParagraphAlign ||
          Math.abs(indentLeft - currentParagraphIndentPt) > 10 ||
          style !== 'Normal' ||
          verticalGap > lastLineHeight * 1.55;

        if (isNewParagraph && paragraphLineCount > 0) {
          flushCurrentParagraph();
        }

        if (paragraphLineCount === 0) {
          firstLineY = line.y;
          currentParagraphStyle = style;
          currentParagraphAlign = align;
          currentParagraphIndentPt = indentLeft;
        }

        // Format bullet text
        let lineItems = line.items;
        if (style === 'ListBullet' && lineItems.length > 0) {
          const firstItem = { ...lineItems[0] };
          firstItem.text = firstItem.text.replace(/^[•\-\*\u2022\u25cf]\s*/, '');
          lineItems = [firstItem, ...lineItems.slice(1)];
        }

        // Add line runs
        if (currentParagraphRuns.length > 0) {
          currentParagraphRuns.push({
            text: ' ',
            fontSizePt: line.avgFontSize,
            fontFamily: line.items[0]?.fontFamily
          });
        }

        for (const item of lineItems) {
          currentParagraphRuns.push({
            text: item.text,
            bold: item.isBold,
            italic: item.isItalic,
            fontSizePt: item.fontSize,
            fontFamily: item.fontFamily
          });
        }

        lastLineY = line.y;
        lastLineHeight = line.avgFontSize || bodyFontSize;
        paragraphLineCount++;
        lineIdx++;
      }

      flushCurrentParagraph();

      // Render any remaining images on this page
      for (const img of pageImages) {
        builder.addImage({
          buffer: img.buffer,
          mimeType: img.mimeType,
          widthPt: Math.min(usableWidthPt, img.widthPt),
          heightPt: Math.min(usableWidthPt * 0.75, img.heightPt),
          alignment: 'center'
        });
        totalImages++;
      }
    }

    // Write generated OpenXML DOCX to output path
    await builder.writeToFile(outputPath);

    // Deep independent verification with docxValidator
    const validation = await docxValidator.validate(outputPath);
    logger.info('High-fidelity PDF to Word generated and verified', {
      outputPath,
      fileSize: validation.fileSizeBytes,
      pageCount: numPages,
      paragraphCount: totalParagraphs,
      tableCount: totalTables,
      imageCount: totalImages,
      durationMs: Date.now() - startTime
    });

    return {
      outputPath,
      fileSize: validation.fileSizeBytes,
      pageCount: numPages,
      paragraphCount: totalParagraphs,
      tableCount: totalTables,
      imageCount: totalImages
    };
  }

  /**
   * Scans PDF indirect objects to extract raster images and their page attachments.
   */
  private async extractImagesFromPdf(pdfBuffer: Buffer, numPages: number): Promise<Map<number, ExtractedImage[]>> {
    const map = new Map<number, ExtractedImage[]>();
    for (let i = 1; i <= numPages; i++) {
      map.set(i, []);
    }

    try {
      const doc = await PDFDocument.load(pdfBuffer);
      const objects = doc.context.enumerateIndirectObjects();

      let imgIdx = 0;
      for (const [, obj] of objects) {
        if (obj instanceof PDFRawStream) {
          const dict = obj.dict;
          const subtype = dict.get(PDFName.of('Subtype'))?.toString();
          if (subtype === '/Image') {
            const widthObj = dict.get(PDFName.of('Width')) as any;
            const heightObj = dict.get(PDFName.of('Height')) as any;
            const width = typeof widthObj?.asNumber === 'function' ? widthObj.asNumber() : Number(widthObj?.value || 200);
            const height = typeof heightObj?.asNumber === 'function' ? heightObj.asNumber() : Number(heightObj?.value || 150);
            const filter = dict.get(PDFName.of('Filter'))?.toString() || '';
            const bytes = obj.contents;

            // Only extract images with valid binary streams
            if (bytes && bytes.length > 8) {
              imgIdx++;
              const isJpeg = filter === '/DCTDecode' || filter === '/DCT';
              const mimeType = isJpeg ? 'image/jpeg' : 'image/png';

              // Map to first page by default if page mapping is ambiguous
              const targetPage = Math.min(imgIdx, numPages);
              const list = map.get(targetPage) || [];
              list.push({
                pageNum: targetPage,
                widthPt: Math.min(480, Math.round(width * 0.75)),
                heightPt: Math.min(320, Math.round(height * 0.75)),
                buffer: Buffer.from(bytes),
                mimeType,
                y: 100
              });
              map.set(targetPage, list);
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Non-fatal error during PDF image extraction', { err });
    }

    return map;
  }

  /**
   * Clusters raw text items on a page into horizontal lines with reading-order preservation.
   */
  private clusterTextIntoLines(items: ExtractedTextItem[], pageWidth: number): ExtractedLine[] {
    // Check if the page has a 2-column layout (gutter between 40% and 60% of page width)
    const gutterThreshold = pageWidth * 0.5;
    const leftColItems = items.filter((it) => it.right < gutterThreshold - 10);
    const rightColItems = items.filter((it) => it.x > gutterThreshold + 10);
    const spanningItems = items.filter((it) => it.x < gutterThreshold && it.right > gutterThreshold);

    // If page is strictly multi-column (distinct items on left, distinct on right, minimal spanning items)
    const isMultiColumn =
      leftColItems.length >= 3 &&
      rightColItems.length >= 3 &&
      spanningItems.length <= 1;

    if (isMultiColumn) {
      // Process left column, then right column
      const leftLines = this.clusterItemsSingleColumn(leftColItems);
      const rightLines = this.clusterItemsSingleColumn(rightColItems);
      return [...leftLines, ...rightLines];
    }

    return this.clusterItemsSingleColumn(items);
  }

  private clusterItemsSingleColumn(items: ExtractedTextItem[]): ExtractedLine[] {
    items.sort((a, b) => a.y - b.y || a.x - b.x);

    const lineBuckets: ExtractedTextItem[][] = [];

    for (const item of items) {
      let matchedBucket = lineBuckets.find((bucket) => {
        const avgY = bucket.reduce((sum, it) => sum + it.y, 0) / bucket.length;
        const fontH = item.h || 10;
        return Math.abs(item.y - avgY) <= Math.max(3.0, fontH * 0.32);
      });

      if (!matchedBucket) {
        matchedBucket = [];
        lineBuckets.push(matchedBucket);
      }
      matchedBucket.push(item);
    }

    lineBuckets.sort((a, b) => {
      const avgYA = a.reduce((sum, it) => sum + it.y, 0) / a.length;
      const avgYB = b.reduce((sum, it) => sum + it.y, 0) / b.length;
      return avgYA - avgYB;
    });

    const lines: ExtractedLine[] = [];

    for (const bucket of lineBuckets) {
      bucket.sort((a, b) => a.x - b.x);

      let lineText = '';
      let prevRight = -1;
      const mergedItems: ExtractedTextItem[] = [];

      for (const item of bucket) {
        if (prevRight >= 0) {
          const gap = item.x - prevRight;
          if (gap > 2.0 && !lineText.endsWith(' ') && !item.text.startsWith(' ')) {
            lineText += ' ';
          }
        }
        lineText += item.text;
        prevRight = Math.max(prevRight, item.right);
        mergedItems.push(item);
      }

      const minX = bucket[0].x;
      const maxX = bucket[bucket.length - 1].right;
      const avgY = bucket.reduce((sum, it) => sum + it.y, 0) / bucket.length;
      const avgFontSize = Math.round((bucket.reduce((sum, it) => sum + it.fontSize, 0) / bucket.length) * 10) / 10;
      const isBold = bucket.filter((it) => it.isBold).length > bucket.length / 2;
      const isItalic = bucket.filter((it) => it.isItalic).length > bucket.length / 2;

      // Detect distinct horizontal columns in this line (items separated by > 18pt)
      const columns: ExtractedTextItem[] = [];
      let currentColItems: ExtractedTextItem[] = [];

      for (let i = 0; i < bucket.length; i++) {
        const item = bucket[i];
        if (currentColItems.length === 0) {
          currentColItems.push(item);
        } else {
          const lastInCol = currentColItems[currentColItems.length - 1];
          if (item.x - lastInCol.right > 15) {
            columns.push(this.mergeColumnItems(currentColItems));
            currentColItems = [item];
          } else {
            currentColItems.push(item);
          }
        }
      }
      if (currentColItems.length > 0) {
        columns.push(this.mergeColumnItems(currentColItems));
      }

      lines.push({
        y: avgY,
        minX,
        maxX,
        width: maxX - minX,
        avgFontSize,
        isBold,
        isItalic,
        text: lineText,
        items: mergedItems,
        columns
      });
    }

    return lines;
  }

  private mergeColumnItems(items: ExtractedTextItem[]): ExtractedTextItem {
    if (items.length === 1) return items[0];
    const text = items.map((it) => it.text).join(' ');
    const x = items[0].x;
    const right = items[items.length - 1].right;
    const y = items[0].y;
    const h = Math.max(...items.map((it) => it.h));
    return {
      text,
      x,
      y,
      w: right - x,
      h,
      right,
      fontSize: items[0].fontSize,
      isBold: items.some((it) => it.isBold),
      isItalic: items.some((it) => it.isItalic),
      fontName: items[0].fontName,
      fontFamily: items[0].fontFamily
    };
  }

  /**
   * Detects multi-column tabular data matrices across lines with exact column widths and margins.
   */
  private detectTables(lines: ExtractedLine[], docLeftMarginPt: number, usableWidthPt: number): DetectedTable[] {
    const tables: DetectedTable[] = [];
    let i = 0;

    while (i < lines.length) {
      if (lines[i].columns.length < 2) {
        i++;
        continue;
      }

      const tableLines: ExtractedLine[] = [lines[i]];
      let j = i + 1;

      while (j < lines.length) {
        const candidate = lines[j];
        if (candidate.columns.length < 2) break;

        const colDiff = Math.abs(candidate.columns.length - tableLines[0].columns.length);
        if (colDiff > 1) break;

        const vGap = candidate.y - tableLines[tableLines.length - 1].y;
        if (vGap > 36 || vGap < 4) break;

        tableLines.push(candidate);
        j++;
      }

      if (tableLines.length >= 2) {
        // Exclude lines with long narrative sentences (these belong to multi-column text rather than data tables)
        const hasLongNarratives = tableLines.some((l) =>
          l.columns.some((c) => c.text.length > 55 && /\.\s+[A-Z]/.test(c.text))
        );
        if (hasLongNarratives) {
          i = j;
          continue;
        }

        const maxCols = Math.max(...tableLines.map((l) => l.columns.length));

        // Determine table horizontal boundaries
        const tableMinX = Math.min(...tableLines.map((l) => l.minX));
        const tableMaxX = Math.max(...tableLines.map((l) => l.maxX));
        const tableWidthPt = Math.max(200, tableMaxX - tableMinX);

        // Compute column widths based on actual column positions in the PDF
        const colWidthsPt: number[] = Array(maxCols).fill(0);
        for (const line of tableLines) {
          line.columns.forEach((col, cIdx) => {
            colWidthsPt[cIdx] = Math.max(colWidthsPt[cIdx], col.w + 14);
          });
        }

        const totalColWidthPt = colWidthsPt.reduce((sum, w) => sum + w, 0);
        // Scale to actual table width in twips (dxa)
        const targetTableWidthDxa = Math.min(
          Math.round(usableWidthPt * 20),
          Math.max(4000, Math.round(tableWidthPt * 20))
        );

        const colWidthsDxa = colWidthsPt.map((w) =>
          Math.max(1000, Math.round((w / (totalColWidthPt || 1)) * targetTableWidthDxa))
        );

        const indentPt = Math.max(0, tableMinX - docLeftMarginPt);
        const indentDxa = Math.round(indentPt * 20);

        // Header row
        const headerCells: DocxTableCell[] = tableLines[0].columns.map((col) => {
          const isNum = /^\$?\d+[\.,]?\d*%?$/.test(col.text.trim());
          return {
            text: col.text,
            bold: true,
            alignment: isNum ? 'right' : 'left',
            backgroundColorHex: 'F1F5F9'
          };
        });

        // Data rows
        const dataRows: DocxTableCell[][] = [];
        for (let rIdx = 1; rIdx < tableLines.length; rIdx++) {
          const rowLine = tableLines[rIdx];
          const rowCells: DocxTableCell[] = [];

          for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            const col = rowLine.columns[cIdx];
            const text = col ? col.text : '';
            const isNumber = /^\$?\d+[\.,]?\d*%?$/.test(text.trim());
            rowCells.push({
              text,
              bold: col ? col.isBold : false,
              italic: col ? col.isItalic : false,
              alignment: isNumber ? 'right' : 'left'
            });
          }
          dataRows.push(rowCells);
        }

        tables.push({
          startLineIdx: i,
          endLineIdx: j - 1,
          minX: tableMinX,
          maxX: tableMaxX,
          headers: headerCells,
          rows: dataRows,
          colWidthsDxa,
          indentDxa
        });

        i = j;
      } else {
        i++;
      }
    }

    return tables;
  }

  private mapFontFamily(fontName: string): string {
    const fn = fontName.toLowerCase();
    if (fn.includes('times') || fn.includes('roman')) return 'Times New Roman';
    if (fn.includes('arial') || fn.includes('helvetica')) return 'Arial';
    if (fn.includes('courier') || fn.includes('mono')) return 'Courier New';
    if (fn.includes('georgia')) return 'Georgia';
    if (fn.includes('cambria')) return 'Cambria';
    if (fn.includes('trebuchet')) return 'Trebuchet MS';
    if (fn.includes('verdana')) return 'Verdana';
    return 'Calibri';
  }

  private computeQuantile(samples: number[], q: number): number | null {
    if (!samples || samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * q);
    return sorted[Math.min(idx, sorted.length - 1)];
  }
}

export const pdfToWordConverter = new PdfToWordConverterService();
