import crypto from 'crypto';
import { db } from '../db/database';

export interface AuditLogEntry {
  actorUserId?: string | null;
  action: string;
  targetUserId?: string | null;
  details?: Record<string, any>;
  ipAddress?: string | null;
}

export function logAuditEvent(entry: AuditLogEntry): void {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Strip any accidental sensitive data
  let safeDetails: string | null = null;
  if (entry.details) {
    const sanitized = { ...entry.details };
    delete sanitized.password;
    delete sanitized.password_hash;
    delete sanitized.otp;
    delete sanitized.otp_hash;
    delete sanitized.token;
    delete sanitized.secret;
    safeDetails = JSON.stringify(sanitized);
  }

  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.actorUserId || null,
    entry.action,
    entry.targetUserId || null,
    safeDetails,
    entry.ipAddress || null,
    now
  );
}

export function getAuditLogs(limit = 100, offset = 0) {
  return db.prepare(`
    SELECT a.*, 
      u1.email as actor_email, 
      u2.email as target_email
    FROM audit_logs a
    LEFT JOIN users u1 ON a.actor_user_id = u1.id
    LEFT JOIN users u2 ON a.target_user_id = u2.id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}
