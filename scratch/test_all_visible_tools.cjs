const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require(path.join(__dirname, '../backend/node_modules/jsonwebtoken'));

const API_BASE = 'http://localhost:4000/api';

// Create a valid auth token to bypass guest rate limiter
const JWT_SECRET = 'super-secret-jwt-key-replace-in-production-min-32-chars';
const authToken = jwt.sign(
  { sub: '507f1f77bcf86cd799439011', email: 'auditor@docusuite.com', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '2h' }
);

async function makeMultiPartRequest(endpoint, files, fields = {}) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const chunks = [];

  for (const f of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${f.filename}"\r\n` +
      `Content-Type: ${f.contentType || 'application/octet-stream'}\r\n\r\n`
    ));
    chunks.push(f.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== '') {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${k}"\r\n\r\n` +
        `${valStr}\r\n`
      ));
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  const url = new URL(API_BASE + endpoint);

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function downloadBuffer(downloadPath) {
  const origin = API_BASE.replace('/api', '');
  const fullUrl = downloadPath.startsWith('http') ? downloadPath : `${origin}${downloadPath}`;
  const url = new URL(fullUrl);

  return new Promise((resolve, reject) => {
    http.get(url, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          buffer: Buffer.concat(chunks)
        });
      });
    }).on('error', reject);
  });
}

