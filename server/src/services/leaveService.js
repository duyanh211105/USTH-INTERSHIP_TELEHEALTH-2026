import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value) {
  if (!datePattern.test(value || '')) {
    throw new ApiError(400, 'date must use YYYY-MM-DD format');
  }
}

function assertDoctor(user) {
  if (user.role !== 'doctor') {
    throw new ApiError(403, 'Only doctors can submit leave requests');
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
  return {
    id: Number(row.id),
    doctorId: Number(row.doctor_id),
    doctorName: row.doctor_name,
    date: toDateString(row.date),
    reason: row.reason,
    note: row.note,
    status: row.status,
    reviewedBy: row.reviewed_by === null || row.reviewed_by === undefined ? null : Number(row.reviewed_by),
    reviewedAt: toIsoString(row.reviewed_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function getLeaveRequestById(id) {
  const row = await getDatabase()
    .prepare(`
      SELECT leave_requests.*, users.name AS doctor_name
      FROM leave_requests
      JOIN users ON users.id = leave_requests.doctor_id
      WHERE leave_requests.id = ?
    `)
    .get(id);

  if (!row) {
    throw new ApiError(404, 'Leave request not found');
  }

  return row;
}

export async function listLeaveRequestsForDoctor(user) {
  assertDoctor(user);

  const rows = await getDatabase()
    .prepare(`
      SELECT leave_requests.*, users.name AS doctor_name
      FROM leave_requests
      JOIN users ON users.id = leave_requests.doctor_id
      WHERE leave_requests.doctor_id = ?
      ORDER BY leave_requests.date DESC, leave_requests.id DESC
    `)
    .all(user.id);

  return rows.map(mapLeaveRequest);
}

export async function createLeaveRequest(user, data) {
  assertDoctor(user);
  assertDate(data.date);

  const reason = String(data.reason || '').trim();
  const note = String(data.note || '').trim();

  if (!reason) {
    throw new ApiError(400, 'reason is required');
  }

  const result = await getDatabase()
    .prepare(`
      INSERT INTO leave_requests (doctor_id, date, reason, note, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `)
    .run(user.id, data.date, reason, note);

  return mapLeaveRequest(await getLeaveRequestById(result.lastInsertRowid));
}

export async function listLeaveRequestsForAdmin() {
  const rows = await getDatabase()
    .prepare(`
      SELECT leave_requests.*, users.name AS doctor_name
      FROM leave_requests
      JOIN users ON users.id = leave_requests.doctor_id
      ORDER BY
        CASE leave_requests.status
          WHEN 'PENDING' THEN 0
          WHEN 'APPROVED' THEN 1
          ELSE 2
        END,
        leave_requests.date ASC,
        leave_requests.id DESC
    `)
    .all();

  return rows.map(mapLeaveRequest);
}

export async function updateLeaveRequestStatus(id, status, adminUser) {
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new ApiError(400, 'status must be APPROVED or REJECTED');
  }

  await getLeaveRequestById(id);

  await getDatabase()
    .prepare(`
      UPDATE leave_requests
      SET status = ?,
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(status, adminUser.id, id);

  return mapLeaveRequest(await getLeaveRequestById(id));
}
