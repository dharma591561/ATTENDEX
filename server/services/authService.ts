import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/database';

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || plainText.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}

export function createSession(userId: string, ipAddress?: string, userAgent?: string): string {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, expiresAt, now, ipAddress || null, userAgent || null);

  return sessionId;
}

export function invalidateSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function invalidateAllUserSessions(userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'FACULTY' | 'FOUNDER';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED';
  is_email_verified: number;
  created_at: string;
  student_profile?: {
    id: string;
    full_name: string;
    roll_number: string;
    branch: string;
    section: string;
    profile_photo_url: string | null;
    bio: string | null;
    phone: string | null;
  } | null;
  faculty_profile?: {
    id: string;
    full_name: string;
    department: string;
    designation: string;
    profile_photo_url: string | null;
    bio: string | null;
    phone: string | null;
  } | null;
  faculty_application?: {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    rejection_reason: string | null;
    reviewed_at: string | null;
  } | null;
}

export function getSessionUser(sessionId: string): AuthenticatedUser | null {
  if (!sessionId) return null;

  const session = db.prepare(`
    SELECT user_id, expires_at FROM sessions WHERE id = ?
  `).get(sessionId) as { user_id: string; expires_at: number } | undefined;

  if (!session) return null;

  if (Date.now() > session.expires_at) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  const user = db.prepare(`
    SELECT id, email, role, status, is_email_verified, created_at
    FROM users WHERE id = ?
  `).get(session.user_id) as AuthenticatedUser | undefined;

  if (!user) return null;

  if (user.role === 'STUDENT') {
    const student = db.prepare(`
      SELECT id, full_name, roll_number, branch, section, profile_photo_url, bio, phone
      FROM student_profiles WHERE user_id = ?
    `).get(user.id);
    user.student_profile = (student as any) || null;
  } else if (user.role === 'FACULTY') {
    const faculty = db.prepare(`
      SELECT id, full_name, department, designation, profile_photo_url, bio, phone
      FROM faculty_profiles WHERE user_id = ?
    `).get(user.id);
    user.faculty_profile = (faculty as any) || null;

    const application = db.prepare(`
      SELECT id, status, rejection_reason, reviewed_at
      FROM faculty_applications WHERE user_id = ?
    `).get(user.id);
    user.faculty_application = (application as any) || null;
  }

  return user;
}
