import { buildAssetUrl } from './apiClient.js';

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

export function mapDoctorForView(doctor) {
  return {
    ...doctor,
    availability: doctor.availability || 'Availability pending',
    patients: doctor.patients ?? doctor.patientsCount ?? 0,
    rating: doctor.rating ?? '4.8',
  };
}

export function mapAppointmentForView(appointment) {
  return {
    ...appointment,
    patient: appointment.patient || appointment.patientName || 'Patient',
    doctor: appointment.doctor || appointment.doctorName || 'Doctor',
    specialty: appointment.specialty || 'Telehealth',
    date: appointment.date || formatDate(appointment.scheduledDate),
    time: appointment.time || formatTime(appointment.scheduledTime),
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
