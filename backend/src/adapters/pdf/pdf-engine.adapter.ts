import {
  PDFDocument,
  degrees,
  rgb,
  StandardFonts
} from 'pdf-lib';
import sharp from 'sharp';
import {
  AppError,
  FileCorruptedError,
  FileEncryptedError,
  ValidationError
} from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';
import { assertFileIsPdf } from '../../utils/file-signatures.js';

const logger = createChildLogger('PdfEngineAdapter');

export interface RotatePageOption {
  pageNumber: number; // 1-indexed
  rotation: 90 | 180 | 270;
}

export interface OrganizePageOption {
  pageNumber: number; // 1-indexed source page
  rotation?: 90 | 180 | 270;
  deleted?: boolean;
}

export interface WatermarkOptions {
  text?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  opacity?: number; // 0 to 1
  rotationDegrees?: number;
  fontSize?: number;
  color?: { r: number; g: number; b: number };
  allPages?: boolean;
  pages?: number[]; // 1-indexed
}

export interface PageNumberOptions {
  format?: 'page_of_total' | 'number_only' | 'page_number';
  position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  fontSize?: number;
  startPage?: number;
  color?: { r: number; g: number; b: number };
}

export interface CropOptions {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  pages?: number[]; // 1-indexed, empty means all
}

export class PdfEngineAdapter {
  /**
   * Safe document loader with corruption & password detection
   */
  public async loadPdf(buffer: Buffer, password?: string): Promise<PDFDocument> {
    assertFileIsPdf(buffer);

    const isEncrypted = buffer.toString('latin1').includes('/Encrypt');
    if (isEncrypted && !password) {
      throw new FileEncryptedError('PDF document is encrypted and requires a password to open');
    }

    let workingBuffer = buffer;
    if (isEncrypted && password) {
      const { pdfSecurity } = await import('../../utils/pdf-security.js');
      workingBuffer = await pdfSecurity.unlockPdf(buffer, password);
    }

    try {
      const loadOptions: { password?: string; ignoreEncryption?: boolean } = {};
      if (password) {
        loadOptions.password = password;
      }
      const doc = await PDFDocument.load(workingBuffer, loadOptions);
      if (doc.getPageCount() === 0) {
        throw new FileCorruptedError('PDF document contains no pages or invalid structure');
      }
      return doc;
    } catch (err: unknown) {
      if (err instanceof FileCorruptedError || err instanceof FileEncryptedError || err instanceof AppError) {
        throw err;
      }
      const errorMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (errorMsg.includes('encrypt') || errorMsg.includes('password')) {
        throw new FileEncryptedError();
      }
      logger.warn('Failed to parse PDF document', { errorMsg });
      throw new FileCorruptedError('The supplied PDF document is corrupted or malformed');
    }
  }

  /**
   * 1. Merge multiple PDFs into a single document
   */
  public async merge(pdfBuffers: Buffer[]): Promise<Buffer> {
    if (!pdfBuffers || pdfBuffers.length < 2) {
      throw new ValidationError('At least 2 PDF documents are required to merge');
    }

    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < pdfBuffers.length; i++) {
      const srcDoc = await this.loadPdf(pdfBuffers[i]);
      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
      for (const page of copiedPages) {
        mergedDoc.addPage(page);
      }
    }

