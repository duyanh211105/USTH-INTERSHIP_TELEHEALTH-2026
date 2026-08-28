import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telehealth-phase2e-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DB_FILE = path.join(testDir, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(testDir, 'uploads');
process.env.JWT_SECRET = 'test-secret';
delete process.env.DATABASE_URL;
delete process.env.OPENROUTER_API_KEY;

const { default: app } = await import('../app.js');
const { closeDatabase, getDatabase } = await import('../db/connection.js');
const { initializeDatabase } = await import('../db/schema.js');
const { seedDatabase } = await import('../db/seed.js');
const { extractText } = await import('../services/documentProcessing/documentTextExtractor.js');
const {
  analyzeMedicalRecord,
  buildMedicalAnalysisPrompts,
} = await import('../services/medicalAnalysis/aiMedicalAnalysisService.js');
const {
  resetMedicalRecordAnalysisProviderForTests,
  setMedicalRecordAnalysisProviderForTests,
} = await import('../services/medicalAnalysis/medicalRecordAnalysisService.js');
const { validateMedicalRecordAnalysis } = await import('../services/medicalAnalysis/medicalRecordAnalysisSchema.js');
const { normalizeLocalAppointmentDateTime } = await import('../utils/appointmentDateTime.js');

function validAnalysis(overrides = {}) {
  return {
    summary: 'Synthetic record contains laboratory information for doctor review.',
    medical_history: ['Synthetic diabetes history mentioned in document'],
    medications: ['Metformin 500mg twice daily'],
    allergies: ['No known drug allergy'],
    key_findings: [
      {
        finding: 'Elevated fasting glucose is listed',
        source_text: 'fasting glucose: 128 mg/dL',
      },
    ],
    abnormal_values: [
      {
        test: 'Fasting glucose',
        value: '128 mg/dL',
        reference_range: '70-99 mg/dL',
        source_text: 'fasting glucose: 128 mg/dL reference 70-99 mg/dL',
      },
    ],
    red_flags: [],
    possible_conditions: [
      {
        condition: 'Possible hyperglycemia',
        reasoning: 'The synthetic document lists fasting glucose above the reference range.',
        source_text: 'fasting glucose: 128 mg/dL',
      },
    ],
    suggested_questions: ['Was the glucose test fasting?'],
    suggested_follow_up: ['Review the laboratory record during consultation.'],
    missing_information: ['HbA1c value is not included.'],
    ...overrides,
  };
}

function openRouterJsonResponse(value) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(value),
          },
        },
      ],
    }),
  };
}

function createMockOpenRouterFetch(handler) {
  const requests = [];

  return {
    requests,
    fetch: async (url, options = {}) => {
      const request = {
        url,
        options,
        body: JSON.parse(options.body),
      };
      requests.push(request);
      return handler(request, requests.length);
    },
  };
}

const fakeOpenRouterEnv = {
  OPENROUTER_API_KEY: 'test-openrouter-key',
  OPENROUTER_MODEL: 'stealth/ox-alpha',
};

