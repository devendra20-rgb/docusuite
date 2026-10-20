import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { standardRateLimiter } from '../../../middleware/rate-limiter.middleware.js';

const router = Router();

router.post('/register', standardRateLimiter, authController.register);
router.post('/login', standardRateLimiter, authController.login);
router.post('/refresh', standardRateLimiter, authController.refresh);
router.get('/me', authenticate, authController.getProfile);
router.get('/history', authenticate, authController.getHistory);

export default router;
