import { Router } from 'express';
import { getMyLeaveRequests, postLeaveRequest } from '../controllers/leaveController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

router.get('/', requireAuth, requireRole('doctor'), asyncHandler(getMyLeaveRequests));
router.post('/', requireAuth, requireRole('doctor'), asyncHandler(postLeaveRequest));

export default router;
