import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import { pdfSecurity } from '../../src/utils/pdf-security.js';

export const createSyntheticPdf = async (pageCount = 3): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`Synthetic Test Document - Page ${i} of ${pageCount}`, {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0.1, 0.2, 0.5)
    });
    page.drawText('This is automated test content generated dynamically for DocuSuite.', {
      x: 50,
      y: 710,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
};

export const createSyntheticEncryptedPdf = async (password = 'secret123'): Promise<Buffer> => {
  const plainPdf = await createSyntheticPdf(2);
  return pdfSecurity.encryptPdf(plainPdf, password);
};

export const createCorruptedPdf = (): Buffer => {
  return Buffer.from('%PDF-1.4\n%Malformed corrupted content truncated %%EOF random text', 'utf8');
};

export const createSyntheticImage = async (format: 'png' | 'jpg' = 'png'): Promise<Buffer> => {
  const img = sharp({
    create: {
      width: 200,
      height: 200,
      channels: 4,
      background: { r: 50, g: 120, b: 220, alpha: 1 }
    }
  });

  return format === 'jpg' ? img.jpeg().toBuffer() : img.png().toBuffer();
};

export const createSyntheticCsv = (): Buffer => {
  const csv = `ID,Name,Department,Salary,Status
1,John Doe,Engineering,95000,Active
2,Jane Smith,Design,88000,Active
3,Bob Wilson,Marketing,72000,Pending
4,Alice Brown,Product,105000,Active`;
  return Buffer.from(csv, 'utf8');
};

export const createSyntheticXlsx = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.addRow(['ID', 'Item', 'Quantity', 'Price']);
  sheet.addRow([101, 'Document Folder', 5, 12.5]);
  sheet.addRow([102, 'Paper Clips', 20, 1.99]);
  sheet.addRow([103, 'Stapler', 2, 8.75]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const createSyntheticTxt = (linesCount = 30): Buffer => {
  const lines: string[] = [];
  for (let i = 1; i <= linesCount; i++) {
    lines.push(`Line ${i}: Sample text content for testing text to PDF paginated conversion.`);
  }
  return Buffer.from(lines.join('\n'), 'utf8');
};

export const createSyntheticDocx = async (): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    // Construct minimal valid Word .docx ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err) => reject(err));

    archive.append(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      { name: '[Content_Types].xml' }
    );

    archive.append(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      { name: '_rels/.rels' }
    );

    archive.append(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>DocuSuite Synthetic DOCX Heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is a paragraph converted from a synthetic Word document.</w:t></w:r></w:p>
  </w:body>
</w:document>`,
      { name: 'word/document.xml' }
    );

    archive.finalize().catch(reject);
  });
};
