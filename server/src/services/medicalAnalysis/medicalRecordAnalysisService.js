import fs from 'node:fs/promises';
import path from 'node:path';
import { getDatabase } from '../../db/connection.js';
import { ApiError } from '../../middleware/errors.js';
import { getUploadDir } from '../storageService.js';
import { DocumentProcessingError } from '../documentProcessing/documentProcessingError.js';
import { extractText } from '../documentProcessing/documentTextExtractor.js';
import { normalizeExtractedText } from '../documentProcessing/textNormalization.js';
import { getOpenRouterModel, analyzeMedicalRecord as analyzeWithOpenRouter, AIMedicalAnalysisError } from './aiMedicalAnalysisService.js';
import {
  MedicalRecordAnalysisValidationError,
  validateMedicalRecordAnalysis,
} from './medicalRecordAnalysisSchema.js';

const promptVersion = 'v1.0';
const finalStatuses = new Set(['ACCEPTED', 'EDITED', 'REJECTED']);
const creationLocks = new Map();
let analysisProvider = analyzeWithOpenRouter;

export function setMedicalRecordAnalysisProviderForTests(provider) {
  analysisProvider = provider;
}

export function resetMedicalRecordAnalysisProviderForTests() {
  analysisProvider = analyzeWithOpenRouter;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value);
}

function mapAnalysis(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    recordId: Number(row.record_id),
    status: row.status,
    aiModel: row.ai_model,
    promptVersion: row.prompt_version,
    analysis: parseJson(row.analysis_json, {}),
    reviewedAnalysis: parseJson(row.reviewed_analysis_json, null),
    doctorNotes: row.doctor_notes || '',
    reviewedBy: row.reviewed_by === null || row.reviewed_by === undefined ? null : Number(row.reviewed_by),
    reviewedAt: toIsoString(row.reviewed_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function findMedicalRecord(recordId) {
  return getDatabase()
    .prepare(`
      SELECT r.*, patient.name AS patient_name
      FROM medical_records r
      JOIN users patient ON patient.id = r.patient_id
      WHERE r.id = ?
    `)
    .get(recordId);
}

async function assertDoctorCanAccessRecord(user, record) {
  if (!record) {
    throw new ApiError(404, 'Record not found');
  }

  if (user.role !== 'doctor') {
    throw new ApiError(403, 'Only assigned doctors can access AI medical record analysis');
  }

  const assignment = await getDatabase()
    .prepare(`
      SELECT id
      FROM appointments
      WHERE doctor_id = ?
        AND patient_id = ?
        AND status <> 'CANCELLED'
      LIMIT 1
    `)
    .get(user.id, record.patient_id);

  if (!assignment) {
    throw new ApiError(403, 'Doctors can only access AI analysis for assigned patients');
  }
}

async function findDocumentsByRecordId(recordId) {
  const rows = await getDatabase()
    .prepare(`
      SELECT *
      FROM medical_documents
      WHERE record_id = ?
      ORDER BY uploaded_at DESC, id DESC
    `)
    .all(recordId);

  return rows.map((row) => ({
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
    uploadedAt: row.uploaded_at,
  }));
}

function assertPathWithinUploadDir(filePath) {
  const uploadDir = path.resolve(getUploadDir());
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(uploadDir, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new ApiError(400, 'Uploaded medical document path is outside the configured upload directory');
  }

  return resolvedPath;
}

async function resolveLocalDocumentPath(document) {
  if (document.storageProvider !== 'local') {
    throw new ApiError(400, 'Uploaded medical document is not available for local AI text extraction');
  }

  const storedPath = document.path || document.storageKey;

  if (!storedPath) {
    throw new ApiError(400, 'Uploaded medical document file path is missing');
  }

  const resolvedPath = assertPathWithinUploadDir(storedPath);
  let stats;

  try {
    stats = await fs.stat(resolvedPath);
  } catch {
    throw new ApiError(400, 'Uploaded medical document file could not be found for AI analysis');
  }

  if (!stats.isFile()) {
    throw new ApiError(400, 'Uploaded medical document path is not a file');
  }

  return resolvedPath;
}

function formatDocumentText(document, index, text) {
  return [
    `[DOCUMENT ${index + 1}: ${document.originalName}]`,
    text,
  ].join('\n');
}

async function extractTextFromUploadedDocuments(documents) {
  const extractedDocuments = [];

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    const filePath = await resolveLocalDocumentPath(document);

    try {
      const extraction = await extractText({
        path: filePath,
        originalname: document.originalName,
        mimetype: document.mimeType,
      });
      const text = normalizeExtractedText(extraction.text || '');

      if (!text) {
        throw new ApiError(400, 'Uploaded medical document did not contain extractable text');
      }

      extractedDocuments.push(formatDocumentText(document, index, text));
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof DocumentProcessingError) {
        throw new ApiError(400, 'Uploaded medical document could not be extracted for AI analysis');
      }

      throw error;
    }
  }

  return normalizeExtractedText(extractedDocuments.join('\n\n'));
}

async function extractAvailableMedicalText(record) {
  const documents = await findDocumentsByRecordId(record.id);

  if (documents.length > 0) {
    return extractTextFromUploadedDocuments(documents);
  }

  const text = normalizeExtractedText(record?.notes || '');

  if (!text) {
    throw new ApiError(400, 'Medical record does not contain extracted text for AI analysis');
  }

  return text;
}

