import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createSyntheticPdf } from '../fixtures/synthetic.js';
import { PDFDocument } from 'pdf-lib';

describe('Extract PDF Pages Integration Tests', () => {
  const app = createApp();
  let samplePdf3: Buffer;
  let samplePdf20: Buffer;

  beforeAll(async () => {
    samplePdf3 = await createSyntheticPdf(3);
    samplePdf20 = await createSyntheticPdf(20);
  });

  it('should extract pages 1-4 from a 20-page PDF successfully', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '1-4')
      .attach('files', samplePdf20, '20pages.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outputFiles).toBeDefined();
    expect(res.body.outputFiles.length).toBe(1);
    expect(res.body.outputFiles[0].originalName).toBe('extracted-20pages.pdf');
  });

  it('should extract mixed range pages "1, 3" from a 3-page PDF', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '1, 3')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outputFiles.length).toBe(1);
  });

  it('should extract single page string "2" from a 3-page PDF', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '2')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outputFiles.length).toBe(1);
  });

  it('should reject invalid range format with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '1-foo')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject inverted range "4-1" with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '4-1')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject out-of-bounds page "99" with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '99')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject zero or negative page with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '0-2')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject empty pages input with 400 validation error', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/extract')
      .field('pages', '')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
