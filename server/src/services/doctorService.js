import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { generateSlots } from './scheduleService.js';

export function mapDoctor(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    specialty: row.specialty,
    bio: row.bio,
    availability: row.availability_summary || row.availability,
    availabilitySummary: row.availability_summary || row.availability,
    consultationFee: Number(row.consultation_fee),
    rating: Number(row.rating),
    patientsCount: Number(row.patients_count),
  };
}

const doctorSelect = `
  SELECT
    u.id,
    u.name,
    u.email,
    u.phone,
    u.role,
    u.status,
    p.specialty,
    p.bio,
    p.availability,
    p.availability_summary,
    p.consultation_fee,
    p.rating,
    p.patients_count
  FROM users u
  JOIN doctor_profiles p ON p.user_id = u.id
`;

export async function getDoctorById(id) {
  return mapDoctor(
    await getDatabase()
      .prepare(`${doctorSelect} WHERE u.id = ? AND u.role = 'doctor'`)
      .get(id),
  );
}

function normalizeOptionalString(value) {
  return String(value || '').trim();
}

function parseOptionalFee(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const fee = Number(value);

  if (!Number.isFinite(fee) || fee < 0) {
    throw new ApiError(400, `${fieldName} must be a non-negative number`);
  }

  return fee;
}

export async function listDoctors({ includeInactive = false, specialty, q, minFee, maxFee, date } = {}) {
  const statusFilter = includeInactive ? '' : "AND u.status = 'ACTIVE'";
  const params = [];
  const filters = [];
  const specialtyFilter = normalizeOptionalString(specialty);
  const keywordFilter = normalizeOptionalString(q);
  const minFeeFilter = parseOptionalFee(minFee, 'minFee');
  const maxFeeFilter = parseOptionalFee(maxFee, 'maxFee');

  if (specialtyFilter) {
    filters.push('LOWER(p.specialty) LIKE ?');
    params.push(`%${specialtyFilter.toLowerCase()}%`);
  }

  if (keywordFilter) {
    filters.push('(LOWER(u.name) LIKE ? OR LOWER(p.specialty) LIKE ?)');
    params.push(`%${keywordFilter.toLowerCase()}%`, `%${keywordFilter.toLowerCase()}%`);
  }

  if (minFeeFilter !== null) {
    filters.push('p.consultation_fee >= ?');
    params.push(minFeeFilter);
  }

  if (maxFeeFilter !== null) {
    filters.push('p.consultation_fee <= ?');
    params.push(maxFeeFilter);
  }

  const filterSql = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
  const rows = await getDatabase()
    .prepare(`
      ${doctorSelect}
      WHERE u.role = 'doctor'
      ${statusFilter}
      ${filterSql}
      ORDER BY u.name ASC
    `)
    .all(...params);
  const doctors = rows.map(mapDoctor);

  if (!date) {
    return doctors;
  }

  const doctorsWithSlots = await Promise.all(
    doctors.map(async (doctor) => ({
      doctor,
      slots: await generateSlots(String(date), doctor.id),
    })),
  );

  return doctorsWithSlots.filter((item) => item.slots.length > 0).map((item) => item.doctor);
}
