import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { createAuditLog } from './auditService.js';
import { assertSlotAvailable, expireStalePendingAppointments } from './scheduleService.js';

const validStatuses = new Set(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);
const videoRoomProvider = 'jitsi';
const videoRoomDurationMinutes = 60;

function toDateString(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return value;
}

function toTimeString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(11, 16);
  }

  if (typeof value === 'string' && value.length >= 5) {
    return value.slice(0, 5);
  }

  return value;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapAppointment(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    patientId: Number(row.patient_id),
    patientName: row.patient_name,
    doctorId: Number(row.doctor_id),
    doctorName: row.doctor_name,
    scheduledDate: toDateString(row.scheduled_date),
    scheduledTime: toTimeString(row.scheduled_time),
    reason: row.reason,
    status: row.status,
    cancellationReason: row.cancellation_reason,
    cancelledBy: row.cancelled_by === null || row.cancelled_by === undefined ? null : Number(row.cancelled_by),
    cancelledAt: toIsoString(row.cancelled_at),
    videoRoomUrl: row.video_room_url || null,
    videoRoomProvider: row.video_room_provider || null,
    createdAt: toIsoString(row.created_at),
  };
}

function buildVideoRoomUrl(appointmentId) {
  return `https://meet.jit.si/mediconnect-appointment-${appointmentId}`;
}

function parseAppointmentStart(appointment) {
  if (!appointment?.scheduledDate || !appointment?.scheduledTime) {
    return null;
  }

  const date = toDateString(appointment.scheduledDate);
  const time = toTimeString(appointment.scheduledTime);
  const value = new Date(`${date}T${time}:00`);

  return Number.isNaN(value.getTime()) ? null : value;
}

export function getAppointmentVideoAccessWindow(appointment) {
  const startsAt = parseAppointmentStart(appointment);

  if (!startsAt) {
    return null;
  }

  return {
    availableFrom: new Date(startsAt.getTime() - 15 * 60 * 1000),
    availableUntil: new Date(startsAt.getTime() + videoRoomDurationMinutes * 60 * 1000),
  };
}

async function ensureVideoRoom(appointment, actor, ipAddress = null) {
  if (!appointment || appointment.status !== 'CONFIRMED') {
    return { appointment, generated: false };
  }

  if (appointment.videoRoomUrl) {
    return { appointment, generated: false };
  }

  const videoRoomUrl = buildVideoRoomUrl(appointment.id);
  await getDatabase()
    .prepare(`
      UPDATE appointments
      SET video_room_url = ?,
          video_room_provider = ?
      WHERE id = ?
        AND (video_room_url IS NULL OR video_room_url = '')
    `)
    .run(videoRoomUrl, videoRoomProvider, appointment.id);

  const updatedAppointment = await getAppointmentById(appointment.id);
  const generated = updatedAppointment?.videoRoomUrl === videoRoomUrl;

  if (generated) {
    await createAuditLog({
      actor,
      action: 'video_room_generated',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: {
        provider: videoRoomProvider,
        videoRoomUrl,
      },
      ipAddress,
    });
  }

  return { appointment: updatedAppointment, generated };
}

const appointmentSelect = `
  SELECT a.*, patient.name AS patient_name, doctor.name AS doctor_name
  FROM appointments a
  JOIN users patient ON patient.id = a.patient_id
  JOIN users doctor ON doctor.id = a.doctor_id
`;

export async function getAppointmentById(id) {
  return mapAppointment(
    await getDatabase()
      .prepare(`${appointmentSelect} WHERE a.id = ?`)
      .get(id),
  );
}

export async function getAppointmentForUser(user, id) {
  const appointment = await getAppointmentById(id);

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  if (
    user.role !== 'admin' &&
    user.id !== appointment.patientId &&
    user.id !== appointment.doctorId
  ) {
    throw new ApiError(403, 'Forbidden');
  }

  return appointment;
}

export async function listAppointmentsForUser(user) {
  await expireStalePendingAppointments();
  let query = `${appointmentSelect}`;
  const params = [];

  if (user.role === 'patient') {
    query += ' WHERE a.patient_id = ?';
    params.push(user.id);
  }

  if (user.role === 'doctor') {
    query += ' WHERE a.doctor_id = ?';
    params.push(user.id);
  }

  query += ' ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.id ASC';
  const rows = await getDatabase().prepare(query).all(...params);
  return rows.map(mapAppointment);
}

