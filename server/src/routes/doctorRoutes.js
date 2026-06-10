import { Router } from 'express';
import {
  deleteMyUnavailability,
  getDoctorSlots,
  getDoctors,
  getMyAvailability,
  getMyUnavailability,
  postDoctorReview,
  postMyUnavailability,
  putMyAvailability,
} from '../controllers/doctorController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

router.get('/', requireAuth, getDoctors);
router.get('/me/availability', requireAuth, requireRole('doctor'), getMyAvailability);
router.put('/me/availability', requireAuth, requireRole('doctor'), asyncHandler(putMyAvailability));
router.get('/me/unavailability', requireAuth, requireRole('doctor'), getMyUnavailability);
router.post('/me/unavailability', requireAuth, requireRole('doctor'), asyncHandler(postMyUnavailability));
router.delete('/me/unavailability/:id', requireAuth, requireRole('doctor'), asyncHandler(deleteMyUnavailability));
router.post('/:id/reviews', requireAuth, requireRole('patient'), asyncHandler(postDoctorReview));
router.get('/:id/slots', requireAuth, asyncHandler(getDoctorSlots));

export default router;
