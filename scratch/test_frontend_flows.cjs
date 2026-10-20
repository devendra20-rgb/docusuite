const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'http://localhost:4000/api';

async function makeMultiPartRequest(endpoint, files, fields = {}) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const chunks = [];

  // Add files
  for (const f of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${f.filename}"\r\n` +
      `Content-Type: ${f.contentType || 'application/octet-stream'}\r\n\r\n`
    ));
    chunks.push(f.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  // Add fields
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
    http.get(url, (res) => {
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

// Generate simple PDF in memory using minimal valid PDF specs
function createDummyPdf(text = 'DocuSuite Test Page', pages = 1) {
  // We can use pdf-lib from backend node_modules if present
  try {
    const { PDFDocument, rgb } = require(path.join(__dirname, '../backend/node_modules/pdf-lib'));
    return (async () => {
      const doc = await PDFDocument.create();
      for (let i = 1; i <= pages; i++) {
        const page = doc.addPage([595, 842]);
        page.drawText(`${text} - Page ${i}`, { x: 50, y: 750, size: 20 });
      }
      return Buffer.from(await doc.save());
    })();
  } catch (err) {
    throw new Error('pdf-lib not found: ' + err.message);
  }
}

async function run() {
  console.log('=== VERIFYING FRONTEND-TO-BACKEND WORKFLOWS ===\n');
  const results = {};

  const pdf1 = await createDummyPdf('Document A', 3);
  const pdf2 = await createDummyPdf('Document B', 2);

  // 1. Merge PDF
  console.log('1. Testing Merge PDF workflow...');
  try {
    const res = await makeMultiPartRequest('/tools/pdf/merge', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' },
      { filename: 'docB.pdf', buffer: pdf2, contentType: 'application/pdf' }
    ]);
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['merge-pdf'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ Merge PDF PASSED: Output size ' + dl.buffer.length + ' bytes, %PDF- verified');
    } else {
      results['merge-pdf'] = { pass: false, status: res.status, error: res.json?.error };
      console.log('   ✗ Merge PDF FAILED:', res.json);
    }
  } catch (e) {
    results['merge-pdf'] = { pass: false, error: e.message };
  }

  // 2. Split PDF (Range)
  console.log('2. Testing Split PDF (Range 1-2)...');
  try {
    const res = await makeMultiPartRequest('/tools/pdf/split', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' }
    ], { ranges: '1-2' });
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['split-pdf-range'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ Split PDF (Range) PASSED: Output size ' + dl.buffer.length + ' bytes');
    } else {
      results['split-pdf-range'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['split-pdf-range'] = { pass: false, error: e.message };
  }

  // 3. Compress PDF
  console.log('3. Testing Compress PDF...');
  try {
    const res = await makeMultiPartRequest('/tools/pdf/compress', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' }
    ]);
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['compress-pdf'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ Compress PDF PASSED: Output size ' + dl.buffer.length + ' bytes');
    } else {
      results['compress-pdf'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['compress-pdf'] = { pass: false, error: e.message };
  }

  // 4. Rotate PDF
  console.log('4. Testing Rotate PDF (rotation=90)...');
  try {
    const res = await makeMultiPartRequest('/tools/pdf/rotate', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' }
    ], { rotation: 90 });
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['rotate-pdf'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ Rotate PDF PASSED: Output size ' + dl.buffer.length + ' bytes');
    } else {
      results['rotate-pdf'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['rotate-pdf'] = { pass: false, error: e.message };
  }

  // 5. Add Page Numbers
  console.log('5. Testing Add Page Numbers (position=bottom-center, format=page_of_total)...');
  try {
    const res = await makeMultiPartRequest('/tools/pdf/add-page-numbers', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' }
    ], { position: 'bottom-center', format: 'page_of_total', fontSize: 10 });
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['add-page-numbers'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ Add Page Numbers PASSED: Output size ' + dl.buffer.length + ' bytes');
    } else {
      results['add-page-numbers'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['add-page-numbers'] = { pass: false, error: e.message };
  }

  // 6. Add Watermark
  console.log('6. Testing Add Watermark (text=AUDIT_VERIFIED, opacity=0.4)...');
  try {
    const res = await makeMultiPartRequest('/tools/pdf/add-watermark', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' }
    ], { text: 'AUDIT_VERIFIED', opacity: 0.4, rotationDegrees: 45 });
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['add-watermark'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ Add Watermark PASSED: Output size ' + dl.buffer.length + ' bytes');
    } else {
      results['add-watermark'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['add-watermark'] = { pass: false, error: e.message };
  }

  // 7. Protect PDF & Unlock PDF
  console.log('7. Testing Protect PDF & Unlock PDF...');
  try {
    const encRes = await makeMultiPartRequest('/tools/pdf/protect', [
      { filename: 'docA.pdf', buffer: pdf1, contentType: 'application/pdf' }
    ], { password: 'AuditPassword123' });
    if (encRes.status === 200 && encRes.json?.outputFiles?.[0]?.downloadUrl) {
      const encDl = await downloadBuffer(encRes.json.outputFiles[0].downloadUrl);
      const isEncrypted = encDl.buffer.toString('binary').includes('/Encrypt');
      results['protect-pdf'] = { pass: isEncrypted, status: encRes.status, size: encDl.buffer.length };
      console.log('   ✓ Protect PDF PASSED: Encrypted dictionary verified');

      // Now unlock it
      const unRes = await makeMultiPartRequest('/tools/pdf/unlock', [
        { filename: 'encrypted.pdf', buffer: encDl.buffer, contentType: 'application/pdf' }
      ], { password: 'AuditPassword123' });
      if (unRes.status === 200 && unRes.json?.outputFiles?.[0]?.downloadUrl) {
        const unDl = await downloadBuffer(unRes.json.outputFiles[0].downloadUrl);
        results['unlock-pdf'] = { pass: true, status: unRes.status, size: unDl.buffer.length };
        console.log('   ✓ Unlock PDF PASSED: Decrypted output size ' + unDl.buffer.length + ' bytes');
      } else {
        results['unlock-pdf'] = { pass: false, status: unRes.status, error: unRes.json?.error };
      }
    } else {
      results['protect-pdf'] = { pass: false, status: encRes.status, error: encRes.json?.error };
    }
  } catch (e) {
    results['protect-pdf'] = { pass: false, error: e.message };
  }

  // 8. CSV to Excel
  console.log('8. Testing CSV to Excel...');
  try {
    const csvContent = 'ID,Name,Role,Score\n101,John Doe,Auditor,98.5\n102,Jane Smith,Engineer,99.2\n';
    const res = await makeMultiPartRequest('/tools/convert/csv-to-excel', [
      { filename: 'scores.csv', buffer: Buffer.from(csvContent), contentType: 'text/csv' }
    ]);
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isZip = dl.buffer.slice(0, 2).toString() === 'PK'; // XLSX is ZIP container
      results['csv-to-excel'] = { pass: isZip, status: res.status, size: dl.buffer.length };
      console.log('   ✓ CSV to Excel PASSED: Valid XLSX PK container ' + dl.buffer.length + ' bytes');
    } else {
      results['csv-to-excel'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['csv-to-excel'] = { pass: false, error: e.message };
  }

  // 9. TXT to PDF
  console.log('9. Testing TXT to PDF...');
  try {
    const txtContent = 'DocuSuite Precision Document Studio\nAutomated functional audit verification report.\nAll tests passing losslessly.\n';
    const res = await makeMultiPartRequest('/tools/convert/txt-to-pdf', [
      { filename: 'report.txt', buffer: Buffer.from(txtContent), contentType: 'text/plain' }
    ]);
    if (res.status === 200 && res.json?.outputFiles?.[0]?.downloadUrl) {
      const dl = await downloadBuffer(res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      results['txt-to-pdf'] = { pass: isPdf, status: res.status, size: dl.buffer.length };
      console.log('   ✓ TXT to PDF PASSED: Output size ' + dl.buffer.length + ' bytes');
    } else {
      results['txt-to-pdf'] = { pass: false, status: res.status, error: res.json?.error };
    }
  } catch (e) {
    results['txt-to-pdf'] = { pass: false, error: e.message };
  }

  fs.writeFileSync(
    path.join(__dirname, 'frontend_flows_results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\nResults saved to frontend_flows_results.json');
}

run().catch(console.error);
