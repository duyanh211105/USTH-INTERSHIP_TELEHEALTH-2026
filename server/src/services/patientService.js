import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { findUserById } from './userService.js';

async function doctorHasPatientAccess(doctorId, patientId) {
  return Boolean(
    await getDatabase()
      .prepare(`
        SELECT id
        FROM appointments
        WHERE doctor_id = ?
          AND patient_id = ?
          AND status <> 'CANCELLED'
        LIMIT 1
      `)
      .get(doctorId, patientId),
  );
}

export async function getPatientForUser(user, patientId) {
  const patient = await findUserById(patientId);

  if (!patient || patient.role !== 'patient') {
    throw new ApiError(404, 'Patient not found');
  }

  if (user.role === 'admin' || user.id === patient.id) {
    return patient;
  }

  if (user.role === 'doctor' && await doctorHasPatientAccess(user.id, patient.id)) {
    return patient;
  }

  throw new ApiError(403, 'Forbidden');
}
