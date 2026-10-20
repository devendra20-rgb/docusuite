const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const outDir = path.join(__dirname, 'docker_outputs');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Minimal valid document creators
function createSampleHtml() {
  return '<!DOCTYPE html><html><head><title>DocuSuite Test</title></head><body><h1>DocuSuite Audit Verification</h1><p>Testing LibreOffice container conversion.</p></body></html>';
}

function createSampleRtf() {
  return '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Arial;}}\\f0\\fs24 DocuSuite RTF conversion test paragraph.\\par}';
}

// Minimal valid OpenXML ZIP builder using pure Node.js / archiver
async function buildMinimalDocx(filePath) {
  const archiver = require(path.join(__dirname, '../backend/node_modules/archiver'));
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
      { name: '[Content_Types].xml' }
    );

    archive.append(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
      { name: '_rels/.rels' }
    );

    archive.append(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>DocuSuite Audit Sample DOCX Document Paragraph.</w:t></w:r></w:p></w:body>' +
      '</w:document>',
      { name: 'word/document.xml' }
    );

    archive.finalize();
  });
}

async function buildMinimalPptx(filePath) {
  const archiver = require(path.join(__dirname, '../backend/node_modules/archiver'));
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '</Types>',
      { name: '[Content_Types].xml' }
    );

    archive.append(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '</Relationships>',
      { name: '_rels/.rels' }
    );

    archive.append(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldIdLst/>' +
      '</p:presentation>',
      { name: 'ppt/presentation.xml' }
    );

    archive.finalize();
  });
}

async function buildMinimalOdt(filePath) {
  const archiver = require(path.join(__dirname, '../backend/node_modules/archiver'));
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append('application/vnd.oasis.opendocument.text', { name: 'mimetype', store: true });
    archive.append(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      '<office:body><office:text><text:p>DocuSuite Sample ODT text for Docker conversion.</text:p></office:text></office:body>' +
      '</office:document-content>',
      { name: 'content.xml' }
    );

    archive.finalize();
  });
}

async function generateInputs() {
  const inputDir = path.join(__dirname, 'docker_inputs');
  if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });

  // HTML
  fs.writeFileSync(path.join(inputDir, 'sample.html'), createSampleHtml());
  // RTF
  fs.writeFileSync(path.join(inputDir, 'sample.rtf'), createSampleRtf());

  // PDF
  const { PDFDocument, StandardFonts } = require(path.join(__dirname, '../backend/node_modules/pdf-lib'));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([500, 700]);
  page.drawText('DocuSuite Audit Sample PDF for Office Conversions', { x: 50, y: 650, size: 16, font });
  fs.writeFileSync(path.join(inputDir, 'sample.pdf'), await doc.save());

  // XLSX
  const ExcelJS = require(path.join(__dirname, '../backend/node_modules/exceljs'));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(['Quarter', 'Revenue', 'Status']);
  ws.addRow(['Q1', 125000, 'Audited']);
  ws.addRow(['Q2', 184000, 'Verified']);
  const xlsxBuf = await wb.xlsx.writeBuffer();
  fs.writeFileSync(path.join(inputDir, 'sample.xlsx'), Buffer.from(xlsxBuf));

  // DOCX
  await buildMinimalDocx(path.join(inputDir, 'sample.docx'));

  // PPTX
  await buildMinimalPptx(path.join(inputDir, 'sample.pptx'));

  // ODT
  await buildMinimalOdt(path.join(inputDir, 'sample.odt'));

  return inputDir;
}

generateInputs().then((dir) => {
  console.log('Sample test inputs generated in:', dir);
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const stat = fs.statSync(path.join(dir, f));
    console.log(`  - ${f} (${stat.size} bytes)`);
  });
}).catch(console.error);

module.exports = { generateInputs };
