import { addDocumentToRecord, createRecord, deleteRecord, listRecordsForUser } from '../services/recordService.js';
import { createAuditLog } from '../services/auditService.js';
import { sendSuccess } from '../services/responseService.js';

export async function getRecords(req, res) {
  return sendSuccess(res, { records: await listRecordsForUser(req.user) });
}

export async function postRecord(req, res) {
  return sendSuccess(res, { record: await createRecord(req.user, req.body) }, 201);
}

export async function uploadRecordDocument(req, res) {
  const document = await addDocumentToRecord(req.record.id, req.file);
  await createAuditLog({
    actor: req.user,
    action: 'medical_record.uploaded',
    entityType: 'medical_document',
    entityId: document.id,
    metadata: {
      recordId: req.record.id,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      storageProvider: document.storageProvider,
    },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { document }, 201);
}

export async function deleteMedicalRecord(req, res) {
  const result = await deleteRecord(req.user, req.params.id);
  await createAuditLog({
    actor: req.user,
    action: 'medical_record.deleted',
    entityType: 'medical_record',
    entityId: Number(req.params.id),
    metadata: { warnings: result.warnings },
    ipAddress: req.ip,
  });
  return sendSuccess(res, result);
}
