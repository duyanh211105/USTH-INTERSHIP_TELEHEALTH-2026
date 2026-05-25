import { createLeaveRequest, listLeaveRequestsForDoctor } from '../services/leaveService.js';
import { createAuditLog } from '../services/auditService.js';
import { sendSuccess } from '../services/responseService.js';

export async function getMyLeaveRequests(req, res) {
  return sendSuccess(res, { leaveRequests: await listLeaveRequestsForDoctor(req.user) });
}

export async function postLeaveRequest(req, res) {
  const leaveRequest = await createLeaveRequest(req.user, req.body);
  await createAuditLog({
    actor: req.user,
    action: 'leave_request.submitted',
    entityType: 'leave_request',
    entityId: leaveRequest.id,
    metadata: { date: leaveRequest.date, reason: leaveRequest.reason },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { leaveRequest }, 201);
}
