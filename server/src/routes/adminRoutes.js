import { Router } from 'express';
import {
  approveLeaveRequest,
  deleteDoctor,
  getAppointments,
  getAuditLogs,
  getDoctors,
  getLeaveRequests,
  getSummary,
  getUsers,
  patchDoctor,
  patchUserStatus,
  postDoctor,
  rejectLeaveRequest,
} from '../controllers/adminController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));
router.get('/summary', getSummary);
router.get('/users', getUsers);
router.get('/appointments', getAppointments);
router.get('/audit-logs', getAuditLogs);
router.get('/leave-requests', asyncHandler(getLeaveRequests));
router.post('/leave-requests/:id/approve', asyncHandler(approveLeaveRequest));
router.post('/leave-requests/:id/reject', asyncHandler(rejectLeaveRequest));
router.get('/doctors', getDoctors);
router.post('/doctors', asyncHandler(postDoctor));
router.patch('/doctors/:id', asyncHandler(patchDoctor));
router.delete('/doctors/:id', asyncHandler(deleteDoctor));
router.patch('/users/:id/status', asyncHandler(patchUserStatus));

export default router;
