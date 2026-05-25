import { Router } from 'express';
import { getConsultations, postConsultation } from '../controllers/consultationController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();

router.get('/', requireAuth, getConsultations);
router.post('/', requireAuth, asyncHandler(postConsultation));

export default router;
