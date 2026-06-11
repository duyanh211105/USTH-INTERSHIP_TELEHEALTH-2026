import {
  createAdminDoctor,
  deleteAdminDoctor,
  getAdminAppointments,
  getAdminDoctors,
  getAdminSummary,
  getAdminUsers,
  updateAdminDoctor,
  updateAdminUserStatus,
} from '../services/adminService.js';
import { createAuditLog, listAuditLogs } from '../services/auditService.js';
import { listLeaveRequestsForAdmin, updateLeaveRequestStatus } from '../services/leaveService.js';
import { sendSuccess } from '../services/responseService.js';

export async function getSummary(req, res) {
  return sendSuccess(res, { summary: await getAdminSummary() });
}

export async function getUsers(req, res) {
  return sendSuccess(res, { users: await getAdminUsers() });
}

export async function getAppointments(req, res) {
  return sendSuccess(res, { appointments: await getAdminAppointments(req.user) });
}

export async function getDoctors(req, res) {
  return sendSuccess(res, { doctors: await getAdminDoctors() });
}

export async function postDoctor(req, res) {
  const doctor = await createAdminDoctor(req.body);
  await createAuditLog({
    actor: req.user,
    action: 'doctor.created',
    entityType: 'doctor',
    entityId: doctor.id,
    metadata: { email: doctor.email, specialty: doctor.specialty },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { doctor }, 201);
}

export async function patchDoctor(req, res) {
  const doctor = await updateAdminDoctor(req.params.id, req.body);
  await createAuditLog({
    actor: req.user,
    action: 'doctor.updated',
    entityType: 'doctor',
    entityId: doctor.id,
    metadata: req.body,
    ipAddress: req.ip,
  });
  return sendSuccess(res, { doctor });
}

export async function patchUserStatus(req, res) {
  const user = await updateAdminUserStatus(req.params.id, req.body.status);
  const statusAction = user.status === 'ACTIVE' ? 'doctor.reactivated' : user.status === 'DELETED' ? 'doctor.deleted' : 'doctor.deactivated';
  await createAuditLog({
    actor: req.user,
    action: statusAction,
    entityType: 'user',
    entityId: user.id,
    metadata: { status: user.status },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { user });
}

export async function deleteDoctor(req, res) {
  const doctor = await deleteAdminDoctor(req.params.id);
  await createAuditLog({
    actor: req.user,
    action: 'doctor.deleted',
    entityType: 'doctor',
    entityId: doctor.id,
    metadata: { email: doctor.email },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { doctor });
}

export async function getLeaveRequests(req, res) {
  return sendSuccess(res, { leaveRequests: await listLeaveRequestsForAdmin(req.user, req.query) });
}

export async function approveLeaveRequest(req, res) {
  const leaveRequest = await updateLeaveRequestStatus(req.params.id, 'APPROVED', req.user);
  await createAuditLog({
    actor: req.user,
    action: 'LEAVE_APPROVED',
    entityType: 'leave_request',
    entityId: leaveRequest.id,
    metadata: {
      leaveRequestId: leaveRequest.id,
      reviewerId: req.user.id,
      targetDoctorId: leaveRequest.doctorId,
      oldStatus: leaveRequest.oldStatus,
      newStatus: leaveRequest.status,
      timestamp: new Date().toISOString(),
    },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { leaveRequest });
}

export async function rejectLeaveRequest(req, res) {
  const leaveRequest = await updateLeaveRequestStatus(req.params.id, 'REJECTED', req.user, req.body);
  await createAuditLog({
    actor: req.user,
    action: 'LEAVE_REJECTED',
    entityType: 'leave_request',
    entityId: leaveRequest.id,
    metadata: {
      leaveRequestId: leaveRequest.id,
      reviewerId: req.user.id,
      targetDoctorId: leaveRequest.doctorId,
      oldStatus: leaveRequest.oldStatus,
      newStatus: leaveRequest.status,
      rejectionReason: leaveRequest.rejectionReason,
      timestamp: new Date().toISOString(),
    },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { leaveRequest });
}

export async function getAuditLogs(req, res) {
  return sendSuccess(res, await listAuditLogs(req.query));
}
