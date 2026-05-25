import { getDatabase } from '../db/connection.js';

const sensitiveKeyPattern = /password|password_hash|token|authorization/i;

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKeyPattern.test(key))
      .map(([key, item]) => [key, item && typeof item === 'object' ? sanitizeMetadata(item) : item]),
  );
}

function parseMetadata(value) {
  if (value && typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function mapAuditLog(row) {
  return {
    id: Number(row.id),
    actorUserId: row.actor_user_id === null || row.actor_user_id === undefined ? null : Number(row.actor_user_id),
    actorName: row.actor_name || 'System',
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id === null || row.entity_id === undefined ? null : Number(row.entity_id),
    metadata: parseMetadata(row.metadata_json),
    ipAddress: row.ip_address,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function createAuditLog({ actor = null, action, entityType, entityId = null, metadata = {}, ipAddress = null }) {
  if (!action || !entityType) {
    return null;
  }

  try {
    const result = await getDatabase()
      .prepare(`
        INSERT INTO audit_logs (
          actor_user_id, actor_role, action, entity_type, entity_id, metadata_json, ip_address
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        actor?.id || null,
        actor?.role || 'anonymous',
        action,
        entityType,
        entityId === undefined ? null : entityId,
        JSON.stringify(sanitizeMetadata(metadata)),
        ipAddress,
      );

    return Number(result.lastInsertRowid);
  } catch (error) {
    console.error('Unable to write audit log:', error);
    return null;
  }
}

export async function listAuditLogs(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
  const offset = (page - 1) * limit;
  const filters = [];
  const params = [];

  if (query.action) {
    filters.push('audit_logs.action = ?');
    params.push(String(query.action));
  }

  if (query.actorRole) {
    filters.push('audit_logs.actor_role = ?');
    params.push(String(query.actorRole));
  }

  if (query.startDate) {
    filters.push('date(audit_logs.created_at) >= date(?)');
    params.push(String(query.startDate));
  }

  if (query.endDate) {
    filters.push('date(audit_logs.created_at) <= date(?)');
    params.push(String(query.endDate));
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const db = getDatabase();
  const total = Number((await db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${where}`).get(...params)).count);
  const rows = (await db
    .prepare(`
      SELECT audit_logs.*, users.name AS actor_name
      FROM audit_logs
      LEFT JOIN users ON users.id = audit_logs.actor_user_id
      ${where}
      ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset)).map(mapAuditLog);

  return {
    logs: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}
