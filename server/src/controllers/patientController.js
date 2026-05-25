import { getPatientForUser } from '../services/patientService.js';
import { sendSuccess } from '../services/responseService.js';

export async function getPatient(req, res) {
  return sendSuccess(res, { patient: await getPatientForUser(req.user, req.params.id) });
}
