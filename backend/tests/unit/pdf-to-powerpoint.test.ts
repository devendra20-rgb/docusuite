import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import unzipper from 'unzipper';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdfToPowerPointConverter } from '../../src/adapters/converters/pdf-to-powerpoint.service.js';
import { nativeNodeAdapter } from '../../src/adapters/converters/native-node.adapter.js';
import { conversionRouter } from '../../src/adapters/converters/conversion-router.service.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('PDF to PowerPoint (PPTX) Native Engine', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), `docusuite-pptx-test-${uuidv4()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  async function createTestPdf(pageCount = 1, landscape = true): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    // Standard 16:9 widescreen presentation page: 960 x 540 pt or 792 x 612 pt
    const width = landscape ? 960 : 540;
    const height = landscape ? 540 : 960;

    for (let p = 1; p <= pageCount; p++) {
      const page = doc.addPage([width, height]);

      // Background color
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: rgb(0.96, 0.97, 0.99)
      });

      // Title
      page.drawText(`Slide ${p}: DocuSuite Product Deck`, {
        x: 60,
        y: height - 80,
        size: 28,
        font: boldFont,
        color: rgb(0.08, 0.12, 0.22)
      });

      // Bullet points
      page.drawText(`- Key achievement on slide ${p}: Native Node.js PresentationML export`, {
        x: 80,
        y: height - 140,
        size: 16,
        font,
        color: rgb(0.2, 0.25, 0.35)
      });

      page.drawText(`- Preserves 100% visual fidelity without requiring external LibreOffice binaries`, {
        x: 80,
        y: height - 170,
        size: 16,
        font,
        color: rgb(0.2, 0.25, 0.35)
      });
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  it('should be registered under nativeNodeAdapter for pdf->pptx', () => {
    expect(nativeNodeAdapter.supports('pdf', 'pptx')).toBe(true);
    expect(nativeNodeAdapter.supports('PDF', 'PPTX')).toBe(true);
  });

  it('should convert single-page PDF to valid PPTX presentation', async () => {
    const pdfBuf = await createTestPdf(1, true);
    const inPath = path.join(tmpDir, 'single.pdf');
    const outPath = path.join(tmpDir, 'single.pptx');
    await fs.writeFile(inPath, pdfBuf);

    const result = await pdfToPowerPointConverter.convert(inPath, outPath);
    expect(result.outputPath).toBe(outPath);
    expect(result.pageCount).toBe(1);
    expect(result.fileSize).toBeGreaterThan(1000);

    const stat = await fs.stat(outPath);
    expect(stat.size).toBe(result.fileSize);

    // Verify OpenXML package structure
    const directory = await unzipper.Open.file(outPath);
    const entryPaths = directory.files.map((f) => f.path);

    expect(entryPaths).toContain('[Content_Types].xml');
    expect(entryPaths).toContain('_rels/.rels');
    expect(entryPaths).toContain('ppt/presentation.xml');
    expect(entryPaths).toContain('ppt/_rels/presentation.xml.rels');
    expect(entryPaths).toContain('ppt/slideMasters/slideMaster1.xml');
    expect(entryPaths).toContain('ppt/slideLayouts/slideLayout1.xml');
    expect(entryPaths).toContain('ppt/theme/theme1.xml');
    expect(entryPaths).toContain('ppt/slides/slide1.xml');
    expect(entryPaths).toContain('ppt/slides/_rels/slide1.xml.rels');
    expect(entryPaths).toContain('ppt/media/image1.png');
  });

  it('should convert multi-page PDF into multi-slide PPTX deck', async () => {
    const pdfBuf = await createTestPdf(3, true);
    const inPath = path.join(tmpDir, 'multi.pdf');
    const outPath = path.join(tmpDir, 'multi.pptx');
    await fs.writeFile(inPath, pdfBuf);

    const result = await pdfToPowerPointConverter.convert(inPath, outPath);
    expect(result.pageCount).toBe(3);
    expect(result.fileSize).toBeGreaterThan(2000);

    const directory = await unzipper.Open.file(outPath);
    const entryPaths = directory.files.map((f) => f.path);

    expect(entryPaths).toContain('ppt/slides/slide1.xml');
    expect(entryPaths).toContain('ppt/slides/slide2.xml');
    expect(entryPaths).toContain('ppt/slides/slide3.xml');
    expect(entryPaths).toContain('ppt/media/image1.png');
    expect(entryPaths).toContain('ppt/media/image2.png');
    expect(entryPaths).toContain('ppt/media/image3.png');
  });

  it('should execute conversion via conversionRouter without requiring LibreOffice', async () => {
    const pdfBuf = await createTestPdf(2, true);
    const inPath = path.join(tmpDir, 'router.pdf');
    const outPath = path.join(tmpDir, 'router.pptx');
    await fs.writeFile(inPath, pdfBuf);

    const result = await conversionRouter.routeConversion(inPath, outPath, 'pdf', 'pptx');
    expect(result.engineUsed).toBe('NativeNodeEngine');
    expect(result.outputExtension).toBe('.pptx');
    expect(result.outputMime).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(result.fileSize).toBeGreaterThan(1500);
  });

  it('should reject empty or corrupted files with ValidationError', async () => {
    const inPath = path.join(tmpDir, 'corrupt.pdf');
    const outPath = path.join(tmpDir, 'corrupt.pptx');
    await fs.writeFile(inPath, Buffer.from('NOT_A_VALID_PDF_STREAM'));

    await expect(pdfToPowerPointConverter.convert(inPath, outPath)).rejects.toThrow(ValidationError);
  });
});

