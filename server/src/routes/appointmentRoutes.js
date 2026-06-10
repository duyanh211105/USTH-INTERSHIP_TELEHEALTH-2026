import { Router } from 'express';
import {
  getAppointment,
  getAppointmentCalendar,
  getAppointmentVideoRoom,
  getAppointments,
  getUpcomingAppointments,
  patchAppointmentStatus,
  postAppointment,
} from '../controllers/appointmentController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();

router.get('/', requireAuth, getAppointments);
router.get('/upcoming', requireAuth, asyncHandler(getUpcomingAppointments));
router.get('/:id/calendar.ics', requireAuth, getAppointmentCalendar);
router.get('/:id/video-room', requireAuth, asyncHandler(getAppointmentVideoRoom));
router.get('/:id', requireAuth, getAppointment);
router.post('/', requireAuth, asyncHandler(postAppointment));
router.patch('/:id/status', requireAuth, asyncHandler(patchAppointmentStatus));

export default router;
