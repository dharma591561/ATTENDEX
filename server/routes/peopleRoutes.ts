import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import { requireAuth, requireRole } from '../middleware/auth';
import { normalizeBranchLabel } from '../services/attendanceLogic';

export const peopleRouter = Router();

const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.DATABASE_PATH && process.env.DATABASE_PATH.includes('test'));

const rateWindowMs = 60 * 1000;
const maxRequestsPerWindow = isTestEnv ? 2000 : 120;
const requestCounters = new Map<string, { count: number; resetAt: number }>();

function peopleSearchLimiter(req: Request, res: Response, next: NextFunction) {
  const key = req.user?.id || req.ip || 'anon';
  const now = Date.now();
  const entry = requestCounters.get(key);
  if (!entry || now > entry.resetAt) {
    requestCounters.set(key, { count: 1, resetAt: now + rateWindowMs });
    return next();
  }
  entry.count += 1;
  if (entry.count > maxRequestsPerWindow) {
    return res.status(429).json({ error: 'Too many directory requests. Please wait a moment and try again.' });
  }
  return next();
}

peopleRouter.use(requireAuth);
peopleRouter.use(requireRole(['STUDENT', 'FACULTY', 'FOUNDER']));
peopleRouter.use(peopleSearchLimiter);

function resolveCanonicalBranchCandidates(rawBranch: string): string[] {
  const trimmed = rawBranch.trim();
  if (!trimmed) return [];
  const normalized = normalizeBranchLabel(trimmed);
  const candidates = new Set<string>([trimmed.toUpperCase(), normalized.toUpperCase()]);

  const dbBranch = db
    .prepare(`SELECT code, name FROM academic_branches WHERE UPPER(name) = UPPER(?) OR UPPER(code) = UPPER(?) LIMIT 1`)
    .get(normalized, trimmed) as { code: string; name: string } | undefined;

  if (dbBranch) {
    candidates.add(dbBranch.name.toUpperCase());
    candidates.add(dbBranch.code.toUpperCase());
  }
  return Array.from(candidates);
}

/**
 * GET /api/people/students
 * Search approved, active students by name or official roll number, with optional branch and section filters.
 * Returns strictly public academic fields: userId, fullName, rollNumber, branch, section.
 */
