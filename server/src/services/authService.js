import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/connection.js';
import { findUserByEmail, findUserById, findUserByNationalId, mapUser } from './userService.js';
import { getJwtSecret } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePatientRegistration(data) {
  const fullName = String(data.full_name || data.fullName || '').trim();
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  const phone = String(data.phone || '').trim();
  const nationalId = String(data.national_id || data.nationalId || '').trim();
  const permanentAddress = String(data.permanent_address || data.permanentAddress || '').trim();

  if (!fullName) {
    throw new ApiError(400, 'full_name is required');
  }

  if (!email) {
    throw new ApiError(400, 'email is required');
  }

  if (!password) {
    throw new ApiError(400, 'password is required');
  }

  if (!phone) {
    throw new ApiError(400, 'phone is required');
  }

  if (!nationalId) {
    throw new ApiError(400, 'national_id is required');
  }

  if (!/^0\d{8,11}$/.test(nationalId)) {
    throw new ApiError(400, 'national_id must contain 9-12 digits and begin with 0');
  }

  if (!permanentAddress) {
    throw new ApiError(400, 'permanent_address is required');
  }

  return { fullName, email, password, phone, nationalId, permanentAddress };
}

export async function loginUser(email, password) {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'Account is inactive');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, getJwtSecret(), { expiresIn: '8h' });

  return { token, user: mapUser(user) };
}

export async function registerPatient(data) {
  const registration = validatePatientRegistration(data);

  if (await findUserByEmail(registration.email)) {
    throw new ApiError(409, 'email is already registered');
  }

  if (await findUserByNationalId(registration.nationalId)) {
    throw new ApiError(409, 'national_id is already registered');
  }

  const passwordHash = await bcrypt.hash(registration.password, 10);
  const result = await getDatabase()
    .prepare(`
      INSERT INTO users (
        name, email, password_hash, phone, national_id, permanent_address, role, status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'patient', 'ACTIVE')
    `)
    .run(
      registration.fullName,
      registration.email,
      passwordHash,
      registration.phone,
      registration.nationalId,
      registration.permanentAddress,
    );

  return { user: await findUserById(Number(result.lastInsertRowid)) };
}

export async function getCurrentUser(id) {
  const user = await findUserById(id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return user;
}
