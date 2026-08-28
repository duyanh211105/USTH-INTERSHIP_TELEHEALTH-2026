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
import { addDaysToLocalDate, getCurrentLocalDate } from '../utils/appointmentDateTime.js';

const supportedLanguages = new Set(['vietnamese', 'english', 'japanese', 'korean', 'chinese']);
const supportedRatingThresholds = new Set([4, 4.5, 4.8]);
const maxExperienceForScore = 30;
const maxReviewCountForScore = 500;

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
    recommendationScore: Number(row.recommendation_score || 0),
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
  return getCurrentLocalDate();
}

function addUtcDays(date, days) {
  return addDaysToLocalDate(date, days);
}

function getDateWindow(startDate, dayCount) {
  return Array.from({ length: dayCount }, (_, index) => addUtcDays(startDate, index));
}

function getAvailabilityDates({ date, availableToday, availableNext3Days, availableWithin3Days, availableThisWeek }) {
  const today = getTodayIsoDate();
  const requestedDate = normalizeOptionalString(date);

  if (requestedDate) {
    return [requestedDate];
  }

  if (String(availableToday || '').toLowerCase() === 'true') {
    return getDateWindow(today, 1);
  }

  if (String(availableThisWeek || '').toLowerCase() === 'true') {
    return getDateWindow(today, 7);
  }

  if (
    String(availableNext3Days || '').toLowerCase() === 'true'
    || String(availableWithin3Days || '').toLowerCase() === 'true'
  ) {
    return getDateWindow(today, 3);
  }

  return getDateWindow(today, 7);
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
    case 'most_experienced':
      return 'ORDER BY p.years_of_experience DESC, u.name ASC';
    case 'most_reviewed':
      return 'ORDER BY p.review_count DESC, p.average_rating DESC, u.name ASC';
    default:
      return 'ORDER BY u.name ASC';
  }
}

function applyInMemorySort(doctors, sort) {
  const normalizedSort = normalizeOptionalString(sort) || 'recommended';

  if (normalizedSort === 'earliest_availability') {
    return [...doctors].sort((left, right) => {
      const leftSlot = left.nextAvailableAt || '9999-99-99T99:99:99.999Z';
      const rightSlot = right.nextAvailableAt || '9999-99-99T99:99:99.999Z';
      return leftSlot.localeCompare(rightSlot) || left.name.localeCompare(right.name);
    });
  }

  if (normalizedSort === 'recommended') {
    return [...doctors].sort((left, right) => (
      right.recommendationScore - left.recommendationScore
      || Number(right.averageRating || 0) - Number(left.averageRating || 0)
      || Number(right.reviewCount || 0) - Number(left.reviewCount || 0)
      || left.name.localeCompare(right.name)
    ));
  }

  return doctors;
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
      const recommendationScore = calculateRecommendationScore(doctor, nextAvailability);

      return {
        ...doctor,
        recommendationScore,
        nextAvailableSlot: nextAvailability?.time || null,
        nextAvailableAt: nextAvailability?.startsAt || null,
        availability: formatNextAvailability(nextAvailability),
        availabilitySummary: formatNextAvailability(nextAvailability),
      };
    }),
  );

  return requireAvailability ? enrichedDoctors.filter((doctor) => doctor.nextAvailableSlot) : enrichedDoctors;
}

function clampScore(value) {
  return Math.max(0, Math.min(value, 1));
}

function getAvailabilityScore(nextAvailability) {
  if (!nextAvailability?.startsAt) {
    return 0;
  }

  const startsAt = new Date(nextAvailability.startsAt);
  const diffDays = (startsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

  if (diffDays <= 1) {
    return 1;
  }

  if (diffDays <= 3) {
    return 0.75;
  }

  if (diffDays <= 7) {
    return 0.5;
  }

  return 0.25;
}

function calculateRecommendationScore(doctor, nextAvailability) {
  const normalizedRating = clampScore(Number(doctor.averageRating || doctor.rating || 0) / 5);
  const availabilityScore = getAvailabilityScore(nextAvailability);
  const normalizedExperience = clampScore(Number(doctor.yearsOfExperience || 0) / maxExperienceForScore);
  const normalizedReviewCount = clampScore(Number(doctor.reviewCount || 0) / maxReviewCountForScore);

  return Number((
    0.4 * normalizedRating
    + 0.3 * availabilityScore
    + 0.2 * normalizedExperience
    + 0.1 * normalizedReviewCount
  ).toFixed(4));
}

function parseSupportedRating(value) {
  const rating = parseOptionalNumber(value);
  return supportedRatingThresholds.has(rating) ? rating : null;
}

function parseSupportedLanguage(value) {
  const language = normalizeOptionalString(value);
  return supportedLanguages.has(language.toLowerCase()) ? language : '';
}

function normalizeSortOption(value) {
  const sort = normalizeOptionalString(value);
  const supportedSorts = new Set([
    '',
    'recommended',
    'highest_rating',
    'most_experienced',
    'earliest_availability',
    'lowest_fee',
    'highest_fee',
    'most_reviewed',
  ]);

  return supportedSorts.has(sort) ? sort : 'recommended';
}

function paginateDoctors(doctors, page, limit) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.min(Math.max(Number(limit) || doctors.length || 20, 1), 50);
  const start = (pageNumber - 1) * limitNumber;

  return doctors.slice(start, start + limitNumber);
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
  consultationType,
  minExperience,
  minYearsExperience,
  minRating,
  gender,
  language,
  sort,
  page,
  limit,
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
  const minRatingFilter = parseSupportedRating(minRating);
  const genderFilter = normalizeOptionalString(gender);
  const languageFilter = parseSupportedLanguage(language);
  const requestedSort = normalizeSortOption(sort);
  const requestedConsultationType = normalizeOptionalString(consultationType).toLowerCase();
  const hasVideoFilter = String(videoAvailable || '').toLowerCase() === 'true' || requestedConsultationType === 'video';
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

  return paginateDoctors(applyInMemorySort(doctorsWithAvailability, requestedSort), page, limit);
}
