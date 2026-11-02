import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
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
  startNumber?: number;
  skipFirst?: boolean;
  pages?: number[]; // 1-indexed
  font?: 'helvetica' | 'helvetica-bold' | 'times' | 'courier' | string;
  color?: string | { r: number; g: number; b: number };
  background?: 'none' | 'white' | 'dark' | 'transparent' | 'highlight';
  position?: 'center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
  style?: 'diagonal' | 'horizontal' | 'tiled';
  customXRatio?: number;
  customYRatio?: number;
  imageWidth?: number;
  imageHeight?: number;
  isBold?: boolean;
  isItalic?: boolean;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  pageRotations?: Record<number, number>;
  allPages?: boolean;
}

export interface PageNumberOptions {
  format?: 'page_of_total' | 'number_only' | 'page_number';
  position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  fontSize?: number;
  startPage?: number;
  startNumber?: number;
  skipFirst?: boolean;
  pages?: number[]; // 1-indexed
  font?: 'helvetica' | 'helvetica-bold' | 'times' | 'courier' | string;
  color?: string | { r: number; g: number; b: number };
  background?: 'none' | 'white' | 'dark' | 'transparent' | 'highlight';
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  pageRotations?: Record<number, number>;
}

export interface CropOptions {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  pages?: number[]; // 1-indexed, empty means all
  pageCrops?: Record<number, { top: number; bottom: number; left: number; right: number }>;
  pageRotations?: Record<number, number>;
}

export interface CompressOptions {
  targetSizeBytes?: number;
  preset?: 'extreme' | 'recommended' | 'less';
  quality?: number;
}

export interface CompressResult {
  buffer: Buffer;
  originalSize: number;
  finalSize: number;
  savedBytes: number;
  reductionPercentage: number;
  targetAchieved?: boolean;
  presetUsed: string;
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
  public async merge(pdfBuffers: Buffer[], fileOperations?: OrganizePageOption[][]): Promise<Buffer> {
    if (!pdfBuffers || pdfBuffers.length < 2) {
      throw new ValidationError('At least 2 PDF documents are required to merge');
    }

    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < pdfBuffers.length; i++) {
      const srcDoc = await this.loadPdf(pdfBuffers[i]);
      const ops = fileOperations && fileOperations[i];

      if (ops && Array.isArray(ops) && ops.length > 0) {
        const total = srcDoc.getPageCount();
        for (const op of ops) {
          if (op.deleted) continue;
          if (op.pageNumber < 1 || op.pageNumber > total) {
            continue;
          }
          const [copiedPage] = await mergedDoc.copyPages(srcDoc, [op.pageNumber - 1]);
          if (op.rotation) {
            const cur = copiedPage.getRotation().angle;
            copiedPage.setRotation(degrees((cur + op.rotation) % 360));
          }
          mergedDoc.addPage(copiedPage);
        }
      } else {
        const pageIndices = srcDoc.getPageIndices();
        const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
        for (const page of copiedPages) {
          mergedDoc.addPage(page);
        }
      }
    }

