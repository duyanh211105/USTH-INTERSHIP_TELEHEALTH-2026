import { buildAssetUrl } from './apiClient.js';
import { getSpecialtyLabel, normalizeSpecialtyCode } from '../constants/specialties.js';
import {
  formatDoctorNameWithQualification,
  getQualificationLabel,
  normalizeQualificationCode,
} from '../constants/doctorQualifications.js';

function formatDate(value) {
  if (!value) {
    return 'Not scheduled';
  }

  const rawValue = String(value);
  const dateValue = rawValue.includes('T') ? rawValue : `${rawValue}T00:00:00`;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return 'Not scheduled';
  }

  const date = new Date(`1970-01-01T${value}`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function parseAppointmentDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }

  const value = new Date(`${String(dateValue).slice(0, 10)}T${String(timeValue).slice(0, 5)}:00Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function formatLocalAppointmentDate(dateValue, timeValue) {
  const value = parseAppointmentDateTime(dateValue, timeValue);
  return value ? formatDate(value.toISOString()) : formatDate(dateValue);
}

function formatLocalAppointmentTime(dateValue, timeValue) {
  const value = parseAppointmentDateTime(dateValue, timeValue);

  if (!value) {
    return formatTime(timeValue);
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

export function mapDoctorForView(doctor) {
  const specialtyCode = doctor.specialtyCode || normalizeSpecialtyCode(doctor.specialty);
  const qualificationCode = doctor.qualificationCode || normalizeQualificationCode(doctor.qualificationTitle || doctor.qualification_title);
  const qualificationTitle = qualificationCode ? getQualificationLabel(qualificationCode) : (doctor.qualificationTitle || doctor.qualification_title || '');
  const averageRating = doctor.averageRating ?? doctor.average_rating ?? doctor.rating ?? '4.8';
  const reviewCount = doctor.reviewCount ?? doctor.review_count ?? 0;

  return {
    ...doctor,
    specialtyCode,
    specialty: specialtyCode ? getSpecialtyLabel(specialtyCode) : doctor.specialty,
    qualificationCode,
    qualificationTitle,
    displayName: doctor.displayName || formatDoctorNameWithQualification(doctor.name, qualificationCode),
    availability: doctor.availability || 'Availability pending',
    nextAvailableSlot: doctor.nextAvailableSlot || null,
    nextAvailableAt: doctor.nextAvailableAt || null,
    patients: doctor.patients ?? doctor.patientsCount ?? 0,
    yearsOfExperience: doctor.yearsOfExperience ?? doctor.years_of_experience ?? 0,
    languagesSpoken: doctor.languagesSpoken ?? doctor.languages_spoken ?? '',
    gender: doctor.gender || '',
    averageRating,
    reviewCount,
    rating: averageRating,
    videoConsultationAvailable: doctor.videoConsultationAvailable ?? true,
  };
}

export function mapAppointmentForView(appointment) {
  const scheduledDate = appointment.scheduledDate || appointment.appointmentDate;
  const scheduledTime = appointment.scheduledTime || appointment.appointmentTime;

  return {
    ...appointment,
    id: appointment.id || appointment.appointmentId,
    scheduledDate,
    scheduledTime,
    patient: appointment.patient || appointment.patientName || 'Patient',
    doctor: appointment.doctor || appointment.doctorName || 'Doctor',
    specialty: appointment.specialty || 'Telehealth',
    date: appointment.date || formatLocalAppointmentDate(scheduledDate, scheduledTime),
    time: appointment.time || formatLocalAppointmentTime(scheduledDate, scheduledTime),
    priority: appointment.priority || 'NORMAL',
    status: appointment.status || 'PENDING',
  };
}

export function mapRecordForView(record) {
  const documents = (record.documents || []).map((document) => ({
    ...document,
    url: buildAssetUrl(document.url),
  }));
  const primaryDocument = documents[0];
  const inferredType = primaryDocument?.mimeType === 'application/pdf'
    ? 'PDF'
    : primaryDocument?.mimeType?.startsWith('image/')
      ? 'Image'
      : 'Record';
  const documentSize = primaryDocument?.size ? `${Math.ceil(primaryDocument.size / 1024)} KB` : 'Metadata';

  return {
    ...record,
    documents,
    type: record.type || inferredType,
    date: record.date || formatDate(record.createdAt),
    size: record.size || documentSize,
  };
}
