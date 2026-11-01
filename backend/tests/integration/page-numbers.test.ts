import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createSyntheticPdf } from '../fixtures/synthetic.js';
import { PDFDocument, degrees } from 'pdf-lib';
import { PdfEngineAdapter } from '../../src/adapters/pdf/pdf-engine.adapter.js';

describe('Add Page Numbers Integration Tests', () => {
  const app = createApp();
  const pdfEngine = new PdfEngineAdapter();
  let samplePdf3: Buffer;

  beforeAll(async () => {
    samplePdf3 = await createSyntheticPdf(3);
  });

  it('should add page numbers with default settings (page_of_total at bottom-center)', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/add-page-numbers')
      .field('format', 'page_of_total')
      .field('position', 'bottom-center')
      .field('fontSize', '12')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outputFiles).toBeDefined();
    expect(res.body.outputFiles.length).toBe(1);

    const dlRes = await request(app).get(res.body.downloadUrl);
    expect(dlRes.status).toBe(200);
    const pdf = await PDFDocument.load(dlRes.body);
    expect(pdf.getPageCount()).toBe(3);
  });

  it('should support page_number and number_only formats', async () => {
    const res1 = await request(app)
      .post('/api/tools/pdf/add-page-numbers')
      .field('format', 'page_number')
      .field('position', 'top-right')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/tools/pdf/add-page-numbers')
      .field('format', 'number_only')
      .field('position', 'bottom-left')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res2.status).toBe(200);
  });

  it('should support skipFirst: true and custom startNumber', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/add-page-numbers')
      .field('format', 'page_of_total')
      .field('position', 'bottom-center')
      .field('skipFirst', 'true')
      .field('startNumber', '5')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    const dlRes = await request(app).get(res.body.downloadUrl);
    expect(dlRes.status).toBe(200);
    const pdf = await PDFDocument.load(dlRes.body);
    expect(pdf.getPageCount()).toBe(3);
  });

  it('should support targeting specific pages via pages parameter', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/add-page-numbers')
      .field('format', 'number_only')
      .field('pages', JSON.stringify([2, 3]))
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    const dlRes = await request(app).get(res.body.downloadUrl);
    expect(dlRes.status).toBe(200);
    const pdf = await PDFDocument.load(dlRes.body);
    expect(pdf.getPageCount()).toBe(3);
  });

  it('should support custom fonts, hex color, and background badge', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/add-page-numbers')
      .field('font', 'times')
      .field('color', '#E11D48')
      .field('background', 'white')
      .field('margin', '25')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    const dlRes = await request(app).get(res.body.downloadUrl);
    expect(dlRes.status).toBe(200);
    const pdf = await PDFDocument.load(dlRes.body);
    expect(pdf.getPageCount()).toBe(3);
  });

  it('should correctly handle rotated pages (90, 180, 270 degrees)', async () => {
    // Create a 4-page PDF with 0, 90, 180, and 270 degree rotated pages
    const doc = await PDFDocument.create();
    const p0 = doc.addPage([300, 400]);
    const p90 = doc.addPage([300, 400]);
    p90.setRotation(degrees(90));
    const p180 = doc.addPage([300, 400]);
    p180.setRotation(degrees(180));
    const p270 = doc.addPage([300, 400]);
    p270.setRotation(degrees(270));

    const rotatedPdfBytes = await doc.save();
    const outputBuffer = await pdfEngine.addPageNumbers(Buffer.from(rotatedPdfBytes), {
      format: 'page_of_total',
      position: 'bottom-center',
      background: 'dark',
      font: 'helvetica-bold'
    });

    const resultPdf = await PDFDocument.load(outputBuffer);
    expect(resultPdf.getPageCount()).toBe(4);
    expect(resultPdf.getPage(0).getRotation().angle).toBe(0);
    expect(resultPdf.getPage(1).getRotation().angle).toBe(90);
    expect(resultPdf.getPage(2).getRotation().angle).toBe(180);
    expect(resultPdf.getPage(3).getRotation().angle).toBe(270);
  });

  it('should correctly handle cropped PDFs with non-zero CropBox', async () => {
    // Create a PDF with cropped page
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.setCropBox(50, 50, 300, 500);

    const croppedPdfBytes = await doc.save();
    const outputBuffer = await pdfEngine.addPageNumbers(Buffer.from(croppedPdfBytes), {
      format: 'page_number',
      position: 'top-right',
      margin: 15
    });

    const resultPdf = await PDFDocument.load(outputBuffer);
    expect(resultPdf.getPageCount()).toBe(1);
    const cb = resultPdf.getPage(0).getCropBox();
    expect(cb.x).toBe(50);
    expect(cb.y).toBe(50);
    expect(cb.width).toBe(300);
    expect(cb.height).toBe(500);
  });
});