    const output = await mergedDoc.save();
    return Buffer.from(output);
  }

  /**
   * 2. Split PDF by page ranges or into single pages
   * pageRanges: e.g. "1-3,5,7-9" or undefined for individual pages
   */
  public async split(pdfBuffer: Buffer, pageRanges?: string): Promise<{ name: string; buffer: Buffer }[]> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    const totalPages = srcDoc.getPageCount();

    if (totalPages === 0) {
      throw new ValidationError('PDF contains no pages to split');
    }

    const results: { name: string; buffer: Buffer }[] = [];

    if (!pageRanges || pageRanges.trim() === '' || pageRanges === 'all') {
      // Split each page into its own PDF
      for (let i = 0; i < totalPages; i++) {
        const singleDoc = await PDFDocument.create();
        const [copiedPage] = await singleDoc.copyPages(srcDoc, [i]);
        singleDoc.addPage(copiedPage);
        const bytes = await singleDoc.save();
        results.push({
          name: `page-${i + 1}.pdf`,
          buffer: Buffer.from(bytes)
        });
      }
      return results;
    }

    // Split according to ranges (e.g. "1-2, 3-5")
    const parts = pageRanges.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      let start = 1;
      let end = 1;

      if (part.includes('-')) {
        const [s, e] = part.split('-').map(Number);
        start = s;
        end = e;
      } else {
        start = Number(part);
        end = Number(part);
      }

      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        throw new ValidationError(`Invalid page range: ${part}. Document has ${totalPages} pages.`);
      }

      const rangeDoc = await PDFDocument.create();
      const indices: number[] = [];
      for (let pageNum = start; pageNum <= end; pageNum++) {
        indices.push(pageNum - 1);
      }

      const copiedPages = await rangeDoc.copyPages(srcDoc, indices);
      copiedPages.forEach(p => rangeDoc.addPage(p));
      const bytes = await rangeDoc.save();

      results.push({
        name: `pages-${start}-to-${end}.pdf`,
        buffer: Buffer.from(bytes)
      });
    }

    return results;
  }

  /**
   * 3. Compress PDF
   * Strips unused objects, metadata, compacts xref tables and streams
   */
  public async compress(pdfBuffer: Buffer): Promise<Buffer> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    // Remove heavy metadata, optimize object streams
    srcDoc.setTitle('');
    srcDoc.setAuthor('');
    srcDoc.setSubject('');
    srcDoc.setKeywords([]);
    srcDoc.setProducer('DocuSuite Compression Engine');
    srcDoc.setCreator('DocuSuite');

    const bytes = await srcDoc.save({
      useObjectStreams: true,
      addDefaultPage: false
    });
    return Buffer.from(bytes);
  }

  /**
   * 4 & 5. PDF to JPG and PDF to PNG
   */
  public async pdfToImages(
    pdfBuffer: Buffer,
    format: 'jpg' | 'png' = 'png',
    scale = 1.5
  ): Promise<{ page: number; buffer: Buffer; mimeType: string }[]> {
    try {
      const canvasModule = await import('@napi-rs/canvas');
      const { createCanvas } = canvasModule;
      (globalThis as any).Path2D = (canvasModule as any).Path2D;
      (globalThis as any).DOMMatrix = (canvasModule as any).DOMMatrix;

      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfjs: any = (pdfjsModule as any).getDocument ? pdfjsModule : (pdfjsModule as any).default || pdfjsModule;

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false
      });
      const doc = await loadingTask.promise;
      const results: { page: number; buffer: Buffer; mimeType: string }[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // Render PDF page into canvas context
        await page.render({
          canvasContext: context as any,
          viewport
        }).promise;

        const rawBuffer = format === 'jpg'
          ? await canvas.encode('jpeg')
          : await canvas.encode('png');

        let finalBuffer = rawBuffer;

        if (format === 'jpg') {
          finalBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
        }

        results.push({
          page: i,
          buffer: finalBuffer,
          mimeType: format === 'jpg' ? 'image/jpeg' : 'image/png'
        });
      }

      return results;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('PDF to image rendering failed', { message: errMsg, stack: (err as any)?.stack });
      throw new AppError(`Failed to rasterize PDF pages to images: ${errMsg}`, 500);
    }
  }

  /**
   * 6 & 7. JPG/PNG to PDF
   */
  public async imagesToPdf(
    images: { buffer: Buffer; mimeType: string }[],
    options: { fitToPage?: boolean } = {}
  ): Promise<Buffer> {
    if (!images || images.length === 0) {
      throw new ValidationError('At least one image is required to build a PDF');
    }

    const doc = await PDFDocument.create();

    for (const img of images) {
      let embeddedImage;
      // Normalize image to PNG or JPEG via Sharp if needed
      if (img.mimeType === 'image/png') {
        const pngBuf = await sharp(img.buffer).png().toBuffer();
        embeddedImage = await doc.embedPng(pngBuf);
      } else {
        const jpgBuf = await sharp(img.buffer).jpeg().toBuffer();
        embeddedImage = await doc.embedJpg(jpgBuf);
      }

      const imgDims = embeddedImage.scale(1);
      const page = doc.addPage([imgDims.width, imgDims.height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imgDims.width,
        height: imgDims.height
      });
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * 8. Rotate PDF pages
   */
  public async rotate(
    pdfBuffer: Buffer,
    rotation: 90 | 180 | 270,
    pageNumbers?: number[]
  ): Promise<Buffer> {
    const doc = await this.loadPdf(pdfBuffer);
    const total = doc.getPageCount();

    const targetPages = pageNumbers && pageNumbers.length > 0
      ? pageNumbers
      : Array.from({ length: total }, (_, i) => i + 1);

    for (const pageNum of targetPages) {
      if (pageNum < 1 || pageNum > total) {
        throw new ValidationError(`Invalid page number ${pageNum}. Total pages: ${total}`);
      }
      const page = doc.getPage(pageNum - 1);
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + rotation) % 360));
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * 9. Reorder PDF pages
   * pageOrder: e.g. [3, 1, 2] (1-indexed)
   */
  public async reorder(pdfBuffer: Buffer, pageOrder: number[]): Promise<Buffer> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    const total = srcDoc.getPageCount();

    if (!pageOrder || pageOrder.length !== total) {
      throw new ValidationError(`Page order array must contain exactly ${total} page indices`);
    }

    const seen = new Set<number>();
    for (const p of pageOrder) {
      if (p < 1 || p > total || seen.has(p)) {
        throw new ValidationError(`Invalid page index ${p} in reorder sequence`);
      }
      seen.add(p);
    }

    const newDoc = await PDFDocument.create();
    const indices = pageOrder.map(p => p - 1);
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * 10. Extract PDF pages
   */
  public async extract(pdfBuffer: Buffer, pagesToExtract: number[]): Promise<Buffer> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    const total = srcDoc.getPageCount();

    if (!pagesToExtract || pagesToExtract.length === 0) {
      throw new ValidationError('At least one page must be specified for extraction');
    }

    const indices: number[] = [];
    for (const p of pagesToExtract) {
      if (p < 1 || p > total) {
        throw new ValidationError(`Cannot extract page ${p}: document has ${total} pages`);
      }
      indices.push(p - 1);
    }

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * 11. Delete PDF pages
   */
  public async deletePages(pdfBuffer: Buffer, pagesToDelete: number[]): Promise<Buffer> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    const total = srcDoc.getPageCount();

    if (!pagesToDelete || pagesToDelete.length === 0) {
      throw new ValidationError('No pages specified for deletion');
    }

    const deleteSet = new Set(pagesToDelete);
    if (deleteSet.size >= total) {
      throw new ValidationError('Cannot delete all pages of a PDF document');
    }

    const keepIndices: number[] = [];
    for (let i = 1; i <= total; i++) {
      if (!deleteSet.has(i)) {
        keepIndices.push(i - 1);
      }
    }

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, keepIndices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * 12. Organize PDF pages (atomic reorder, rotate and delete)
   */
  public async organize(pdfBuffer: Buffer, operations: OrganizePageOption[]): Promise<Buffer> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    const total = srcDoc.getPageCount();

    if (!operations || operations.length === 0) {
      throw new ValidationError('Operations array is required for organize');
    }

    const newDoc = await PDFDocument.create();

    for (const op of operations) {
      if (op.deleted) continue;
      if (op.pageNumber < 1 || op.pageNumber > total) {
        throw new ValidationError(`Invalid page number ${op.pageNumber}`);
      }

      const [copiedPage] = await newDoc.copyPages(srcDoc, [op.pageNumber - 1]);
      if (op.rotation) {
        const cur = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((cur + op.rotation) % 360));
      }
      newDoc.addPage(copiedPage);
    }

    if (newDoc.getPageCount() === 0) {
      throw new ValidationError('Resulting PDF has 0 pages. At least one page must remain.');
    }

    const bytes = await newDoc.save();
    return Buffer.from(bytes);
  }

  /**
   * 13. Crop PDF
   */
  public async crop(pdfBuffer: Buffer, options: CropOptions): Promise<Buffer> {
    const doc = await this.loadPdf(pdfBuffer);
    const total = doc.getPageCount();
    const { top = 0, bottom = 0, left = 0, right = 0, pages } = options;

    const targetPages = pages && pages.length > 0
      ? pages
      : Array.from({ length: total }, (_, i) => i + 1);

    for (const pageNum of targetPages) {
      if (pageNum < 1 || pageNum > total) {
        throw new ValidationError(`Invalid page number ${pageNum}`);
      }
      const page = doc.getPage(pageNum - 1);
      const { width, height } = page.getSize();

      const newWidth = width - left - right;
      const newHeight = height - top - bottom;

      if (newWidth <= 0 || newHeight <= 0) {
        throw new ValidationError(`Crop margins exceed page dimensions on page ${pageNum}`);
      }

      page.setCropBox(left, bottom, newWidth, newHeight);
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * 14. Add Page Numbers
   */
  public async addPageNumbers(pdfBuffer: Buffer, options: PageNumberOptions = {}): Promise<Buffer> {
    const doc = await this.loadPdf(pdfBuffer);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const total = doc.getPageCount();

    const {
      format = 'page_of_total',
      position = 'bottom-center',
      fontSize = 10,
      startPage = 1,
      color = { r: 0.3, g: 0.3, b: 0.3 }
    } = options;

    const textColor = rgb(color.r, color.g, color.b);

    for (let i = startPage - 1; i < total; i++) {
      const page = doc.getPage(i);
      const { width, height } = page.getSize();
      const pageNum = i + 1;

      let text = '';
      if (format === 'page_of_total') {
        text = `Page ${pageNum} of ${total}`;
      } else if (format === 'page_number') {
        text = `Page ${pageNum}`;
      } else {
        text = `${pageNum}`;
      }

      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);
      const margin = 20;

      let x = (width - textWidth) / 2;
      let y = margin;

      if (position === 'bottom-left') {
        x = margin;
        y = margin;
      } else if (position === 'bottom-right') {
        x = width - textWidth - margin;
        y = margin;
      } else if (position === 'top-left') {
        x = margin;
        y = height - textHeight - margin;
      } else if (position === 'top-center') {
        x = (width - textWidth) / 2;
        y = height - textHeight - margin;
      } else if (position === 'top-right') {
        x = width - textWidth - margin;
        y = height - textHeight - margin;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: textColor
      });
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * 15. Add Watermark (Text or Image)
   */
  public async addWatermark(pdfBuffer: Buffer, options: WatermarkOptions): Promise<Buffer> {
    const doc = await this.loadPdf(pdfBuffer);
    const total = doc.getPageCount();

    const {
      text,
      imageBuffer,
      imageMimeType,
      opacity = 0.3,
      rotationDegrees = 45,
      fontSize = 50,
      color = { r: 0.5, g: 0.5, b: 0.5 },
      pages
    } = options;

    if (!text && !imageBuffer) {
      throw new ValidationError('Either text or imageBuffer must be provided for watermark');
    }

    const targetPages = pages && pages.length > 0
      ? pages
      : Array.from({ length: total }, (_, i) => i + 1);

    let font;
    let embeddedImg;

    if (text) {
      font = await doc.embedFont(StandardFonts.HelveticaBold);
    } else if (imageBuffer) {
      if (imageMimeType === 'image/png') {
        embeddedImg = await doc.embedPng(imageBuffer);
      } else {
        embeddedImg = await doc.embedJpg(imageBuffer);
      }
    }

    for (const pageNum of targetPages) {
      if (pageNum < 1 || pageNum > total) continue;
      const page = doc.getPage(pageNum - 1);
      const { width, height } = page.getSize();

      if (text && font) {
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          opacity,
          rotate: degrees(rotationDegrees)
        });
      } else if (embeddedImg) {
        const dims = embeddedImg.scale(0.5);
        page.drawImage(embeddedImg, {
          x: (width - dims.width) / 2,
          y: (height - dims.height) / 2,
          width: dims.width,
          height: dims.height,
          opacity,
          rotate: degrees(rotationDegrees)
        });
      }
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * 16. Password protect PDF
   */
  public async protect(
    pdfBuffer: Buffer,
    userPassword: string,
    ownerPassword?: string
  ): Promise<Buffer> {
    if (!userPassword || userPassword.trim().length === 0) {
      throw new ValidationError('Password is required to protect the document');
    }

    // Verify it is a valid PDF first and ensure standard trailer is emitted
    const doc = await this.loadPdf(pdfBuffer);
    const standardizedPdf = await doc.save({ useObjectStreams: false });

    const { pdfSecurity } = await import('../../utils/pdf-security.js');
    return pdfSecurity.encryptPdf(Buffer.from(standardizedPdf), userPassword, ownerPassword);
  }

  /**
   * 17. Unlock authorized PDF
   */
  public async unlock(pdfBuffer: Buffer, password: string): Promise<Buffer> {
    if (!password) {
      throw new ValidationError('Password is required to unlock this document');
    }

    // loadPdf will authenticate using the provided password
    const doc = await this.loadPdf(pdfBuffer, password);

    // Saving without re-encrypting outputs an unlocked, password-free PDF
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }
}

export const pdfEngine = new PdfEngineAdapter();
