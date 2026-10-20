import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfEngine } from '../../src/adapters/pdf/pdf-engine.adapter.js';
import {
  createSyntheticPdf,
  createSyntheticEncryptedPdf,
  createCorruptedPdf,
  createSyntheticImage
} from '../fixtures/synthetic.js';
import {
  FileCorruptedError,
  FileEncryptedError,
  ValidationError
} from '../../src/utils/errors.js';

describe('PdfEngineAdapter (Phase 1 PDF Tools)', () => {
  let samplePdf3Pages: Buffer;
  let samplePdf2Pages: Buffer;
  let samplePngImage: Buffer;
  let sampleJpgImage: Buffer;

  beforeAll(async () => {
    samplePdf3Pages = await createSyntheticPdf(3);
    samplePdf2Pages = await createSyntheticPdf(2);
    samplePngImage = await createSyntheticImage('png');
    sampleJpgImage = await createSyntheticImage('jpg');
  });

  // 1. Merge
  describe('1. Merge PDFs', () => {
    it('should successfully merge two or more PDFs into a single document', async () => {
      const merged = await pdfEngine.merge([samplePdf3Pages, samplePdf2Pages]);
      expect(merged).toBeInstanceOf(Buffer);

      const doc = await PDFDocument.load(merged);
      expect(doc.getPageCount()).toBe(5);
    });

    it('should throw ValidationError if less than 2 PDF documents are provided', async () => {
      await expect(pdfEngine.merge([samplePdf3Pages])).rejects.toThrow(ValidationError);
      await expect(pdfEngine.merge([])).rejects.toThrow(ValidationError);
    });
  });

  // 2. Split
  describe('2. Split PDF', () => {
    it('should split PDF into individual single pages by default', async () => {
      const parts = await pdfEngine.split(samplePdf3Pages);
      expect(parts).toHaveLength(3);
      expect(parts[0].name).toBe('page-1.pdf');
      expect(parts[1].name).toBe('page-2.pdf');
      expect(parts[2].name).toBe('page-3.pdf');

      const doc1 = await PDFDocument.load(parts[0].buffer);
      expect(doc1.getPageCount()).toBe(1);
    });

    it('should split PDF according to specified page ranges', async () => {
      const parts = await pdfEngine.split(samplePdf3Pages, '1-2, 3');
      expect(parts).toHaveLength(2);
      expect(parts[0].name).toBe('pages-1-to-2.pdf');
      expect(parts[1].name).toBe('pages-3-to-3.pdf');

      const doc1 = await PDFDocument.load(parts[0].buffer);
      expect(doc1.getPageCount()).toBe(2);

      const doc2 = await PDFDocument.load(parts[1].buffer);
      expect(doc2.getPageCount()).toBe(1);
    });

    it('should throw ValidationError for invalid page ranges', async () => {
      await expect(pdfEngine.split(samplePdf3Pages, '4-5')).rejects.toThrow(ValidationError);
      await expect(pdfEngine.split(samplePdf3Pages, '3-1')).rejects.toThrow(ValidationError);
      await expect(pdfEngine.split(samplePdf3Pages, 'abc')).rejects.toThrow(ValidationError);
    });
  });

  // 3. Compress
  describe('3. Compress PDF', () => {
    it('should compress and optimize PDF structure', async () => {
      const compressed = await pdfEngine.compress(samplePdf3Pages);
      expect(compressed).toBeInstanceOf(Buffer);

      const doc = await PDFDocument.load(compressed);
      expect(doc.getPageCount()).toBe(3);
      expect(compressed.length).toBeGreaterThan(0);
    });
  });

  // 4 & 5. PDF to Images
  describe('4 & 5. PDF to Images (PNG & JPG)', () => {
    it('should rasterize PDF pages to PNG images', async () => {
      const images = await pdfEngine.pdfToImages(samplePdf2Pages, 'png');
      expect(images).toHaveLength(2);
      expect(images[0].mimeType).toBe('image/png');
      expect(images[0].buffer.length).toBeGreaterThan(100);
      expect(images[1].mimeType).toBe('image/png');
    });

    it('should rasterize PDF pages to JPG images', async () => {
      const images = await pdfEngine.pdfToImages(samplePdf2Pages, 'jpg');
      expect(images).toHaveLength(2);
      expect(images[0].mimeType).toBe('image/jpeg');
      expect(images[0].buffer.length).toBeGreaterThan(100);
    });
  });

  // 6 & 7. Images to PDF
  describe('6 & 7. Images to PDF', () => {
    it('should convert an array of PNG/JPG images into a single multi-page PDF', async () => {
      const pdf = await pdfEngine.imagesToPdf([
        { buffer: samplePngImage, mimeType: 'image/png' },
        { buffer: sampleJpgImage, mimeType: 'image/jpeg' }
      ]);
      expect(pdf).toBeInstanceOf(Buffer);

      const doc = await PDFDocument.load(pdf);
      expect(doc.getPageCount()).toBe(2);
    });

    it('should throw ValidationError when no images are provided', async () => {
      await expect(pdfEngine.imagesToPdf([])).rejects.toThrow(ValidationError);
    });
  });

  // 8. Rotate
  describe('8. Rotate PDF', () => {
    it('should rotate all pages by specified angle', async () => {
      const rotated = await pdfEngine.rotate(samplePdf3Pages, 90);
      const doc = await PDFDocument.load(rotated);
      expect(doc.getPage(0).getRotation().angle).toBe(90);
      expect(doc.getPage(1).getRotation().angle).toBe(90);
    });

    it('should rotate specific pages only', async () => {
      const rotated = await pdfEngine.rotate(samplePdf3Pages, 180, [2]);
      const doc = await PDFDocument.load(rotated);
      expect(doc.getPage(0).getRotation().angle).toBe(0);
      expect(doc.getPage(1).getRotation().angle).toBe(180);
      expect(doc.getPage(2).getRotation().angle).toBe(0);
    });

    it('should throw ValidationError on out-of-range page number', async () => {
      await expect(pdfEngine.rotate(samplePdf3Pages, 90, [5])).rejects.toThrow(ValidationError);
    });
  });

  // 9. Reorder
  describe('9. Reorder PDF Pages', () => {
    it('should reorder pages in the specified sequence', async () => {
      const reordered = await pdfEngine.reorder(samplePdf3Pages, [3, 1, 2]);
      const doc = await PDFDocument.load(reordered);
      expect(doc.getPageCount()).toBe(3);
    });

    it('should throw ValidationError on length mismatch or duplicate indices', async () => {
      await expect(pdfEngine.reorder(samplePdf3Pages, [1, 2])).rejects.toThrow(ValidationError);
      await expect(pdfEngine.reorder(samplePdf3Pages, [1, 1, 3])).rejects.toThrow(ValidationError);
      await expect(pdfEngine.reorder(samplePdf3Pages, [1, 2, 4])).rejects.toThrow(ValidationError);
    });
  });

  // 10. Extract
  describe('10. Extract PDF Pages', () => {
    it('should extract specific pages into a new PDF', async () => {
      const extracted = await pdfEngine.extract(samplePdf3Pages, [1, 3]);
      const doc = await PDFDocument.load(extracted);
      expect(doc.getPageCount()).toBe(2);
    });

    it('should throw ValidationError on invalid extraction list', async () => {
      await expect(pdfEngine.extract(samplePdf3Pages, [])).rejects.toThrow(ValidationError);
      await expect(pdfEngine.extract(samplePdf3Pages, [10])).rejects.toThrow(ValidationError);
    });
  });

  // 11. Delete Pages
  describe('11. Delete PDF Pages', () => {
    it('should delete specified pages from PDF', async () => {
      const modified = await pdfEngine.deletePages(samplePdf3Pages, [2]);
      const doc = await PDFDocument.load(modified);
      expect(doc.getPageCount()).toBe(2);
    });

    it('should throw ValidationError when attempting to delete all pages', async () => {
      await expect(pdfEngine.deletePages(samplePdf3Pages, [1, 2, 3])).rejects.toThrow(ValidationError);
      await expect(pdfEngine.deletePages(samplePdf3Pages, [])).rejects.toThrow(ValidationError);
    });
  });

  // 12. Organize
  describe('12. Organize PDF Pages', () => {
    it('should atomically reorder, rotate and delete pages', async () => {
      const organized = await pdfEngine.organize(samplePdf3Pages, [
        { pageNumber: 3, rotation: 90 },
        { pageNumber: 1, deleted: false },
        { pageNumber: 2, deleted: true }
      ]);
      const doc = await PDFDocument.load(organized);
      expect(doc.getPageCount()).toBe(2);
      expect(doc.getPage(0).getRotation().angle).toBe(90);
    });

    it('should throw ValidationError if all pages are deleted', async () => {
      await expect(
        pdfEngine.organize(samplePdf2Pages, [
          { pageNumber: 1, deleted: true },
          { pageNumber: 2, deleted: true }
        ])
      ).rejects.toThrow(ValidationError);
    });
  });

  // 13. Crop
  describe('13. Crop PDF', () => {
    it('should adjust the page crop box according to margins', async () => {
      const cropped = await pdfEngine.crop(samplePdf2Pages, {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20
      });
      const doc = await PDFDocument.load(cropped);
      const page1 = doc.getPage(0);
      const cropBox = page1.getCropBox();
      expect(cropBox.x).toBe(20);
      expect(cropBox.y).toBe(20);
    });

    it('should throw ValidationError if margins exceed page dimensions', async () => {
      await expect(
        pdfEngine.crop(samplePdf2Pages, { left: 400, right: 400 })
      ).rejects.toThrow(ValidationError);
    });
  });

  // 14. Add Page Numbers
  describe('14. Add Page Numbers', () => {
    it('should add page numbers in various formats and positions', async () => {
      const numbered = await pdfEngine.addPageNumbers(samplePdf3Pages, {
        format: 'page_of_total',
        position: 'bottom-center',
        fontSize: 11
      });
      expect(numbered).toBeInstanceOf(Buffer);
      const doc = await PDFDocument.load(numbered);
      expect(doc.getPageCount()).toBe(3);
    });

    it('should support top-right position and number_only format', async () => {
      const numbered = await pdfEngine.addPageNumbers(samplePdf2Pages, {
        format: 'number_only',
        position: 'top-right',
        fontSize: 9
      });
      expect(numbered).toBeInstanceOf(Buffer);
      const doc = await PDFDocument.load(numbered);
      expect(doc.getPageCount()).toBe(2);
    });
  });

  // 15. Add Watermark
  describe('15. Add Watermark', () => {
    it('should add text watermark to document pages', async () => {
      const watermarked = await pdfEngine.addWatermark(samplePdf2Pages, {
        text: 'CONFIDENTIAL',
        opacity: 0.25,
        rotationDegrees: 45
      });
      expect(watermarked).toBeInstanceOf(Buffer);
      const doc = await PDFDocument.load(watermarked);
      expect(doc.getPageCount()).toBe(2);
    });

    it('should add image watermark to document pages', async () => {
      const watermarked = await pdfEngine.addWatermark(samplePdf2Pages, {
        imageBuffer: samplePngImage,
        imageMimeType: 'image/png',
        opacity: 0.3
      });
      expect(watermarked).toBeInstanceOf(Buffer);
      const doc = await PDFDocument.load(watermarked);
      expect(doc.getPageCount()).toBe(2);
    });

    it('should throw ValidationError when neither text nor image is given', async () => {
      await expect(pdfEngine.addWatermark(samplePdf2Pages, {})).rejects.toThrow(ValidationError);
    });
  });

  // 16 & 17. Protect and Unlock
  describe('16 & 17. Protect and Unlock PDF', () => {
    it('should protect a PDF with password and unlock it with the correct password', async () => {
      const password = 'DocuSuiteSecurePassword123!';
      const protectedPdf = await pdfEngine.protect(samplePdf2Pages, password);
      expect(protectedPdf).toBeInstanceOf(Buffer);

      // Attempting to load protected PDF without password should detect encryption
      await expect(pdfEngine.loadPdf(protectedPdf)).rejects.toThrow(FileEncryptedError);

      // Unlocking with correct password should succeed
      const unlockedPdf = await pdfEngine.unlock(protectedPdf, password);
      expect(unlockedPdf).toBeInstanceOf(Buffer);

      // Verify the unlocked PDF can now be opened plainly
      const doc = await PDFDocument.load(unlockedPdf);
      expect(doc.getPageCount()).toBe(2);
    });

    it('should throw ValidationError if password is empty when protecting', async () => {
      await expect(pdfEngine.protect(samplePdf2Pages, '')).rejects.toThrow(ValidationError);
    });

    it('should throw error when unlocking with wrong password', async () => {
      const protectedPdf = await pdfEngine.protect(samplePdf2Pages, 'realPassword');
      await expect(pdfEngine.unlock(protectedPdf, 'wrongPassword')).rejects.toThrow();
    });
  });

  // Security & Corrupted File Handling
  describe('Security & Corrupted File Handling', () => {
    it('should throw FileCorruptedError on malformed PDF data', async () => {
      const corrupted = createCorruptedPdf();
      await expect(pdfEngine.loadPdf(corrupted)).rejects.toThrow(FileCorruptedError);
    });
  });
});
