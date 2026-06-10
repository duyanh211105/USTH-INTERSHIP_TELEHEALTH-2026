import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

function parseJson(value, fallback) {
  if (!value) return fallback;

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function mapSymptom(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    patientId: Number(row.patient_id),
    appointmentId: row.appointment_id === null || row.appointment_id === undefined ? null : Number(row.appointment_id),
    medicalRecordId: row.medical_record_id === null || row.medical_record_id === undefined ? null : Number(row.medical_record_id),
    mainSymptom: row.main_symptom,
    duration: row.duration,
    severity: row.severity,
    fever: row.fever,
    temperature: row.temperature,
    medication: row.medication,
    allergies: row.allergies,
    previousHistory: row.previous_history,
    conditionalAnswers: parseJson(row.conditional_answers, {}),
    redFlags: parseJson(row.red_flags, []),
    priority: row.priority || 'NORMAL',
    doctorSummary: row.doctor_summary || row.summary,
    summary: row.summary,
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function buildIntakeRecordNotes(data) {
  const lines = [
    `Main symptom: ${data.mainSymptom}`,
    `Duration: ${data.duration}`,
    `Fever: ${data.fever}`,
    `Medication: ${data.medication}`,
    `Allergies: ${data.allergies}`,
    `Chronic diseases / previous history: ${data.previousHistory}`,
  ];

  if (data.summary) {
    lines.push('', data.summary);
  }

  return lines.join('\n');
}

async function ensureAppointmentBelongsToPatient(db, appointmentId, patientId) {
  if (!appointmentId) {
    return null;
  }

  const appointment = await db
    .prepare('SELECT id, patient_id FROM appointments WHERE id = ?')
    .get(appointmentId);

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  if (Number(appointment.patient_id) !== Number(patientId)) {
    throw new ApiError(403, 'Patients can only attach intake answers to their own appointment');
  }

  return Number(appointment.id);
}

async function saveAppointmentIntakeRecord(db, patientId, appointmentId, data) {
  if (!appointmentId) {
    return null;
  }

  const notes = buildIntakeRecordNotes(data);
  const existing = await db
    .prepare(`
      SELECT id
      FROM medical_records
      WHERE patient_id = ?
        AND appointment_id = ?
        AND category = 'Medical Intake'
      ORDER BY id DESC
    `)
    .get(patientId, appointmentId);

  // Post-booking chatbot answers are stored as a normal medical record so the doctor can review
  // the intake in the same workflow as uploaded/created records.
  if (existing) {
    await db
      .prepare(`
        UPDATE medical_records
        SET title = ?,
            notes = ?
        WHERE id = ?
      `)
      .run('Pre-consultation Intake', notes, existing.id);
    return Number(existing.id);
  }

  const result = await db
    .prepare(`
      INSERT INTO medical_records (patient_id, appointment_id, title, category, notes)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(patientId, appointmentId, 'Pre-consultation Intake', 'Medical Intake', notes);

  return Number(result.lastInsertRowid);
}

export async function createSymptomSummary(user, data) {
  const patientId = Number(data.patientId || user.id);

  if (user.role !== 'admin' && user.id !== patientId) {
    throw new ApiError(403, 'Patients can only create their own symptom summaries');
  }

  const {
    mainSymptom,
    duration,
    severity = '',
    fever,
    temperature = '',
    medication,
    allergies,
    previousHistory,
    conditionalAnswers = {},
    redFlags = [],
    priority = 'NORMAL',
    doctorSummary,
    summary,
    appointmentId: rawAppointmentId = data.appointment_id,
  } = data;

  if (!mainSymptom || !duration || !fever || !medication || !allergies || !previousHistory || !summary) {
    throw new ApiError(400, 'symptom summary fields are required');
  }

  const db = getDatabase();
  const result = await db.transaction(async (transactionDb) => {
    const appointmentId = await ensureAppointmentBelongsToPatient(transactionDb, rawAppointmentId, patientId);
    const medicalRecordId = await saveAppointmentIntakeRecord(transactionDb, patientId, appointmentId, {
      mainSymptom,
      duration,
      fever,
      medication,
      allergies,
      previousHistory,
      summary,
    });

    return transactionDb
      .prepare(`
      INSERT INTO symptom_summaries (
        patient_id,
        appointment_id,
        medical_record_id,
        main_symptom,
        duration,
        severity,
        fever,
        temperature,
        medication,
        allergies,
        previous_history,
        conditional_answers,
        red_flags,
        priority,
        doctor_summary,
        summary
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        patientId,
        appointmentId,
        medicalRecordId,
        mainSymptom,
        duration,
        severity,
        fever,
        temperature,
        medication,
        allergies,
        previousHistory,
        stringifyJson(conditionalAnswers, {}),
        stringifyJson(redFlags, []),
        priority === 'HIGH' ? 'HIGH' : 'NORMAL',
        doctorSummary || summary,
        summary,
      );
  });

  return mapSymptom(
    await db
      .prepare('SELECT * FROM symptom_summaries WHERE id = ?')
      .get(Number(result.lastInsertRowid)),
  );
}

export async function listSymptomsForPatient(patientId) {
  const rows = await getDatabase()
    .prepare('SELECT * FROM symptom_summaries WHERE patient_id = ? ORDER BY created_at DESC, id DESC')
    .all(patientId);

  return rows.map(mapSymptom);
}
