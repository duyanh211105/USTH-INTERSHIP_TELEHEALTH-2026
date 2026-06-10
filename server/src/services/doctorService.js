import { getDatabase } from '../db/connection.js';
import { generateSlots } from './scheduleService.js';
import {
  getSpecialtyLabel,
  getSpecialtySearchTerms,
  normalizeSpecialtyCode,
} from './specialtyService.js';
import {
  formatDoctorNameWithQualification,
  getQualificationLabel,
  normalizeQualificationCode,
} from './doctorQualificationService.js';

export function mapDoctor(row) {
  if (!row) return null;

  const specialtyCode = normalizeSpecialtyCode(row.specialty);
  const specialtyLabel = specialtyCode ? getSpecialtyLabel(specialtyCode) : row.specialty;
  const qualificationCode = normalizeQualificationCode(row.qualification_title);
  const qualificationTitle = qualificationCode ? getQualificationLabel(qualificationCode) : row.qualification_title;
  const averageRating = Number(row.average_rating ?? row.rating ?? 0);
  const reviewCount = Number(row.review_count ?? 0);

  return {
    id: Number(row.id),
    name: row.name,
    displayName: formatDoctorNameWithQualification(row.name, qualificationCode),
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    qualificationTitle,
    qualificationCode,
    specialty: specialtyLabel,
    specialtyCode,
    bio: row.bio,
    availability: row.availability_summary || row.availability,
    availabilitySummary: row.availability_summary || row.availability,
    consultationFee: Number(row.consultation_fee),
    yearsOfExperience: Number(row.years_of_experience || 0),
    gender: row.gender || '',
    languagesSpoken: row.languages_spoken || '',
    rating: averageRating,
    averageRating,
    reviewCount,
    patientsCount: Number(row.patients_count),
    videoConsultationAvailable: true,
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
    p.qualification_title,
    p.years_of_experience,
    p.gender,
    p.languages_spoken,
    p.rating,
    p.average_rating,
    p.review_count,
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

function parseOptionalFee(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const fee = Number(value);

  if (!Number.isFinite(fee) || fee < 0) {
    return null;
  }

  return fee;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getDateWindow(startDate, dayCount) {
  return Array.from({ length: dayCount }, (_, index) => addUtcDays(startDate, index));
}

function getAvailabilityDates({ date, availableToday, availableNext3Days, availableWithin3Days, availableThisWeek }) {
  const today = getTodayIsoDate();

  if (String(availableToday || '').toLowerCase() === 'true') {
    return getDateWindow(today, 1);
  }

  if (
    String(availableNext3Days || '').toLowerCase() === 'true'
    || String(availableWithin3Days || '').toLowerCase() === 'true'
  ) {
    return getDateWindow(today, 3);
  }

  if (String(availableThisWeek || '').toLowerCase() === 'true') {
    return getDateWindow(today, 7);
  }

  const requestedDate = normalizeOptionalString(date);
  return requestedDate ? [requestedDate] : getDateWindow(today, 7);
}

function formatNextAvailability(slot) {
  if (!slot) {
    return 'Unavailable This Week';
  }

  const today = getTodayIsoDate();
  const tomorrow = addUtcDays(today, 1);

  if (slot.date === today) {
    return `Next Available: Today ${slot.time}`;
  }

  if (slot.date === tomorrow) {
    return `Next Available: Tomorrow ${slot.time}`;
  }

  return `Next Available: ${slot.date} ${slot.time}`;
}

function getSortSql(sort) {
  switch (normalizeOptionalString(sort)) {
    case 'lowest_fee':
      return 'ORDER BY p.consultation_fee ASC, u.name ASC';
    case 'highest_fee':
      return 'ORDER BY p.consultation_fee DESC, u.name ASC';
    case 'highest_rating':
      return 'ORDER BY p.average_rating DESC, p.review_count DESC, u.name ASC';
    default:
      return 'ORDER BY u.name ASC';
  }
}

function applyInMemorySort(doctors, sort) {
  if (sort !== 'earliest_availability') {
    return doctors;
  }

  return [...doctors].sort((left, right) => {
    const leftSlot = left.nextAvailableAt || '9999-99-99T99:99:99.999Z';
    const rightSlot = right.nextAvailableAt || '9999-99-99T99:99:99.999Z';
    return leftSlot.localeCompare(rightSlot) || left.name.localeCompare(right.name);
  });
}

async function getNextAvailability(doctorId, dates) {
  const now = new Date();

  for (const date of dates) {
    const slots = await generateSlots(date, doctorId);
    const nextSlot = slots.find((slot) => new Date(slot.startsAt) > now);

    if (nextSlot) {
      return {
        ...nextSlot,
        date,
      };
    }
  }

  return null;
}

async function enrichWithAvailability(doctors, dates, requireAvailability) {
  const enrichedDoctors = await Promise.all(
    doctors.map(async (doctor) => {
      const nextAvailability = await getNextAvailability(doctor.id, dates);

      return {
        ...doctor,
        nextAvailableSlot: nextAvailability?.time || null,
        nextAvailableAt: nextAvailability?.startsAt || null,
        availability: formatNextAvailability(nextAvailability),
        availabilitySummary: formatNextAvailability(nextAvailability),
      };
    }),
  );

  return requireAvailability ? enrichedDoctors.filter((doctor) => doctor.nextAvailableSlot) : enrichedDoctors;
}

export async function listDoctors({
  includeInactive = false,
  specialty,
  qualificationTitle,
  q,
  minFee,
  maxFee,
  date,
  availableToday,
  availableNext3Days,
  availableWithin3Days,
  availableThisWeek,
  videoAvailable,
  minExperience,
  minYearsExperience,
  minRating,
  gender,
  language,
  sort,
} = {}) {
  const statusFilter = includeInactive ? '' : "AND u.status = 'ACTIVE'";
  const params = [];
  const filters = [];
  const specialtyCode = normalizeSpecialtyCode(specialty);
  const qualificationCode = normalizeQualificationCode(qualificationTitle);
  const keywordFilter = normalizeOptionalString(q);
  const minFeeFilter = parseOptionalFee(minFee);
  const maxFeeFilter = parseOptionalFee(maxFee);
  const minExperienceFilter = parseOptionalNumber(minExperience ?? minYearsExperience);
  const minRatingFilter = parseOptionalNumber(minRating);
  const genderFilter = normalizeOptionalString(gender);
  const languageFilter = normalizeOptionalString(language);
  const requestedSort = normalizeOptionalString(sort);
  const hasVideoFilter = String(videoAvailable || '').toLowerCase() === 'true';
  const availabilityDates = getAvailabilityDates({ date, availableToday, availableNext3Days, availableWithin3Days, availableThisWeek });
  const requireAvailability = Boolean(
    normalizeOptionalString(date)
    || String(availableToday || '').toLowerCase() === 'true'
    || String(availableNext3Days || '').toLowerCase() === 'true'
    || String(availableWithin3Days || '').toLowerCase() === 'true'
    || String(availableThisWeek || '').toLowerCase() === 'true',
  );

  if (specialtyCode) {
    const specialtyTerms = getSpecialtySearchTerms(specialtyCode);
    filters.push(`(${specialtyTerms.map(() => 'LOWER(p.specialty) LIKE ?').join(' OR ')})`);
    params.push(...specialtyTerms.map((term) => `%${term}%`));
  }

  if (keywordFilter) {
    filters.push('(LOWER(u.name) LIKE ? OR LOWER(p.specialty) LIKE ? OR LOWER(p.qualification_title) LIKE ?)');
    params.push(`%${keywordFilter.toLowerCase()}%`, `%${keywordFilter.toLowerCase()}%`, `%${keywordFilter.toLowerCase()}%`);
  }

  if (qualificationCode) {
    filters.push('p.qualification_title = ?');
    params.push(qualificationCode);
  }

  if (minFeeFilter !== null) {
    filters.push('p.consultation_fee >= ?');
    params.push(minFeeFilter);
  }

  if (maxFeeFilter !== null) {
    filters.push('p.consultation_fee <= ?');
    params.push(maxFeeFilter);
  }

  if (minExperienceFilter !== null) {
    filters.push('p.years_of_experience >= ?');
    params.push(minExperienceFilter);
  }

  if (minRatingFilter !== null) {
    filters.push('p.average_rating >= ?');
    params.push(minRatingFilter);
  }

  if (genderFilter) {
    filters.push('LOWER(p.gender) = ?');
    params.push(genderFilter.toLowerCase());
  }

  if (languageFilter) {
    filters.push('LOWER(p.languages_spoken) LIKE ?');
    params.push(`%${languageFilter.toLowerCase()}%`);
  }

  if (hasVideoFilter) {
    filters.push('u.status = ?');
    params.push('ACTIVE');
  }

  const filterSql = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
  const rows = await getDatabase()
    .prepare(`
      ${doctorSelect}
      WHERE u.role = 'doctor'
      ${statusFilter}
      ${filterSql}
      ${getSortSql(requestedSort)}
    `)
    .all(...params);
  const doctors = rows.map(mapDoctor);
  const doctorsWithAvailability = await enrichWithAvailability(doctors, availabilityDates, requireAvailability);

  return applyInMemorySort(doctorsWithAvailability, requestedSort);
}
