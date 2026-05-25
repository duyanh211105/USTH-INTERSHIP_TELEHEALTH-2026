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
  } = data;

  if (!mainSymptom || !duration || !fever || !medication || !allergies || !previousHistory || !summary) {
    throw new ApiError(400, 'symptom summary fields are required');
  }

  const result = await getDatabase()
    .prepare(`
      INSERT INTO symptom_summaries (
        patient_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      patientId,
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

  return mapSymptom(
    await getDatabase()
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
