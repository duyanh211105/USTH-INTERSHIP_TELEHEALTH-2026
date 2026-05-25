import { getDatabase } from '../db/connection.js';
import { getAppointmentById } from './appointmentService.js';
import { ApiError } from '../middleware/errors.js';

function mapConsultation(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    appointmentId: Number(row.appointment_id),
    doctorId: Number(row.doctor_id),
    doctorName: row.doctor_name,
    patientId: Number(row.patient_id),
    patientName: row.patient_name,
    symptoms: row.symptoms,
    diagnosis: row.diagnosis,
    prescription: row.prescription,
    advice: row.advice,
    followUp: row.follow_up,
    createdAt: toIsoString(row.created_at),
  };
}

const consultationSelect = `
  SELECT c.*, doctor.name AS doctor_name, patient.name AS patient_name
  FROM consultation_notes c
  JOIN users doctor ON doctor.id = c.doctor_id
  JOIN users patient ON patient.id = c.patient_id
`;

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function listConsultationsForUser(user) {
  let query = `${consultationSelect}`;
  const params = [];

  if (user.role === 'patient') {
    query += ' WHERE c.patient_id = ?';
    params.push(user.id);
  }

  if (user.role === 'doctor') {
    query += ' WHERE c.doctor_id = ?';
    params.push(user.id);
  }

  query += ' ORDER BY c.created_at DESC, c.id DESC';
  const rows = await getDatabase().prepare(query).all(...params);
  return rows.map(mapConsultation);
}

export async function createConsultation(user, data) {
  if (user.role !== 'doctor' && user.role !== 'admin') {
    throw new ApiError(403, 'Only doctors and admins can create consultation notes');
  }

  const { appointmentId, symptoms, diagnosis, prescription, advice, followUp } = data;
  const appointment = await getAppointmentById(appointmentId);

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  if (user.role === 'doctor' && appointment.doctorId !== user.id) {
    throw new ApiError(403, 'Doctors can only write notes for assigned appointments');
  }

  if (!symptoms || !diagnosis || !prescription || !advice || !followUp) {
    throw new ApiError(400, 'consultation note fields are required');
  }

  const result = await getDatabase()
    .prepare(`
      INSERT INTO consultation_notes (
        appointment_id, doctor_id, patient_id, symptoms, diagnosis, prescription, advice, follow_up
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(appointment.id, appointment.doctorId, appointment.patientId, symptoms, diagnosis, prescription, advice, followUp);

  await getDatabase().prepare("UPDATE appointments SET status = 'COMPLETED' WHERE id = ?").run(appointment.id);

  return mapConsultation(
    await getDatabase()
      .prepare(`${consultationSelect} WHERE c.id = ?`)
      .get(Number(result.lastInsertRowid)),
  );
}