    if (mergedDoc.getPageCount() === 0) {
      throw new ValidationError('Cannot merge documents: all pages were excluded');
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
   * Genuine optimization: Strips metadata, recompresses embedded raster images via Sharp,
   * downsamples high-DPI graphics according to presets or target sizes, and packs xref streams.
   */
  public async compress(pdfBuffer: Buffer, options: CompressOptions = {}): Promise<Buffer> {
    const result = await this.compressWithStats(pdfBuffer, options);
    return result.buffer;
  }

  /**
   * Compresses PDF and calculates exact byte metrics and target attainment
   */
  public async compressWithStats(pdfBuffer: Buffer, options: CompressOptions = {}): Promise<CompressResult> {
    const originalSize = pdfBuffer.length;
    const targetSizeBytes = options.targetSizeBytes && options.targetSizeBytes > 0
      ? Number(options.targetSizeBytes)
      : undefined;
    const preset = options.preset || 'recommended';

    let quality = options.quality || 65;
    let maxDimension = 1600;

    // Dynamically calculate quality and resolution target if targetSizeBytes was specified
    if (targetSizeBytes) {
      const targetRatio = targetSizeBytes / originalSize;
      if (targetRatio < 0.45) {
        quality = 40;
        maxDimension = 1000;
      } else if (targetRatio < 0.75) {
        quality = 65;
        maxDimension = 1600;
      } else {
        quality = 80;
        maxDimension = 2200;
      }
    } else {
      if (preset === 'extreme') {
        quality = 45;
        maxDimension = 1000;
      } else if (preset === 'less') {
        quality = 80;
        maxDimension = 2200;
      } else {
        quality = 65;
        maxDimension = 1600;
      }
    }

    const srcDoc = await this.loadPdf(pdfBuffer);

    // Remove heavy metadata, optimize producer
    srcDoc.setTitle('');
    srcDoc.setAuthor('');
    srcDoc.setSubject('');
    srcDoc.setKeywords([]);
    srcDoc.setProducer('DocuSuite Compression Engine');
    srcDoc.setCreator('DocuSuite');

    // Recompress and downsample embedded images
    for (const [, obj] of srcDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        const subtype = obj.dict.get(PDFName.of('Subtype'));
        if (subtype === PDFName.of('Image')) {
          const filter = obj.dict.get(PDFName.of('Filter'));
          if (filter === PDFName.of('DCTDecode')) {
            const hasSMask = obj.dict.has(PDFName.of('SMask'));
            const wObj = obj.dict.get(PDFName.of('Width'));
            const hObj = obj.dict.get(PDFName.of('Height'));
            const w = wObj && typeof (wObj as any).asNumber === 'function' ? (wObj as any).asNumber() : null;
            const h = hObj && typeof (hObj as any).asNumber === 'function' ? (hObj as any).asNumber() : null;

            try {
              let pipeline = sharp(Buffer.from(obj.contents));
              let newW = w;
              let newH = h;
              // Downscale dimensions if larger than preset maximum (avoid if image has separate SMask transparency)
              if (!hasSMask && w && h && (w > maxDimension || h > maxDimension)) {
                if (w >= h) {
                  newW = maxDimension;
                  newH = Math.round((h * maxDimension) / w);
                } else {
                  newH = maxDimension;
                  newW = Math.round((w * maxDimension) / h);
                }
                pipeline = pipeline.resize(newW, newH, { fit: 'inside' });
              }

              const compressedImg = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
              if (compressedImg.length < obj.contents.length) {
                (obj as any).contents = new Uint8Array(compressedImg);
                obj.dict.set(PDFName.of('Length'), PDFNumber.of(compressedImg.length));
                if (!hasSMask && newW && newH && (newW !== w || newH !== h)) {
                  obj.dict.set(PDFName.of('Width'), PDFNumber.of(newW));
                  obj.dict.set(PDFName.of('Height'), PDFNumber.of(newH));
                }
              }
            } catch (imgErr: any) {
              // Some unusual DCT streams may not decode via libvips; skip gracefully
              logger.debug(`Skipped recompressing image stream: ${imgErr?.message || String(imgErr)}`);
            }
          }
        }
      }
    }

    const outBytes = await srcDoc.save({
      useObjectStreams: true,
      addDefaultPage: false
    });

    // If compression caused file size to grow (e.g. tiny 1-page vector PDF overhead), keep original
    if (outBytes.length >= originalSize) {
      return {
        buffer: pdfBuffer,
        originalSize,
        finalSize: originalSize,
        savedBytes: 0,
        reductionPercentage: 0,
        targetAchieved: targetSizeBytes ? originalSize <= targetSizeBytes : undefined,
        presetUsed: preset
      };
    }

    const finalSize = outBytes.length;
    const savedBytes = originalSize - finalSize;
    const reductionPercentage = Number(((savedBytes / originalSize) * 100).toFixed(1));
    const targetAchieved = targetSizeBytes ? finalSize <= targetSizeBytes : undefined;

    return {
      buffer: Buffer.from(outBytes),
      originalSize,
      finalSize,
      savedBytes,
      reductionPercentage,
      targetAchieved,
      presetUsed: preset
    };
  }

  /**
   * 4 & 5. PDF to JPG and PDF to PNG
   */
  public async pdfToImages(
    pdfBuffer: Buffer,
    format: 'jpg' | 'png' = 'png',
    scaleOrOptions: number | {
      scale?: number;
      dpi?: number;
      quality?: number;
      pages?: number[];
      password?: string;
      onPageProgress?: (page: number, total: number) => void | Promise<void>;
    } = 1.5
  ): Promise<{ page: number; buffer: Buffer; mimeType: string }[]> {
    let scale = 1.5;
    let quality = 85;
    let targetPages: number[] | undefined;
    let password: string | undefined;
    let onPageProgress: ((page: number, total: number) => void | Promise<void>) | undefined;

    if (typeof scaleOrOptions === 'number') {
      scale = scaleOrOptions;
    } else if (typeof scaleOrOptions === 'object' && scaleOrOptions !== null) {
      if (scaleOrOptions.dpi) {
        scale = scaleOrOptions.dpi / 72;
      } else if (scaleOrOptions.scale) {
        scale = scaleOrOptions.scale;
      }
      if (scaleOrOptions.quality !== undefined) {
        quality = Math.max(10, Math.min(100, Math.round(Number(scaleOrOptions.quality))));
      }
      if (scaleOrOptions.pages && Array.isArray(scaleOrOptions.pages)) {
        targetPages = scaleOrOptions.pages;
      }
      password = scaleOrOptions.password;
      onPageProgress = scaleOrOptions.onPageProgress;
    }

    try {
      const canvasModule = await import('@napi-rs/canvas');
      const { createCanvas } = canvasModule;
      (globalThis as any).Path2D = (canvasModule as any).Path2D;
      (globalThis as any).DOMMatrix = (canvasModule as any).DOMMatrix;

      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfjs: any = (pdfjsModule as any).getDocument ? pdfjsModule : (pdfjsModule as any).default || pdfjsModule;

      class NodeCanvasFactory {
        create(width: number, height: number) {
          const canvas = createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
          const context = canvas.getContext('2d');
          return { canvas, context };
        }
        reset(entry: any, width: number, height: number) {
          entry.canvas.width = Math.max(1, Math.round(width));
          entry.canvas.height = Math.max(1, Math.round(height));
        }
        destroy(entry: any) {
          entry.canvas.width = 0;
          entry.canvas.height = 0;
          entry.canvas = null;
          entry.context = null;
        }
      }

      let doc: any;
      try {
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(pdfBuffer),
          CanvasFactory: NodeCanvasFactory,
          useSystemFonts: true,
          disableFontFace: true,
          isEvalSupported: false,
          password: password || undefined
        });
        doc = await loadingTask.promise;
      } catch (loadErr: any) {
        const errMsg = loadErr?.message || String(loadErr);
        if (
          loadErr?.name === 'PasswordException' ||
          errMsg.toLowerCase().includes('password') ||
          errMsg.toLowerCase().includes('encrypted')
        ) {
          throw new ValidationError('This PDF document is encrypted or password-protected.');
        }
        if (
          loadErr?.name === 'InvalidPDFException' ||
          errMsg.toLowerCase().includes('invalid pdf') ||
          errMsg.toLowerCase().includes('corrupt')
        ) {
          throw new ValidationError(`Invalid or corrupted PDF document structure: ${errMsg}`);
        }
        throw new ValidationError(`Failed to open PDF document: ${errMsg}`);
      }

