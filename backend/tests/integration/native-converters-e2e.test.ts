import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import unzipper from 'unzipper';
import { createApp } from '../../src/app.js';
import { createSyntheticPdf, createSyntheticXlsx } from '../fixtures/synthetic.js';

describe('Native Document Converters E2E Integration (No LibreOffice Required)', () => {
  const app = createApp();
  let samplePdf: Buffer;
  let sampleXlsx: Buffer;

  beforeAll(async () => {
    samplePdf = await createSyntheticPdf(2);
    sampleXlsx = await createSyntheticXlsx();
  });

  it('GET /api/tools/convert/capabilities should report NativeNodeEngine with xlsx->pdf and pdf->pptx', async () => {
    const res = await request(app).get('/api/tools/convert/capabilities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const nativeEngine = res.body.data.find((e: any) => e.name === 'NativeNodeEngine');
    expect(nativeEngine).toBeDefined();
    expect(nativeEngine.available).toBe(true);
    expect(nativeEngine.supportedConversions).toContain('xlsx->pdf');
    expect(nativeEngine.supportedConversions).toContain('pdf->pptx');
  });

  it('POST /api/tools/convert/excel-to-pdf should convert .xlsx to .pdf natively', async () => {
    const res = await request(app)
      .post('/api/tools/convert/excel-to-pdf')
      .attach('files', sampleXlsx, 'test_sheet.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('completed');
    expect(res.body.outputFiles).toBeDefined();
    expect(res.body.outputFiles.length).toBe(1);
    expect(res.body.outputFiles[0].originalName).toContain('.pdf');
  });

  it('POST /api/tools/convert/pdf-to-powerpoint should convert .pdf to .pptx natively and produce valid OpenXML package', async () => {
    const res = await request(app)
      .post('/api/tools/convert/pdf-to-powerpoint')
      .attach('files', samplePdf, 'presentation_slides.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('completed');
    expect(res.body.outputFiles).toBeDefined();
    expect(res.body.outputFiles.length).toBe(1);
    expect(res.body.outputFiles[0].originalName).toContain('.pptx');

    const downloadPath = res.body.outputFiles[0].path;
    expect(downloadPath).toBeDefined();

    // Verify OpenXML PresentationML contents
    const directory = await unzipper.Open.file(downloadPath);
    const entryPaths = directory.files.map((f) => f.path);

    expect(entryPaths).toContain('[Content_Types].xml');
    expect(entryPaths).toContain('_rels/.rels');
    expect(entryPaths).toContain('ppt/presentation.xml');
    expect(entryPaths).toContain('ppt/slides/slide1.xml');
    expect(entryPaths).toContain('ppt/slides/slide2.xml');
    expect(entryPaths).toContain('ppt/media/image1.png');
    expect(entryPaths).toContain('ppt/media/image2.png');
  });
});
