import { Router } from 'express';
import {
  getMedicalRecordAnalysisByRecord,
  patchMedicalRecordAnalysisReview,
  postMedicalRecordAnalysis,
} from '../controllers/medicalRecordAnalysisController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();

router.post('/:id/ai-analysis', requireAuth, asyncHandler(postMedicalRecordAnalysis));
router.get('/:id/ai-analysis', requireAuth, asyncHandler(getMedicalRecordAnalysisByRecord));
router.patch('/:id/ai-analysis/review', requireAuth, asyncHandler(patchMedicalRecordAnalysisReview));

export default router;
