import { getAppointmentForUser } from './appointmentService.js';

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsDate(date, time, offsetMinutes = 0) {
  const start = new Date(`${date}T${time}:00.000Z`);
  start.setUTCMinutes(start.getUTCMinutes() + offsetMinutes);
  return start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export async function generateAppointmentCalendar(user, appointmentId) {
  const appointment = await getAppointmentForUser(user, appointmentId);
  const title = `Telehealth consultation: ${appointment.patientName || appointment.patient} with ${appointment.doctorName || appointment.doctor}`;
  const description = [
    `Status: ${appointment.status}`,
    `Reason: ${appointment.reason}`,
    `Patient: ${appointment.patientName || appointment.patient}`,
    `Doctor: ${appointment.doctorName || appointment.doctor}`,
  ].join('\\n');

  return {
    filename: `appointment-${appointment.id}.ics`,
    content: [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MediConnect//Telehealth Appointment//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:appointment-${appointment.id}@mediconnect.local`,
      `DTSTAMP:${toIcsDate(appointment.scheduledDate, appointment.scheduledTime)}`,
      `DTSTART:${toIcsDate(appointment.scheduledDate, appointment.scheduledTime)}`,
      `DTEND:${toIcsDate(appointment.scheduledDate, appointment.scheduledTime, 30)}`,
      `SUMMARY:${escapeIcsText(title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `STATUS:${appointment.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n'),
  };
}
