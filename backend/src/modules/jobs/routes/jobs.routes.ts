import { Router } from 'express';
import { jobsController } from '../controllers/jobs.controller.js';
import { optionalAuth } from '../../../middleware/auth.middleware.js';

const router = Router();

router.get('/:jobId', optionalAuth, jobsController.getStatus);
router.get('/:jobId/download', optionalAuth, jobsController.downloadResult);
router.get('/:jobId/download/:fileId', optionalAuth, jobsController.downloadResult);

export default router;
