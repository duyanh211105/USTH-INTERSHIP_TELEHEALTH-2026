import { Router } from 'express';
import { getMyLeaveRequests, postLeaveRequest } from '../controllers/leaveController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

router.get('/', requireAuth, requireRole('doctor', 'department_head', 'hospital_director'), asyncHandler(getMyLeaveRequests));
router.post('/', requireAuth, requireRole('doctor', 'department_head', 'hospital_director'), asyncHandler(postLeaveRequest));

export default router;
