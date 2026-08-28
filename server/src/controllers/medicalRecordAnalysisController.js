import { createAuditLog } from '../services/auditService.js';
import {
  getMedicalRecordAnalysis,
  requestMedicalRecordAnalysis,
  reviewMedicalRecordAnalysis,
} from '../services/medicalAnalysis/medicalRecordAnalysisService.js';
import { sendSuccess } from '../services/responseService.js';

export async function postMedicalRecordAnalysis(req, res) {
  const { analysis, created } = await requestMedicalRecordAnalysis(req.user, req.params.id, {
    force: req.query.force === 'true',
  });

  await createAuditLog({
    actor: req.user,
    action: created ? 'medical_record_analysis.created' : 'medical_record_analysis.reused',
    entityType: 'medical_record_analysis',
    entityId: analysis.id,
    metadata: {
      recordId: analysis.recordId,
      status: analysis.status,
      force: req.query.force === 'true',
    },
    ipAddress: req.ip,
  });

  return sendSuccess(res, { analysis }, created ? 201 : 200);
}

export async function getMedicalRecordAnalysisByRecord(req, res) {
  return sendSuccess(res, {
    analysis: await getMedicalRecordAnalysis(req.user, req.params.id),
  });
}

export async function patchMedicalRecordAnalysisReview(req, res) {
  const analysis = await reviewMedicalRecordAnalysis(req.user, req.params.id, req.body);

  await createAuditLog({
    actor: req.user,
    action: 'medical_record_analysis.reviewed',
    entityType: 'medical_record_analysis',
    entityId: analysis.id,
    metadata: {
      recordId: analysis.recordId,
      status: analysis.status,
      action: req.body.action,
    },
    ipAddress: req.ip,
  });

  return sendSuccess(res, { analysis });
}
