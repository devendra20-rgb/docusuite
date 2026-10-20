import { Router } from 'express';
import { conversionsController } from '../controllers/conversions.controller.js';
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

router.get('/capabilities', conversionsController.getCapabilities);

router.post('/pdf-to-word', ...uploadMiddleware, conversionsController.pdfToWord);
router.post('/word-to-pdf', ...uploadMiddleware, conversionsController.wordToPdf);
router.post('/pdf-to-excel', ...uploadMiddleware, conversionsController.pdfToExcel);
router.post('/excel-to-pdf', ...uploadMiddleware, conversionsController.excelToPdf);
router.post('/pdf-to-powerpoint', ...uploadMiddleware, conversionsController.pdfToPowerPoint);
router.post('/powerpoint-to-pdf', ...uploadMiddleware, conversionsController.powerPointToPdf);
router.post('/html-to-pdf', ...uploadMiddleware, conversionsController.htmlToPdf);
router.post('/word-to-html', ...uploadMiddleware, conversionsController.wordToHtml);
router.post('/csv-to-excel', ...uploadMiddleware, conversionsController.csvToExcel);
router.post('/excel-to-csv', ...uploadMiddleware, conversionsController.excelToCsv);
router.post('/txt-to-pdf', ...uploadMiddleware, conversionsController.txtToPdf);
router.post('/rtf-to-pdf', ...uploadMiddleware, conversionsController.rtfToPdf);
router.post('/pdf-to-html', ...uploadMiddleware, conversionsController.pdfToHtml);
router.post('/odt-to-pdf', ...uploadMiddleware, conversionsController.odtToPdf);
router.post('/ods-to-pdf', ...uploadMiddleware, conversionsController.odsToPdf);
router.post('/odp-to-pdf', ...uploadMiddleware, conversionsController.odpToPdf);
router.post('/batch', ...uploadMiddleware, conversionsController.batch);

export default router;
