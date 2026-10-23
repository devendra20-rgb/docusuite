import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { nativeNodeAdapter } from '../../src/adapters/converters/native-node.adapter.js';
import { conversionRouter } from '../../src/adapters/converters/conversion-router.service.js';
import { libreOfficeAdapter } from '../../src/adapters/converters/libreoffice.adapter.js';
import {
  createSyntheticCsv,
  createSyntheticXlsx,
  createSyntheticTxt,
  createSyntheticDocx
} from '../fixtures/synthetic.js';
import { AppError, UnsupportedFormatError } from '../../src/utils/errors.js';

describe('Document Converters (Phase 2)', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `docusuite-test-${uuidv4()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('NativeNodeAdapter', () => {
    it('should be marked as available', async () => {
      const isAvailable = await nativeNodeAdapter.isAvailable();
      expect(isAvailable).toBe(true);
    });

    it('should convert CSV to Excel (.xlsx)', async () => {
      const csvBuffer = createSyntheticCsv();
      const inPath = path.join(tmpDir, 'test.csv');
      const outPath = path.join(tmpDir, 'test.xlsx');
      await fs.writeFile(inPath, csvBuffer);

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'csv', 'xlsx');
      expect(result.outputExtension).toBe('.xlsx');
      expect(result.outputMime).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.limitations.length).toBeGreaterThan(0);

      const stat = await fs.stat(outPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('should convert Excel (.xlsx) to CSV', async () => {
      const xlsxBuffer = await createSyntheticXlsx();
      const inPath = path.join(tmpDir, 'sample.xlsx');
      const outPath = path.join(tmpDir, 'sample.csv');
      await fs.writeFile(inPath, xlsxBuffer);

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'xlsx', 'csv');
      expect(result.outputExtension).toBe('.csv');
      expect(result.outputMime).toBe('text/csv');
      expect(result.fileSize).toBeGreaterThan(0);

      const csvContent = await fs.readFile(outPath, 'utf8');
      expect(csvContent).toContain('Document Folder');
      expect(csvContent).toContain('Paper Clips');
    });

    it('should convert TXT to PDF with pagination', async () => {
      const txtBuffer = createSyntheticTxt(50);
      const inPath = path.join(tmpDir, 'sample.txt');
      const outPath = path.join(tmpDir, 'sample.pdf');
      await fs.writeFile(inPath, txtBuffer);

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'txt', 'pdf');
      expect(result.outputExtension).toBe('.pdf');
      expect(result.outputMime).toBe('application/pdf');
      expect(result.fileSize).toBeGreaterThan(0);

      const stat = await fs.stat(outPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('should convert DOCX to HTML', async () => {
      const docxBuffer = await createSyntheticDocx();
      const inPath = path.join(tmpDir, 'sample.docx');
      const outPath = path.join(tmpDir, 'sample.html');
      await fs.writeFile(inPath, docxBuffer);

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'docx', 'html');
      expect(result.outputExtension).toBe('.html');
      expect(result.outputMime).toBe('text/html');
      expect(result.fileSize).toBeGreaterThan(0);

      const html = await fs.readFile(outPath, 'utf8');
      expect(html).toContain('DocuSuite Synthetic DOCX Heading');
    });

    it('should convert PDF containing a table to Excel (.xlsx)', async () => {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage([600, 400]);

      page.drawText('Sample Product Table', { x: 50, y: 350, size: 14, font: fontBold });

      const headers = ['ID', 'Product', 'Qty', 'Price'];
      const colX = [50, 120, 250, 350];
      let y = 310;

      for (let i = 0; i < headers.length; i++) {
        page.drawText(headers[i], { x: colX[i], y, size: 10, font: fontBold });
      }

      const rows = [
        ['P1', 'Keyboard', '10', '$49.99'],
        ['P2', 'Mouse', '25', '$19.99'],
        ['P3', 'Monitor', '5', '$199.99']
      ];

      for (const row of rows) {
        y -= 25;
        for (let i = 0; i < row.length; i++) {
          page.drawText(row[i], { x: colX[i], y, size: 9, font });
        }
      }

      const inPath = path.join(tmpDir, 'table.pdf');
      const outPath = path.join(tmpDir, 'table.xlsx');
      await fs.writeFile(inPath, await pdfDoc.save());

      const result = await nativeNodeAdapter.convert(inPath, outPath, 'pdf', 'xlsx');
      expect(result.outputExtension).toBe('.xlsx');
      expect(result.engineUsed).toBe('NativeNodeEngine');
      expect(result.fileSize).toBeGreaterThan(0);

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(outPath);
      expect(wb.worksheets.length).toBeGreaterThanOrEqual(1);
      const sheet = wb.worksheets[0];
      expect(sheet.rowCount).toBe(4); // 1 header + 3 data rows
    });

    it('should throw user-friendly ValidationError when PDF has no extractable tables', async () => {
      const { PDFDocument, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const page = pdfDoc.addPage([600, 400]);
      page.drawText('This document has no tables at all, just a normal single line.', {
        x: 50,
        y: 350,
        size: 12,
        font
      });

      const inPath = path.join(tmpDir, 'no_table.pdf');
      const outPath = path.join(tmpDir, 'no_table.xlsx');
      await fs.writeFile(inPath, await pdfDoc.save());

      await expect(
        nativeNodeAdapter.convert(inPath, outPath, 'pdf', 'xlsx')
      ).rejects.toThrow('No extractable tables found');
    });

    it('should report conversion limitations correctly', () => {
      const limits = nativeNodeAdapter.getLimitations('csv', 'xlsx');
      expect(limits.length).toBeGreaterThan(0);
      expect(limits[0]).toContain('formatting');
    });

    it('should reject unsupported conversion pairs', async () => {
      const inPath = path.join(tmpDir, 'dummy.xyz');
      const outPath = path.join(tmpDir, 'dummy.abc');
      await fs.writeFile(inPath, 'dummy');

      await expect(
        nativeNodeAdapter.convert(inPath, outPath, 'xyz', 'abc')
      ).rejects.toThrow();
    });
  });

  describe('ConversionRouterService', () => {
    it('should return engine capabilities including native and external engines', async () => {
      const caps = await conversionRouter.getEngineCapabilities();
      expect(caps.length).toBeGreaterThanOrEqual(2);

      const nativeCap = caps.find((c) => c.name === 'NativeNodeEngine');
      expect(nativeCap).toBeDefined();
      expect(nativeCap?.available).toBe(true);
      expect(nativeCap?.supportedConversions).toContain('csv->xlsx');
      expect(nativeCap?.supportedConversions).toContain('xlsx->csv');
      expect(nativeCap?.supportedConversions).toContain('txt->pdf');
      expect(nativeCap?.supportedConversions).toContain('docx->html');
      expect(nativeCap?.supportedConversions).toContain('pdf->xlsx');
    });

    it('should route native conversion seamlessly through conversionRouter', async () => {
      const csvBuffer = createSyntheticCsv();
      const inPath = path.join(tmpDir, 'router_test.csv');
      const outPath = path.join(tmpDir, 'router_test.xlsx');
      await fs.writeFile(inPath, csvBuffer);

      const result = await conversionRouter.routeConversion(inPath, outPath, 'csv', 'xlsx');
      expect(result.outputExtension).toBe('.xlsx');
      expect(result.engineUsed).toBe('NativeNodeEngine');
    });

    it('should throw 503 error if LibreOffice is needed but unavailable on host', async () => {
      const isLoAvailable = await libreOfficeAdapter.isAvailable();
      if (!isLoAvailable) {
        const inPath = path.join(tmpDir, 'dummy.pptx');
        const outPath = path.join(tmpDir, 'dummy.pdf');
        await fs.writeFile(inPath, 'dummy pptx content');

        await expect(
          conversionRouter.routeConversion(inPath, outPath, 'pptx', 'pdf')
        ).rejects.toThrow(AppError);
      }
    });

    it('should throw UnsupportedFormatError for unknown conversion pairs', async () => {
      const inPath = path.join(tmpDir, 'dummy.xyz');
      const outPath = path.join(tmpDir, 'dummy.abc');
      await fs.writeFile(inPath, 'unknown');

      await expect(
        conversionRouter.routeConversion(inPath, outPath, 'xyz', 'abc')
      ).rejects.toThrow(UnsupportedFormatError);
    });
  });
});
