import { loginUser, registerPatient } from '../services/authService.js';
import { createAuditLog } from '../services/auditService.js';
import { sendSuccess } from '../services/responseService.js';

export async function login(req, res) {
  const { phone, password } = req.body;
  try {
    const result = await loginUser(phone, password);
    await createAuditLog({
      actor: result.user,
      action: 'auth.login.success',
      entityType: 'user',
      entityId: result.user.id,
      metadata: { phone },
      ipAddress: req.ip,
    });
    return sendSuccess(res, result);
  } catch (error) {
    await createAuditLog({
      action: 'auth.login.failure',
      entityType: 'user',
      metadata: { phone, reason: error.message },
      ipAddress: req.ip,
    });
    throw error;
  }
}

export async function register(req, res) {
  const result = await registerPatient(req.body);
  await createAuditLog({
    actor: result.user,
    action: 'patient.registered',
    entityType: 'user',
    entityId: result.user.id,
    metadata: { email: result.user.email },
    ipAddress: req.ip,
  });
  return sendSuccess(res, result, 201);
}

export async function me(req, res) {
  return sendSuccess(res, { user: req.user });
}
