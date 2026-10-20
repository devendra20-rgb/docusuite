import { Router } from 'express';
import { pdfToolsController } from '../controllers/pdf-tools.controller.js';
import { multerUpload, processUploads } from '../../../middleware/upload.middleware.js';
import { optionalAuth } from '../../../middleware/auth.middleware.js';
import { guestProcessingLimiter } from '../../../middleware/rate-limiter.middleware.js';

const router = Router();

const uploadMiddleware = [
  optionalAuth,
  guestProcessingLimiter,
  multerUpload.any(),
  processUploads
];

router.post('/pdf/merge', ...uploadMiddleware, pdfToolsController.merge);
router.post('/pdf/split', ...uploadMiddleware, pdfToolsController.split);
router.post('/pdf/compress', ...uploadMiddleware, pdfToolsController.compress);
router.post('/pdf/rotate', ...uploadMiddleware, pdfToolsController.rotate);
router.post('/pdf/to-images', ...uploadMiddleware, pdfToolsController.toImages);
router.post('/images/to-pdf', ...uploadMiddleware, pdfToolsController.imagesToPdf);
router.post('/pdf/reorder', ...uploadMiddleware, pdfToolsController.reorder);
router.post('/pdf/extract', ...uploadMiddleware, pdfToolsController.extract);
router.post('/pdf/delete', ...uploadMiddleware, pdfToolsController.deletePages);
router.post('/pdf/organize', ...uploadMiddleware, pdfToolsController.organize);
router.post('/pdf/crop', ...uploadMiddleware, pdfToolsController.crop);
router.post('/pdf/add-page-numbers', ...uploadMiddleware, pdfToolsController.addPageNumbers);
router.post('/pdf/add-watermark', ...uploadMiddleware, pdfToolsController.addWatermark);
router.post('/pdf/protect', ...uploadMiddleware, pdfToolsController.protect);
router.post('/pdf/unlock', ...uploadMiddleware, pdfToolsController.unlock);

export default router;
