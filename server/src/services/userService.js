import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

export function mapUser(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    nationalId: row.national_id,
    permanentAddress: row.permanent_address,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function normalizePhone(phone) {
  return String(phone || '').trim().replace(/\s+/g, '');
}

export function validatePhone(phone, fieldName = 'phone') {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  if (!/^0\d{9,10}$/.test(normalizedPhone)) {
    throw new ApiError(400, `${fieldName} must contain 10-11 digits and begin with 0`);
  }

  return normalizedPhone;
}

export async function findUserByEmail(email) {
  return getDatabase().prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
}

export async function findUserByPhone(phone) {
  return getDatabase().prepare('SELECT * FROM users WHERE phone = ?').get(normalizePhone(phone));
}

export async function findUserByNationalId(nationalId) {
  return getDatabase().prepare('SELECT * FROM users WHERE national_id = ?').get(nationalId);
}

export async function findUserById(id) {
  const row = await getDatabase()
    .prepare(`
      SELECT id, name, email, phone, national_id, permanent_address, role, status, created_at
      FROM users
      WHERE id = ?
    `)
    .get(id);
  return mapUser(row);
}

export async function listUsers() {
  const rows = await getDatabase()
    .prepare(`
      SELECT id, name, email, phone, national_id, permanent_address, role, status, created_at
      FROM users
      ORDER BY id ASC
    `)
    .all();

  return rows.map(mapUser);
}
