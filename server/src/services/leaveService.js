import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { createAuditLog } from './auditService.js';
import { getSpecialtyLabel, normalizeSpecialtyCode } from './specialtyService.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const medicalStaffRoles = new Set(['doctor', 'department_head', 'hospital_director']);
const reviewerRoles = new Set(['department_head', 'hospital_director', 'admin']);

function assertDate(value) {
  if (!datePattern.test(value || '')) {
    throw new ApiError(400, 'date must use YYYY-MM-DD format');
  }
}

function assertMedicalStaff(user) {
  if (!medicalStaffRoles.has(user.role)) {
    throw new ApiError(403, 'Only medical staff can submit leave requests');
  }
}

function assertReviewer(user) {
  if (!reviewerRoles.has(user.role)) {
    throw new ApiError(403, 'Forbidden');
  }
}

function toDateString(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return value;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapLeaveRequest(row) {
  const departmentId = row.department_id || normalizeSpecialtyCode(row.specialty) || '';

  return {
    id: Number(row.id),
    doctorId: Number(row.doctor_id),
    doctorName: row.doctor_name,
    doctorRole: row.doctor_role || 'doctor',
    departmentId,
    departmentName: departmentId ? getSpecialtyLabel(departmentId) : '',
    date: toDateString(row.date),
    reason: row.reason,
    note: row.note,
    status: row.status,
    reviewedBy: row.reviewed_by === null || row.reviewed_by === undefined ? null : Number(row.reviewed_by),
    reviewedAt: toIsoString(row.reviewed_at),
    rejectionReason: row.rejection_reason || '',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    rescheduledAppointmentIds: row.rescheduledAppointmentIds || [],
  };
}

function toStaffContext(row) {
  if (!row) {
    return null;
  }

  const departmentId = row.department_id || normalizeSpecialtyCode(row.specialty) || '';

  return {
    userId: Number(row.user_id || row.id || row.doctor_id),
    departmentId,
    user: {
      role: row.role || row.doctor_role,
    },
  };
}

function targetFromLeaveRequest(leaveRequest) {
  return {
    userId: Number(leaveRequest.doctorId),
    departmentId: leaveRequest.departmentId,
    user: {
      role: leaveRequest.doctorRole,
    },
  };
}

async function getStaffContext(userId) {
  const row = await getDatabase()
    .prepare(`
      SELECT users.id AS user_id, users.role, profile.specialty
      FROM users
      LEFT JOIN doctor_profiles profile ON profile.user_id = users.id
      WHERE users.id = ?
    `)
    .get(userId);

  return toStaffContext(row);
}

export function canReviewLeaveRequest(reviewer, targetDoctor) {
  if (!reviewer || !targetDoctor) {
    return false;
  }

  if (Number(reviewer.userId) === Number(targetDoctor.userId)) {
    return false;
  }

  if (reviewer.user?.role === 'admin') {
    return true;
  }

  if (reviewer.user?.role === 'hospital_director') {
    return ['doctor', 'department_head'].includes(targetDoctor.user?.role);
  }

  if (reviewer.user?.role === 'department_head') {
    return (
      targetDoctor.user?.role === 'doctor'
      && reviewer.departmentId
      && reviewer.departmentId === targetDoctor.departmentId
    );
  }

  return false;
}

async function getLeaveRequestById(id) {
  const row = await getDatabase()
    .prepare(`
      SELECT leave_requests.*, users.name AS doctor_name, users.role AS doctor_role, profile.specialty AS specialty
      FROM leave_requests
      JOIN users ON users.id = leave_requests.doctor_id
      LEFT JOIN doctor_profiles profile ON profile.user_id = users.id
      WHERE leave_requests.id = ?
    `)
    .get(id);

  if (!row) {
    throw new ApiError(404, 'Leave request not found');
  }

  return row;
}

export async function listLeaveRequestsForDoctor(user) {
  assertMedicalStaff(user);

  const rows = await getDatabase()
    .prepare(`
      SELECT leave_requests.*, users.name AS doctor_name, users.role AS doctor_role, profile.specialty AS specialty
      FROM leave_requests
      JOIN users ON users.id = leave_requests.doctor_id
      LEFT JOIN doctor_profiles profile ON profile.user_id = users.id
      WHERE leave_requests.doctor_id = ?
      ORDER BY leave_requests.date DESC, leave_requests.id DESC
    `)
    .all(user.id);

  return rows.map(mapLeaveRequest);
}

export async function createLeaveRequest(user, data) {
  assertMedicalStaff(user);
  assertDate(data.date);

  const reason = String(data.reason || '').trim();
  const note = String(data.note || '').trim();

  if (!reason) {
    throw new ApiError(400, 'reason is required');
  }

  const profile = await getDatabase()
    .prepare('SELECT specialty FROM doctor_profiles WHERE user_id = ?')
    .get(user.id);
  const departmentId = normalizeSpecialtyCode(profile?.specialty) || String(profile?.specialty || '').trim();

  const result = await getDatabase()
    .prepare(`
      INSERT INTO leave_requests (doctor_id, department_id, date, reason, note, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `)
    .run(user.id, departmentId, data.date, reason, note);

  return mapLeaveRequest(await getLeaveRequestById(result.lastInsertRowid));
}

export async function listLeaveRequestsForAdmin(reviewer, query = {}) {
  assertReviewer(reviewer);

  const status = String(query.status || '').trim().toUpperCase();
  const doctorName = String(query.doctorName || query.q || '').trim().toLowerCase();
  const date = String(query.date || query.leaveDate || '').trim();
  const requestedDepartment = normalizeSpecialtyCode(query.department || query.departmentId || query.specialty);
  const filters = [];
  const params = [];

  if (status) {
    filters.push('leave_requests.status = ?');
    params.push(status);
  }

  if (date) {
    assertDate(date);
    filters.push('leave_requests.date = ?');
    params.push(date);
  }

  if (doctorName) {
    filters.push('LOWER(users.name) LIKE ?');
    params.push(`%${doctorName}%`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await getDatabase()
    .prepare(`
      SELECT leave_requests.*, users.name AS doctor_name, users.role AS doctor_role, profile.specialty AS specialty
      FROM leave_requests
      JOIN users ON users.id = leave_requests.doctor_id
      LEFT JOIN doctor_profiles profile ON profile.user_id = users.id
      ${where}
      ORDER BY
        CASE leave_requests.status
          WHEN 'PENDING' THEN 0
          WHEN 'APPROVED' THEN 1
          ELSE 2
        END,
        leave_requests.date ASC,
        leave_requests.id DESC
    `)
    .all(...params);
  const reviewerContext = await getStaffContext(reviewer.id);

  return rows
    .map(mapLeaveRequest)
    .filter((leaveRequest) => !requestedDepartment || leaveRequest.departmentId === requestedDepartment)
    .filter((leaveRequest) => canReviewLeaveRequest(reviewerContext, targetFromLeaveRequest(leaveRequest)));
}

export async function updateLeaveRequestStatus(id, status, reviewer, options = {}) {
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new ApiError(400, 'status must be APPROVED or REJECTED');
  }

  const leaveRequest = await getLeaveRequestById(id);
  const mappedLeaveRequest = mapLeaveRequest(leaveRequest);
  const reviewerContext = await getStaffContext(reviewer.id);
  const targetDoctor = targetFromLeaveRequest(mappedLeaveRequest);

  if (!canReviewLeaveRequest(reviewerContext, targetDoctor)) {
    throw new ApiError(403, 'You do not have permission to review this leave request');
  }

  const oldStatus = leaveRequest.status;
  const rejectionReason = String(options.rejectionReason || options.rejection_reason || '').trim();
  const rescheduledAppointmentIds = [];
  const db = getDatabase();

  await db.transaction(async (transactionDb) => {
    await transactionDb
      .prepare(`
        UPDATE leave_requests
        SET status = ?,
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            rejection_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, reviewer.id, status === 'REJECTED' ? rejectionReason : '', id);

    if (status !== 'APPROVED') {
      return;
    }

    await transactionDb
      .prepare(`
        INSERT INTO doctor_unavailability (doctor_id, date, reason)
        VALUES (?, ?, ?)
        ON CONFLICT(doctor_id, date) DO UPDATE SET reason = excluded.reason
      `)
      .run(leaveRequest.doctor_id, toDateString(leaveRequest.date), `Approved leave request: ${leaveRequest.reason}`);

    const activeAppointments = await transactionDb
      .prepare(`
        SELECT id
        FROM appointments
        WHERE doctor_id = ?
          AND scheduled_date = ?
          AND status IN ('PENDING', 'CONFIRMED')
      `)
      .all(leaveRequest.doctor_id, toDateString(leaveRequest.date));

    rescheduledAppointmentIds.push(...activeAppointments.map((appointment) => Number(appointment.id)));

    if (rescheduledAppointmentIds.length > 0) {
      await transactionDb
        .prepare(`
          UPDATE appointments
          SET status = 'RESCHEDULE_REQUIRED'
          WHERE doctor_id = ?
            AND scheduled_date = ?
            AND status IN ('PENDING', 'CONFIRMED')
        `)
        .run(leaveRequest.doctor_id, toDateString(leaveRequest.date));
    }
  });

  for (const appointmentId of rescheduledAppointmentIds) {
    await createAuditLog({
      actor: reviewer,
      action: 'appointment_reschedule_required',
      entityType: 'appointment',
      entityId: appointmentId,
      metadata: {
        doctorId: Number(leaveRequest.doctor_id),
        leaveRequestId: Number(id),
        date: toDateString(leaveRequest.date),
      },
    });
  }

  const updatedLeaveRequest = mapLeaveRequest(await getLeaveRequestById(id));
  return {
    ...updatedLeaveRequest,
    oldStatus,
    rescheduledAppointmentIds,
  };
}
