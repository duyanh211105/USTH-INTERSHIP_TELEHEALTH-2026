import { createConsultation, listConsultationsForUser } from '../services/consultationService.js';
import { createAuditLog } from '../services/auditService.js';
import { sendSuccess } from '../services/responseService.js';

export async function getConsultations(req, res) {
  return sendSuccess(res, { consultations: await listConsultationsForUser(req.user) });
}

export async function postConsultation(req, res) {
  const consultation = await createConsultation(req.user, req.body);
  await createAuditLog({
    actor: req.user,
    action: 'consultation_note.created',
    entityType: 'consultation_note',
    entityId: consultation.id,
    metadata: { appointmentId: consultation.appointmentId, patientId: consultation.patientId },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { consultation }, 201);
}
