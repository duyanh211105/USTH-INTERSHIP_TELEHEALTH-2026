import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

const sourcedFindingSchema = z.object({
  finding: nonEmptyString,
  source_text: nonEmptyString,
}).strict();

const abnormalValueSchema = z.object({
  test: nonEmptyString,
  value: nonEmptyString,
  reference_range: z.string().trim().min(1).nullable(),
  source_text: nonEmptyString,
}).strict();

const possibleConditionSchema = z.object({
  condition: nonEmptyString,
  reasoning: nonEmptyString,
  source_text: z.string().trim().min(1).nullable(),
}).strict();

export const medicalRecordAnalysisSchema = z.object({
  summary: nonEmptyString,
  medical_history: z.array(nonEmptyString),
  medications: z.array(nonEmptyString),
  allergies: z.array(nonEmptyString),
  key_findings: z.array(sourcedFindingSchema),
  abnormal_values: z.array(abnormalValueSchema),
  red_flags: z.array(sourcedFindingSchema),
  possible_conditions: z.array(possibleConditionSchema),
  suggested_questions: z.array(nonEmptyString),
  suggested_follow_up: z.array(nonEmptyString),
  missing_information: z.array(nonEmptyString),
}).strict();

export class MedicalRecordAnalysisValidationError extends Error {
  constructor(error) {
    super('Invalid medical record analysis schema');
    this.name = 'MedicalRecordAnalysisValidationError';
    this.issues = error?.issues || [];
  }
}

export function validateMedicalRecordAnalysis(value) {
  const result = medicalRecordAnalysisSchema.safeParse(value);

  if (!result.success) {
    throw new MedicalRecordAnalysisValidationError(result.error);
  }

  return result.data;
}
