import { buildAssetUrl } from './apiClient.js';
import { getSpecialtyLabel, normalizeSpecialtyCode } from '../constants/specialties.js';
import {
  formatDoctorNameWithQualification,
  getQualificationLabel,
  normalizeQualificationCode,
} from '../constants/doctorQualifications.js';
import { convertUtcToDisplayDateTime, parseLocalAppointmentDateTime } from '../utils/appointmentDateTime.js';

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

  return String(value).slice(0, 5);
}

function parseAppointmentDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }

  return parseLocalAppointmentDateTime(String(dateValue).slice(0, 10), String(timeValue).slice(0, 5));
}

function getAppointmentDisplayDateTime(appointment, dateValue, timeValue) {
  if (appointment.appointmentDateTime) {
    const display = convertUtcToDisplayDateTime(appointment.appointmentDateTime);

    if (display) {
      return display;
    }
  }

  const value = parseAppointmentDateTime(dateValue, timeValue);
  return value ? convertUtcToDisplayDateTime(value) : null;
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
  const displayDateTime = getAppointmentDisplayDateTime(appointment, scheduledDate, scheduledTime);

  return {
    ...appointment,
    id: appointment.id || appointment.appointmentId,
    appointmentDateTime: appointment.appointmentDateTime,
    scheduledDate: displayDateTime?.localDate || scheduledDate,
    scheduledTime: displayDateTime?.localTime || scheduledTime,
    patient: appointment.patient || appointment.patientName || 'Patient',
    doctor: appointment.doctor || appointment.doctorName || 'Doctor',
    specialty: appointment.specialty || 'Telehealth',
    date: appointment.date || appointment.displayDate || displayDateTime?.date || formatDate(scheduledDate),
    time: appointment.time || appointment.displayTime || displayDateTime?.time || formatTime(scheduledTime),
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
