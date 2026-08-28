import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  medicalRecordAnalysisSchema,
  validateMedicalRecordAnalysis,
} from '../services/medicalAnalysis/medicalRecordAnalysisSchema.js';

function validAnalysis(overrides = {}) {
  return {
    summary: 'Document contains synthetic clinical information for future review.',
    medical_history: ['Hypertension history noted in previous record'],
    medications: ['Synthetic medication 500mg daily'],
    allergies: ['No known drug allergies'],
    key_findings: [
      {
        finding: 'Blood pressure value is mentioned',
        source_text: 'Blood pressure: 120/80 mmHg',
      },
    ],
    abnormal_values: [
      {
        test: 'Glucose',
        value: '140 mg/dL',
        reference_range: '70-99 mg/dL',
        source_text: 'Glucose 140 mg/dL reference 70-99 mg/dL',
      },
      {
        test: 'White blood cell count',
        value: '11.2 x10^9/L',
        reference_range: null,
        source_text: 'WBC 11.2 x10^9/L',
      },
    ],
    red_flags: [
      {
        finding: 'Severe chest pain is mentioned',
        source_text: 'Patient reported severe chest pain',
      },
    ],
    possible_conditions: [
      {
        condition: 'Possible dehydration',
        reasoning: 'Synthetic record mentions reduced fluid intake and fatigue.',
        source_text: 'Reduced fluid intake with fatigue',
      },
    ],
    suggested_questions: ['How long has the symptom been present?'],
    suggested_follow_up: ['Review the uploaded laboratory result during consultation.'],
    missing_information: ['Recent medication history is incomplete.'],
    ...overrides,
  };
}

describe('medical record AI analysis schema', () => {
  it('accepts a valid AI-assisted analysis object', () => {
    const result = validateMedicalRecordAnalysis(validAnalysis());

    assert.equal(result.summary.includes('synthetic clinical information'), true);
    assert.equal(result.key_findings[0].source_text, 'Blood pressure: 120/80 mmHg');
  });

  it('rejects an object with a missing required field', () => {
    const analysis = validAnalysis();
    delete analysis.summary;

    assert.throws(
      () => validateMedicalRecordAnalysis(analysis),
      /medical record analysis/i,
    );
  });

  it('rejects invalid field types', () => {
    assert.throws(
      () => validateMedicalRecordAnalysis(validAnalysis({ medications: 'Synthetic medication' })),
      /medical record analysis/i,
    );
  });

  it('rejects possible conditions represented as a diagnosis', () => {
    assert.throws(
      () => validateMedicalRecordAnalysis(validAnalysis({
        possible_conditions: [
          {
            diagnosis: 'Confirmed diagnosis should not be accepted',
            reasoning: 'This incorrectly represents a suggestion as a diagnosis.',
            source_text: null,
          },
        ],
      })),
      /medical record analysis/i,
    );
  });

  it('requires key findings to retain source text provenance', () => {
    const result = medicalRecordAnalysisSchema.parse(validAnalysis({
      key_findings: [
        {
          finding: 'Synthetic finding',
          source_text: 'Original extracted phrase',
        },
      ],
    }));

    assert.equal(result.key_findings[0].source_text, 'Original extracted phrase');
  });

  it('accepts abnormal values with nullable reference ranges and source text', () => {
    const result = validateMedicalRecordAnalysis(validAnalysis({
      abnormal_values: [
        {
          test: 'Hemoglobin',
          value: '12.0 g/dL',
          reference_range: null,
          source_text: 'Hemoglobin 12.0 g/dL',
        },
      ],
    }));

    assert.equal(result.abnormal_values[0].reference_range, null);
  });

  it('rejects top-level diagnosis fields because analysis is not a final diagnosis', () => {
    assert.throws(
      () => validateMedicalRecordAnalysis({
        ...validAnalysis(),
        diagnosis: 'Confirmed diagnosis should not be stored here',
      }),
      /medical record analysis/i,
    );
  });
});
