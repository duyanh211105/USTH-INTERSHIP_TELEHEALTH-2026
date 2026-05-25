import { getDatabase } from '../db/connection.js';

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

export async function findUserByEmail(email) {
  return getDatabase().prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
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
