import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createSyntheticPdf } from '../fixtures/synthetic.js';

describe('Organize PDF Integration Tests', () => {
  const app = createApp();
  let samplePdf3: Buffer;

  beforeAll(async () => {
    samplePdf3 = await createSyntheticPdf(3);
  });

  it('should organize with visual operations JSON string', async () => {
    const ops = [
      { pageNumber: 2, rotation: 90, deleted: false },
      { pageNumber: 1, rotation: 0, deleted: false },
      { pageNumber: 3, rotation: 0, deleted: true }
    ];

    const res = await request(app)
      .post('/api/tools/pdf/organize')
      .field('operations', JSON.stringify(ops))
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outputFiles).toBeDefined();
    expect(res.body.outputFiles.length).toBe(1);
    expect(res.body.outputFiles[0].originalName).toBe('organized-doc.pdf');

    // Test download URL
    const dlRes = await request(app).get(res.body.downloadUrl);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-type']).toBe('application/pdf');
    expect(dlRes.body.length).toBeGreaterThan(0);
  });

  it('should return 400 validation error if operations is missing', async () => {
    const res = await request(app)
      .post('/api/tools/pdf/organize')
      .attach('files', samplePdf3, 'doc.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
