import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import {
  createSyntheticPdf,
  createSyntheticImage,
  createSyntheticCsv,
  createSyntheticTxt
} from '../fixtures/synthetic.js';

describe('DocuSuite Full API Integration Tests', () => {
  const app = createApp();
  let samplePdf1: Buffer;
  let samplePdf2: Buffer;
  let samplePng: Buffer;
  let sampleCsv: Buffer;
  let sampleTxt: Buffer;
  let authToken: string;

  beforeAll(async () => {
    samplePdf1 = await createSyntheticPdf(2);
    samplePdf2 = await createSyntheticPdf(1);
    samplePng = await createSyntheticImage('png');
    sampleCsv = createSyntheticCsv();
    sampleTxt = createSyntheticTxt(20);
  });

  describe('Health, Status & Documentation Endpoints', () => {
    it('GET /api/health should return ok and process metrics', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('docusuite-backend');
      expect(res.body.uptimeSeconds).toBeDefined();
    });

    it('GET /api/ready should return readiness and dependency status', async () => {
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      expect(res.body.dependencies).toBeDefined();
      expect(res.body.dependencies.storage).toBe('writable');
    });

    it('GET /api/docs.json should return the OpenAPI specification', async () => {
      const res = await request(app).get('/api/docs.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.info.title).toContain('DocuSuite');
      expect(res.body.paths['/tools/pdf/merge']).toBeDefined();
    });

    it('GET /api/nonexistent-route should return structured 404', async () => {
      const res = await request(app).get('/api/nonexistent-route');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Authentication Lifecycle', () => {
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      name: 'Integration Tester'
    };

    it('POST /api/auth/register should register a new user and return tokens', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.data.tokens.accessToken).toBeDefined();

      authToken = res.body.data.tokens.accessToken;
    });

    it('POST /api/auth/login should authenticate registered user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('GET /api/auth/me should return authenticated profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUser.email.toLowerCase());
    });

    it('GET /api/auth/me should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PDF Tools Endpoints (Phase 1)', () => {
    it('POST /api/tools/pdf/merge should merge uploaded PDFs', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/merge')
        .attach('files', samplePdf1, 'doc1.pdf')
        .attach('files', samplePdf2, 'doc2.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBeDefined();
      expect(res.body.status).toBe('completed');
      expect(res.body.outputFiles.length).toBe(1);
    });

    it('POST /api/tools/pdf/merge with single file should return 400 validation error', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/merge')
        .attach('files', samplePdf1, 'doc1.pdf');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/tools/pdf/split should split a PDF document', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/split')
        .field('pageRanges', '1, 2')
        .attach('files', samplePdf1, 'doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outputFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/tools/pdf/compress should compress an uploaded PDF', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/compress')
        .attach('files', samplePdf1, 'doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outputFiles.length).toBe(1);
    });

    it('POST /api/tools/pdf/rotate should rotate PDF pages', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/rotate')
        .field('rotation', '90')
        .attach('files', samplePdf1, 'doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/tools/images/to-pdf should convert uploaded images to PDF', async () => {
      const res = await request(app)
        .post('/api/tools/images/to-pdf')
        .attach('files', samplePng, 'img1.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outputFiles.length).toBe(1);
    });

    it('POST /api/tools/pdf/add-page-numbers should number pages of a PDF', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/add-page-numbers')
        .field('format', 'page_of_total')
        .field('position', 'bottom-center')
        .attach('files', samplePdf1, 'doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/tools/pdf/add-watermark should add text watermark to a PDF', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/add-watermark')
        .field('text', 'CONFIDENTIAL')
        .field('opacity', '0.2')
        .attach('files', samplePdf1, 'doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Conversions Endpoints (Phase 2)', () => {
    it('GET /api/tools/convert/capabilities should return supported conversions', async () => {
      const res = await request(app).get('/api/tools/convert/capabilities');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/tools/convert/csv-to-excel should convert CSV to Excel', async () => {
      const res = await request(app)
        .post('/api/tools/convert/csv-to-excel')
        .attach('files', sampleCsv, 'data.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outputFiles.length).toBe(1);
      expect(res.body.outputFiles[0].originalName).toContain('.xlsx');
    });

    it('POST /api/tools/convert/txt-to-pdf should convert text to PDF', async () => {
      const res = await request(app)
        .post('/api/tools/convert/txt-to-pdf')
        .attach('files', sampleTxt, 'notes.txt');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outputFiles.length).toBe(1);
    });
  });

  describe('Job Status & Downloads', () => {
    let createdJobId: string;

    it('should create an async job when requested with async=true', async () => {
      const res = await request(app)
        .post('/api/tools/pdf/compress?async=true')
        .attach('files', samplePdf1, 'doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBeDefined();
      createdJobId = res.body.jobId;
    });

    it('GET /api/jobs/:jobId should return job status information', async () => {
      const res = await request(app).get(`/api/jobs/${createdJobId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe(createdJobId);
      expect(res.body.data.tool).toBe('compress');
    });

    it('GET /api/jobs/:jobId with invalid id should return 404', async () => {
      const res = await request(app).get('/api/jobs/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
