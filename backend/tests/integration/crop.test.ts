import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createSyntheticPdf } from '../fixtures/synthetic.js';
import { PDFDocument } from 'pdf-lib';

describe('Crop PDF Integration Tests', () => {
  const app = createApp();
  let samplePdf3: Buffer;

  beforeAll(async () => {
    samplePdf3 = await createSyntheticPdf(3);
  });

  it('should crop all pages uniformly with top/bottom/left/right margins', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/crop')
      .field('top', '25')
      .field('bottom', '25')
      .field('left', '30')
      .field('right', '30')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outputFiles).toBeDefined();
    expect(res.body.outputFiles.length).toBe(1);

    // Verify downloaded file cropbox
    const dlRes = await request(app).get(res.body.downloadUrl);
    expect(dlRes.status).toBe(200);
    const pdf = await PDFDocument.load(dlRes.body);
    expect(pdf.getPageCount()).toBe(3);
    const cb0 = pdf.getPage(0).getCropBox();
    expect(cb0.x).toBe(30);
    expect(cb0.y).toBe(25);
  });

  it('should support cropping specific pages only via pages parameter', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/crop')
      .field('top', '40')
      .field('bottom', '40')
      .field('left', '40')
      .field('right', '40')
      .field('pages', JSON.stringify([2]))
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    const dlRes = await request(app).get(res.body.downloadUrl);
    const pdf = await PDFDocument.load(dlRes.body);
    // Page 2 should have cropbox x=40, page 1 should have cropbox x=0
    expect(pdf.getPage(1).getCropBox().x).toBe(40);
    expect(pdf.getPage(0).getCropBox().x).toBe(0);
  });

  it('should support per-page custom crops via pageCrops parameter', async () => {
    const pageCrops = {
      1: { top: 10, bottom: 10, left: 15, right: 15 },
      3: { top: 50, bottom: 50, left: 50, right: 50 }
    };

    const res = await request(app)
      .post('/api/tools/pdf/crop')
      .field('pageCrops', JSON.stringify(pageCrops))
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    const dlRes = await request(app).get(res.body.downloadUrl);
    const pdf = await PDFDocument.load(dlRes.body);
    expect(pdf.getPage(0).getCropBox().x).toBe(15);
    expect(pdf.getPage(2).getCropBox().x).toBe(50);
  });

  it('should support cropping with extra pageRotations and rotate page correctly', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/crop')
      .field('top', '10')
      .field('bottom', '20')
      .field('left', '30')
      .field('right', '40')
      .field('pageRotations', JSON.stringify({ 1: 90 }))
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    const dlRes = await request(app).get(res.body.downloadUrl);
    const pdf = await PDFDocument.load(dlRes.body);
    const p1 = pdf.getPage(0);
    expect(p1.getRotation().angle).toBe(90);
    // When rot is 90: finalLeft = top = 10, finalBottom = left = 30
    const cb = p1.getCropBox();
    expect(cb.x).toBe(10);
    expect(cb.y).toBe(30);
  });

  it('should reject invalid crop margins exceeding page dimensions', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/crop')
      .field('top', '5000')
      .field('bottom', '5000')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
