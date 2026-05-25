import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

function assertDate(value) {
  if (!datePattern.test(value || '')) {
    throw new ApiError(400, 'date must use YYYY-MM-DD format');
  }
}

function assertTime(value, fieldName = 'time') {
  if (!timePattern.test(value || '')) {
    throw new ApiError(400, `${fieldName} must use HH:mm format`);
  }

  const [hours, minutes] = value.split(':').map(Number);

  if (hours > 23 || minutes > 59) {
    throw new ApiError(400, `${fieldName} must be a valid time`);
  }
}

function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return `${hours}:${remainder}`;
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

function toTimeString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(11, 16);
  }

  if (typeof value === 'string' && value.length >= 5) {
    return value.slice(0, 5);
  }

  return value;
}

function getWeekday(date) {
  assertDate(date);
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function assertDoctor(user) {
  if (user.role !== 'doctor') {
    throw new ApiError(403, 'Only doctors can manage schedule');
  }
}

function mapSchedule(row) {
  return {
    id: Number(row.id),
    doctorId: Number(row.doctor_id),
    weekday: Number(row.weekday),
    startTime: toTimeString(row.start_time),
    endTime: toTimeString(row.end_time),
    slotDuration: Number(row.slot_duration),
    updatedAt: row.updated_at,
  };
}

function mapUnavailability(row) {
  return {
    id: Number(row.id),
    doctorId: Number(row.doctor_id),
    date: toDateString(row.date),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function normalizeScheduleItem(item) {
  const weekday = Number(item.weekday);
  const startTime = item.startTime || item.start_time;
  const endTime = item.endTime || item.end_time;
  const slotDuration = Number(item.slotDuration || item.slot_duration);

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new ApiError(400, 'weekday must be between 0 and 6');
  }

  assertTime(startTime, 'startTime');
  assertTime(endTime, 'endTime');

  if (!Number.isInteger(slotDuration) || slotDuration < 5 || slotDuration > 240) {
    throw new ApiError(400, 'slotDuration must be between 5 and 240 minutes');
  }

  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  if (startMinutes >= endMinutes) {
    throw new ApiError(400, 'endTime must be after startTime');
  }

  return {
    weekday,
    startTime,
    endTime,
    slotDuration,
    startMinutes,
    endMinutes,
  };
}

function assertNoOverlappingSessions(sessions) {
  const grouped = new Map();

  for (const session of sessions) {
    const daySessions = grouped.get(session.weekday) || [];
    daySessions.push(session);
    grouped.set(session.weekday, daySessions);
  }

  for (const [weekday, daySessions] of grouped.entries()) {
    const sorted = [...daySessions].sort((a, b) => a.startMinutes - b.startMinutes);

    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startMinutes < sorted[index - 1].endMinutes) {
        throw new ApiError(400, `Schedule sessions overlap on weekday ${weekday}`);
      }
    }
  }
}

export async function expireStalePendingAppointments() {
  await getDatabase()
    .prepare("UPDATE appointments SET status = 'CANCELLED' WHERE status = 'PENDING' AND created_at <= datetime('now', '-30 minutes')")
    .run();
}

export async function listAvailabilityForDoctor(doctorId) {
  const rows = await getDatabase()
    .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY weekday ASC, start_time ASC')
    .all(doctorId);

  return rows.map(mapSchedule);
}

export async function saveDoctorAvailability(user, availability) {
  assertDoctor(user);

  if (!Array.isArray(availability)) {
    throw new ApiError(400, 'availability must be an array');
  }

  const normalizedSessions = availability.map(normalizeScheduleItem);
  assertNoOverlappingSessions(normalizedSessions);

  const db = getDatabase();
  await db.transaction(async (transactionDb) => {
    const deleteExisting = transactionDb.prepare('DELETE FROM doctor_schedules WHERE doctor_id = ?');
    const insert = transactionDb.prepare(`
      INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time, slot_duration)
      VALUES (?, ?, ?, ?, ?)
    `);

    await deleteExisting.run(user.id);
    for (const item of normalizedSessions) {
      await insert.run(user.id, item.weekday, item.startTime, item.endTime, item.slotDuration);
    }
  });

  return listAvailabilityForDoctor(user.id);
}

export async function listUnavailabilityForDoctor(doctorId) {
  const rows = await getDatabase()
    .prepare('SELECT * FROM doctor_unavailability WHERE doctor_id = ? ORDER BY date ASC')
    .all(doctorId);

  return rows.map(mapUnavailability);
}

export async function addDoctorUnavailability(user, data) {
  assertDoctor(user);
  assertDate(data.date);

  const reason = data.reason || 'Unavailable';
  await getDatabase()
    .prepare(`
      INSERT INTO doctor_unavailability (doctor_id, date, reason)
      VALUES (?, ?, ?)
      ON CONFLICT(doctor_id, date) DO UPDATE SET reason = excluded.reason
    `)
    .run(user.id, data.date, reason);

  return mapUnavailability(
    await getDatabase()
      .prepare('SELECT * FROM doctor_unavailability WHERE doctor_id = ? AND date = ?')
      .get(user.id, data.date),
  );
}

export async function deleteDoctorUnavailability(user, id) {
  assertDoctor(user);

  const result = await getDatabase()
    .prepare('DELETE FROM doctor_unavailability WHERE id = ? AND doctor_id = ?')
    .run(id, user.id);

  if (result.changes === 0) {
    throw new ApiError(404, 'Unavailability date not found');
  }
}

export async function isDoctorUnavailable(doctorId, date) {
  assertDate(date);
  return Boolean(
    await getDatabase()
      .prepare("SELECT id FROM leave_requests WHERE doctor_id = ? AND date = ? AND status = 'APPROVED'")
      .get(doctorId, date),
  );
}

export async function generateSlots(date, doctorId) {
  assertDate(date);
  await expireStalePendingAppointments();

  if (await isDoctorUnavailable(doctorId, date)) {
    return [];
  }

  const schedules = await getDatabase()
    .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND weekday = ? ORDER BY start_time ASC')
    .all(doctorId, getWeekday(date));

  if (schedules.length === 0) {
    return [];
  }

  const lockedRows = await getDatabase()
    .prepare(`
      SELECT scheduled_time
      FROM appointments
      WHERE doctor_id = ?
        AND scheduled_date = ?
        AND status <> 'CANCELLED'
    `)
    .all(doctorId, date);
  const lockedTimes = new Set(lockedRows.map((row) => toTimeString(row.scheduled_time)));
  const emittedTimes = new Set();
  const slots = [];

  for (const schedule of schedules) {
    const start = toMinutes(toTimeString(schedule.start_time));
    const end = toMinutes(toTimeString(schedule.end_time));
    const duration = schedule.slot_duration;

    for (let cursor = start; cursor + duration <= end; cursor += duration) {
      const time = toTime(cursor);

      if (!lockedTimes.has(time) && !emittedTimes.has(time)) {
        emittedTimes.add(time);
        slots.push({
          time,
          startsAt: `${date}T${time}:00.000Z`,
          endsAt: `${date}T${toTime(cursor + duration)}:00.000Z`,
        });
      }
    }
  }

  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

export async function assertSlotAvailable(doctorId, date, time) {
  assertDate(date);
  assertTime(time, 'scheduledTime');

  const slots = await generateSlots(date, doctorId);

  if (!slots.some((slot) => slot.time === time)) {
    throw new ApiError(409, 'Selected appointment slot is unavailable');
  }
}
