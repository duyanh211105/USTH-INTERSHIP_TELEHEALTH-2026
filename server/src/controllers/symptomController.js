import { createSymptomSummary, listSymptomsForPatient } from '../services/symptomService.js';
import { sendSuccess } from '../services/responseService.js';

export async function postSymptom(req, res) {
  return sendSuccess(res, { symptom: await createSymptomSummary(req.user, req.body) }, 201);
}

export async function getSymptomsForPatient(req, res) {
  return sendSuccess(res, { symptoms: await listSymptomsForPatient(req.params.patientId) });
}