      const totalPages = doc.numPages;
      if (totalPages === 0) {
        throw new ValidationError('PDF document contains 0 pages.');
      }

      const pagesToRender: number[] = [];
      if (targetPages && targetPages.length > 0) {
        for (const p of targetPages) {
          const num = Number(p);
          if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > totalPages) {
            throw new ValidationError(`Invalid page number ${p}. Total pages in document: ${totalPages}`);
          }
          if (!pagesToRender.includes(num)) {
            pagesToRender.push(num);
          }
        }
      } else {
        for (let i = 1; i <= totalPages; i++) {
          pagesToRender.push(i);
        }
      }

      const results: { page: number; buffer: Buffer; mimeType: string }[] = [];
      const canvasFactory = new NodeCanvasFactory();

      for (let idx = 0; idx < pagesToRender.length; idx++) {
        const pageNum = pagesToRender[idx];
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // Render PDF page into canvas context
        await page.render({
          canvasContext: context as any,
          viewport,
          canvasFactory
        }).promise;

        let finalBuffer: Buffer;
        let mimeType: string;

        if (format === 'jpg') {
          // Encode directly from canvas to JPEG with target quality in a single native pass
          finalBuffer = await canvas.encode('jpeg', quality);
          mimeType = 'image/jpeg';
        } else {
          finalBuffer = await canvas.encode('png');
          mimeType = 'image/png';
        }

        try {
          page.cleanup();
        } catch {
          // ignore cleanup errors
        }

        results.push({
          page: pageNum,
          buffer: finalBuffer,
          mimeType
        });

        if (onPageProgress) {
          await onPageProgress(idx + 1, pagesToRender.length);
        }

        // Micro-yield to event loop so Node.js can process I/O and healthcheck requests
        await new Promise((resolve) => setImmediate(resolve));
      }

      try {
        doc.cleanup();
      } catch {
        // ignore cleanup errors
      }

      return results;
    } catch (err) {
      if (err instanceof ValidationError) {
        throw err;
      }
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
    rotation: number = 90,
    pageNumbers?: number[],
    pageRotations?: Record<string | number, number> | Array<{ pageNumber: number; rotation: number }>
  ): Promise<Buffer> {
    const doc = await this.loadPdf(pdfBuffer);
    const total = doc.getPageCount();

    // Check if per-page rotations provided
    if (pageRotations) {
      const rotationMap = new Map<number, number>();
      if (Array.isArray(pageRotations)) {
        for (const item of pageRotations) {
          const p = Number(item.pageNumber);
          const r = Number(item.rotation);
          if (isNaN(p) || !Number.isInteger(p) || p < 1 || p > total) {
            throw new ValidationError(`Invalid page number ${item.pageNumber}. Total pages: ${total}`);
          }
          if (isNaN(r) || r % 90 !== 0) {
            throw new ValidationError(`Invalid rotation angle for page ${item.pageNumber}: ${item.rotation}`);
          }
          rotationMap.set(p, ((r % 360) + 360) % 360);
        }
      } else if (typeof pageRotations === 'object' && pageRotations !== null) {
        for (const [key, val] of Object.entries(pageRotations)) {
          const p = Number(key);
          const r = Number(val);
          if (isNaN(p) || !Number.isInteger(p) || p < 1 || p > total) {
            throw new ValidationError(`Invalid page number ${key}. Total pages: ${total}`);
          }
          if (isNaN(r) || r % 90 !== 0) {
            throw new ValidationError(`Invalid rotation angle for page ${key}: ${val}`);
          }
          rotationMap.set(p, ((r % 360) + 360) % 360);
        }
      }

      for (const [pageNum, angle] of rotationMap.entries()) {
        const page = doc.getPage(pageNum - 1);
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees((currentRotation + angle) % 360));
      }

      const bytes = await doc.save();
      return Buffer.from(bytes);
    }

    if (pageNumbers !== undefined && pageNumbers.length === 0) {
      throw new ValidationError('pages array must not be empty if specified');
    }

    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const targetPages = pageNumbers && pageNumbers.length > 0
      ? pageNumbers
      : Array.from({ length: total }, (_, i) => i + 1);

    for (const pageNum of targetPages) {
      if (pageNum < 1 || pageNum > total) {
        throw new ValidationError(`Invalid page number ${pageNum}. Total pages: ${total}`);
      }
      const page = doc.getPage(pageNum - 1);
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + normalizedRotation) % 360));
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
   * Extract-specific helper: parses page numbers and ranges (e.g. "1-4", "1, 3-5, 8", [1, 2])
   */
  public parseExtractPages(input: unknown): number[] {
    if (input === null || input === undefined) {
      return [];
    }

    if (Array.isArray(input)) {
      const result: number[] = [];
      for (const item of input) {
        if (typeof item === 'number') {
          if (isNaN(item) || !Number.isInteger(item) || item < 1) {
            throw new ValidationError(`Invalid page number: ${item}`);
          }
          result.push(item);
        } else if (typeof item === 'string') {
          const sub = this.parseExtractPages(item);
          result.push(...sub);
        } else {
          throw new ValidationError(`Invalid page entry: ${String(item)}`);
        }
      }
      return result;
    }

    if (typeof input === 'number') {
      if (isNaN(input) || !Number.isInteger(input) || input < 1) {
        throw new ValidationError(`Invalid page number: ${input}`);
      }
      return [input];
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) {
        return [];
      }

      // If JSON array format (e.g. "[1, 2, 3]")
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return this.parseExtractPages(parsed);
          }
        } catch {
          // fall through to comma-separated range parser
        }
      }

      const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      const result: number[] = [];

      for (const part of parts) {
        if (part.includes('-')) {
          const rangeParts = part.split('-');
          if (rangeParts.length !== 2) {
            throw new ValidationError(`Invalid page range format: "${part}"`);
          }
          const [startStr, endStr] = rangeParts.map(s => s.trim());
          const start = Number(startStr);
          const end = Number(endStr);

          if (
            isNaN(start) ||
            isNaN(end) ||
            !Number.isInteger(start) ||
            !Number.isInteger(end)
          ) {
            throw new ValidationError(`Invalid page range numbers: "${part}"`);
          }
          if (start < 1 || end < 1) {
            throw new ValidationError(`Page numbers must be 1 or greater: "${part}"`);
          }
          if (start > end) {
            throw new ValidationError(`Invalid page range: start page (${start}) cannot exceed end page (${end})`);
          }

          for (let i = start; i <= end; i++) {
            result.push(i);
          }
        } else {
          const num = Number(part);
          if (isNaN(num) || !Number.isInteger(num)) {
            throw new ValidationError(`Invalid page number: "${part}"`);
          }
          if (num < 1) {
            throw new ValidationError(`Page numbers must be 1 or greater: "${part}"`);
          }
          result.push(num);
        }
      }

      return result;
    }

    throw new ValidationError(`Invalid pages specification type: ${typeof input}`);
  }

  /**
   * 10. Extract PDF pages
   */
  public async extract(pdfBuffer: Buffer, pagesToExtract: number[] | string | (number | string)[]): Promise<Buffer> {
    const srcDoc = await this.loadPdf(pdfBuffer);
    const total = srcDoc.getPageCount();

    const resolvedPages = this.parseExtractPages(pagesToExtract);
    if (!resolvedPages || resolvedPages.length === 0) {
      throw new ValidationError('At least one page must be specified for extraction');
    }

    const indices: number[] = [];
    for (const p of resolvedPages) {
      if (typeof p !== 'number' || isNaN(p) || !Number.isInteger(p) || p < 1 || p > total) {
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
    const { top = 0, bottom = 0, left = 0, right = 0, pages, pageCrops, pageRotations } = options;

    if (pageCrops && Object.keys(pageCrops).length > 0) {
      for (const [pageNumStr, margins] of Object.entries(pageCrops)) {
        const pageNum = Number(pageNumStr);
        if (isNaN(pageNum) || pageNum < 1 || pageNum > total) {
          throw new ValidationError(`Invalid page number ${pageNumStr}`);
        }
        const page = doc.getPage(pageNum - 1);
        const { width, height } = page.getSize();
        const mTop = Number(margins.top) || 0;
        const mBottom = Number(margins.bottom) || 0;
        const mLeft = Number(margins.left) || 0;
        const mRight = Number(margins.right) || 0;

        const extraRot = (pageRotations && pageRotations[pageNum]) || 0;
        const rot = ((page.getRotation().angle || 0) + extraRot) % 360;
        if (extraRot !== 0) {
          page.setRotation(degrees(rot));
        }
        let finalLeft = mLeft;
        let finalRight = mRight;
        let finalTop = mTop;
        let finalBottom = mBottom;

        if (rot === 90) {
          finalLeft = mTop;
          finalRight = mBottom;
          finalTop = mRight;
          finalBottom = mLeft;
        } else if (rot === 180) {
          finalLeft = mRight;
          finalRight = mLeft;
          finalTop = mBottom;
          finalBottom = mTop;
        } else if (rot === 270) {
          finalLeft = mBottom;
          finalRight = mTop;
          finalTop = mLeft;
          finalBottom = mRight;
        }

        const newWidth = width - finalLeft - finalRight;
        const newHeight = height - finalTop - finalBottom;

        if (newWidth <= 0 || newHeight <= 0) {
          throw new ValidationError(`Crop margins exceed page dimensions on page ${pageNum}`);
        }

        page.setCropBox(finalLeft, finalBottom, newWidth, newHeight);
      }
    } else {
      const targetPages = pages && pages.length > 0
        ? pages
        : Array.from({ length: total }, (_, i) => i + 1);

      for (const pageNum of targetPages) {
        if (pageNum < 1 || pageNum > total) {
          throw new ValidationError(`Invalid page number ${pageNum}`);
        }
        const page = doc.getPage(pageNum - 1);
        const { width, height } = page.getSize();

        const extraRot = (pageRotations && pageRotations[pageNum]) || 0;
        const rot = ((page.getRotation().angle || 0) + extraRot) % 360;
        if (extraRot !== 0) {
          page.setRotation(degrees(rot));
        }
        let finalLeft = left;
        let finalRight = right;
        let finalTop = top;
        let finalBottom = bottom;

        if (rot === 90) {
          finalLeft = top;
          finalRight = bottom;
          finalTop = right;
          finalBottom = left;
        } else if (rot === 180) {
          finalLeft = right;
          finalRight = left;
          finalTop = bottom;
          finalBottom = top;
        } else if (rot === 270) {
          finalLeft = bottom;
          finalRight = top;
          finalTop = left;
          finalBottom = right;
        }

        const newWidth = width - finalLeft - finalRight;
        const newHeight = height - finalTop - finalBottom;

        if (newWidth <= 0 || newHeight <= 0) {
          throw new ValidationError(`Crop margins exceed page dimensions on page ${pageNum}`);
        }

        page.setCropBox(finalLeft, finalBottom, newWidth, newHeight);
      }
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * 14. Add Page Numbers
   */
  public async addPageNumbers(pdfBuffer: Buffer, options: PageNumberOptions = {}): Promise<Buffer> {
    const doc = await this.loadPdf(pdfBuffer);
    const total = doc.getPageCount();

    // 1. Resolve Font
    let font;
    switch (options.font) {
      case 'helvetica-bold':
        font = await doc.embedFont(StandardFonts.HelveticaBold);
        break;
      /*
        const fName = (requestedFont || '').toLowerCase();
      const bold = isBold ?? (fName.includes('bold') || requestedFont === undefined);
      const italic = isItalic ?? (fName.includes('italic') || fName.includes('oblique'));

      if (fName.includes('times')) {
        if (bold && italic) font = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
        else if (bold) font = await doc.embedFont(StandardFonts.TimesRomanBold);
        else if (italic) font = await doc.embedFont(StandardFonts.TimesRomanItalic);
        else font = await doc.embedFont(StandardFonts.TimesRoman);
      } else if (fName.includes('courier')) {
        if (bold && italic) font = await doc.embedFont(StandardFonts.CourierBoldOblique);
        else if (bold) font = await doc.embedFont(StandardFonts.CourierBold);
        else if (italic) font = await doc.embedFont(StandardFonts.CourierOblique);
        else font = await doc.embedFont(StandardFonts.Courier);
      } else {
        if (bold && italic) font = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
        else if (bold) font = await doc.embedFont(StandardFonts.HelveticaBold);
        else if (italic) font = await doc.embedFont(StandardFonts.HelveticaOblique);
        else font = await doc.embedFont(StandardFonts.Helvetica);
      }
        break;
      */
      case 'times':
        font = await doc.embedFont(StandardFonts.TimesRoman);
        break;
      case 'courier':
        font = await doc.embedFont(StandardFonts.Courier);
        break;
      case 'helvetica':
      default:
        font = await doc.embedFont(StandardFonts.Helvetica);
        break;
    }

    // 2. Options & Defaults
    const {
      format = 'page_of_total',
      position = 'bottom-center',
      fontSize = 10,
      startPage = 1,
      startNumber = 1,
      skipFirst = false,
      pages: requestedPages,
      background = 'none',
      pageRotations
    } = options;

    // Resolve Margins
    const baseMargin = typeof options.margin === 'number' && !isNaN(options.margin) ? options.margin : 20;
    const marginTop = typeof options.marginTop === 'number' && !isNaN(options.marginTop) ? options.marginTop : baseMargin;
    const marginBottom = typeof options.marginBottom === 'number' && !isNaN(options.marginBottom) ? options.marginBottom : baseMargin;
    const marginLeft = typeof options.marginLeft === 'number' && !isNaN(options.marginLeft) ? options.marginLeft : baseMargin;
    const marginRight = typeof options.marginRight === 'number' && !isNaN(options.marginRight) ? options.marginRight : baseMargin;

    // Resolve Text Color
    const parseColor = (c?: string | { r: number; g: number; b: number }, defaultColor = rgb(0.2, 0.2, 0.2)) => {
      if (!c) return defaultColor;
      if (typeof c === 'string') {
        let hex = c.trim();
        if (hex.startsWith('#')) hex = hex.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map(ch => ch + ch).join('');
        }
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          return rgb(isNaN(r) ? 0.2 : r, isNaN(g) ? 0.2 : g, isNaN(b) ? 0.2 : b);
        }
        return defaultColor;
      }
      let { r, g, b } = c;
      if (r > 1 || g > 1 || b > 1) {
        r /= 255;
        g /= 255;
        b /= 255;
      }
      return rgb(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
    };

    const defaultTextColor = background === 'dark' ? rgb(0.95, 0.95, 0.95) : rgb(0.2, 0.2, 0.2);
    const textColor = parseColor(options.color, defaultTextColor);

    // 3. Determine which pages will be numbered
    const targetPages: number[] = [];
    const validRequestedPages = Array.isArray(requestedPages) && requestedPages.length > 0
      ? requestedPages.map(Number).filter(p => !isNaN(p) && p >= 1 && p <= total)
      : null;

    for (let p = 1; p <= total; p++) {
      if (p < startPage) continue;
      if (skipFirst && p === 1) continue;
      if (validRequestedPages && !validRequestedPages.includes(p)) continue;
      targetPages.push(p);
    }

    const totalCount = startNumber > 1
      ? (startNumber + targetPages.length - 1)
      : (validRequestedPages || skipFirst ? targetPages.length : total);

    // Coordinate mapping helper
    const getPageTransforms = (rot: number, bX: number, bY: number, bW: number, bH: number, xVal: number, yVal: number) => {
      rot = (rot % 360 + 360) % 360;
      if (rot === 90) {
        return { px: bX + bW - yVal, py: bY + xVal, angle: 90 };
      } else if (rot === 180) {
        return { px: bX + bW - xVal, py: bY + bH - yVal, angle: 180 };
      } else if (rot === 270) {
        return { px: bX + yVal, py: bY + bH - xVal, angle: 270 };
      } else {
        return { px: bX + xVal, py: bY + yVal, angle: 0 };
      }
    };

    for (let idx = 0; idx < targetPages.length; idx++) {
      const pageNum = targetPages[idx];
      const page = doc.getPage(pageNum - 1);
      const currentNumber = startNumber + idx;

      // Check crop box and rotation
      const cropBox = page.getCropBox();
      const boxX = cropBox.x;
      const boxY = cropBox.y;
      const boxW = cropBox.width;
      const boxH = cropBox.height;

      const manualRotation = pageRotations?.[pageNum] ?? 0;
      const pageRotation = ((page.getRotation().angle || 0) + manualRotation) % 360;
      const rot = (pageRotation % 360 + 360) % 360;

      if (manualRotation !== 0) {
        page.setRotation(degrees(rot));
      }

      const isSideways = (rot === 90 || rot === 270);
      const viewW = isSideways ? boxH : boxW;
      const viewH = isSideways ? boxW : boxH;

      let text = '';
      if (format === 'page_of_total') {
        text = `Page ${currentNumber} of ${totalCount}`;
      } else if (format === 'page_number') {
        text = `Page ${currentNumber}`;
      } else {
        text = `${currentNumber}`;
      }

      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      let vx = (viewW - textWidth) / 2;
      let vy = marginBottom;

      if (position === 'bottom-left') {
        vx = marginLeft;
        vy = marginBottom;
      } else if (position === 'bottom-right') {
        vx = viewW - textWidth - marginRight;
        vy = marginBottom;
      } else if (position === 'top-left') {
        vx = marginLeft;
        vy = viewH - textHeight - marginTop;
      } else if (position === 'top-center') {
        vx = (viewW - textWidth) / 2;
        vy = viewH - textHeight - marginTop;
      } else if (position === 'top-right') {
        vx = viewW - textWidth - marginRight;
        vy = viewH - textHeight - marginTop;
      }

      // Draw background pill/box if requested
      if (background === 'white' || background === 'dark') {
        const padX = Math.max(5, Math.round(fontSize * 0.45));
        const padY = Math.max(3, Math.round(fontSize * 0.3));
        const rectVx = vx - padX;
        const rectVy = vy - padY;
        const rectW = textWidth + padX * 2;
        const rectH = textHeight + padY * 2;

        const rectT = getPageTransforms(rot, boxX, boxY, boxW, boxH, rectVx, rectVy);
        const bgColor = background === 'dark' ? rgb(0.12, 0.14, 0.18) : rgb(1, 1, 1);
        const bgBorderColor = background === 'dark' ? rgb(0.25, 0.28, 0.35) : rgb(0.82, 0.85, 0.9);

        page.drawRectangle({
          x: rectT.px,
          y: rectT.py,
          width: rectW,
          height: rectH,
          color: bgColor,
          borderColor: bgBorderColor,
          borderWidth: 0.75,
          rotate: degrees(rectT.angle)
        });
      }

      // Draw text
      const textT = getPageTransforms(rot, boxX, boxY, boxW, boxH, vx, vy);
      page.drawText(text, {
        x: textT.px,
        y: textT.py,
        size: fontSize,
        font,
        color: textColor,
        rotate: degrees(textT.angle)
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
      font: requestedFont,
      background = 'none',
      position = 'center',
      style = 'diagonal',
      customXRatio = 0.5,
      customYRatio = 0.5,
      pageRotations,
      imageWidth,
      imageHeight,
      isBold,
      isItalic,
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
      const fName = (requestedFont || '').toLowerCase();
      const bold = isBold ?? (fName.includes('bold') || requestedFont === undefined);
      const italic = isItalic ?? (fName.includes('italic') || fName.includes('oblique'));

      if (fName.includes('times')) {
        if (bold && italic) font = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
        else if (bold) font = await doc.embedFont(StandardFonts.TimesRomanBold);
        else if (italic) font = await doc.embedFont(StandardFonts.TimesRomanItalic);
        else font = await doc.embedFont(StandardFonts.TimesRoman);
      } else if (fName.includes('courier')) {
        if (bold && italic) font = await doc.embedFont(StandardFonts.CourierBoldOblique);
        else if (bold) font = await doc.embedFont(StandardFonts.CourierBold);
        else if (italic) font = await doc.embedFont(StandardFonts.CourierOblique);
        else font = await doc.embedFont(StandardFonts.Courier);
      } else {
        if (bold && italic) font = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
        else if (bold) font = await doc.embedFont(StandardFonts.HelveticaBold);
        else if (italic) font = await doc.embedFont(StandardFonts.HelveticaOblique);
        else font = await doc.embedFont(StandardFonts.Helvetica);
      }
    } else if (imageBuffer) {
      try {
        if (imageMimeType === 'image/png' || (imageBuffer.length > 4 && imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50)) {
          embeddedImg = await doc.embedPng(imageBuffer);
        } else {
          embeddedImg = await doc.embedJpg(imageBuffer);
        }
      } catch {
        try {
          embeddedImg = await doc.embedJpg(imageBuffer);
        } catch {
          embeddedImg = await doc.embedPng(imageBuffer);
        }
      }
    }

    const parseWatermarkColor = (c?: string | { r: number; g: number; b: number }, defaultColor = rgb(0.5, 0.5, 0.5)) => {
      if (!c) return defaultColor;
      if (typeof c === 'string') {
        let hex = c.trim();
        if (hex.startsWith('#')) hex = hex.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map(ch => ch + ch).join('');
        }
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          return rgb(isNaN(r) ? 0.5 : r, isNaN(g) ? 0.5 : g, isNaN(b) ? 0.5 : b);
        }
        return defaultColor;
      }
      let { r, g, b } = c;
      if (r > 1 || g > 1 || b > 1) {
        r /= 255;
        g /= 255;
        b /= 255;
      }
      return rgb(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
    };

    const textColor = parseWatermarkColor(color);

    let effectiveRotation = rotationDegrees;
    if (style === 'horizontal') {
      effectiveRotation = 0;
    } else if (style === 'diagonal' && rotationDegrees === 0) {
      effectiveRotation = 45;
    }

    const getWatermarkTransforms = (rot: number, bX: number, bY: number, bW: number, bH: number, xVal: number, yVal: number) => {
      rot = (rot % 360 + 360) % 360;
      if (rot === 90) {
        return { px: bX + bW - yVal, py: bY + xVal, angle: 90 };
      } else if (rot === 180) {
        return { px: bX + bW - xVal, py: bY + bH - yVal, angle: 180 };
      } else if (rot === 270) {
        return { px: bX + yVal, py: bY + bH - xVal, angle: 270 };
      } else {
        return { px: bX + xVal, py: bY + yVal, angle: 0 };
      }
    };

    for (const pageNum of targetPages) {
      if (pageNum < 1 || pageNum > total) continue;
      const page = doc.getPage(pageNum - 1);

      const cropBox = page.getCropBox();
      const boxX = cropBox.x;
      const boxY = cropBox.y;
      const boxW = cropBox.width;
      const boxH = cropBox.height;

      const manualRotation = pageRotations?.[pageNum] ?? 0;
      const pageRotation = ((page.getRotation().angle || 0) + manualRotation) % 360;
      const rot = (pageRotation % 360 + 360) % 360;

      if (manualRotation !== 0) {
        page.setRotation(degrees(rot));
      }

      const isSideways = (rot === 90 || rot === 270);
      const viewW = isSideways ? boxH : boxW;
      const viewH = isSideways ? boxW : boxH;

      const centers: Array<{ vcx: number; vcy: number }> = [];
      if (style === 'tiled') {
        const cols = 3;
        const rows = 3;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            centers.push({
              vcx: ((c + 0.5) / cols) * viewW,
              vcy: ((r + 0.5) / rows) * viewH
            });
          }
        }
      } else {
        let vcx = viewW / 2;
        let vcy = viewH / 2;
        if (position === 'top-left') {
          vcx = viewW * 0.25;
          vcy = viewH * 0.8;
        } else if (position === 'top-center') {
          vcx = viewW * 0.5;
          vcy = viewH * 0.85;
        } else if (position === 'top-right') {
          vcx = viewW * 0.75;
          vcy = viewH * 0.8;
        } else if (position === 'bottom-left') {
          vcx = viewW * 0.25;
          vcy = viewH * 0.2;
        } else if (position === 'bottom-center') {
          vcx = viewW * 0.5;
          vcy = viewH * 0.15;
        } else if (position === 'bottom-right') {
          vcx = viewW * 0.75;
          vcy = viewH * 0.2;
        } else if (position === 'custom') {
          const rx = Math.max(0.05, Math.min(0.95, customXRatio));
          const ry = Math.max(0.05, Math.min(0.95, customYRatio));
          vcx = rx * viewW;
          vcy = (1 - ry) * viewH;
        }
        centers.push({ vcx, vcy });
      }

      const theta = (effectiveRotation * Math.PI) / 180;

      if (text && font) {
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        const cu = textWidth / 2;
        const cv = textHeight / 2;

        for (const { vcx, vcy } of centers) {
          if (background === 'white' || background === 'dark' || background === 'highlight') {
            const padX = Math.max(8, Math.round(fontSize * 0.4));
            const padY = Math.max(5, Math.round(fontSize * 0.25));
            const rectW = textWidth + padX * 2;
            const rectH = textHeight + padY * 2;
            const rectCu = rectW / 2;
            const rectCv = rectH / 2;

            const vRectAnchorX = vcx - (rectCu * Math.cos(theta) - rectCv * Math.sin(theta));
            const vRectAnchorY = vcy - (rectCu * Math.sin(theta) + rectCv * Math.cos(theta));
            const rectT = getWatermarkTransforms(rot, boxX, boxY, boxW, boxH, vRectAnchorX, vRectAnchorY);

            const bgColor = background === 'dark'
              ? rgb(0.12, 0.14, 0.18)
              : background === 'highlight'
              ? rgb(1, 0.96, 0.35)
              : rgb(1, 1, 1);
            const bgBorderColor = background === 'dark'
              ? rgb(0.25, 0.28, 0.35)
              : background === 'highlight'
              ? rgb(0.9, 0.8, 0.2)
              : rgb(0.85, 0.85, 0.85);

            page.drawRectangle({
              x: rectT.px,
              y: rectT.py,
              width: rectW,
              height: rectH,
              color: bgColor,
              borderColor: bgBorderColor,
              borderWidth: 0.75,
              opacity: Math.min(1, opacity + 0.15),
              rotate: degrees((effectiveRotation + rot) % 360)
            });
          }

          const vAnchorX = vcx - (cu * Math.cos(theta) - cv * Math.sin(theta));
          const vAnchorY = vcy - (cu * Math.sin(theta) + cv * Math.cos(theta));
          const textT = getWatermarkTransforms(rot, boxX, boxY, boxW, boxH, vAnchorX, vAnchorY);

          page.drawText(text, {
            x: textT.px,
            y: textT.py,
            size: fontSize,
            font,
            color: textColor,
            opacity,
            rotate: degrees((effectiveRotation + rot) % 360)
          });
        }
      } else if (embeddedImg) {
        let targetW = imageWidth || Math.min(viewW * 0.45, embeddedImg.width * 0.5);
        if (style === 'tiled') {
          targetW = Math.min(targetW, viewW * 0.25);
        }
        const scale = targetW / embeddedImg.width;
        const targetH = imageHeight || (embeddedImg.height * scale);
        const cu = targetW / 2;
        const cv = targetH / 2;

        for (const { vcx, vcy } of centers) {
          const vAnchorX = vcx - (cu * Math.cos(theta) - cv * Math.sin(theta));
          const vAnchorY = vcy - (cu * Math.sin(theta) + cv * Math.cos(theta));
          const imgT = getWatermarkTransforms(rot, boxX, boxY, boxW, boxH, vAnchorX, vAnchorY);

          page.drawImage(embeddedImg, {
            x: imgT.px,
            y: imgT.py,
            width: targetW,
            height: targetH,
            opacity,
            rotate: degrees((effectiveRotation + rot) % 360)
          });
        }
      }
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);

  }

  /* REMOVED_OLD_WATERMARK
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
        // dims
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
   * 16. Password protect PDF (Cleaned)
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
    // Keep original buffer to preserve exact stream fidelity

    const { pdfSecurity } = await import('../../utils/pdf-security.js');
    return pdfSecurity.encryptPdf(pdfBuffer, userPassword, ownerPassword);
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
