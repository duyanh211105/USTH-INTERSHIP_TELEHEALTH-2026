import { getDatabase } from '../db/connection.js';
import { getAppointmentById } from '../services/appointmentService.js';
import { getRecordById } from '../services/recordService.js';
import { ApiError } from './errors.js';

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

export function requirePatientParamAccess(paramName = 'patientId') {
  return async (req, res, next) => {
    const patientId = Number(req.params[paramName]);

    if (
      req.user.role === 'admin' ||
      req.user.id === patientId ||
      (req.user.role === 'doctor' && await doctorHasPatientAccess(req.user.id, patientId))
    ) {
      return next();
    }

    return next(new ApiError(403, 'Forbidden'));
  };
}

export async function requireRecordAccess(req, res, next) {
  const record = await getRecordById(req.params.id);

  if (!record) {
    return next(new ApiError(404, 'Record not found'));
  }

  if (req.user.role === 'admin' || req.user.id === record.patientId) {
    req.record = record;
    return next();
  }

  return next(new ApiError(403, 'Forbidden'));
}

export async function requireAppointmentAccess(req, res, next) {
  const appointment = await getAppointmentById(req.params.id || req.body.appointmentId);

  if (!appointment) {
    return next(new ApiError(404, 'Appointment not found'));
  }

  if (
    req.user.role === 'admin' ||
    req.user.id === appointment.patientId ||
    req.user.id === appointment.doctorId
  ) {
    req.appointment = appointment;
    return next();
  }

  return next(new ApiError(403, 'Forbidden'));
}
