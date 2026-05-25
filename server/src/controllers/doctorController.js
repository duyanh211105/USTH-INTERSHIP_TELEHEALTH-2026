import { listDoctors } from '../services/doctorService.js';
import { sendSuccess } from '../services/responseService.js';
import {
  addDoctorUnavailability,
  deleteDoctorUnavailability,
  generateSlots,
  listAvailabilityForDoctor,
  listUnavailabilityForDoctor,
  saveDoctorAvailability,
} from '../services/scheduleService.js';

export async function getDoctors(req, res) {
  return sendSuccess(res, { doctors: await listDoctors(req.query) });
}

export async function getDoctorSlots(req, res) {
  return sendSuccess(res, { slots: await generateSlots(req.query.date, Number(req.params.id)) });
}

export async function getMyAvailability(req, res) {
  return sendSuccess(res, { availability: await listAvailabilityForDoctor(req.user.id) });
}

export async function putMyAvailability(req, res) {
  return sendSuccess(res, { availability: await saveDoctorAvailability(req.user, req.body.availability) });
}

export async function getMyUnavailability(req, res) {
  return sendSuccess(res, { unavailability: await listUnavailabilityForDoctor(req.user.id) });
}

export async function postMyUnavailability(req, res) {
  return sendSuccess(res, { unavailability: await addDoctorUnavailability(req.user, req.body) }, 201);
}

export async function deleteMyUnavailability(req, res) {
  await deleteDoctorUnavailability(req.user, req.params.id);
  return sendSuccess(res, { deleted: true });
}
