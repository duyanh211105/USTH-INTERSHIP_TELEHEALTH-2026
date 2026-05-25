import { createAuditLog } from '../services/auditService.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || 500;

  if (status === 401 || status === 403) {
    createAuditLog({
      actor: req.user || null,
      action: 'access.denied',
      entityType: 'route',
      metadata: {
        method: req.method,
        path: req.originalUrl,
        status,
        reason: error.message,
      },
      ipAddress: req.ip,
    });
  }

  return res.status(status).json({
    success: false,
    error: { message: status === 500 ? 'Internal server error' : error.message },
  });
}
