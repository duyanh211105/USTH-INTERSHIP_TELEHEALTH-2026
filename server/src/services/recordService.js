import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { getStorageAdapter } from './storageService.js';

function mapRecord(row, documents = []) {
  if (!row) return null;

  return {
    id: Number(row.id),
    patientId: Number(row.patient_id),
    appointmentId: row.appointment_id === null || row.appointment_id === undefined ? null : Number(row.appointment_id),
    patientName: row.patient_name,
    title: row.title,
    category: row.category,
    notes: row.notes,
    createdAt: toIsoString(row.created_at),
    documents,
  };
}

function mapDocument(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    recordId: Number(row.record_id),
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: Number(row.size),
    path: row.path,
    url: row.url,
    storageProvider: row.storage_provider || 'local',
    storageKey: row.storage_key || row.path,
    uploadedAt: toIsoString(row.uploaded_at),
  };
}

const recordSelect = `
  SELECT r.*, patient.name AS patient_name
  FROM medical_records r
  JOIN users patient ON patient.id = r.patient_id
`;

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

async function getDocumentsForRecordIds(recordIds) {
  if (recordIds.length === 0) {
    return new Map();
  }

  const placeholders = recordIds.map(() => '?').join(', ');
  const rows = await getDatabase()
    .prepare(`
      SELECT *
      FROM medical_documents
      WHERE record_id IN (${placeholders})
      ORDER BY uploaded_at DESC, id DESC
    `)
    .all(...recordIds);

  const documentsByRecordId = new Map();

  for (const row of rows) {
    const recordId = Number(row.record_id);
    const documents = documentsByRecordId.get(recordId) || [];
    documents.push(mapDocument(row));
    documentsByRecordId.set(recordId, documents);
  }

  return documentsByRecordId;
}

async function attachDocuments(records) {
  const documentsByRecordId = await getDocumentsForRecordIds(records.map((record) => record.id));

  return records.map((record) => ({
    ...record,
    documents: documentsByRecordId.get(record.id) || [],
  }));
}

export async function getRecordById(id) {
  const record = mapRecord(await getDatabase().prepare(`${recordSelect} WHERE r.id = ?`).get(id));

  if (!record) {
    return null;
  }

  return (await attachDocuments([record]))[0];
}

export async function listRecordsForUser(user) {
  let query = `${recordSelect}`;
  const params = [];

  if (user.role === 'patient') {
    query += ' WHERE r.patient_id = ?';
    params.push(user.id);
  } else if (user.role === 'doctor') {
    query += `
      WHERE r.patient_id IN (
        SELECT DISTINCT patient_id
        FROM appointments
        WHERE doctor_id = ?
          AND status != 'CANCELLED'
      )
    `;
    params.push(user.id);
  }

  query += ' ORDER BY r.created_at DESC, r.id DESC';
  const rows = await getDatabase().prepare(query).all(...params);
  return attachDocuments(rows.map((row) => mapRecord(row)));
}

export async function createRecord(user, data) {
  if (user.role !== 'patient') {
    throw new ApiError(403, 'Only patients can create medical records');
  }

  const { title, category, notes = '', appointmentId = null } = data;

  if (!title || !category) {
    throw new ApiError(400, 'title and category are required');
  }

  if (appointmentId) {
    const appointment = await getDatabase()
      .prepare('SELECT id FROM appointments WHERE id = ? AND patient_id = ?')
      .get(appointmentId, user.id);

    if (!appointment) {
      throw new ApiError(403, 'Patients can only attach records to their own appointments');
    }
  }

  const result = await getDatabase()
    .prepare('INSERT INTO medical_records (patient_id, appointment_id, title, category, notes) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, appointmentId, title, category, notes);

  return getRecordById(Number(result.lastInsertRowid));
}

export async function addDocumentToRecord(recordId, file) {
  if (!file) {
    throw new ApiError(400, 'file is required');
  }

  const storedFile = await getStorageAdapter().persistUploadedFile(file);
  const result = await getDatabase()
    .prepare(`
      INSERT INTO medical_documents (
        record_id, filename, original_name, mime_type, size, path, url, storage_provider, storage_key
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      recordId,
      file.filename,
      file.originalname,
      file.mimetype,
      file.size,
      storedFile.path,
      storedFile.url,
      storedFile.storageProvider,
      storedFile.storageKey,
    );

  return mapDocument(
    await getDatabase()
      .prepare('SELECT * FROM medical_documents WHERE id = ?')
      .get(Number(result.lastInsertRowid)),
  );
}

export async function deleteRecord(user, recordId) {
  const record = await getRecordById(recordId);

  if (!record) {
    throw new ApiError(404, 'Record not found');
  }

  if (user.role !== 'admin' && user.id !== record.patientId) {
    throw new ApiError(403, 'Only the owning patient can delete this medical record');
  }

  const warnings = [];

  for (const document of record.documents) {
    try {
      await getStorageAdapter(document.storageProvider).removeStoredFile(document);
    } catch (error) {
      console.error(`Unable to delete stored medical document ${document.id}:`, error);
      warnings.push(`Unable to delete stored file for ${document.originalName}`);
    }
  }

  await getDatabase().prepare('DELETE FROM medical_records WHERE id = ?').run(recordId);

  return { deleted: true, warnings };
}