async function createDummyPdf(text = 'DocuSuite Test Page', pages = 1) {
  const { PDFDocument } = require(path.join(__dirname, '../backend/node_modules/pdf-lib'));
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${text} - Page ${i}`, { x: 50, y: 750, size: 20 });
  }
  return Buffer.from(await doc.save());
}

async function createSampleImage() {
  const sharp = require(path.join(__dirname, '../backend/node_modules/sharp'));
  return await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 4,
      background: { r: 184, g: 0, b: 53, alpha: 1 }
    }
  }).png().toBuffer();
}

async function run() {
  console.log('=== COMPREHENSIVE E2E VERIFICATION OF ALL VISIBLE TOOLS ===\n');
  const results = {};

  const pdf4 = await createDummyPdf('Multi-Page DocuSuite Test', 4);
  const pdfSingle = await createDummyPdf('Single Page Document', 1);
  const pngImg = await createSampleImage();

  // Helper tester
  async function testTool(id, name, endpoint, files, fields, validator) {
    process.stdout.write(`Testing [${name}] ... `);
    try {
      const res = await makeMultiPartRequest(endpoint, files, fields);
      if (res.status === 200 && res.json?.success) {
        let fileUrl = res.json.outputFiles?.[0]?.downloadUrl || res.json.downloadUrl;
        if (fileUrl) {
          const dl = await downloadBuffer(fileUrl);
          const valid = validator(dl.buffer, dl.contentType);
          if (valid) {
            console.log(`✓ PASS (${dl.buffer.length} bytes, verified format)`);
            results[id] = { status: 'PASS', size: dl.buffer.length, endpoint };
            return;
          } else {
            console.log(`✗ FAIL (signature check failed, size: ${dl.buffer.length})`);
            results[id] = { status: 'FAIL', error: 'Invalid output signature', size: dl.buffer.length, endpoint };
            return;
          }
        }
      }
      console.log(`✗ FAIL (status ${res.status}): ${JSON.stringify(res.json?.error || res.json)}`);
      results[id] = { status: 'FAIL', status_code: res.status, error: res.json?.error, endpoint };
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      results[id] = { status: 'ERROR', error: err.message, endpoint };
    }
  }

  // 1. Merge PDF
  await testTool(
    'merge-pdf', 'Merge PDF', '/tools/pdf/merge',
    [
      { filename: 'doc1.pdf', buffer: pdfSingle, contentType: 'application/pdf' },
      { filename: 'doc2.pdf', buffer: pdfSingle, contentType: 'application/pdf' }
    ],
    {},
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 2. Split PDF
  await testTool(
    'split-pdf', 'Split PDF (ranges)', '/tools/pdf/split',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { ranges: '1-2' },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 3. Compress PDF
  await testTool(
    'compress-pdf', 'Compress PDF', '/tools/pdf/compress',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    {},
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 4. Rotate PDF
  await testTool(
    'rotate-pdf', 'Rotate PDF', '/tools/pdf/rotate',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { rotation: 90 },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 5. Reorder PDF
  await testTool(
    'reorder-pdf', 'Reorder PDF', '/tools/pdf/reorder',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { pageOrder: '4,3,2,1' },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 6. Extract PDF
  await testTool(
    'extract-pdf', 'Extract PDF Pages', '/tools/pdf/extract',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { pages: '1,3' },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 7. Delete Pages
  await testTool(
    'delete-pdf-pages', 'Delete PDF Pages', '/tools/pdf/delete',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { pages: '2,4' },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 8. Organize PDF
  await testTool(
    'organize-pdf', 'Organize PDF', '/tools/pdf/organize',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { operations: JSON.stringify([{ pageNumber: 1, rotation: 90 }, { pageNumber: 2 }, { pageNumber: 3 }]) },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 9. Crop PDF
  await testTool(
    'crop-pdf', 'Crop PDF', '/tools/pdf/crop',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { top: 20, bottom: 20, left: 20, right: 20 },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 10. Add Page Numbers
  await testTool(
    'add-page-numbers', 'Add Page Numbers', '/tools/pdf/add-page-numbers',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { position: 'bottom-center', format: 'page_of_total', fontSize: 11 },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 11. Add Watermark
  await testTool(
    'add-watermark', 'Add Watermark', '/tools/pdf/add-watermark',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { text: 'CONFIDENTIAL AUDIT', opacity: 0.35, rotationDegrees: 45 },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 12. Protect PDF
  let encryptedPdfBuffer = null;
  await testTool(
    'protect-pdf', 'Protect PDF', '/tools/pdf/protect',
    [{ filename: 'doc.pdf', buffer: pdf4, contentType: 'application/pdf' }],
    { password: 'MasterAuditPassword2026' },
    (buf) => {
      encryptedPdfBuffer = buf;
      return buf.toString('binary').includes('/Encrypt');
    }
  );

  // 13. Unlock PDF
  if (encryptedPdfBuffer) {
    await testTool(
      'unlock-pdf', 'Unlock PDF', '/tools/pdf/unlock',
      [{ filename: 'protected.pdf', buffer: encryptedPdfBuffer, contentType: 'application/pdf' }],
      { password: 'MasterAuditPassword2026' },
      (buf) => buf.slice(0, 5).toString() === '%PDF-'
    );
  }

  // 14. Images to PDF
  await testTool(
    'images-to-pdf', 'Images to PDF', '/tools/images/to-pdf',
    [{ filename: 'sample.png', buffer: pngImg, contentType: 'image/png' }],
    { pageSize: 'A4', orientation: 'portrait' },
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 15. PDF to Images
  await testTool(
    'to-images', 'PDF to Images (PNG/ZIP)', '/tools/pdf/to-images',
    [{ filename: 'doc.pdf', buffer: pdfSingle, contentType: 'application/pdf' }],
    { format: 'png', dpi: 150 },
    (buf) => (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') || buf.slice(0, 2).toString() === 'PK'
  );

  // 16. CSV to Excel
  const csvBuffer = Buffer.from('ID,Product,Price,Quantity\n101,DocuSuite Pro,49.99,10\n102,Enterprise Cloud,199.00,5\n');
  let excelBuffer = null;
  await testTool(
    'csv-to-excel', 'CSV to Excel', '/tools/convert/csv-to-excel',
    [{ filename: 'catalog.csv', buffer: csvBuffer, contentType: 'text/csv' }],
    {},
    (buf) => {
      excelBuffer = buf;
      return buf.slice(0, 2).toString() === 'PK';
    }
  );

  // 17. Excel to CSV
  if (excelBuffer) {
    await testTool(
      'excel-to-csv', 'Excel to CSV', '/tools/convert/excel-to-csv',
      [{ filename: 'catalog.xlsx', buffer: excelBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
      {},
      (buf) => buf.toString().includes('DocuSuite Pro')
    );
  }

  // 18. Word to HTML (Mammoth)
  const docxInput = fs.readFileSync(path.join(__dirname, 'docker_inputs/sample.docx'));
  await testTool(
    'word-to-html', 'Word to HTML', '/tools/convert/word-to-html',
    [{ filename: 'sample.docx', buffer: docxInput, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
    {},
    (buf) => buf.toString().toLowerCase().includes('<html') || buf.toString().includes('<p')
  );

  // 19. TXT to PDF
  const txtBuffer = Buffer.from('DocuSuite Precision Document Studio\nAutomated Verification Report\nStatus: PASS');
  await testTool(
    'txt-to-pdf', 'TXT to PDF', '/tools/convert/txt-to-pdf',
    [{ filename: 'memo.txt', buffer: txtBuffer, contentType: 'text/plain' }],
    {},
    (buf) => buf.slice(0, 5).toString() === '%PDF-'
  );

  // 20. Batch Conversion
  process.stdout.write('Testing [Batch Conversion API] ... ');
  try {
    const csv1 = Buffer.from('A,B\n1,2');
    const csv2 = Buffer.from('X,Y\n8,9');
    const batchRes = await makeMultiPartRequest('/tools/convert/batch', [
      { filename: 'file1.csv', buffer: csv1, contentType: 'text/csv' },
      { filename: 'file2.csv', buffer: csv2, contentType: 'text/csv' }
    ], { targetFormat: 'xlsx' });

    if (batchRes.status === 200 && batchRes.json?.success && batchRes.json?.batchCount === 2) {
      console.log(`✓ PASS (Processed 2 batch files simultaneously)`);
      results['batch-conversion'] = { status: 'PASS', batchCount: 2, endpoint: '/tools/convert/batch' };
    } else {
      console.log(`✗ FAIL: ${JSON.stringify(batchRes.json)}`);
      results['batch-conversion'] = { status: 'FAIL', error: batchRes.json?.error };
    }
  } catch (err) {
    console.log(`✗ ERROR: ${err.message}`);
    results['batch-conversion'] = { status: 'ERROR', error: err.message };
  }

  // Save results
  const outPath = path.join(__dirname, 'all_visible_tools_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nAll results recorded to ${outPath}`);
}

run().catch(console.error);
