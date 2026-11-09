import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdfToHtmlConverter } from '../../src/adapters/converters/pdf-to-html.service.js';
import { conversionRouter } from '../../src/adapters/converters/conversion-router.service.js';

describe('PDF to HTML Converter & Service', () => {
  const testDir = path.resolve('storage/temp/test_pdf_to_html');
  const samplePdf = path.join(testDir, 'sample_test.pdf');
  const outputHtml = path.join(testDir, 'sample_test.html');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });

    // Create a valid multi-page PDF with text and shapes
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page 1
    const page1 = pdfDoc.addPage([600, 800]);
    page1.drawText('Sample Document Title', {
      x: 50,
      y: 720,
      size: 20,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });
    page1.drawLine({
      start: { x: 50, y: 700 },
      end: { x: 550, y: 700 },
      thickness: 1,
      color: rgb(0.2, 0.2, 0.2)
    });
    page1.drawText('Contact: user@example.com | https://example.com', {
      x: 50,
      y: 670,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });

    // Page 2
    const page2 = pdfDoc.addPage([600, 800]);
    page2.drawText('Second Page Content', {
      x: 50,
      y: 720,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(samplePdf, pdfBytes);
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should convert PDF into self-contained HTML with text and structure', async () => {
    const result = await pdfToHtmlConverter.convert(samplePdf, outputHtml);

    expect(result.outputPath).toBe(outputHtml);
    expect(result.pageCount).toBe(2);
    expect(result.fileSize).toBeGreaterThan(500);

    const htmlContent = await fs.readFile(outputHtml, 'utf8');
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('Sample Document Title');
    expect(htmlContent).toContain('Second Page Content');
    expect(htmlContent).toContain('mailto:user@example.com');
    expect(htmlContent).toContain('href="https://example.com"');
    expect(htmlContent).toContain('<line'); // SVG divider
    expect(htmlContent).toContain('data-page="1"');
    expect(htmlContent).toContain('data-page="2"');
  });

  it('should route pdf -> html via ConversionRouter without requiring LibreOffice', async () => {
    const routerOutput = path.join(testDir, 'router_test.html');
    const result = await conversionRouter.routeConversion(samplePdf, routerOutput, 'pdf', 'html');

    expect(result.engineUsed).toBe('NativeNodeEngine');
    expect(fsSync.existsSync(routerOutput)).toBe(true);
    const content = await fs.readFile(routerOutput, 'utf8');
    expect(content).toContain('Sample Document Title');
  });
});
