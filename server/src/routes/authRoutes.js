import { Router } from 'express';
import { login, me, register } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();

router.post('/login', asyncHandler(login));
router.post('/register', asyncHandler(register));
router.get('/me', requireAuth, me);

export default router;
