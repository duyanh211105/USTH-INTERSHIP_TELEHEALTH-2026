import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telehealth-ai-analysis-api-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DB_FILE = path.join(testDir, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(testDir, 'uploads');
process.env.JWT_SECRET = 'test-secret';
delete process.env.DATABASE_URL;

const { default: app } = await import('../app.js');
const { closeDatabase, getDatabase } = await import('../db/connection.js');
const {
  dropMedicalRecordAnalysesSchema,
  initializeDatabase,
  initializeMedicalRecordAnalysesSchema,
  postgresSchemaSql,
} = await import('../db/schema.js');
const { seedDatabase } = await import('../db/seed.js');
const {
  resetMedicalRecordAnalysisProviderForTests,
  setMedicalRecordAnalysisProviderForTests,
} = await import('../services/medicalAnalysis/medicalRecordAnalysisService.js');
const { normalizeLocalAppointmentDateTime } = await import('../utils/appointmentDateTime.js');

async function login(phone, password = 'password123') {
  const response = await request(app)
    .post('/auth/login')
    .send({ phone, password })
    .expect(200);

  return response.body.data.token;
}

function validAnalysis(overrides = {}) {
  return {
    summary: 'Synthetic laboratory result requires clinician review.',
    medical_history: [],
    medications: ['Synthetic medication 10mg daily'],
    allergies: [],
    key_findings: [
      {
        finding: 'Synthetic glucose result is listed',
        source_text: 'Glucose 140 mg/dL',
      },
    ],
    abnormal_values: [
      {
        test: 'Glucose',
        value: '140 mg/dL',
        reference_range: '70-99 mg/dL',
        source_text: 'Glucose 140 mg/dL reference range 70-99 mg/dL',
      },
    ],
    red_flags: [],
    possible_conditions: [
      {
        condition: 'Possible metabolic concern',
        reasoning: 'The document includes an elevated synthetic glucose value for review.',
        source_text: 'Glucose 140 mg/dL',
      },
    ],
    suggested_questions: ['Has the patient fasted before this synthetic test?'],
    suggested_follow_up: ['Doctor should review the uploaded laboratory record.'],
    missing_information: ['Fasting status is not included.'],
    ...overrides,
  };
}

function countAnalysesForRecord(recordId) {
  return Number(
    getDatabase()
      .prepare('SELECT COUNT(*) AS count FROM medical_record_analyses WHERE record_id = ?')
      .get(recordId).count,
  );
}

function getStoredAnalysis(analysisId) {
  return getDatabase()
    .prepare('SELECT * FROM medical_record_analyses WHERE id = ?')
    .get(analysisId);
}

function escapePdfText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdf(text) {
  const safeText = escapePdfText(text);
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${safeText}) Tj ET`;
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'ascii');
}

describe('AI medical record analysis API', () => {
  let patientToken;
  let doctorToken;
  let otherDoctorToken;
  let patientId;
  let doctorId;
  let otherDoctorId;

  function insertAssignedAppointment({
    patient = patientId,
    doctor = doctorId,
    status = 'CONFIRMED',
  } = {}) {
    const appointmentDateTime = normalizeLocalAppointmentDateTime('2026-06-11', '09:30').utcDateTime;
    const result = getDatabase()
      .prepare(`
        INSERT INTO appointments (
          patient_id, doctor_id, scheduled_date, scheduled_time, appointment_datetime, reason, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(patient, doctor, '2026-06-11', '09:30', appointmentDateTime, 'Synthetic AI review appointment', status);

    return Number(result.lastInsertRowid);
  }

  async function createRecord({ notes = 'Synthetic record text with Glucose 140 mg/dL reference range 70-99 mg/dL.' } = {}) {
    const appointmentId = insertAssignedAppointment();
    const response = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        title: 'Synthetic Laboratory Report',
        category: 'Laboratory',
        appointmentId,
        notes,
      })
      .expect(201);

    return response.body.data.record;
  }

  async function createOtherDoctor() {
    const passwordHash = getDatabase()
      .prepare("SELECT password_hash FROM users WHERE phone = '0900000002'")
      .get().password_hash;
    const userId = Number(
      getDatabase()
        .prepare(`
          INSERT INTO users (name, email, password_hash, phone, role, status)
          VALUES (?, ?, ?, ?, 'doctor', 'ACTIVE')
        `)
        .run('Unassigned Doctor', 'unassigned-doctor@example.com', passwordHash, '0900099999').lastInsertRowid,
    );

    getDatabase()
      .prepare(`
        INSERT INTO doctor_profiles (
          user_id, specialty, bio, availability, availability_summary, consultation_fee,
          qualification_title, years_of_experience, gender, languages_spoken
        )
        VALUES (?, 'Neurology', '', '', '', 0, 'GENERAL_PRACTITIONER', 0, '', '')
      `)
      .run(userId);

    return {
      id: userId,
      token: await login('0900099999'),
    };
  }

  before(async () => {
    await initializeDatabase();
    await seedDatabase();
    patientToken = await login('0900000001');
    doctorToken = await login('0900000002');

    patientId = Number(
      (await getDatabase().prepare("SELECT id FROM users WHERE phone = '0900000001'").get()).id,
    );
    doctorId = Number(
      (await getDatabase().prepare("SELECT id FROM users WHERE phone = '0900000002'").get()).id,
    );

    const otherDoctor = await createOtherDoctor();
    otherDoctorId = otherDoctor.id;
    otherDoctorToken = otherDoctor.token;
  });

  beforeEach(() => {
    resetMedicalRecordAnalysisProviderForTests();
  });

  after(async () => {
    resetMedicalRecordAnalysisProviderForTests();
    await closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates and rolls back the medical_record_analyses migration cleanly', async () => {
    let table = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'medical_record_analyses'")
      .get();
    assert.equal(table.name, 'medical_record_analyses');
    assert.match(postgresSchemaSql(), /medical_record_analyses/);
    assert.match(postgresSchemaSql(), /analysis_json JSONB NOT NULL/);

    await dropMedicalRecordAnalysesSchema(getDatabase());
    table = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'medical_record_analyses'")
      .get();
    assert.equal(table, undefined);

    await initializeMedicalRecordAnalysesSchema(getDatabase());
    table = getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'medical_record_analyses'")
      .get();
    assert.equal(table.name, 'medical_record_analyses');
  });

  it('lets an assigned doctor request AI analysis and persist a pending review result', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis();
    });
    const record = await createRecord();

    const response = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.equal(response.body.success, true);
    assert.equal(response.body.data.analysis.recordId, record.id);
    assert.equal(response.body.data.analysis.status, 'PENDING_REVIEW');
    assert.equal(response.body.data.analysis.analysis.summary, validAnalysis().summary);
    assert.equal(calls, 1);
    assert.equal(countAnalysesForRecord(record.id), 1);
  });

  it('extracts uploaded PDF documents for Phase 2C analysis instead of using medical record notes', async () => {
    let capturedText = '';
    setMedicalRecordAnalysisProviderForTests(async (text) => {
      capturedText = text;
      return validAnalysis();
    });
    const record = await createRecord({ notes: 'Uploaded from patient dashboard' });
    const pdfText = 'Synthetic PDF laboratory document shows glucose 140 mg/dL reference range 70-99 mg/dL for AI extraction.';
    const filePath = path.join(process.env.UPLOAD_DIR, 'synthetic-lab-result.pdf');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buildSimplePdf(pdfText));

    getDatabase()
      .prepare(`
        INSERT INTO medical_documents (
          record_id, filename, original_name, mime_type, size, path, url, storage_provider, storage_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'local', ?)
      `)
      .run(
        record.id,
        'synthetic-lab-result.pdf',
        'synthetic-lab-result.pdf',
        'application/pdf',
        fs.statSync(filePath).size,
        filePath,
        '/uploads/synthetic-lab-result.pdf',
        filePath,
      );

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.match(capturedText, /Synthetic PDF laboratory document/);
    assert.match(capturedText, /glucose 140 mg\/dL/);
    assert.equal(capturedText.includes('Uploaded from patient dashboard'), false);
  });

  it('combines multiple uploaded documents in deterministic order before Phase 2B analysis', async () => {
    let capturedText = '';
    setMedicalRecordAnalysisProviderForTests(async (text) => {
      capturedText = text;
      return validAnalysis();
    });
    const record = await createRecord({ notes: 'Notes should not be used when documents exist' });

    const documents = [
      {
        filename: 'older-prescription.pdf',
        originalName: 'older-prescription.pdf',
        text: 'First ordered document contains prescription Metformin 500mg twice daily.',
        uploadedAt: '2026-05-01T08:00:00.000Z',
      },
      {
        filename: 'newer-lab.pdf',
        originalName: 'newer-lab.pdf',
        text: 'Second ordered document contains HbA1c 7.2 percent for review.',
        uploadedAt: '2026-05-02T08:00:00.000Z',
      },
    ];

    for (const document of documents) {
      const filePath = path.join(process.env.UPLOAD_DIR, document.filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buildSimplePdf(document.text));
      getDatabase()
        .prepare(`
          INSERT INTO medical_documents (
            record_id, filename, original_name, mime_type, size, path, url, storage_provider, storage_key, uploaded_at
          )
          VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, 'local', ?, ?)
        `)
        .run(
          record.id,
          document.filename,
          document.originalName,
          fs.statSync(filePath).size,
          filePath,
          `/uploads/${document.filename}`,
          filePath,
          document.uploadedAt,
        );
    }

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.ok(capturedText.indexOf('[DOCUMENT 1: newer-lab.pdf]') < capturedText.indexOf('[DOCUMENT 2: older-prescription.pdf]'));
    assert.match(capturedText, /Second ordered document contains HbA1c/);
    assert.match(capturedText, /First ordered document contains prescription/);
    assert.equal(capturedText.includes('Notes should not be used'), false);
  });

  it('uses medical record notes only as an explicit fallback when no documents exist', async () => {
    let capturedText = '';
    setMedicalRecordAnalysisProviderForTests(async (text) => {
      capturedText = text;
      return validAnalysis();
    });
    const record = await createRecord({
      notes: 'Synthetic notes-only record includes glucose 140 mg/dL for fallback analysis.',
    });

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.equal(capturedText, 'Synthetic notes-only record includes glucose 140 mg/dL for fallback analysis.');
  });

  it('returns a controlled error when uploaded document extraction fails and does not fall back to notes', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis();
    });
    const record = await createRecord({ notes: 'Do not analyze this note when document extraction fails' });
    const filePath = path.join(process.env.UPLOAD_DIR, 'corrupted-analysis.pdf');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from('not a valid pdf'));

    getDatabase()
      .prepare(`
        INSERT INTO medical_documents (
          record_id, filename, original_name, mime_type, size, path, url, storage_provider, storage_key
        )
        VALUES (?, 'corrupted-analysis.pdf', 'corrupted-analysis.pdf', 'application/pdf', ?, ?, '/uploads/corrupted-analysis.pdf', 'local', ?)
      `)
      .run(record.id, fs.statSync(filePath).size, filePath, filePath);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(400);

    assert.equal(calls, 0);
    assert.equal(countAnalysesForRecord(record.id), 0);
  });

  it('returns a controlled error when document metadata points to a missing local file', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis();
    });
    const record = await createRecord({ notes: 'Do not analyze this note when document file is missing' });
    const missingPath = path.join(process.env.UPLOAD_DIR, 'missing-analysis.pdf');

    getDatabase()
      .prepare(`
        INSERT INTO medical_documents (
          record_id, filename, original_name, mime_type, size, path, url, storage_provider, storage_key
        )
        VALUES (?, 'missing-analysis.pdf', 'missing-analysis.pdf', 'application/pdf', 123, ?, '/uploads/missing-analysis.pdf', 'local', ?)
      `)
      .run(record.id, missingPath, missingPath);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(400);

    assert.equal(calls, 0);
    assert.equal(countAnalysesForRecord(record.id), 0);
  });

  it('rejects unsafe uploaded document paths outside the upload directory before extraction', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis();
    });
    const record = await createRecord({ notes: 'Do not analyze this note when document path is unsafe' });
    const unsafePath = path.join(testDir, 'outside-upload.pdf');
    fs.writeFileSync(unsafePath, buildSimplePdf('Unsafe outside file should never be read.'));

    getDatabase()
      .prepare(`
        INSERT INTO medical_documents (
          record_id, filename, original_name, mime_type, size, path, url, storage_provider, storage_key
        )
        VALUES (?, 'outside-upload.pdf', 'outside-upload.pdf', 'application/pdf', ?, ?, '/uploads/outside-upload.pdf', 'local', ?)
      `)
      .run(record.id, fs.statSync(unsafePath).size, unsafePath, unsafePath);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(400);

    assert.equal(calls, 0);
    assert.equal(countAnalysesForRecord(record.id), 0);
  });

  it('reuses an existing analysis without calling the AI provider again', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis();
    });
    const record = await createRecord();

    const first = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    const second = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(second.body.data.analysis.id, first.body.data.analysis.id);
    assert.equal(calls, 1);
    assert.equal(countAnalysesForRecord(record.id), 1);
  });

  it('supports force=true by preserving previous analyses and creating a new pending analysis', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis({ summary: `Synthetic forced analysis ${calls}` });
    });
    const record = await createRecord();

    const first = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    const forced = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis?force=true`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.notEqual(forced.body.data.analysis.id, first.body.data.analysis.id);
    assert.equal(countAnalysesForRecord(record.id), 2);
    assert.equal(calls, 2);
  });

  it('deduplicates concurrent default analysis requests for the same medical record', async () => {
    let calls = 0;
    let releaseProvider;
    const providerGate = new Promise((resolve) => {
      releaseProvider = resolve;
    });
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      await providerGate;
      return validAnalysis();
    });
    const record = await createRecord();

    const requestA = request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`);
    const requestB = request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`);

    releaseProvider();
    const [responseA, responseB] = await Promise.all([requestA, requestB]);

    assert.equal(responseA.status, 201);
    assert.equal(responseB.status, 200);
    assert.equal(responseA.body.data.analysis.id, responseB.body.data.analysis.id);
    assert.equal(calls, 1);
    assert.equal(countAnalysesForRecord(record.id), 1);
  });

  it('lets an assigned doctor get the latest AI analysis', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    const response = await request(app)
      .get(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(response.body.data.analysis.id, created.body.data.analysis.id);
  });

  it('requires authentication for AI analysis endpoints', async () => {
    const record = await createRecord();

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .expect(401);
  });

  it('returns 404 when an authorized doctor requests a record with no AI analysis', async () => {
    const record = await createRecord();

    await request(app)
      .get(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404);
  });

  it('rejects unauthorized users and patients from the internal AI analysis endpoint', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();

    await request(app)
      .get(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${otherDoctorToken}`)
      .expect(403);

    assert.equal(otherDoctorId > 0, true);
  });

  it('lets an assigned doctor accept a pending AI analysis exactly once', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    const response = await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'ACCEPT', doctor_notes: 'Reviewed and accepted for clinician reference.' })
      .expect(200);

    assert.equal(response.body.data.analysis.status, 'ACCEPTED');
    assert.equal(response.body.data.analysis.reviewedBy, doctorId);
    assert.match(response.body.data.analysis.doctorNotes, /accepted/);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'EDIT', reviewed_analysis: validAnalysis(), doctor_notes: 'Invalid transition' })
      .expect(409);

    assert.deepEqual(
      JSON.parse(getStoredAnalysis(created.body.data.analysis.id).analysis_json),
      created.body.data.analysis.analysis,
    );
  });

  it('rejects unsupported review actions while keeping the analysis pending', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'APPROVE', doctor_notes: 'Invalid action' })
      .expect(400);

    assert.equal(getStoredAnalysis(created.body.data.analysis.id).status, 'PENDING_REVIEW');
  });

  it('requires reviewed_analysis for EDIT actions', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'EDIT', doctor_notes: 'Missing edited analysis object' })
      .expect(400);

    assert.equal(getStoredAnalysis(created.body.data.analysis.id).status, 'PENDING_REVIEW');
  });

  it('lets an assigned doctor edit a pending analysis while preserving the original AI output', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    const editedAnalysis = validAnalysis({
      summary: 'Doctor-edited synthetic summary for review.',
      suggested_questions: ['Doctor edited question.'],
    });

    const response = await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        action: 'EDIT',
        reviewed_analysis: editedAnalysis,
        doctor_notes: 'Corrected summary wording.',
      })
      .expect(200);

    assert.equal(response.body.data.analysis.status, 'EDITED');
    assert.equal(response.body.data.analysis.analysis.summary, validAnalysis().summary);
    assert.equal(response.body.data.analysis.reviewedAnalysis.summary, editedAnalysis.summary);
    assert.equal(response.body.data.analysis.reviewedBy, doctorId);
    assert.ok(response.body.data.analysis.reviewedAt);

    const stored = getStoredAnalysis(created.body.data.analysis.id);
    assert.equal(JSON.parse(stored.analysis_json).summary, validAnalysis().summary);
    assert.equal(JSON.parse(stored.reviewed_analysis_json).summary, editedAnalysis.summary);
  });

  it('rejects invalid edit payloads without modifying the stored analysis', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    const beforeRow = getStoredAnalysis(created.body.data.analysis.id);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        action: 'EDIT',
        reviewed_analysis: {
          summary: 'Invalid diagnosis payload',
          diagnosis: 'Must not be accepted',
        },
        doctor_notes: 'Invalid edit',
      })
      .expect(400);

    const afterRow = getStoredAnalysis(created.body.data.analysis.id);
    assert.equal(afterRow.status, beforeRow.status);
    assert.equal(afterRow.reviewed_analysis_json, beforeRow.reviewed_analysis_json);
    assert.equal(afterRow.doctor_notes, beforeRow.doctor_notes);
  });

  it('lets an assigned doctor reject a pending AI analysis', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    const response = await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'REJECT', doctor_notes: 'Insufficient source support.' })
      .expect(200);

    assert.equal(response.body.data.analysis.status, 'REJECTED');

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'ACCEPT' })
      .expect(409);
  });

  it('reuses a final reviewed analysis unless force=true is requested', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis({ summary: `Synthetic analysis call ${calls}` });
    });
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'ACCEPT' })
      .expect(200);

    const reused = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(reused.body.data.analysis.id, created.body.data.analysis.id);
    assert.equal(calls, 1);
  });

  it('creates a new pending analysis with force=true after a final reviewed analysis', async () => {
    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis({ summary: `Synthetic forced final-state analysis ${calls}` });
    });
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'REJECT', doctor_notes: 'Not enough source support.' })
      .expect(200);

    const forced = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis?force=true`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.notEqual(forced.body.data.analysis.id, created.body.data.analysis.id);
    assert.equal(forced.body.data.analysis.status, 'PENDING_REVIEW');
    assert.equal(countAnalysesForRecord(record.id), 2);
    assert.equal(calls, 2);
  });

  it('writes audit logs for analysis creation and review without storing the analysis payload in metadata', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'ACCEPT', doctor_notes: 'Audit check.' })
      .expect(200);

    const logs = getDatabase()
      .prepare(`
        SELECT action, metadata_json
        FROM audit_logs
        WHERE entity_type = 'medical_record_analysis'
          AND entity_id = ?
        ORDER BY id ASC
      `)
      .all(created.body.data.analysis.id);

    assert.deepEqual(logs.map((log) => log.action), [
      'medical_record_analysis.created',
      'medical_record_analysis.reviewed',
    ]);
    assert.equal(logs.some((log) => /Synthetic laboratory result|analysis_json/i.test(log.metadata_json)), false);
  });

  it('removes analysis rows when the owning medical record is deleted according to cascade integrity', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const record = await createRecord();
    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    assert.equal(countAnalysesForRecord(record.id), 1);

    await request(app)
      .delete(`/records/${record.id}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(countAnalysesForRecord(record.id), 0);
  });

  it('returns controlled errors for missing records, missing text, and provider failures without corrupting data', async () => {
    await request(app)
      .post('/api/medical-records/999999/ai-analysis')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404);

    let calls = 0;
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis();
    });
    const emptyRecord = await createRecord({ notes: '   ' });
    await request(app)
      .post(`/api/medical-records/${emptyRecord.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(400);
    assert.equal(calls, 0);
    assert.equal(countAnalysesForRecord(emptyRecord.id), 0);

    const providerFailureRecord = await createRecord();
    setMedicalRecordAnalysisProviderForTests(async () => {
      throw new Error('synthetic provider outage');
    });
    await request(app)
      .post(`/api/medical-records/${providerFailureRecord.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(502);
    assert.equal(countAnalysesForRecord(providerFailureRecord.id), 0);
  });
});
