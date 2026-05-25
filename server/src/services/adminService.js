import bcrypt from 'bcrypt';
import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { listAppointmentsForUser } from './appointmentService.js';
import { getDoctorById, listDoctors } from './doctorService.js';
import { findUserByEmail, findUserById, listUsers } from './userService.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseConsultationFee(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const fee = Number(value);

  if (!Number.isFinite(fee) || fee < 0) {
    throw new ApiError(400, 'consultation_fee must be a valid non-negative number');
  }

  return fee;
}

async function requireDoctorExists(id) {
  const doctor = await getDoctorById(id);

  if (!doctor) {
    throw new ApiError(404, 'Doctor not found');
  }

  return doctor;
}

export async function getAdminSummary() {
  const db = getDatabase();
  const totalUsers = Number((await db.prepare('SELECT COUNT(*) AS count FROM users').get()).count);
  const totalDoctors = Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'doctor'").get()).count);
  const totalPatients = Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'patient'").get()).count);
  const totalAppointments = Number((await db.prepare('SELECT COUNT(*) AS count FROM appointments').get()).count);
  const completedAppointments = Number((await db
    .prepare("SELECT COUNT(*) AS count FROM appointments WHERE status = 'COMPLETED'")
    .get()).count);

  return { totalUsers, totalDoctors, totalPatients, totalAppointments, completedAppointments };
}

export async function getAdminUsers() {
  return listUsers();
}

export async function getAdminAppointments(adminUser) {
  return listAppointmentsForUser(adminUser);
}

export async function getAdminDoctors() {
  return listDoctors({ includeInactive: true });
}

export async function createAdminDoctor(data) {
  const fullName = String(data.full_name || data.fullName || '').trim();
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  const specialty = String(data.specialty || '').trim();
  const phone = String(data.phone || '').trim();
  const bio = String(data.bio || '').trim();
  const availabilitySummary = String(data.availability_summary || data.availabilitySummary || '').trim();
  const consultationFee = parseConsultationFee(data.consultation_fee ?? data.consultationFee);

  if (!fullName) {
    throw new ApiError(400, 'full_name is required');
  }

  if (!email) {
    throw new ApiError(400, 'email is required');
  }

  if (!password) {
    throw new ApiError(400, 'password is required');
  }

  if (!specialty) {
    throw new ApiError(400, 'specialty is required');
  }

  if (await findUserByEmail(email)) {
    throw new ApiError(409, 'email is already registered');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const db = getDatabase();
  const userResult = await db
    .prepare(`
      INSERT INTO users (name, email, password_hash, phone, role, status)
      VALUES (?, ?, ?, ?, 'doctor', 'ACTIVE')
    `)
    .run(fullName, email, passwordHash, phone);
  const doctorId = Number(userResult.lastInsertRowid);

  await db.prepare(`
    INSERT INTO doctor_profiles (
      user_id, specialty, bio, availability, availability_summary, consultation_fee
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(doctorId, specialty, bio, availabilitySummary, availabilitySummary, consultationFee);

  return getDoctorById(doctorId);
}

export async function updateAdminDoctor(id, data) {
  await requireDoctorExists(id);

  const db = getDatabase();
  const userUpdates = [];
  const userParams = [];
  const profileUpdates = [];
  const profileParams = [];

  if (data.full_name !== undefined || data.fullName !== undefined || data.name !== undefined) {
    const fullName = String(data.full_name || data.fullName || data.name || '').trim();
    if (!fullName) {
      throw new ApiError(400, 'full_name cannot be empty');
    }
    userUpdates.push('name = ?');
    userParams.push(fullName);
  }

  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    if (!email) {
      throw new ApiError(400, 'email cannot be empty');
    }
    const existing = await findUserByEmail(email);
    if (existing && Number(existing.id) !== Number(id)) {
      throw new ApiError(409, 'email is already registered');
    }
    userUpdates.push('email = ?');
    userParams.push(email);
  }

  if (data.phone !== undefined) {
    userUpdates.push('phone = ?');
    userParams.push(String(data.phone || '').trim());
  }

  if (data.specialty !== undefined) {
    const specialty = String(data.specialty || '').trim();
    if (!specialty) {
      throw new ApiError(400, 'specialty cannot be empty');
    }
    profileUpdates.push('specialty = ?');
    profileParams.push(specialty);
  }

  if (data.bio !== undefined) {
    profileUpdates.push('bio = ?');
    profileParams.push(String(data.bio || '').trim());
  }

  if (data.availability_summary !== undefined || data.availabilitySummary !== undefined) {
    const availabilitySummary = String(data.availability_summary || data.availabilitySummary || '').trim();
    profileUpdates.push('availability = ?', 'availability_summary = ?');
    profileParams.push(availabilitySummary, availabilitySummary);
  }

  if (data.consultation_fee !== undefined || data.consultationFee !== undefined) {
    profileUpdates.push('consultation_fee = ?');
    profileParams.push(parseConsultationFee(data.consultation_fee ?? data.consultationFee));
  }

  if (userUpdates.length > 0) {
    await db.prepare(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ? AND role = 'doctor'`).run(...userParams, id);
  }

  if (profileUpdates.length > 0) {
    await db.prepare(`UPDATE doctor_profiles SET ${profileUpdates.join(', ')} WHERE user_id = ?`).run(...profileParams, id);
  }

  return getDoctorById(id);
}

export async function updateAdminUserStatus(id, status) {
  const nextStatus = String(status || '').toUpperCase();

  if (!['ACTIVE', 'INACTIVE', 'DELETED'].includes(nextStatus)) {
    throw new ApiError(400, 'status must be ACTIVE, INACTIVE, or DELETED');
  }

  const user = await findUserById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await getDatabase().prepare('UPDATE users SET status = ? WHERE id = ?').run(nextStatus, id);
  return findUserById(id);
}

export async function deleteAdminDoctor(id) {
  const doctor = await requireDoctorExists(id);
  const futureConfirmed = await getDatabase()
    .prepare(`
      SELECT id
      FROM appointments
      WHERE doctor_id = ?
        AND status = 'CONFIRMED'
        AND scheduled_date >= date('now')
      LIMIT 1
    `)
    .get(id);

  if (futureConfirmed) {
    throw new ApiError(409, 'Cannot delete doctor with future confirmed appointments');
  }

  await getDatabase().prepare("UPDATE users SET status = 'DELETED' WHERE id = ? AND role = 'doctor'").run(id);
  return { ...doctor, status: 'DELETED' };
}
