import { Router } from 'express';
import { deleteMedicalRecord, getRecords, postRecord, uploadRecordDocument } from '../controllers/recordController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireRecordAccess } from '../middleware/ownership.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/', requireAuth, getRecords);
router.post('/', requireAuth, asyncHandler(postRecord));
router.post('/:id/upload', requireAuth, requireRecordAccess, upload.single('file'), asyncHandler(uploadRecordDocument));
router.delete('/:id', requireAuth, asyncHandler(deleteMedicalRecord));

export default router;