async function findLatestAnalysisByRecordId(recordId) {
  const row = await getDatabase()
    .prepare(`
      SELECT *
      FROM medical_record_analyses
      WHERE record_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .get(recordId);

  return mapAnalysis(row);
}

async function insertAnalysis(recordId, analysis, model) {
  const db = getDatabase();
  const validated = validateMedicalRecordAnalysis(analysis);

  const result = await db.transaction(async (transactionDb) => transactionDb
    .prepare(`
      INSERT INTO medical_record_analyses (
        record_id, status, ai_model, prompt_version, analysis_json
      )
      VALUES (?, 'PENDING_REVIEW', ?, ?, ?)
    `)
    .run(recordId, model, promptVersion, stringifyJson(validated)));

  const row = await db
    .prepare('SELECT * FROM medical_record_analyses WHERE id = ?')
    .get(Number(result.lastInsertRowid));

  return mapAnalysis(row);
}

function mapAnalysisProviderError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof MedicalRecordAnalysisValidationError) {
    return new ApiError(502, 'AI analysis returned an invalid structure');
  }

  if (error instanceof AIMedicalAnalysisError) {
    if (error.code === 'EMPTY_DOCUMENT') {
      return new ApiError(400, 'Medical record does not contain extracted text for AI analysis');
    }

    if (error.code === 'DOCUMENT_TOO_LARGE') {
      return new ApiError(413, 'Medical record text is too large for AI analysis');
    }

    return new ApiError(502, 'AI analysis service is temporarily unavailable');
  }

  return new ApiError(502, 'AI analysis service is temporarily unavailable');
}

async function withCreationLock(recordId, operation) {
  const activeLock = creationLocks.get(recordId);

  if (activeLock) {
    await activeLock.catch(() => {});
    return operation();
  }

  const lock = operation();
  creationLocks.set(recordId, lock);

  try {
    return await lock;
  } finally {
    if (creationLocks.get(recordId) === lock) {
      creationLocks.delete(recordId);
    }
  }
}

export async function requestMedicalRecordAnalysis(user, recordId, { force = false } = {}) {
  const numericRecordId = Number(recordId);
  const record = await findMedicalRecord(numericRecordId);
  await assertDoctorCanAccessRecord(user, record);

  return withCreationLock(numericRecordId, async () => {
    if (!force) {
      const existing = await findLatestAnalysisByRecordId(numericRecordId);

      if (existing) {
        return { analysis: existing, created: false };
      }
    }

    const text = await extractAvailableMedicalText(record);

    try {
      const model = getOpenRouterModel();
      const analysis = await analysisProvider(text, { model });

      if (!force) {
        const existingAfterProvider = await findLatestAnalysisByRecordId(numericRecordId);

        if (existingAfterProvider) {
          return { analysis: existingAfterProvider, created: false };
        }
      }

      return {
        analysis: await insertAnalysis(numericRecordId, analysis, model),
        created: true,
      };
    } catch (error) {
      throw mapAnalysisProviderError(error);
    }
  });
}

export async function getMedicalRecordAnalysis(user, recordId) {
  const numericRecordId = Number(recordId);
  const record = await findMedicalRecord(numericRecordId);
  await assertDoctorCanAccessRecord(user, record);

  const analysis = await findLatestAnalysisByRecordId(numericRecordId);

  if (!analysis) {
    throw new ApiError(404, 'AI analysis not found');
  }

  return analysis;
}

function normalizeReviewAction(action) {
  return String(action || '').trim().toUpperCase();
}

function validateReviewPayload(action, data) {
  if (!['ACCEPT', 'EDIT', 'REJECT'].includes(action)) {
    throw new ApiError(400, 'Invalid review action');
  }

  if (action === 'EDIT' && !data.reviewed_analysis) {
    throw new ApiError(400, 'reviewed_analysis is required for EDIT');
  }

  if (action === 'EDIT') {
    try {
      return validateMedicalRecordAnalysis(data.reviewed_analysis);
    } catch (error) {
      if (error instanceof MedicalRecordAnalysisValidationError) {
        throw new ApiError(400, 'reviewed_analysis must match the medical analysis schema');
      }

      throw error;
    }
  }

  return null;
}

function statusForAction(action) {
  if (action === 'ACCEPT') return 'ACCEPTED';
  if (action === 'EDIT') return 'EDITED';
  return 'REJECTED';
}

export async function reviewMedicalRecordAnalysis(user, recordId, data = {}) {
  const numericRecordId = Number(recordId);
  const record = await findMedicalRecord(numericRecordId);
  await assertDoctorCanAccessRecord(user, record);

  const action = normalizeReviewAction(data.action);
  const reviewedAnalysis = validateReviewPayload(action, data);
  const analysis = await findLatestAnalysisByRecordId(numericRecordId);

  if (!analysis) {
    throw new ApiError(404, 'AI analysis not found');
  }

  if (finalStatuses.has(analysis.status)) {
    throw new ApiError(409, 'AI analysis has already been reviewed');
  }

  const reviewedAt = new Date().toISOString();
  const nextStatus = statusForAction(action);
  await getDatabase()
    .prepare(`
      UPDATE medical_record_analyses
      SET status = ?,
          reviewed_analysis_json = ?,
          doctor_notes = ?,
          reviewed_by = ?,
          reviewed_at = ?,
          updated_at = ?
      WHERE id = ?
        AND status = 'PENDING_REVIEW'
    `)
    .run(
      nextStatus,
      reviewedAnalysis ? stringifyJson(reviewedAnalysis) : null,
      data.doctor_notes || data.doctorNotes || '',
      user.id,
      reviewedAt,
      reviewedAt,
      analysis.id,
    );

  return mapAnalysis(
    await getDatabase()
      .prepare('SELECT * FROM medical_record_analyses WHERE id = ?')
      .get(analysis.id),
  );
}