export async function createAppointment(user, data) {
  if (user.role !== 'patient') {
    throw new ApiError(403, 'Only patients can create appointments');
  }

  await expireStalePendingAppointments();

  const { doctorId, scheduledDate, scheduledTime, reason } = data;

  if (!doctorId || !scheduledDate || !scheduledTime || !reason) {
    throw new ApiError(400, 'doctorId, scheduledDate, scheduledTime, and reason are required');
  }

  const doctor = await getDatabase().prepare("SELECT id FROM users WHERE id = ? AND role = 'doctor' AND status = 'ACTIVE'").get(doctorId);
  if (!doctor) {
    throw new ApiError(400, 'Doctor not found');
  }

  const duplicate = await getDatabase()
    .prepare(`
      ${appointmentSelect}
      WHERE a.patient_id = ?
        AND a.doctor_id = ?
        AND a.scheduled_date = ?
        AND a.scheduled_time = ?
        AND a.status <> 'CANCELLED'
        AND a.created_at >= datetime('now', '-5 seconds')
      ORDER BY a.id ASC
      LIMIT 1
    `)
    .get(user.id, doctorId, scheduledDate, scheduledTime);

  if (duplicate) {
    return {
      appointment: mapAppointment(duplicate),
      duplicate: true,
    };
  }

  const lockedSlot = await getDatabase()
    .prepare(`
      SELECT id FROM appointments
      WHERE doctor_id = ?
        AND scheduled_date = ?
        AND scheduled_time = ?
        AND status <> 'CANCELLED'
      LIMIT 1
    `)
    .get(doctorId, scheduledDate, scheduledTime);

  if (lockedSlot) {
    throw new ApiError(409, 'Selected appointment slot is unavailable');
  }

  await assertSlotAvailable(doctorId, scheduledDate, scheduledTime);

  const result = await getDatabase()
    .prepare(`
      INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, reason, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `)
    .run(user.id, doctorId, scheduledDate, scheduledTime, reason);

  return {
    appointment: await getAppointmentById(Number(result.lastInsertRowid)),
    duplicate: false,
  };
}

export async function updateAppointmentStatus(user, id, status, options = {}) {
  if (!validStatuses.has(status)) {
    throw new ApiError(400, 'Invalid appointment status');
  }

  const appointment = await getAppointmentById(id);
  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  if (user.role === 'patient') {
    if (user.id !== appointment.patientId || status !== 'CANCELLED') {
      throw new ApiError(403, 'Patients can only cancel their own appointments');
    }
  } else if (user.role !== 'admin' && user.id !== appointment.doctorId) {
    throw new ApiError(403, 'Only assigned doctors or admins can update status');
  }

  if (status === 'CANCELLED') {
    const cancellationReason = String(options.cancellationReason || options.cancellation_reason || '').trim();

    if (!cancellationReason) {
      throw new ApiError(400, 'cancellationReason is required');
    }

    await getDatabase()
      .prepare(`
        UPDATE appointments
        SET status = 'CANCELLED',
            cancellation_reason = ?,
            cancelled_by = ?,
            cancelled_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(cancellationReason, user.id, id);

    return getAppointmentById(id);
  }

  await getDatabase()
    .prepare(`
      UPDATE appointments
      SET status = ?,
          cancellation_reason = '',
          cancelled_by = NULL,
          cancelled_at = NULL
      WHERE id = ?
    `)
    .run(status, id);
  const updatedAppointment = await getAppointmentById(id);

  if (status === 'CONFIRMED') {
    const result = await ensureVideoRoom(updatedAppointment, user, options.ipAddress || null);
    return result.appointment;
  }

  return updatedAppointment;
}

export async function getAppointmentVideoRoomForUser(user, id, options = {}) {
  let appointment = await getAppointmentById(id);

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  const isAssignedPatient = user.role === 'patient' && user.id === appointment.patientId;
  const isAssignedDoctor = user.role === 'doctor' && user.id === appointment.doctorId;

  if (!isAssignedPatient && !isAssignedDoctor) {
    throw new ApiError(403, 'You do not have permission to access this resource');
  }

  if (appointment.status !== 'CONFIRMED') {
    throw new ApiError(400, 'Video call is available only for confirmed appointments');
  }

  const videoRoom = await ensureVideoRoom(appointment, user, options.ipAddress || null);
  appointment = videoRoom.appointment;

  const window = getAppointmentVideoAccessWindow(appointment);
  if (!window) {
    throw new ApiError(400, 'Appointment time is missing or invalid');
  }

  const now = options.now ? new Date(options.now) : new Date();

  if (now < window.availableFrom) {
    throw new ApiError(400, 'Video call will be available 15 minutes before the confirmed appointment time');
  }

  if (now > window.availableUntil) {
    throw new ApiError(400, 'Video call window has ended for this appointment');
  }

  return {
    appointmentId: appointment.id,
    provider: appointment.videoRoomProvider || videoRoomProvider,
    videoRoomUrl: appointment.videoRoomUrl,
    availableFrom: window.availableFrom.toISOString(),
    availableUntil: window.availableUntil.toISOString(),
  };
}