async function login(phone, password = 'password123') {
  const response = await request(app)
    .post('/auth/login')
    .send({ phone, password })
    .expect(200);

  return response.body.data.token;
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

function collectSourceTexts(analysis) {
  return [
    ...(analysis.key_findings || []).map((item) => item.source_text),
    ...(analysis.abnormal_values || []).map((item) => item.source_text),
    ...(analysis.red_flags || []).map((item) => item.source_text),
    ...(analysis.possible_conditions || []).map((item) => item.source_text).filter(Boolean),
  ];
}

function unsupportedSourceTexts(analysis, documentText) {
  const haystack = String(documentText || '').toLowerCase();
  return collectSourceTexts(analysis)
    .filter(Boolean)
    .filter((sourceText) => !haystack.includes(String(sourceText).toLowerCase()));
}

describe('Phase 2E verification and AI safety audit', () => {
  let patientToken;
  let doctorToken;
  let otherDoctorToken;
  let patientId;
  let doctorId;

  function insertAssignedAppointment({ patient = patientId, doctor = doctorId, status = 'CONFIRMED' } = {}) {
    const appointmentDateTime = normalizeLocalAppointmentDateTime('2026-06-11', '09:30').utcDateTime;
    const result = getDatabase()
      .prepare(`
        INSERT INTO appointments (
          patient_id, doctor_id, scheduled_date, scheduled_time, appointment_datetime, reason, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(patient, doctor, '2026-06-11', '09:30', appointmentDateTime, 'Synthetic Phase 2E appointment', status);

    return Number(result.lastInsertRowid);
  }

  async function createRecordFromText(notes) {
    const appointmentId = insertAssignedAppointment();
    const response = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        title: 'Synthetic Phase 2E Laboratory Report',
        category: 'Laboratory',
        appointmentId,
        notes,
      })
      .expect(201);

    return {
      appointmentId,
      record: response.body.data.record,
    };
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
        .run('Unassigned Phase 2E Doctor', 'phase2e-unassigned@example.com', passwordHash, '0900088888').lastInsertRowid,
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

    return login('0900088888');
  }

  before(async () => {
    await initializeDatabase();
    await seedDatabase();
    patientToken = await login('0900000001');
    doctorToken = await login('0900000002');

    patientId = Number(getDatabase().prepare("SELECT id FROM users WHERE phone = '0900000001'").get().id);
    doctorId = Number(getDatabase().prepare("SELECT id FROM users WHERE phone = '0900000002'").get().id);
    otherDoctorToken = await createOtherDoctor();
  });

  beforeEach(() => {
    resetMedicalRecordAnalysisProviderForTests();
  });

  after(async () => {
    resetMedicalRecordAnalysisProviderForTests();
    await closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('verifies the synthetic Phase 1 to Phase 2C pipeline with de-identification before the mocked AI provider', async () => {
    const extraction = await extractText({
      path: path.join(testDir, 'synthetic-scan.pdf'),
      originalname: 'synthetic-scan.pdf',
      mimetype: 'application/pdf',
    }, {
      extractPdfText: async () => ({
        text: ' ',
        pageCount: 2,
        meaningfulCharacterCount: 0,
      }),
      renderPdfPagesToImageBuffers: async () => ({
        pageCount: 2,
        pages: [
          { pageNumber: 2, buffer: Buffer.from('page-two') },
          { pageNumber: 1, buffer: Buffer.from('page-one') },
        ],
      }),
      preprocessImage: async (buffer) => Buffer.from(`processed-${buffer.toString()}`),
      recognizeImageText: async (buffer) => ({
        text: buffer.toString().includes('page-one')
          ? 'Patient: Nguyen Van A Phone: 0912345678 Email: test@example.com fasting glucose: 128 mg/dL reference 70-99 mg/dL.'
          : 'Medication: Metformin 500mg twice daily. Allergy: No known drug allergy. HbA1c value is not included.',
      }),
    });
    assert.equal(extraction.extractionMethod, 'tesseract_ocr');
    assert.equal(extraction.ocrUsed, true);
    assert.ok(extraction.text.indexOf('Nguyen Van A') < extraction.text.indexOf('Metformin 500mg'));

    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));
    setMedicalRecordAnalysisProviderForTests((text, options = {}) => analyzeMedicalRecord(text, {
      ...options,
      env: fakeOpenRouterEnv,
      fetch: mock.fetch,
      maxRetries: 0,
      sleep: async () => {},
    }));
    const { appointmentId, record } = await createRecordFromText(extraction.text);

    const created = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.equal(created.body.data.analysis.status, 'PENDING_REVIEW');
    assert.equal(created.body.data.analysis.analysis.summary, validAnalysis().summary);
    assert.equal(countAnalysesForRecord(record.id), 1);
    assert.equal(mock.requests.length, 1);

    const providerUserMessage = mock.requests[0].body.messages.find((message) => message.role === 'user').content;
    assert.equal(providerUserMessage.includes('Nguyen Van A'), false);
    assert.equal(providerUserMessage.includes('0912345678'), false);
    assert.equal(providerUserMessage.includes('test@example.com'), false);
    assert.match(providerUserMessage, /\[PATIENT_NAME\]/);
    assert.match(providerUserMessage, /\[PHONE\]/);
    assert.match(providerUserMessage, /\[EMAIL\]/);
    assert.match(providerUserMessage, /fasting glucose: 128 mg\/dL/i);

    const edited = validAnalysis({
      summary: 'Doctor-reviewed synthetic Phase 2E analysis.',
      suggested_questions: ['Doctor-reviewed question.'],
    });
    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        action: 'EDIT',
        reviewed_analysis: edited,
        doctor_notes: 'Synthetic Phase 2E doctor review.',
      })
      .expect(200);

    const stored = getStoredAnalysis(created.body.data.analysis.id);
    assert.equal(JSON.parse(stored.analysis_json).summary, validAnalysis().summary);
    assert.equal(JSON.parse(stored.reviewed_analysis_json).summary, edited.summary);
    assert.equal(stored.reviewed_by, doctorId);
    assert.equal(
      getDatabase().prepare('SELECT COUNT(*) AS count FROM consultation_notes WHERE appointment_id = ?').get(appointmentId).count,
      0,
    );
  });

  it('verifies RBAC boundaries and final-state transition protection for internal AI analysis', async () => {
    setMedicalRecordAnalysisProviderForTests(async () => validAnalysis());
    const { record } = await createRecordFromText('Synthetic text with fasting glucose: 128 mg/dL reference 70-99 mg/dL.');

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .expect(401);
    await request(app)
      .get(`/api/medical-records/${record.id}/ai-analysis`)
      .expect(401);
    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .send({ action: 'ACCEPT' })
      .expect(401);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${otherDoctorToken}`)
      .expect(403);

    await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'ACCEPT', doctor_notes: 'Accepted as decision-support reference.' })
      .expect(200);

    await request(app)
      .patch(`/api/medical-records/${record.id}/ai-analysis/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ action: 'REJECT', doctor_notes: 'Invalid final-state transition.' })
      .expect(409);

    await request(app)
      .get(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);
  });

  it('verifies idempotency, force re-analysis, and concurrent duplicate protection', async () => {
    let calls = 0;
    let releaseProvider;
    let markProviderStarted;
    const providerGate = new Promise((resolve) => {
      releaseProvider = resolve;
    });
    const providerStarted = new Promise((resolve) => {
      markProviderStarted = resolve;
    });
    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      markProviderStarted();
      await providerGate;
      return validAnalysis({ summary: `Synthetic concurrent analysis call ${calls}` });
    });
    const { record } = await createRecordFromText('Synthetic concurrent text with fasting glucose: 128 mg/dL reference 70-99 mg/dL.');

    const requestA = request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`);
    const requestB = request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`);

    const concurrentResponses = Promise.all([requestA, requestB]);
    await providerStarted;
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    assert.equal(calls, 1);
    assert.equal(countAnalysesForRecord(record.id), 0);
    releaseProvider();
    const [responseA, responseB] = await concurrentResponses;

    assert.equal(responseA.status, 201);
    assert.equal(responseB.status, 200);
    assert.equal(responseA.body.data.analysis.id, responseB.body.data.analysis.id);
    assert.equal(calls, 1);
    assert.equal(countAnalysesForRecord(record.id), 1);

    const reused = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    assert.equal(reused.body.data.analysis.id, responseA.body.data.analysis.id);
    assert.equal(calls, 1);

    setMedicalRecordAnalysisProviderForTests(async () => {
      calls += 1;
      return validAnalysis({ summary: `Synthetic forced analysis call ${calls}` });
    });
    const forced = await request(app)
      .post(`/api/medical-records/${record.id}/ai-analysis?force=true`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    assert.notEqual(forced.body.data.analysis.id, responseA.body.data.analysis.id);
    assert.equal(countAnalysesForRecord(record.id), 2);
  });

  it('verifies medical_record_analyses database integrity, indexes, and status constraints', async () => {
    const { record: constraintRecord } = await createRecordFromText(
      'Synthetic status constraint text with fasting glucose: 128 mg/dL reference 70-99 mg/dL.',
    );
    const tableInfo = getDatabase().prepare('PRAGMA table_info(medical_record_analyses)').all();
    const columns = tableInfo.map((column) => column.name);
    assert.deepEqual(columns, [
      'id',
      'record_id',
      'status',
      'ai_model',
      'prompt_version',
      'analysis_json',
      'reviewed_analysis_json',
      'doctor_notes',
      'reviewed_by',
      'reviewed_at',
      'created_at',
      'updated_at',
    ]);

    const foreignKeys = getDatabase().prepare('PRAGMA foreign_key_list(medical_record_analyses)').all();
    assert.equal(foreignKeys.some((key) => key.table === 'medical_records' && key.from === 'record_id'), true);
    assert.equal(foreignKeys.some((key) => key.table === 'users' && key.from === 'reviewed_by'), true);

    const indexNames = getDatabase()
      .prepare('PRAGMA index_list(medical_record_analyses)')
      .all()
      .map((index) => index.name);
    assert.equal(indexNames.includes('idx_medical_record_analyses_record_status'), true);
    assert.equal(indexNames.includes('idx_medical_record_analyses_record_created'), true);
    assert.equal(indexNames.includes('idx_medical_record_analyses_reviewed_by'), true);

    assert.throws(() => {
      getDatabase()
        .prepare(`
          INSERT INTO medical_record_analyses (record_id, status, ai_model, prompt_version, analysis_json)
          VALUES (?, 'INVALID_STATUS', 'synthetic-model', 'v1.0', ?)
        `)
        .run(constraintRecord.id, JSON.stringify(validAnalysis()));
    }, /constraint failed/i);
  });

  it('verifies AI safety prompts, schema rejection of diagnosis fields, and synthetic hallucination-source detection', () => {
    const prompts = buildMedicalAnalysisPrompts('fasting glucose: 128 mg/dL reference 70-99 mg/dL');
    assert.match(prompts.systemPrompt, /Do NOT provide a definitive diagnosis/i);
    assert.match(prompts.systemPrompt, /Do NOT fabricate source_text/i);
    assert.match(prompts.userPrompt, /not a diagnosis/i);

    assert.throws(() => validateMedicalRecordAnalysis({
      ...validAnalysis(),
      diagnosis: 'This field must not be accepted as a schema field.',
    }));

    const documentText = [
      'fasting glucose: 128 mg/dL reference 70-99 mg/dL',
      'Medication: Metformin 500mg twice daily',
    ].join('\n');
    assert.deepEqual(unsupportedSourceTexts(validAnalysis(), documentText), []);

    const unsupportedAnalysis = validAnalysis({
      key_findings: [
        {
          finding: 'Unsupported synthetic claim',
          source_text: 'This phrase is not present in the document',
        },
      ],
    });
    assert.deepEqual(unsupportedSourceTexts(unsupportedAnalysis, documentText), [
      'This phrase is not present in the document',
    ]);
  });

  it('runs synthetic reliability observations without real OpenRouter calls', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));
    const syntheticDocuments = [
      'Short synthetic medical note with fasting glucose: 128 mg/dL reference 70-99 mg/dL.',
      'Medium synthetic medical note. '.repeat(200),
      ['Page 1 synthetic OCR text with fasting glucose: 128 mg/dL.', 'Page 2 synthetic medication: Metformin 500mg twice daily.'].join('\n'),
    ];

    const startedAt = performance.now();
    const analyses = [];
    for (const documentText of syntheticDocuments) {
      analyses.push(await analyzeMedicalRecord(documentText, {
        env: fakeOpenRouterEnv,
        fetch: mock.fetch,
        maxRetries: 0,
        sleep: async () => {},
      }));
    }
    const durationMs = performance.now() - startedAt;

    assert.equal(analyses.length, syntheticDocuments.length);
    assert.equal(mock.requests.length, syntheticDocuments.length);
    assert.equal(analyses.every((analysis) => analysis.summary === validAnalysis().summary), true);
    assert.equal(Number.isFinite(durationMs), true);
    assert.ok(durationMs < 5000);
  });
});