peopleRouter.get('/students', (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rawBranch = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';
    const rawSection = typeof req.query.section === 'string' ? req.query.section.trim() : '';

    const rawLimit = parseInt(String(req.query.limit || '25'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 25;
    const rawOffset = parseInt(String(req.query.offset || '0'), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    let whereClause = `WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'`;
    const params: any[] = [];

    if (q) {
      whereClause += ` AND (sp.full_name LIKE ? COLLATE NOCASE OR sp.roll_number LIKE ? COLLATE NOCASE)`;
      const likePattern = `%${q}%`;
      params.push(likePattern, likePattern);
    }

    if (rawBranch) {
      const branchCandidates = resolveCanonicalBranchCandidates(rawBranch);
      if (branchCandidates.length > 0) {
        const placeholders = branchCandidates.map(() => `UPPER(sp.branch) = ?`).join(' OR ');
        whereClause += ` AND (${placeholders})`;
        params.push(...branchCandidates);
      }
    }

    if (rawSection) {
      whereClause += ` AND UPPER(sp.section) = UPPER(?)`;
      params.push(rawSection);
    }

    const totalRow = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM student_profiles sp
         JOIN users u ON sp.user_id = u.id
         ${whereClause}`
      )
      .get(...params) as { count: number };

    const rows = db
      .prepare(
        `SELECT sp.user_id, sp.full_name, sp.roll_number, sp.branch, sp.section
         FROM student_profiles sp
         JOIN users u ON sp.user_id = u.id
         ${whereClause}
         ORDER BY sp.roll_number ASC, sp.full_name ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<{
      user_id: string;
      full_name: string;
      roll_number: string;
      branch: string;
      section: string;
    }>;

    const students = rows.map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      rollNumber: r.roll_number,
      branch: r.branch,
      section: r.section,
    }));

    return res.json({
      students,
      total: totalRow?.count || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[People Search Students Error]', err);
    return res.status(500).json({ error: 'Failed to search student directory.' });
  }
});

/**
 * GET /api/people/faculty
 * Search approved, active faculty by name or registered email address (partial match).
 * Returns strictly public academic fields: userId, fullName, department, designation.
 * Never exposes email addresses or sensitive account fields in the response.
 */
peopleRouter.get('/faculty', (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const rawLimit = parseInt(String(req.query.limit || '25'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 50) : 25;
    const rawOffset = parseInt(String(req.query.offset || '0'), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    let whereClause = `WHERE u.role = 'FACULTY' AND u.status = 'ACTIVE'`;
    const params: any[] = [];

    if (q) {
      whereClause += ` AND (fp.full_name LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE)`;
      const likePattern = `%${q}%`;
      params.push(likePattern, likePattern);
    }

    const totalRow = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM faculty_profiles fp
         JOIN users u ON fp.user_id = u.id
         ${whereClause}`
      )
      .get(...params) as { count: number };

    const rows = db
      .prepare(
        `SELECT fp.user_id, fp.full_name, fp.department, fp.designation
         FROM faculty_profiles fp
         JOIN users u ON fp.user_id = u.id
         ${whereClause}
         ORDER BY fp.full_name ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<{
      user_id: string;
      full_name: string;
      department: string;
      designation: string;
    }>;

    const faculty = rows.map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      department: r.department,
      designation: r.designation,
    }));

    return res.json({
      faculty,
      total: totalRow?.count || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[People Search Faculty Error]', err);
    return res.status(500).json({ error: 'Failed to search faculty directory.' });
  }
});

/**
 * GET /api/people/profiles/:userId
 * View an approved student or faculty profile by account userId.
 * Pending, rejected, or suspended accounts return 404.
 * Never returns email addresses, passwords, OTPs, phone numbers, photos, or attendance records.
 */
peopleRouter.get('/profiles/:userId', (req: Request, res: Response) => {
  try {
    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId) {
      return res.status(400).json({ error: 'Valid profile ID is required.' });
    }

    const userRow = db
      .prepare(
        `SELECT id, role, status
         FROM users
         WHERE id = ? AND status = 'ACTIVE' AND role IN ('STUDENT', 'FACULTY')
         LIMIT 1`
      )
      .get(targetUserId) as { id: string; role: 'STUDENT' | 'FACULTY'; status: string } | undefined;

    if (!userRow) {
      return res.status(404).json({ error: 'Profile not found or not available.' });
    }

    if (userRow.role === 'STUDENT') {
      const sp = db
        .prepare(
          `SELECT user_id, full_name, roll_number, branch, section
           FROM student_profiles
           WHERE user_id = ?
           LIMIT 1`
        )
        .get(targetUserId) as
        | {
            user_id: string;
            full_name: string;
            roll_number: string;
            branch: string;
            section: string;
          }
        | undefined;

      if (!sp) {
        return res.status(404).json({ error: 'Student profile not found.' });
      }

      return res.json({
        profile: {
          userId: sp.user_id,
          role: 'STUDENT' as const,
          fullName: sp.full_name,
          rollNumber: sp.roll_number,
          branch: sp.branch,
          section: sp.section,
        },
      });
    }

    const fp = db
      .prepare(
        `SELECT user_id, full_name, department, designation
         FROM faculty_profiles
         WHERE user_id = ?
         LIMIT 1`
      )
      .get(targetUserId) as
      | {
          user_id: string;
          full_name: string;
          department: string;
          designation: string;
        }
      | undefined;

    if (!fp) {
      return res.status(404).json({ error: 'Faculty profile not found.' });
    }

    return res.json({
      profile: {
        userId: fp.user_id,
        role: 'FACULTY' as const,
        fullName: fp.full_name,
        department: fp.department,
        designation: fp.designation,
      },
    });
  } catch (err: any) {
    console.error('[People Profile View Error]', err);
    return res.status(500).json({ error: 'Failed to load profile.' });
  }
});
