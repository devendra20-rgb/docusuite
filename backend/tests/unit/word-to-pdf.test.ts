import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import archiver from 'archiver';
import { wordToPdfConverter } from '../../src/adapters/converters/word-to-pdf.service.js';
import { nativeNodeAdapter } from '../../src/adapters/converters/native-node.adapter.js';
import { conversionRouter } from '../../src/adapters/converters/conversion-router.service.js';
import { ValidationError, ConversionError } from '../../src/utils/errors.js';

describe('Word to PDF (DOC/DOCX to PDF) Converter', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `docusuite-word-to-pdf-test-${uuidv4()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  /**
   * Helper to build a synthetic, valid OpenXML DOCX archive with custom options.
   */
  async function createTestDocx(options: {
    title?: string;
    includeTable?: boolean;
    includeImage?: boolean;
    includeHeaderFooter?: boolean;
    pageBreak?: boolean;
    landscape?: boolean;
  } = {}): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (c) => chunks.push(c));
    const endPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    // 1. [Content_Types].xml
    archive.append(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`,
      { name: '[Content_Types].xml' }
    );

    // 2. _rels/.rels
    archive.append(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      { name: '_rels/.rels' }
    );

    // 3. word/_rels/document.xml.rels
    let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
    if (options.includeHeaderFooter) {
      relsXml += `
  <Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
    }
    if (options.includeImage) {
      relsXml += `
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`;
    }
    relsXml += `\n</Relationships>`;
    archive.append(relsXml, { name: 'word/_rels/document.xml.rels' });

    // Optional Header and Footer
    if (options.includeHeaderFooter) {
      archive.append(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>DocuSuite Confidential Executive Report</w:t></w:r></w:p>
</w:hdr>`,
        { name: 'word/header1.xml' }
      );

      archive.append(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>Copyright 2026 DocuSuite Inc.</w:t></w:r></w:p>
</w:ftr>`,
        { name: 'word/footer1.xml' }
      );
    }

    // Optional Embedded Image
    if (options.includeImage) {
      // 2x2 valid PNG
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGACEMAAP/B/15lUfVAAAAAElFTkSuQmCC',
        'base64'
      );
      archive.append(pngBuffer, { name: 'word/media/image1.png' });
    }

    // Build word/document.xml
    const wDxa = options.landscape ? 16838 : 11906;
    const hDxa = options.landscape ? 11906 : 16838;
    const orient = options.landscape ? 'landscape' : 'portrait';

    let body = '';

    // Title paragraph
    body += `<w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:jc w:val="center"/>
        <w:spacing w:before="240" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="36"/>
          <w:color w:val="1E293B"/>
        </w:rPr>
        <w:t>${options.title || 'Executive Progress Summary'}</w:t>
      </w:r>
    </w:p>`;

    // Body paragraph with formatting and indent
    body += `<w:p>
      <w:pPr>
        <w:ind w:left="400"/>
        <w:spacing w:after="160"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:sz w:val="22"/>
          <w:rFonts w:ascii="Times New Roman"/>
        </w:rPr>
        <w:t>DocuSuite delivers automated high-fidelity file conversion with </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:color w:val="0EA5E9"/>
          <w:sz w:val="22"/>
        </w:rPr>
        <w:t>zero data retention guarantees</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:i/>
          <w:sz w:val="22"/>
        </w:rPr>
        <w:t> and enterprise encryption.</w:t>
      </w:r>
    </w:p>`;

    // Optional image drawing
    if (options.includeImage) {
      body += `<w:p>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:spacing w:before="120" w:after="120"/>
        </w:pPr>
        <w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0">
              <wp:extent cx="1524000" cy="863600"/>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:blipFill>
                      <a:blip r:embed="rIdImg1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                    </pic:blipFill>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>`;
    }

    // Optional Table
    if (options.includeTable) {
      body += `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="0" w:type="auto"/>
          <w:jc w:val="center"/>
          <w:tblInd w:w="200"/>
        </w:tblPr>
        <w:tblGrid>
          <w:gridCol w:w="3000"/>
          <w:gridCol w:w="3000"/>
          <w:gridCol w:w="3000"/>
        </w:tblGrid>
        <w:tr>
          <w:tc>
            <w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="F1F5F9"/></w:tcPr>
            <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Metric</w:t></w:r></w:p>
          </w:tc>
          <w:tc>
            <w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="F1F5F9"/></w:tcPr>
            <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Q3 Target</w:t></w:r></w:p>
          </w:tc>
          <w:tc>
            <w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="F1F5F9"/></w:tcPr>
            <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Q3 Result</w:t></w:r></w:p>
          </w:tc>
        </w:tr>
        <w:tr>
          <w:tc>
            <w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="FFFFFF"/></w:tcPr>
            <w:p><w:r><w:t>Throughput</w:t></w:r></w:p>
          </w:tc>
          <w:tc>
            <w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="FFFFFF"/></w:tcPr>
            <w:p><w:r><w:t>50,000 docs</w:t></w:r></w:p>
          </w:tc>
          <w:tc>
            <w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="FFFFFF"/></w:tcPr>
            <w:p><w:r><w:t>62,400 docs</w:t></w:r></w:p>
          </w:tc>
        </w:tr>
      </w:tbl>`;
    }

    // Optional Page Break
    if (options.pageBreak) {
      body += `<w:p>
        <w:r><w:br w:type="page"/></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Page 2: Detailed Performance Analysis</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>This second page verifies automatic page break rendering and header/footer continuation.</w:t></w:r>
      </w:p>`;
    }

    // Section Properties
    let sectXml = `<w:sectPr>
      <w:pgSz w:w="${wDxa}" w:h="${hDxa}" w:orient="${orient}"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>`;
    if (options.includeHeaderFooter) {
      sectXml += `
      <w:headerReference r:id="rIdH1" w:type="default" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      <w:footerReference r:id="rIdF1" w:type="default" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`;
    }
    sectXml += `\n</w:sectPr>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${body}
    ${sectXml}
  </w:body>
</w:document>`;

    archive.append(docXml, { name: 'word/document.xml' });
    await archive.finalize();

    return endPromise;
  }

  describe('Single-Page DOCX to PDF', () => {
    it('should convert a standard DOCX file into a valid PDF document', async () => {
      const docxBytes = await createTestDocx({ title: 'Quarterly Audit' });
      const inPath = path.join(tmpDir, 'single.docx');
      const outPath = path.join(tmpDir, 'single.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.outputPath).toBe(outPath);
      expect(result.fileSize).toBeGreaterThan(500);
      expect(result.pageCount).toBe(1);
      expect(result.paragraphCount).toBeGreaterThan(0);

      // Verify with PDFLib
      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBe(1);
      const page = pdfLib.getPage(0);
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(595.3, 1);
      expect(height).toBeCloseTo(841.9, 1);
    });
  });

  describe('Multi-Page DOCX with Page Breaks', () => {
    it('should convert multi-page documents and preserve page breaks', async () => {
      const docxBytes = await createTestDocx({
        title: 'Multi-Page Report',
        pageBreak: true
      });
      const inPath = path.join(tmpDir, 'multi.docx');
      const outPath = path.join(tmpDir, 'multi.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.pageCount).toBe(2);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBe(2);
    });
  });

  describe('Orientation & Page Dimensions', () => {
    it('should preserve landscape orientation from <w:pgSz w:orient="landscape">', async () => {
      const docxBytes = await createTestDocx({
        title: 'Landscape Spread',
        landscape: true
      });
      const inPath = path.join(tmpDir, 'landscape.docx');
      const outPath = path.join(tmpDir, 'landscape.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.fileSize).toBeGreaterThan(500);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      const page = pdfLib.getPage(0);
      const { width, height } = page.getSize();
      expect(width).toBeGreaterThan(height);
      expect(width).toBeCloseTo(841.9, 1);
      expect(height).toBeCloseTo(595.3, 1);
    });
  });

  describe('Tables & Cell Formatting', () => {
    it('should render tables with borders, shaded headers, and cell content', async () => {
      const docxBytes = await createTestDocx({
        title: 'Tabular Data',
        includeTable: true
      });
      const inPath = path.join(tmpDir, 'table.docx');
      const outPath = path.join(tmpDir, 'table.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.tableCount).toBeGreaterThanOrEqual(1);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBe(1);
    });
  });

  describe('Embedded Images & DrawingML', () => {
    it('should render embedded images from word/media/*', async () => {
      const docxBytes = await createTestDocx({
        title: 'Document with Graphic',
        includeImage: true
      });
      const inPath = path.join(tmpDir, 'image.docx');
      const outPath = path.join(tmpDir, 'image.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.imageCount).toBeGreaterThanOrEqual(1);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBe(1);
    });
  });

  describe('Headers, Footers & Pagination', () => {
    it('should render document headers and footers across pages', async () => {
      const docxBytes = await createTestDocx({
        title: 'Header & Footer Document',
        includeHeaderFooter: true,
        pageBreak: true
      });
      const inPath = path.join(tmpDir, 'header_footer.docx');
      const outPath = path.join(tmpDir, 'header_footer.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.pageCount).toBe(2);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBe(2);
    });
  });

  describe('Legacy .doc (Word 97-2003 / RTF) Handling', () => {
    it('should convert legacy .doc files with RTF content cleanly into PDF', async () => {
      const rtfDoc = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fnil\\fcharset0 Helvetica;}}
\\viewkind4\\uc1\\pard\\lang1033\\f0\\fs24 This is a legacy Word document in RTF format.\\par
\\b Key Milestones achieved\\b0\\par
Uptime reached 99.99 percent across global nodes.\\par}`;

      const inPath = path.join(tmpDir, 'legacy_rtf.doc');
      const outPath = path.join(tmpDir, 'legacy_rtf.pdf');
      await fs.writeFile(inPath, Buffer.from(rtfDoc, 'utf8'));

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.fileSize).toBeGreaterThan(500);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('should convert binary .doc files containing structured text runs', async () => {
      // Simulate binary OLE compound header with readable text chunks
      const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const padding = Buffer.alloc(512, 0);
      const textChunk1 = Buffer.from('DocuSuite Legacy Enterprise Document Content.\n', 'utf8');
      const textChunk2 = Buffer.from('System audit passed with zero security non-conformances.\n', 'utf8');
      const binaryDoc = Buffer.concat([oleHeader, padding, textChunk1, padding, textChunk2]);

      const inPath = path.join(tmpDir, 'legacy_binary.doc');
      const outPath = path.join(tmpDir, 'legacy_binary.pdf');
      await fs.writeFile(inPath, binaryDoc);

      const result = await wordToPdfConverter.convert(inPath, outPath);
      expect(result.fileSize).toBeGreaterThan(500);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);

      const pdfBytes = await fs.readFile(outPath);
      const pdfLib = await PDFLibDocument.load(pdfBytes);
      expect(pdfLib.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('NativeNodeAdapter & ConversionRouter Integration', () => {
    it('should support docx -> pdf and doc -> pdf in NativeNodeAdapter', () => {
      expect(nativeNodeAdapter.supports('docx', 'pdf')).toBe(true);
      expect(nativeNodeAdapter.supports('.docx', '.pdf')).toBe(true);
      expect(nativeNodeAdapter.supports('doc', 'pdf')).toBe(true);
      expect(nativeNodeAdapter.supports('.doc', '.pdf')).toBe(true);
    });

    it('should execute docx -> pdf via NativeNodeAdapter', async () => {
      const docxBytes = await createTestDocx({ title: 'Adapter Test', includeTable: true });
      const inPath = path.join(tmpDir, 'adapter_test.docx');
      const outPath = path.join(tmpDir, 'adapter_test.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'docx', 'pdf');
      expect(result.outputExtension).toBe('.pdf');
      expect(result.outputMime).toBe('application/pdf');
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.engineUsed).toBe('NativeNodeEngine');
    });

    it('should route docx -> pdf through ConversionRouterService without requiring LibreOffice', async () => {
      const docxBytes = await createTestDocx({ title: 'Router Test' });
      const inPath = path.join(tmpDir, 'router_test.docx');
      const outPath = path.join(tmpDir, 'router_test.pdf');
      await fs.writeFile(inPath, docxBytes);

      const result = await conversionRouter.routeConversion(inPath, outPath, 'docx', 'pdf');
      expect(result.outputExtension).toBe('.pdf');
      expect(result.outputMime).toBe('application/pdf');
      expect(result.fileSize).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw ValidationError on non-existent file', async () => {
      await expect(
        wordToPdfConverter.convert(path.join(tmpDir, 'missing.docx'), path.join(tmpDir, 'missing.pdf'))
      ).rejects.toThrow(/not found/i);
    });

    it('should throw ValidationError on empty file', async () => {
      const emptyPath = path.join(tmpDir, 'empty.docx');
      await fs.writeFile(emptyPath, Buffer.alloc(0));

      await expect(
        wordToPdfConverter.convert(emptyPath, path.join(tmpDir, 'empty.pdf'))
      ).rejects.toThrow(/empty/i);
    });
  });
});

