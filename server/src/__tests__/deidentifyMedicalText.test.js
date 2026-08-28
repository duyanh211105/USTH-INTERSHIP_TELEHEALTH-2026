import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deidentifyMedicalText } from '../services/medicalAnalysis/deidentifyMedicalText.js';

function assertDetected(result, type) {
  assert.equal(result.detectedTypes.includes(type), true);
}

describe('medical text de-identification', () => {
  it('masks obvious labeled Vietnamese patient name, phone, email, and ID number', () => {
    const result = deidentifyMedicalText(`Patient: Nguyen Van A
Phone: 0912345678
Email: test@example.com
ID: 012345678901`);

    assert.match(result.text, /Patient: \[PATIENT_NAME\]/);
    assert.match(result.text, /Phone: \[PHONE\]/);
    assert.match(result.text, /Email: \[EMAIL\]/);
    assert.match(result.text, /ID: \[ID_NUMBER\]/);
    assertDetected(result, 'patient_name');
    assertDetected(result, 'phone');
    assertDetected(result, 'email');
    assertDetected(result, 'id_number');
    assert.equal(result.maskedCount, 4);
  });

  it('masks English patient names when they appear after explicit labels', () => {
    const result = deidentifyMedicalText('Patient Name: John Michael Smith\nSymptoms: cough and fever');

    assert.match(result.text, /Patient Name: \[PATIENT_NAME\]/);
    assert.match(result.text, /Symptoms: cough and fever/);
    assertDetected(result, 'patient_name');
  });

  it('masks Vietnamese name labels while keeping clinical content', () => {
    const result = deidentifyMedicalText('Ho ten: Tran Thi B\nAge: 42\nGender: Female\nMedication: Metformin 500mg');

    assert.match(result.text, /Ho ten: \[PATIENT_NAME\]/);
    assert.match(result.text, /Age: 42/);
    assert.match(result.text, /Gender: Female/);
    assert.match(result.text, /Metformin 500mg/);
  });

  it('masks common phone number formats', () => {
    const result = deidentifyMedicalText('Contact phone: +84 912 345 678 or 0912-345-679');

    assert.equal((result.text.match(/\[PHONE\]/g) || []).length, 2);
    assertDetected(result, 'phone');
  });

  it('masks email addresses without logging or returning the original address', () => {
    const result = deidentifyMedicalText('Send report to clinician.test@example.org after review.');

    assert.match(result.text, /\[EMAIL\]/);
    assert.equal(result.text.includes('clinician.test@example.org'), false);
    assertDetected(result, 'email');
  });

  it('masks ID-like numbers only when they are presented as identification fields', () => {
    const result = deidentifyMedicalText('Citizen ID: 012345678901\nGlucose: 120 mg/dL\nBlood pressure: 120/80 mmHg');

    assert.match(result.text, /Citizen ID: \[ID_NUMBER\]/);
    assert.match(result.text, /Glucose: 120 mg\/dL/);
    assert.match(result.text, /Blood pressure: 120\/80 mmHg/);
    assertDetected(result, 'id_number');
  });

  it('masks reasonably detectable address lines', () => {
    const result = deidentifyMedicalText('Address: 123 Nguyen Trai Street, District 1, Ho Chi Minh City\nAllergy: Penicillin');

    assert.match(result.text, /Address: \[ADDRESS\]/);
    assert.match(result.text, /Allergy: Penicillin/);
    assertDetected(result, 'address');
  });

  it('leaves text without PII unchanged', () => {
    const source = 'Symptoms: headache for 2 days. Medication: Paracetamol 500mg. HbA1c: 6.5%.';
    const result = deidentifyMedicalText(source);

    assert.equal(result.text, source);
    assert.deepEqual(result.detectedTypes, []);
    assert.equal(result.maskedCount, 0);
  });

  it('keeps clinically relevant dates, age, gender, laboratory values, and medications', () => {
    const source = 'Date of test: 11/06/2026. Age: 58. Gender: Male. WBC: 11.2 x10^9/L. Paracetamol 500mg.';
    const result = deidentifyMedicalText(source);

    assert.equal(result.text, source);
    assert.equal(result.maskedCount, 0);
  });
});
