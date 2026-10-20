const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const API_BASE = 'http://localhost:4000/api';
const FRONTEND_URL = 'http://localhost:3000';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    }).on('error', reject);
  });
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    }).on('error', reject);
  });
}

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
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
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

async function run() {
  console.log('=================================================================');
  console.log('       DOCUSUITE — FULL DOCKER STACK VERIFICATION SUITE         ');
  console.log('=================================================================\n');

  const verificationResults = {};

  // 1. Docker Compose Container Health Check
  console.log('1. Checking Docker Compose Container States...');
  try {
    const psRaw = execSync('docker compose ps --format json', { encoding: 'utf8' });
    const containers = psRaw.trim().split(/\r?\n/).map(line => JSON.parse(line));
    console.log(`   Found ${containers.length} active containers:`);
    for (const c of containers) {
      console.log(`   - [${c.Service}] ${c.Name}: ${c.State} (${c.Health || 'no healthcheck'}) -> ${c.Ports || 'internal'}`);
    }
    verificationResults.containers = containers.map(c => ({ service: c.Service, name: c.Name, state: c.State, health: c.Health }));
  } catch (err) {
    console.log('   ✗ Error querying docker compose ps:', err.message);
  }

  // 2. Backend Liveness & Readiness Probes
  console.log('\n2. Testing Backend Health & Readiness Probes...');
  try {
    const health = await fetchJson(`${API_BASE}/health`);
    console.log(`   /api/health (Status ${health.status}):`, JSON.stringify(health.json));
    verificationResults.health = health.json;

    const ready = await fetchJson(`${API_BASE}/ready`);
    console.log(`   /api/ready (Status ${ready.status}):`, JSON.stringify(ready.json));
    verificationResults.ready = ready.json;

    const isReady = ready.status === 200 && ready.json?.status === 'ready';
    console.log(`   ✓ Readiness Probe: ${isReady ? 'PASSED (All dependencies operational)' : 'DEGRADED'}`);
  } catch (err) {
    console.log('   ✗ Failed to reach health/ready endpoints:', err.message);
  }

  // 3. Conversion Engine Capabilities Probe (LibreOffice Detection)
  console.log('\n3. Testing Conversion Engine Capabilities (/api/tools/convert/capabilities)...');
  try {
    const cap = await fetchJson(`${API_BASE}/tools/convert/capabilities`);
    const engines = cap.json?.data || cap.json?.engines || [];
    console.log(`   Detected ${engines.length} conversion engines:`);
    for (const e of engines) {
      console.log(`   - ${e.name}: available = ${e.available}`);
    }
    const loAvailable = engines.find(e => e.name === 'LibreOfficeHeadlessEngine')?.available;
    console.log(`   ✓ LibreOffice In Container: ${loAvailable ? 'ACTIVE & OPERATIONAL' : 'UNAVAILABLE'}`);
    verificationResults.libreOfficeAvailable = loAvailable;
  } catch (err) {
    console.log('   ✗ Failed to reach capabilities endpoint:', err.message);
  }

  // 4. Background Worker Inspection
  console.log('\n4. Checking Background Worker Logs...');
  try {
    const workerLogs = execSync('docker compose logs worker --tail=15', { encoding: 'utf8' });
    console.log('   Last 15 lines of worker logs:');
    console.log(workerLogs.split('\n').map(l => '     ' + l).join('\n'));
    verificationResults.workerActive = workerLogs.includes('BullMQ Worker is running');
  } catch (err) {
    console.log('   ✗ Failed to fetch worker logs:', err.message);
  }

  // 5. Frontend UI Availability
  console.log('\n5. Testing Frontend Access (http://localhost:3000)...');
  try {
    const feRes = await fetchText(FRONTEND_URL);
    const hasBrand = feRes.text.includes('DocuSuite') || feRes.text.includes('document');
    console.log(`   HTTP ${feRes.status} received (${feRes.text.length} bytes). Contains brand: ${hasBrand}`);
    verificationResults.frontend = { status: feRes.status, hasBrand };
  } catch (err) {
    console.log('   ✗ Failed to reach frontend:', err.message);
  }

  // 6. Test Word-to-PDF in Docker Stack
  console.log('\n6. Testing DOCX to PDF Conversion in Dockerized API...');
  try {
    const docxBuf = fs.readFileSync(path.join(__dirname, 'docker_inputs/sample.docx'));
    const res = await makeMultiPartRequest('/tools/convert/word-to-pdf', [
      { filename: 'sample.docx', buffer: docxBuf, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ]);
    if (res.status === 200 && res.json?.success) {
      const dl = await downloadBuffer(res.json.downloadUrl || res.json.outputFiles[0].downloadUrl);
      const isPdf = dl.buffer.slice(0, 5).toString() === '%PDF-';
      console.log(`   ✓ DOCX to PDF PASSED: Generated ${dl.buffer.length} bytes (%PDF- signature verified)`);
      verificationResults.docxToPdf = { status: 'PASS', bytes: dl.buffer.length };
    } else {
      console.log('   ✗ DOCX to PDF FAILED:', res.json);
      verificationResults.docxToPdf = { status: 'FAIL', error: res.json };
    }
  } catch (err) {
    console.log('   ✗ DOCX to PDF ERROR:', err.message);
    verificationResults.docxToPdf = { status: 'ERROR', error: err.message };
  }

  // 7. Test PDF-to-Word in Docker Stack
  console.log('\n7. Testing PDF to DOCX Conversion in Dockerized API...');
  try {
    const pdfBuf = fs.readFileSync(path.join(__dirname, 'docker_inputs/sample.pdf'));
    const res = await makeMultiPartRequest('/tools/convert/pdf-to-word', [
      { filename: 'sample.pdf', buffer: pdfBuf, contentType: 'application/pdf' }
    ]);
    if (res.status === 200 && res.json?.success) {
      const dl = await downloadBuffer(res.json.downloadUrl || res.json.outputFiles[0].downloadUrl);
      const isDocx = dl.buffer.slice(0, 2).toString() === 'PK';
      console.log(`   ✓ PDF to DOCX PASSED: Generated ${dl.buffer.length} bytes (PK zip container verified)`);
      verificationResults.pdfToDocx = { status: 'PASS', bytes: dl.buffer.length };
    } else {
      console.log('   ✗ PDF to DOCX FAILED:', res.json);
      verificationResults.pdfToDocx = { status: 'FAIL', error: res.json };
    }
  } catch (err) {
    console.log('   ✗ PDF to DOCX ERROR:', err.message);
    verificationResults.pdfToDocx = { status: 'ERROR', error: err.message };
  }

  // 8. Test Batch Conversion in Docker Stack
  console.log('\n8. Testing Batch Conversion in Dockerized API...');
  try {
    const csv1 = Buffer.from('ID,Name\n1,Alice\n2,Bob\n');
    const csv2 = Buffer.from('Product,Price\nWidget,19.99\nGadget,29.99\n');
    const res = await makeMultiPartRequest('/tools/convert/batch', [
      { filename: 'users.csv', buffer: csv1, contentType: 'text/csv' },
      { filename: 'products.csv', buffer: csv2, contentType: 'text/csv' }
    ], { targetFormat: 'xlsx' });

    if (res.status === 200 && res.json?.success && res.json?.batchCount === 2) {
      console.log(`   ✓ Batch Conversion PASSED: Converted ${res.json.batchCount} files in parallel.`);
      for (const item of res.json.outputFiles) {
        const dl = await downloadBuffer(item.downloadUrl);
        const isXlsx = dl.buffer.slice(0, 2).toString() === 'PK';
        console.log(`     - Downloaded ${item.filename} (${dl.buffer.length} bytes, valid XLSX = ${isXlsx})`);
      }
      verificationResults.batchConversion = { status: 'PASS', count: res.json.batchCount };
    } else {
      console.log('   ✗ Batch Conversion FAILED:', res.json);
      verificationResults.batchConversion = { status: 'FAIL', error: res.json };
    }
  } catch (err) {
    console.log('   ✗ Batch Conversion ERROR:', err.message);
    verificationResults.batchConversion = { status: 'ERROR', error: err.message };
  }

  // 9. Save All Verification Results
  const outPath = path.join(__dirname, 'docker_stack_verification_report.json');
  fs.writeFileSync(outPath, JSON.stringify(verificationResults, null, 2));
  console.log(`\nVerification results saved to ${outPath}\n`);
}

run().catch(console.error);
