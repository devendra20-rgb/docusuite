import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import unzipper from 'unzipper';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { pdfToWordConverter } from '../../src/adapters/converters/pdf-to-word.service.js';
import { docxValidator } from '../../src/adapters/converters/docx-validator.service.js';
import { nativeNodeAdapter } from '../../src/adapters/converters/native-node.adapter.js';
import { conversionRouter } from '../../src/adapters/converters/conversion-router.service.js';
import { ValidationError, ConversionError } from '../../src/utils/errors.js';

describe('PDF to Word (DOCX) Converter & Validator', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `docusuite-word-test-${uuidv4()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  /**
   * Helper to create a rich synthetic PDF with title, paragraphs, headings, and table
   */
  async function createRichTestPdf(options: {
    pageCount?: number;
    includeTable?: boolean;
    rotated?: boolean;
  } = {}): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageCount = options.pageCount || 1;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const pageWidth = options.rotated ? 841.89 : 595.28;
      const pageHeight = options.rotated ? 595.28 : 841.89;
      const page = doc.addPage([pageWidth, pageHeight]);

      if (options.rotated) {
        page.setRotation(degrees(90));
      }

      const topY = options.rotated ? 500 : 770;

      // Title
      page.drawText(`Executive Summary - Page ${pageNum}`, {
        x: 50,
        y: topY,
        size: 20,
        font: boldFont,
        color: rgb(0.1, 0.2, 0.4)
      });

      // Flowing Paragraph lines
      page.drawText('DocuSuite delivers precision document conversion and automated cloud workflow orchestration.', {
        x: 50,
        y: topY - 35,
        size: 11,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
      page.drawText('All documents are processed with zero data retention guarantee and high visual fidelity.', {
        x: 50,
        y: topY - 50,
        size: 11,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });

      // Subheading
      page.drawText('Operational Milestones', {
        x: 50,
        y: topY - 90,
        size: 14,
        font: boldFont,
        color: rgb(0.15, 0.25, 0.45)
      });

      page.drawText('Key achievements include ninety-nine percent uptime and multi-tenant security verification.', {
        x: 50,
        y: topY - 115,
        size: 11,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });

      // Optional Table
      if (options.includeTable) {
        page.drawText('Department', { x: 50, y: topY - 160, size: 10, font: boldFont });
        page.drawText('Quarterly Target', { x: 220, y: topY - 160, size: 10, font: boldFont });
        page.drawText('Achievement', { x: 400, y: topY - 160, size: 10, font: boldFont });

        page.drawText('Engineering', { x: 50, y: topY - 185, size: 10, font });
        page.drawText('100,000 requests', { x: 220, y: topY - 185, size: 10, font });
        page.drawText('108,500 (+8.5%)', { x: 400, y: topY - 185, size: 10, font });

        page.drawText('Security Compliance', { x: 50, y: topY - 210, size: 10, font });
        page.drawText('SOC2 Type II', { x: 220, y: topY - 210, size: 10, font });
        page.drawText('100% Passed', { x: 400, y: topY - 210, size: 10, font });
      }
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  describe('Single-Page PDF to DOCX', () => {
    it('should convert a single-page PDF and generate a valid OpenXML .docx file', async () => {
      const pdfBuffer = await createRichTestPdf({ pageCount: 1, includeTable: false });
      const inPath = path.join(tmpDir, 'single.pdf');
      const outPath = path.join(tmpDir, 'single.docx');
      await fs.writeFile(inPath, pdfBuffer);

      const result = await pdfToWordConverter.convert(inPath, outPath);
      expect(result.outputPath).toBe(outPath);
      expect(result.fileSize).toBeGreaterThan(500);
      expect(result.pageCount).toBe(1);
      expect(result.paragraphCount).toBeGreaterThan(0);

      // Validate with independent DocxValidatorService
      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
      expect(validation.hasContentTypes).toBe(true);
      expect(validation.hasDocumentRels).toBe(true);
      expect(validation.hasDocumentXml).toBe(true);
      expect(validation.hasStylesXml).toBe(true);
      expect(validation.extractedText).toContain('Executive Summary - Page 1');
      expect(validation.extractedText).toContain('DocuSuite delivers precision');
      expect(validation.htmlPreview).toContain('Executive Summary - Page 1');
    });
  });

  describe('Multi-Page PDF to DOCX', () => {
    it('should convert a multi-page PDF with page breaks and preserve all pages', async () => {
      const pdfBuffer = await createRichTestPdf({ pageCount: 3, includeTable: false });
      const inPath = path.join(tmpDir, 'multi.pdf');
      const outPath = path.join(tmpDir, 'multi.docx');
      await fs.writeFile(inPath, pdfBuffer);

      const result = await pdfToWordConverter.convert(inPath, outPath);
      expect(result.pageCount).toBe(3);
      expect(result.paragraphCount).toBeGreaterThan(3);

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
      expect(validation.extractedText).toContain('Executive Summary - Page 1');
      expect(validation.extractedText).toContain('Executive Summary - Page 2');
      expect(validation.extractedText).toContain('Executive Summary - Page 3');
    });
  });

  describe('Table Detection & Extraction', () => {
    it('should detect and format tables into editable OpenXML <w:tbl> tables', async () => {
      const pdfBuffer = await createRichTestPdf({ pageCount: 1, includeTable: true });
      const inPath = path.join(tmpDir, 'table.pdf');
      const outPath = path.join(tmpDir, 'table.docx');
      await fs.writeFile(inPath, pdfBuffer);

      const result = await pdfToWordConverter.convert(inPath, outPath);
      expect(result.tableCount).toBeGreaterThanOrEqual(1);

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
      expect(validation.tablesCount).toBeGreaterThanOrEqual(1);
      expect(validation.extractedText).toContain('Engineering');
      expect(validation.extractedText).toContain('108,500');
      // Mammoth extracts tables to HTML <table>
      expect(validation.htmlPreview).toContain('<table');
    });
  });

  describe('Rotated Pages & Landscape Orientation', () => {
    it('should convert rotated PDF pages and preserve landscape orientation', async () => {
      const pdfBuffer = await createRichTestPdf({ pageCount: 1, rotated: true });
      const inPath = path.join(tmpDir, 'rotated.pdf');
      const outPath = path.join(tmpDir, 'rotated.docx');
      await fs.writeFile(inPath, pdfBuffer);

      const result = await pdfToWordConverter.convert(inPath, outPath);
      expect(result.fileSize).toBeGreaterThan(500);

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
      expect(validation.extractedText).toContain('Executive Summary');
    });
  });

  describe('Scanned / Empty PDF & OCR Reporting', () => {
    it('should throw a clear ValidationError when a PDF has no text layer (scanned PDF)', async () => {
      const doc = await PDFDocument.create();
      // Add empty page without any text items
      doc.addPage([595.28, 841.89]);
      const pdfBytes = await doc.save();

      const inPath = path.join(tmpDir, 'scanned.pdf');
      const outPath = path.join(tmpDir, 'scanned.docx');
      await fs.writeFile(inPath, Buffer.from(pdfBytes));

      await expect(pdfToWordConverter.convert(inPath, outPath)).rejects.toThrow(
        /scanned document or contains no selectable text layer/i
      );
    });

    it('should reject empty or malformed files safely', async () => {
      const inPath = path.join(tmpDir, 'corrupt.pdf');
      const outPath = path.join(tmpDir, 'corrupt.docx');
      await fs.writeFile(inPath, Buffer.from(''));

      await expect(pdfToWordConverter.convert(inPath, outPath)).rejects.toThrow();
    });
  });

  describe('NativeNodeAdapter & ConversionRouter Integration', () => {
    it('should support pdf -> docx in NativeNodeAdapter', () => {
      expect(nativeNodeAdapter.supports('pdf', 'docx')).toBe(true);
      expect(nativeNodeAdapter.supports('.pdf', '.docx')).toBe(true);
    });

    it('should execute end-to-end conversion via NativeNodeAdapter', async () => {
      const pdfBuffer = await createRichTestPdf({ pageCount: 1, includeTable: true });
      const inPath = path.join(tmpDir, 'adapter_test.pdf');
      const outPath = path.join(tmpDir, 'adapter_test.docx');
      await fs.writeFile(inPath, pdfBuffer);

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'pdf', 'docx');
      expect(result.outputExtension).toBe('.docx');
      expect(result.outputMime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.engineUsed).toBe('NativeNodeEngine');

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
    });

    it('should execute conversion via conversionRouter without requiring LibreOffice', async () => {
      const pdfBuffer = await createRichTestPdf({ pageCount: 2, includeTable: false });
      const inPath = path.join(tmpDir, 'router_test.pdf');
      const outPath = path.join(tmpDir, 'router_test.docx');
      await fs.writeFile(inPath, pdfBuffer);

      const result = await conversionRouter.routeConversion(inPath, outPath, 'pdf', 'docx');
      expect(result.outputExtension).toBe('.docx');
      expect(result.outputMime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(result.fileSize).toBeGreaterThan(0);

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Layout & Formatting Fidelity Improvements', () => {
    async function readDocumentXml(docxPath: string): Promise<string> {
      const buf = await fs.readFile(docxPath);
      const directory = await unzipper.Open.buffer(buf);
      const docEntry = directory.files.find((f) => f.path.replace(/\\/g, '/') === 'word/document.xml');
      if (!docEntry) throw new Error('Missing word/document.xml');
      const xmlBuffer = await docEntry.buffer();
      return xmlBuffer.toString('utf8');
    }

    it('should detect centered text and keep full-width body paragraphs left-aligned', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([595.28, 841.89]);

      // Centered title: text is ~195pt wide, placed at x: 200, so center is ~297.5 (pageCenter ~297.64)
      page.drawText('Quarterly Financial Report', {
        x: 200,
        y: 750,
        size: 16,
        font: boldFont
      });

      // Full-width body paragraph starting near left margin
      page.drawText('This executive overview outlines the complete financial progress across all cloud divisions for the past fiscal year.', {
        x: 50,
        y: 710,
        size: 11,
        font
      });

      const inPath = path.join(tmpDir, 'alignment_test.pdf');
      const outPath = path.join(tmpDir, 'alignment_test.docx');
      await fs.writeFile(inPath, await doc.save());

      await pdfToWordConverter.convert(inPath, outPath);
      const docXml = await readDocumentXml(outPath);

      // Centered heading should have <w:jc w:val="center"/>
      expect(docXml).toContain('<w:jc w:val="center"/>');

      // The validation should succeed
      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
    });

    it('should calculate relative indentation for nested clauses and blockquotes', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595.28, 841.89]);

      // Base margin text at x: 50
      page.drawText('Standard base paragraph adhering to document margins.', {
        x: 50,
        y: 750,
        size: 11,
        font
      });

      // Indented sub-item / clause at x: 90 (40pt indent)
      page.drawText('Indented sub-clause: Section 4.1.2 compliance requirements.', {
        x: 90,
        y: 720,
        size: 11,
        font
      });

      const inPath = path.join(tmpDir, 'indent_test.pdf');
      const outPath = path.join(tmpDir, 'indent_test.docx');
      await fs.writeFile(inPath, await doc.save());

      await pdfToWordConverter.convert(inPath, outPath);
      const docXml = await readDocumentXml(outPath);

      // Should contain <w:ind w:left="..."/>
      expect(docXml).toContain('<w:ind w:left="');
      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
    });

    it('should extract embedded raster images and embed them into OpenXML DrawingML', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595.28, 841.89]);

      page.drawText('Document with embedded diagram:', {
        x: 50,
        y: 750,
        size: 12,
        font
      });

      // Valid 2x2 PNG
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGACEMAAP/B/15lUfVAAAAAElFTkSuQmCC';
      const pngBytes = Buffer.from(pngBase64, 'base64');
      const embeddedImage = await doc.embedPng(pngBytes);
      page.drawImage(embeddedImage, {
        x: 50,
        y: 600,
        width: 120,
        height: 80
      });

      const inPath = path.join(tmpDir, 'image_test.pdf');
      const outPath = path.join(tmpDir, 'image_test.docx');
      await fs.writeFile(inPath, await doc.save());

      const result = await pdfToWordConverter.convert(inPath, outPath);
      expect(result.imageCount).toBeGreaterThanOrEqual(1);

      const docXml = await readDocumentXml(outPath);
      expect(docXml).toContain('<w:drawing>');
      expect(docXml).toContain('<wp:inline');

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
      expect(validation.filesInPackage).toContain('word/media/image_1.png');
    });

    it('should preserve multi-column reading order from left column to right column', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595.28, 841.89]);

      // Left column lines (x: 50, narrow text that stays within left half of page)
      page.drawText('LEFT_COL_1: Column story alpha.', {
        x: 50,
        y: 700,
        size: 10,
        font
      });
      page.drawText('LEFT_COL_2: Column story beta.', {
        x: 50,
        y: 650,
        size: 10,
        font
      });
      page.drawText('LEFT_COL_3: Column story gamma.', {
        x: 50,
        y: 600,
        size: 10,
        font
      });

      // Right column lines (x: 320, narrow text that stays within right half of page)
      page.drawText('RIGHT_COL_1: Column story delta.', {
        x: 320,
        y: 700,
        size: 10,
        font
      });
      page.drawText('RIGHT_COL_2: Column story epsilon.', {
        x: 320,
        y: 650,
        size: 10,
        font
      });
      page.drawText('RIGHT_COL_3: Column story zeta.', {
        x: 320,
        y: 600,
        size: 10,
        font
      });

      const inPath = path.join(tmpDir, 'columns_test.pdf');
      const outPath = path.join(tmpDir, 'columns_test.docx');
      await fs.writeFile(inPath, await doc.save());

      await pdfToWordConverter.convert(inPath, outPath);
      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);

      const text = validation.extractedText;
      const idxL1 = text.indexOf('LEFT_COL_1');
      const idxL2 = text.indexOf('LEFT_COL_2');
      const idxL3 = text.indexOf('LEFT_COL_3');
      const idxR1 = text.indexOf('RIGHT_COL_1');
      const idxR2 = text.indexOf('RIGHT_COL_2');
      const idxR3 = text.indexOf('RIGHT_COL_3');

      expect(idxL1).toBeGreaterThanOrEqual(0);
      expect(idxL2).toBeGreaterThanOrEqual(0);
      expect(idxL3).toBeGreaterThanOrEqual(0);
      expect(idxR1).toBeGreaterThanOrEqual(0);
      expect(idxR2).toBeGreaterThanOrEqual(0);
      expect(idxR3).toBeGreaterThanOrEqual(0);

      // Verify that left column is fully read before right column
      expect(idxL1).toBeLessThan(idxL2);
      expect(idxL2).toBeLessThan(idxL3);
      expect(idxL3).toBeLessThan(idxR1);
      expect(idxR1).toBeLessThan(idxR2);
      expect(idxR2).toBeLessThan(idxR3);
    });

    it('should preserve table indentation and calculate column widths', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([595.28, 841.89]);

      // Base margin text at x: 50 establishes page margin at 50
      page.drawText('Quarterly Performance Report Summary', {
        x: 50,
        y: 750,
        size: 14,
        font: boldFont
      });

      // Table starts at x: 80 (indented by 30pt from margin 50)
      page.drawText('Feature', { x: 80, y: 700, size: 10, font: boldFont });
      page.drawText('Status', { x: 260, y: 700, size: 10, font: boldFont });
      page.drawText('Fidelity', { x: 420, y: 700, size: 10, font: boldFont });

      page.drawText('Tables', { x: 80, y: 675, size: 10, font });
      page.drawText('Supported', { x: 260, y: 675, size: 10, font });
      page.drawText('High', { x: 420, y: 675, size: 10, font });

      page.drawText('Columns', { x: 80, y: 650, size: 10, font });
      page.drawText('Dynamic', { x: 260, y: 650, size: 10, font });
      page.drawText('Verified', { x: 420, y: 650, size: 10, font });

      const inPath = path.join(tmpDir, 'table_fidelity_test.pdf');
      const outPath = path.join(tmpDir, 'table_fidelity_test.docx');
      await fs.writeFile(inPath, await doc.save());

      const result = await pdfToWordConverter.convert(inPath, outPath);
      expect(result.tableCount).toBeGreaterThanOrEqual(1);

      const docXml = await readDocumentXml(outPath);
      expect(docXml).toContain('<w:tblInd');
      expect(docXml).toContain('<w:gridCol');

      const validation = await docxValidator.validate(outPath);
      expect(validation.valid).toBe(true);
      expect(validation.tablesCount).toBeGreaterThanOrEqual(1);
    });
  });
});
