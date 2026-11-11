import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { db } from '../db/database';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAuditEvent } from '../services/auditService';
import {
  ALLOWED_SECTION_VALUES,
  normalizeBranchLabel,
  parseBranchSectionInput,
  deriveShortRollNumber,
  detectRosterShortRollAmbiguities,
  parseAndValidateAbsenteeInput,
  validateSessionTimes,
  generateRotatingQrToken,
  verifyRotatingQrToken,
  validateCampusGps,
  GeofenceConfigState,
  RosterStudentItem,
} from '../services/attendanceLogic';

export const attendanceRouter = Router();

/**
 * Automatically closes any QR sessions whose expiration timestamp has passed,
 * converting remaining UNMARKED students to ABSENT while preserving PRESENT scans.
 */
export function syncExpiredQrSessions(nowMs: number = Date.now()): void {
  const expiredSessions = db
    .prepare(
      `SELECT id FROM attendance_sessions
       WHERE method = 'QR' AND status = 'ACTIVE' AND qr_expires_at_ms IS NOT NULL AND qr_expires_at_ms <= ?`
    )
    .all(nowMs) as Array<{ id: string }>;

  if (expiredSessions.length === 0) return;

  const nowIso = new Date(nowMs).toISOString();
  const closeTx = db.transaction(() => {
    for (const s of expiredSessions) {
      db.prepare(
        `UPDATE attendance_sessions
         SET status = 'CLOSED', updated_at = ?
         WHERE id = ? AND status = 'ACTIVE'`
      ).run(nowIso, s.id);

      db.prepare(
        `UPDATE attendance_entries
         SET status = 'ABSENT', source = CASE WHEN source = 'ROSTER_INIT' THEN 'QR' ELSE source END, updated_at = ?
         WHERE session_id = ? AND status = 'UNMARKED'`
      ).run(nowIso, s.id);
    }
  });

  closeTx();
}

function getGeofenceRow(): {
  campus_name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  accuracy_tolerance_meters: number;
  max_allowed_accuracy_meters: number;
  gps_enforcement_enabled: number;
  demo_mode_enabled: number;
  qr_signing_secret: string;
  updated_at: string;
} {
  const row = db.prepare(`SELECT * FROM geofence_settings WHERE id = 'default'`).get() as any;
  if (row) return row;

  const nowIso = new Date().toISOString();
  const fallbackSecret = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `INSERT OR IGNORE INTO geofence_settings (
      id, campus_name, latitude, longitude, radius_meters,
      accuracy_tolerance_meters, max_allowed_accuracy_meters,
      gps_enforcement_enabled, demo_mode_enabled, qr_signing_secret, updated_at
    ) VALUES (
      'default',
      'Gayatri Vidya Parishad Institute of Higher Learning and Research, North Campus, Kommadi, Visakhapatnam, Andhra Pradesh',
      NULL, NULL, 300, 75, 350, 1, 0, ?, ?
    )`
  ).run(fallbackSecret, nowIso);

  return db.prepare(`SELECT * FROM geofence_settings WHERE id = 'default'`).get() as any;
}

function resolveBranchRecord(branchInput: string): { id: string; code: string; name: string } | null {
  if (!branchInput) return null;
  const trimmed = branchInput.trim();
  const byId = db
    .prepare(`SELECT id, code, name FROM academic_branches WHERE id = ? AND is_active = 1`)
    .get(trimmed) as { id: string; code: string; name: string } | undefined;
  if (byId) return byId;

  const normalized = normalizeBranchLabel(trimmed);
  const byName = db
    .prepare(`SELECT id, code, name FROM academic_branches WHERE (UPPER(name) = UPPER(?) OR UPPER(code) = UPPER(?))`)
    .get(normalized, normalized) as { id: string; code: string; name: string } | undefined;
  return byName || null;
}

// ============================================================================
// 1. PUBLIC / SHARED ACADEMIC STRUCTURE & GEOFENCE STATUS
// ============================================================================

attendanceRouter.get('/academic-structure', (_req: Request, res: Response) => {
  try {
    const branches = db
      .prepare(
        `SELECT id, code, name, display_order, is_active, created_at, updated_at
         FROM academic_branches
         WHERE is_active = 1
         ORDER BY display_order ASC, name ASC`
      )
      .all() as Array<{
      id: string;
      code: string;
      name: string;
      display_order: number;
      is_active: number;
    }>;

    const sections = db
      .prepare(
        `SELECT id, branch_id, section, is_enabled
         FROM academic_branch_sections
         ORDER BY section ASC`
      )
      .all() as Array<{
      id: string;
      branch_id: string;
      section: string;
      is_enabled: number;
    }>;

    const activeStudentCounts = db
      .prepare(
        `SELECT sp.branch, sp.section, COUNT(*) as count
         FROM student_profiles sp
         JOIN users u ON sp.user_id = u.id
         WHERE u.status = 'ACTIVE' AND u.role = 'STUDENT'
         GROUP BY sp.branch, sp.section`
      )
      .all() as Array<{ branch: string; section: string; count: number }>;

    const countMap = new Map<string, number>();
    for (const row of activeStudentCounts) {
      const key = `${normalizeBranchLabel(row.branch)}:::${row.section.trim().toUpperCase()}`;
      countMap.set(key, (countMap.get(key) || 0) + row.count);
    }

    const structuredBranches = branches.map((b) => {
      const branchSections = sections
        .filter((s) => s.branch_id === b.id)
        .map((s) => {
          const countKey = `${normalizeBranchLabel(b.name)}:::${s.section}`;
          return {
            id: s.id,
            section: s.section,
            isEnabled: s.is_enabled === 1,
            studentCount: countMap.get(countKey) || 0,
          };
        });

      const enabledSections = branchSections.filter((s) => s.isEnabled).map((s) => s.section);
      const totalStudents = branchSections.reduce((acc, s) => acc + s.studentCount, 0);

      return {
        id: b.id,
        code: b.code,
        name: b.name,
        displayOrder: b.display_order,
        isActive: b.is_active === 1,
        sections: branchSections,
        enabledSections,
        totalStudents,
      };
    });

    return res.json({
      branches: structuredBranches,
      allowedSections: ALLOWED_SECTION_VALUES,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error loading academic structure.' });
  }
});

attendanceRouter.get('/geofence-status', requireAuth, (_req: Request, res: Response) => {
  try {
    const row = getGeofenceRow();
    const isBoundaryConfigured =
      row.latitude !== null &&
      row.longitude !== null &&
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude) &&
      row.radius_meters > 0;

    return res.json({
      geofence: {
        campusName: row.campus_name,
        latitude: row.latitude,
        longitude: row.longitude,
        radiusMeters: row.radius_meters,
        accuracyToleranceMeters: row.accuracy_tolerance_meters,
        maxAllowedAccuracyMeters: row.max_allowed_accuracy_meters,
        gpsEnforcementEnabled: row.gps_enforcement_enabled === 1,
        demoModeEnabled: row.demo_mode_enabled === 1,
        isBoundaryConfigured,
        updatedAt: row.updated_at,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error loading campus geofence status.' });
  }
});

// ============================================================================
// 2. FOUNDER-ONLY ACADEMIC & GEOFENCE CONFIGURATION
// ============================================================================

attendanceRouter.get(
  '/admin/academic-config',
  requireAuth,
  requireRole(['FOUNDER']),
  (_req: Request, res: Response) => {
    try {
      const branches = db
        .prepare(
          `SELECT id, code, name, display_order, is_active, created_at, updated_at
           FROM academic_branches
           ORDER BY display_order ASC, name ASC`
        )
        .all() as any[];

      const sections = db
        .prepare(
          `SELECT id, branch_id, section, is_enabled
           FROM academic_branch_sections
           ORDER BY section ASC`
        )
        .all() as any[];

      const students = db
        .prepare(
          `SELECT sp.id, sp.user_id, sp.full_name, sp.roll_number, sp.branch, sp.section, u.email, u.status
           FROM student_profiles sp
           JOIN users u ON sp.user_id = u.id
           ORDER BY sp.roll_number ASC`
        )
        .all() as any[];

      const enabledLookup = new Set<string>();
      for (const b of branches) {
        if (b.is_active !== 1) continue;
        const bSecs = sections.filter((s) => s.branch_id === b.id && s.is_enabled === 1);
        for (const s of bSecs) {
          enabledLookup.add(`${normalizeBranchLabel(b.name)}:::${s.section}`);
        }
      }

      const countMap = new Map<string, number>();
      const legacyOrUnconfiguredStudents: any[] = [];

      for (const st of students) {
        const normBranch = normalizeBranchLabel(st.branch);
        const normSec = (st.section || '').trim().toUpperCase();
        const key = `${normBranch}:::${normSec}`;
        if (st.status === 'ACTIVE') {
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }

        const isStandardSec = (ALLOWED_SECTION_VALUES as readonly string[]).includes(normSec);
        const isKnownBranch = branches.some((b) => normalizeBranchLabel(b.name) === normBranch);
        const isCurrentlyEnabled = enabledLookup.has(key);

        if (!isStandardSec || !isKnownBranch || !isCurrentlyEnabled) {
          legacyOrUnconfiguredStudents.push({
            ...st,
            reason: !isKnownBranch
              ? 'Legacy / non-standard branch label'
              : !isStandardSec
              ? `Legacy section "${st.section}" (numeric sections 1, 2, 3 expected)`
              : `Section ${st.section} is currently disabled for ${st.branch}`,
          });
        }
      }

      const structuredBranches = branches.map((b) => {
        const branchSections = sections
          .filter((s) => s.branch_id === b.id)
          .map((s) => {
            const countKey = `${normalizeBranchLabel(b.name)}:::${s.section}`;
            return {
              id: s.id,
              section: s.section,
              isEnabled: s.is_enabled === 1,
              studentCount: countMap.get(countKey) || 0,
            };
          });

        return {
          id: b.id,
          code: b.code,
          name: b.name,
          displayOrder: b.display_order,
          isActive: b.is_active === 1,
          sections: branchSections,
          totalStudents: branchSections.reduce((acc, s) => acc + s.studentCount, 0),
        };
      });

      return res.json({
        branches: structuredBranches,
        legacyStudents: legacyOrUnconfiguredStudents,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error loading Founder academic configuration.' });
    }
  }
);

attendanceRouter.post(
  '/admin/academic-branches',
  requireAuth,
  requireRole(['FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { name, enabledSections } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Branch name is required.' });
      }

      const cleanName = normalizeBranchLabel(name);
      if (cleanName.length > 80) {
        return res.status(400).json({ error: 'Branch name must not exceed 80 characters.' });
      }

      const existing = db
        .prepare(`SELECT id FROM academic_branches WHERE UPPER(name) = UPPER(?) OR UPPER(code) = UPPER(?)`)
        .get(cleanName, cleanName);
      if (existing) {
        return res.status(409).json({ error: `Branch "${cleanName}" already exists.` });
      }

      const branchId = `branch-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      const nowIso = new Date().toISOString();
      const maxOrderRow = db.prepare(`SELECT MAX(display_order) as maxOrder FROM academic_branches`).get() as any;
      const nextOrder = (maxOrderRow?.maxOrder || 10) + 1;

      const sectionsToEnable: string[] = Array.isArray(enabledSections)
        ? enabledSections.map((s) => String(s).trim())
        : [];

      db.transaction(() => {
        db.prepare(
          `INSERT INTO academic_branches (id, code, name, display_order, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`
        ).run(branchId, cleanName, cleanName, nextOrder, nowIso, nowIso);

        for (const sec of ALLOWED_SECTION_VALUES) {
          const isEnabled = sectionsToEnable.includes(sec) ? 1 : 0;
          db.prepare(
            `INSERT INTO academic_branch_sections (id, branch_id, section, is_enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(`${branchId}-sec-${sec}`, branchId, sec, isEnabled, nowIso, nowIso);
        }
      })();

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'ACADEMIC_BRANCH_CREATED',
        details: { branchId, name: cleanName, enabledSections: sectionsToEnable },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.status(201).json({
        success: true,
        message: `Branch "${cleanName}" added to academic configuration.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error creating branch.' });
    }
  }
);

attendanceRouter.patch(
  '/admin/academic-branches/:id',
  requireAuth,
  requireRole(['FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, isActive } = req.body;

      const branch = db.prepare(`SELECT * FROM academic_branches WHERE id = ?`).get(id) as any;
      if (!branch) {
        return res.status(404).json({ error: 'Academic branch not found.' });
      }

      const nowIso = new Date().toISOString();
      let newName = branch.name;

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
          return res.status(400).json({ error: 'Valid branch name (1-80 characters) is required.' });
        }
        newName = normalizeBranchLabel(name);
        const duplicate = db
          .prepare(`SELECT id FROM academic_branches WHERE UPPER(name) = UPPER(?) AND id != ?`)
          .get(newName, id);
        if (duplicate) {
          return res.status(409).json({ error: `Another branch with the name "${newName}" already exists.` });
        }
      }

      const nextActive = isActive !== undefined ? (isActive ? 1 : 0) : branch.is_active;

      db.transaction(() => {
        db.prepare(
          `UPDATE academic_branches
           SET name = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        ).run(newName, nextActive, nowIso, id);

        if (newName !== branch.name) {
          // Keep student_profiles and student_applications synchronized while preserving historical attendance via branch_id
          db.prepare(`UPDATE student_profiles SET branch = ?, updated_at = ? WHERE UPPER(branch) = UPPER(?)`).run(
            newName,
            nowIso,
            branch.name
          );
          db.prepare(`UPDATE student_applications SET branch = ?, updated_at = ? WHERE UPPER(branch) = UPPER(?)`).run(
            newName,
            nowIso,
            branch.name
          );
        }
      })();

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'ACADEMIC_BRANCH_UPDATED',
        details: { branchId: id, previousName: branch.name, newName, isActive: nextActive === 1 },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: `Branch "${newName}" updated successfully.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error updating branch.' });
    }
  }
);

attendanceRouter.patch(
  '/admin/academic-branches/:id/sections',
  requireAuth,
  requireRole(['FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { section, isEnabled } = req.body;

      const branch = db.prepare(`SELECT * FROM academic_branches WHERE id = ?`).get(id) as any;
      if (!branch) {
        return res.status(404).json({ error: 'Academic branch not found.' });
      }

      const cleanSection = String(section || '').trim();
      if (!(ALLOWED_SECTION_VALUES as readonly string[]).includes(cleanSection)) {
        return res.status(400).json({ error: 'Section must be one of the official numeric sections: 1, 2, or 3.' });
      }

      const nowIso = new Date().toISOString();
      const enabledFlag = isEnabled ? 1 : 0;

      db.prepare(
        `INSERT INTO academic_branch_sections (id, branch_id, section, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(branch_id, section) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = excluded.updated_at`
      ).run(`${id}-sec-${cleanSection}`, id, cleanSection, enabledFlag, nowIso, nowIso);

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'ACADEMIC_SECTION_TOGGLED',
        details: { branchId: id, branchName: branch.name, section: cleanSection, isEnabled: Boolean(isEnabled) },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: `Section ${cleanSection} for ${branch.name} ${enabledFlag ? 'enabled' : 'disabled'}.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error updating branch section configuration.' });
    }
  }
);

// Founder Correction of Existing Student's Branch & Section (Preserves account & official roll number)
attendanceRouter.patch(
  '/admin/students/:userId/academic',
  requireAuth,
  requireRole(['FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { branch, section } = req.body;

      if (!branch || !section) {
        return res.status(400).json({ error: 'Both branch and section are required.' });
      }

      const parsed = parseBranchSectionInput(String(branch), String(section));
      const branchRecord = resolveBranchRecord(parsed.branch);
      if (!branchRecord) {
        return res.status(400).json({ error: `Branch "${parsed.branch}" is not a configured academic branch.` });
      }

      if (!(ALLOWED_SECTION_VALUES as readonly string[]).includes(parsed.section)) {
        return res.status(400).json({ error: 'Section must be 1, 2, or 3.' });
      }

      const profile = db
        .prepare(`SELECT id, user_id, full_name, roll_number, branch, section FROM student_profiles WHERE user_id = ?`)
        .get(userId) as any;
      if (!profile) {
        return res.status(404).json({ error: 'Student profile not found.' });
      }

      const nowIso = new Date().toISOString();
      db.transaction(() => {
        db.prepare(`UPDATE student_profiles SET branch = ?, section = ?, updated_at = ? WHERE user_id = ?`).run(
          branchRecord.name,
          parsed.section,
          nowIso,
          userId
        );
        db.prepare(`UPDATE student_applications SET branch = ?, section = ?, updated_at = ? WHERE user_id = ?`).run(
          branchRecord.name,
          parsed.section,
          nowIso,
          userId
        );
      })();

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'STUDENT_ACADEMIC_ASSIGNMENT_UPDATED',
        targetUserId: userId,
        details: {
          rollNumber: profile.roll_number,
          previousBranch: profile.branch,
          previousSection: profile.section,
          newBranch: branchRecord.name,
          newSection: parsed.section,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: `Updated ${profile.full_name} (${profile.roll_number}) to ${branchRecord.name} — Section ${parsed.section}.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error updating student academic assignment.' });
    }
  }
);

// Founder Geofence & Demo Mode Configuration
attendanceRouter.put(
  '/admin/geofence',
  requireAuth,
  requireRole(['FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const {
        campusName,
        latitude,
        longitude,
        radiusMeters,
        accuracyToleranceMeters,
        maxAllowedAccuracyMeters,
        gpsEnforcementEnabled,
        demoModeEnabled,
      } = req.body;

      const current = getGeofenceRow();
      const nextCampusName =
        campusName !== undefined && String(campusName).trim()
          ? String(campusName).trim().slice(0, 200)
          : current.campus_name;

      let nextLat: number | null = current.latitude;
      let nextLng: number | null = current.longitude;

      if (latitude === null || latitude === '') {
        nextLat = null;
      } else if (latitude !== undefined) {
        const parsedLat = Number(latitude);
        if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
          return res.status(400).json({ error: 'Latitude must be a valid coordinate between -90 and 90.' });
        }
        nextLat = parsedLat;
      }

      if (longitude === null || longitude === '') {
        nextLng = null;
      } else if (longitude !== undefined) {
        const parsedLng = Number(longitude);
        if (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) {
          return res.status(400).json({ error: 'Longitude must be a valid coordinate between -180 and 180.' });
        }
        nextLng = parsedLng;
      }

      const nextRadius =
        radiusMeters !== undefined ? Math.max(25, Math.min(10000, Math.round(Number(radiusMeters) || 300))) : current.radius_meters;
      const nextTolerance =
        accuracyToleranceMeters !== undefined
          ? Math.max(0, Math.min(500, Math.round(Number(accuracyToleranceMeters) || 75)))
          : current.accuracy_tolerance_meters;
      const nextMaxAccuracy =
        maxAllowedAccuracyMeters !== undefined
          ? Math.max(50, Math.min(2000, Math.round(Number(maxAllowedAccuracyMeters) || 350)))
          : current.max_allowed_accuracy_meters;

      const nextGpsEnabled =
        gpsEnforcementEnabled !== undefined ? (gpsEnforcementEnabled ? 1 : 0) : current.gps_enforcement_enabled;
      const nextDemoMode = demoModeEnabled !== undefined ? (demoModeEnabled ? 1 : 0) : current.demo_mode_enabled;

      const nowIso = new Date().toISOString();
      db.prepare(
        `UPDATE geofence_settings
         SET campus_name = ?, latitude = ?, longitude = ?, radius_meters = ?,
             accuracy_tolerance_meters = ?, max_allowed_accuracy_meters = ?,
             gps_enforcement_enabled = ?, demo_mode_enabled = ?,
             updated_by_user_id = ?, updated_at = ?
         WHERE id = 'default'`
      ).run(
        nextCampusName,
        nextLat,
        nextLng,
        nextRadius,
        nextTolerance,
        nextMaxAccuracy,
        nextGpsEnabled,
        nextDemoMode,
        req.user!.id,
        nowIso
      );

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'GEOFENCE_SETTINGS_UPDATED',
        details: {
          campusName: nextCampusName,
          latitude: nextLat,
          longitude: nextLng,
          radiusMeters: nextRadius,
          gpsEnforcementEnabled: nextGpsEnabled === 1,
          demoModeEnabled: nextDemoMode === 1,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: 'Campus geofence and GPS verification settings saved.',
        geofence: {
          campusName: nextCampusName,
          latitude: nextLat,
          longitude: nextLng,
          radiusMeters: nextRadius,
          accuracyToleranceMeters: nextTolerance,
          maxAllowedAccuracyMeters: nextMaxAccuracy,
          gpsEnforcementEnabled: nextGpsEnabled === 1,
          demoModeEnabled: nextDemoMode === 1,
          isBoundaryConfigured: nextLat !== null && nextLng !== null && nextRadius > 0,
          updatedAt: nowIso,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error updating geofence settings.' });
    }
  }
);

// ============================================================================
// 3. FACULTY & FOUNDER ATTENDANCE SESSIONS (MANUAL & DYNAMIC QR)
// ============================================================================

// Load Approved Students Roster & Check Overlapping Sessions
attendanceRouter.get(
  '/roster-preview',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const rawBranch = String(req.query.branch || '');
      const rawSection = String(req.query.section || '');
      const sessionDate = String(req.query.date || new Date().toISOString().slice(0, 10));
      const startTime = String(req.query.startTime || '');
      const endTime = String(req.query.endTime || '');

      if (!rawBranch || !rawSection) {
        return res.status(400).json({ error: 'Branch and section are required to load students.' });
      }

      const parsed = parseBranchSectionInput(rawBranch, rawSection);
      const branchRecord = resolveBranchRecord(parsed.branch);
      const targetBranchName = branchRecord ? branchRecord.name : parsed.branch;

      const students = db
        .prepare(
          `SELECT sp.id as profile_id, sp.user_id, sp.full_name, sp.roll_number, sp.branch, sp.section, sp.profile_photo_url
           FROM student_profiles sp
           JOIN users u ON sp.user_id = u.id
           WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
             AND UPPER(sp.branch) = UPPER(?)
             AND UPPER(sp.section) = UPPER(?)
           ORDER BY sp.roll_number ASC`
        )
        .all(targetBranchName, parsed.section) as Array<{
        profile_id: string;
        user_id: string;
        full_name: string;
        roll_number: string;
        branch: string;
        section: string;
        profile_photo_url: string | null;
      }>;

      const rosterItems: RosterStudentItem[] = students.map((s) => ({
        studentUserId: s.user_id,
        fullName: s.full_name,
        rollNumber: s.roll_number,
      }));
      const ambiguousShortRolls = detectRosterShortRollAmbiguities(rosterItems);

      const formattedRoster = students.map((s, idx) => {
        const shortRoll = deriveShortRollNumber(s.roll_number);
        return {
          serialNumber: idx + 1,
          studentUserId: s.user_id,
          studentProfileId: s.profile_id,
          fullName: s.full_name,
          rollNumber: s.roll_number,
          shortRollNumber: shortRoll,
          isShortRollAmbiguous: ambiguousShortRolls.has(shortRoll),
          branch: s.branch,
          section: s.section,
          profilePhotoUrl: s.profile_photo_url,
        };
      });

      // Check for overlapping or duplicate sessions on the same date, branch, and section
      let overlapWarnings: Array<{
        id: string;
        subjectName: string;
        startTime: string;
        endTime: string;
        status: string;
        method: string;
        facultyName: string;
      }> = [];

      if (startTime && endTime) {
        const existingSessions = db
          .prepare(
            `SELECT a.id, a.subject_name, a.start_time, a.end_time, a.status, a.method,
                    COALESCE(fp.full_name, u.email) as faculty_name
             FROM attendance_sessions a
             JOIN users u ON a.faculty_user_id = u.id
             LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
             WHERE UPPER(a.branch_name_snapshot) = UPPER(?)
               AND UPPER(a.section) = UPPER(?)
               AND a.session_date = ?`
          )
          .all(targetBranchName, parsed.section, sessionDate) as any[];

        overlapWarnings = existingSessions
          .filter((s) => s.start_time < endTime && s.end_time > startTime)
          .map((s) => ({
            id: s.id,
            subjectName: s.subject_name,
            startTime: s.start_time,
            endTime: s.end_time,
            status: s.status,
            method: s.method,
            facultyName: s.faculty_name,
          }));
      }

      return res.json({
        branch: targetBranchName,
        branchId: branchRecord?.id || null,
        section: parsed.section,
        totalStudents: formattedRoster.length,
        hasAmbiguousShortRolls: ambiguousShortRolls.size > 0,
        students: formattedRoster,
        overlapWarnings,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error loading student roster.' });
    }
  }
);

// Create or Resume an Attendance Session (Manual or Dynamic QR)
attendanceRouter.post(
  '/sessions',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const {
        branch,
        section,
        sessionDate,
        subjectName,
        periodNumber,
        startTime,
        endTime,
        method,
        qrDurationMinutes,
        qrRefreshIntervalSeconds,
      } = req.body;

      if (!branch || !section || !sessionDate || !subjectName || !startTime || !endTime || !method) {
        return res.status(400).json({
          error: 'Branch, section, date, subject name, start time, end time, and attendance method are required.',
        });
      }

      if (!['MANUAL', 'QR'].includes(method)) {
        return res.status(400).json({ error: 'Attendance method must be MANUAL or QR.' });
      }

      const cleanSubject = String(subjectName).trim();
      if (!cleanSubject || cleanSubject.length > 120) {
        return res.status(400).json({ error: 'Subject name must be between 1 and 120 characters.' });
      }

      const cleanPeriod = periodNumber ? String(periodNumber).trim().slice(0, 30) : null;
      const cleanDate = String(sessionDate).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        return res.status(400).json({ error: 'Session date must be in YYYY-MM-DD format.' });
      }

      const timeCheck = validateSessionTimes(String(startTime), String(endTime));
      if (!timeCheck.valid) {
        return res.status(400).json({ error: timeCheck.error });
      }

      const parsed = parseBranchSectionInput(String(branch), String(section));
      const branchRecord = resolveBranchRecord(parsed.branch);
      if (!branchRecord) {
        return res.status(400).json({ error: `Branch "${parsed.branch}" is not found in academic configuration.` });
      }

      // Check if an identical active/draft session already exists for this faculty to prevent accidental duplicates on refresh
      const existingActive = db
        .prepare(
          `SELECT id, status, method FROM attendance_sessions
           WHERE faculty_user_id = ?
             AND branch_id = ?
             AND UPPER(section) = UPPER(?)
             AND session_date = ?
             AND start_time = ?
             AND end_time = ?
             AND UPPER(subject_name) = UPPER(?)
             AND status IN ('DRAFT', 'ACTIVE')
           LIMIT 1`
        )
        .get(
          req.user!.id,
          branchRecord.id,
          parsed.section,
          cleanDate,
          String(startTime).trim(),
          String(endTime).trim(),
          cleanSubject
        ) as { id: string; status: string; method: string } | undefined;

      if (existingActive) {
        return res.status(200).json({
          success: true,
          resumed: true,
          sessionId: existingActive.id,
          message: 'Resumed existing active attendance session.',
        });
      }

      // Load eligible Founder-approved students for the roster snapshot
      const eligibleStudents = db
        .prepare(
          `SELECT sp.id as profile_id, sp.user_id, sp.full_name, sp.roll_number
           FROM student_profiles sp
           JOIN users u ON sp.user_id = u.id
           WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
             AND UPPER(sp.branch) = UPPER(?)
             AND UPPER(sp.section) = UPPER(?)
           ORDER BY sp.roll_number ASC`
        )
        .all(branchRecord.name, parsed.section) as Array<{
        profile_id: string;
        user_id: string;
        full_name: string;
        roll_number: string;
      }>;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const sessionId = crypto.randomUUID();

      let durationMins: number | null = null;
      let refreshSecs: number | null = null;
      let startedAtMs: number | null = null;
      let expiresAtMs: number | null = null;
      let initialStatus: 'DRAFT' | 'ACTIVE' = 'DRAFT';
      let gpsMode = 'MANUAL';

      if (method === 'QR') {
        const validDurations = [1, 3, 5, 10, 15];
        const validRefreshes = [5, 10, 15, 20, 30];
        const requestedDuration = Number(qrDurationMinutes) || 5;
        const requestedRefresh = Number(qrRefreshIntervalSeconds) || 5;

        durationMins = validDurations.includes(requestedDuration)
          ? requestedDuration
          : Math.max(1, Math.min(60, Math.round(requestedDuration)));
        refreshSecs = validRefreshes.includes(requestedRefresh)
          ? requestedRefresh
          : Math.max(5, Math.min(120, Math.round(requestedRefresh)));

        startedAtMs = nowMs;
        expiresAtMs = nowMs + durationMins * 60 * 1000;
        initialStatus = 'ACTIVE';

        const geofence = getGeofenceRow();
        gpsMode =
          geofence.demo_mode_enabled === 1
            ? 'DEMO_MODE'
            : geofence.gps_enforcement_enabled === 1
            ? 'GPS_VERIFIED'
            : 'GPS_DISABLED_BY_FOUNDER';
      }

      const insertEntryStmt = db.prepare(
        `INSERT INTO attendance_entries (
          id, session_id, student_user_id, student_profile_id,
          roll_number_snapshot, short_roll_snapshot, full_name_snapshot,
          status, source, verification_mode, marked_by_user_id, recorded_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UNMARKED', 'ROSTER_INIT', NULL, NULL, ?, ?)`
      );

      db.transaction(() => {
        db.prepare(
          `INSERT INTO attendance_sessions (
            id, faculty_user_id, branch_id, branch_name_snapshot, section,
            session_date, subject_name, period_number, start_time, end_time,
            method, status, qr_duration_minutes, qr_refresh_interval_seconds,
            qr_started_at_ms, qr_expires_at_ms, gps_verification_mode,
            submitted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        ).run(
          sessionId,
          req.user!.id,
          branchRecord.id,
          branchRecord.name,
          parsed.section,
          cleanDate,
          cleanSubject,
          cleanPeriod,
          String(startTime).trim(),
          String(endTime).trim(),
          method,
          initialStatus,
          durationMins,
          refreshSecs,
          startedAtMs,
          expiresAtMs,
          gpsMode,
          nowIso,
          nowIso
        );

        for (const student of eligibleStudents) {
          insertEntryStmt.run(
            crypto.randomUUID(),
            sessionId,
            student.user_id,
            student.profile_id,
            student.roll_number,
            deriveShortRollNumber(student.roll_number),
            student.full_name,
            nowIso,
            nowIso
          );
        }
      })();

      logAuditEvent({
        actorUserId: req.user!.id,
        action: method === 'QR' ? 'QR_ATTENDANCE_SESSION_STARTED' : 'MANUAL_ATTENDANCE_SESSION_CREATED',
        details: {
          sessionId,
          branch: branchRecord.name,
          section: parsed.section,
          sessionDate: cleanDate,
          subjectName: cleanSubject,
          method,
          rosterCount: eligibleStudents.length,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.status(201).json({
        success: true,
        resumed: false,
        sessionId,
        rosterCount: eligibleStudents.length,
        message:
          method === 'QR'
            ? `Dynamic QR session started for ${branchRecord.name} — Section ${parsed.section}.`
            : `Attendance roster loaded (${eligibleStudents.length} approved students).`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error creating attendance session.' });
    }
  }
);

// Get Full Session Details & Live Roster
attendanceRouter.get(
  '/sessions/:id',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const { id } = req.params;
      const session = db
        .prepare(
          `SELECT a.*, COALESCE(fp.full_name, u.email) as faculty_name, u.email as faculty_email
           FROM attendance_sessions a
           JOIN users u ON a.faculty_user_id = u.id
           LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
           WHERE a.id = ?`
        )
        .get(id) as any;

      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      const entries = db
        .prepare(
          `SELECT id, session_id, student_user_id, student_profile_id,
                  roll_number_snapshot, short_roll_snapshot, full_name_snapshot,
                  status, source, verification_mode, distance_meters, recorded_at, updated_at
           FROM attendance_entries
           WHERE session_id = ?
           ORDER BY roll_number_snapshot ASC`
        )
        .all(id) as any[];

      const rosterItems: RosterStudentItem[] = entries.map((e) => ({
        studentUserId: e.student_user_id,
        fullName: e.full_name_snapshot,
        rollNumber: e.roll_number_snapshot,
      }));
      const ambiguousShortRolls = detectRosterShortRollAmbiguities(rosterItems);

      let presentCount = 0;
      let absentCount = 0;
      let unmarkedCount = 0;

      const formattedEntries = entries.map((e, idx) => {
        if (e.status === 'PRESENT') presentCount++;
        else if (e.status === 'ABSENT') absentCount++;
        else unmarkedCount++;

        return {
          id: e.id,
          serialNumber: idx + 1,
          studentUserId: e.student_user_id,
          studentProfileId: e.student_profile_id,
          rollNumber: e.roll_number_snapshot,
          shortRollNumber: e.short_roll_snapshot,
          isShortRollAmbiguous: ambiguousShortRolls.has(e.short_roll_snapshot),
          fullName: e.full_name_snapshot,
          status: e.status,
          source: e.source,
          verificationMode: e.verification_mode,
          distanceMeters: e.distance_meters,
          recordedAt: e.recorded_at,
          updatedAt: e.updated_at,
        };
      });

      const corrections = db
        .prepare(
          `SELECT c.*, COALESCE(fp.full_name, u.email) as editor_name
           FROM attendance_correction_audits c
           JOIN users u ON c.editor_user_id = u.id
           LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
           WHERE c.session_id = ?
           ORDER BY c.created_at DESC
           LIMIT 50`
        )
        .all(id) as any[];

      const canEdit = req.user!.role === 'FOUNDER' || session.faculty_user_id === req.user!.id;
      const nowMs = Date.now();
      const remainingSeconds =
        session.method === 'QR' && session.status === 'ACTIVE' && session.qr_expires_at_ms
          ? Math.max(0, Math.ceil((session.qr_expires_at_ms - nowMs) / 1000))
          : 0;

      return res.json({
        session: {
          id: session.id,
          facultyUserId: session.faculty_user_id,
          facultyName: session.faculty_name,
          facultyEmail: session.faculty_email,
          branchId: session.branch_id,
          branch: session.branch_name_snapshot,
          section: session.section,
          sessionDate: session.session_date,
          subjectName: session.subject_name,
          periodNumber: session.period_number,
          startTime: session.start_time,
          endTime: session.end_time,
          method: session.method,
          status: session.status,
          qrDurationMinutes: session.qr_duration_minutes,
          qrRefreshIntervalSeconds: session.qr_refresh_interval_seconds,
          qrStartedAtMs: session.qr_started_at_ms,
          qrExpiresAtMs: session.qr_expires_at_ms,
          remainingSeconds,
          gpsVerificationMode: session.gps_verification_mode,
          submittedAt: session.submitted_at,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          canEdit,
        },
        counts: {
          total: formattedEntries.length,
          present: presentCount,
          absent: absentCount,
          unmarked: unmarkedCount,
        },
        entries: formattedEntries,
        corrections,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error fetching attendance session.' });
    }
  }
);

// Generate Server-Authoritative Rotating QR Code & Live Status for Faculty Screen
attendanceRouter.get(
  '/sessions/:id/qr-token',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  async (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const { id } = req.params;
      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(id) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      if (req.user!.role !== 'FOUNDER' && session.faculty_user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Only the session creator or Founder can display this session QR code.' });
      }

      if (session.method !== 'QR') {
        return res.status(400).json({ error: 'This session is configured for manual attendance, not QR.' });
      }

      const countsRow = db
        .prepare(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present,
             SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
             SUM(CASE WHEN status = 'UNMARKED' THEN 1 ELSE 0 END) as unmarked
           FROM attendance_entries
           WHERE session_id = ?`
        )
        .get(id) as any;

      const counts = {
        total: countsRow?.total || 0,
        present: countsRow?.present || 0,
        absent: countsRow?.absent || 0,
        unmarked: countsRow?.unmarked || 0,
      };

      if (session.status !== 'ACTIVE' || !session.qr_expires_at_ms || Date.now() >= session.qr_expires_at_ms) {
        return res.json({
          active: false,
          status: session.status,
          secondsUntilSessionExpiry: 0,
          secondsUntilNextRefresh: 0,
          qrToken: null,
          qrDataUrl: null,
          counts,
        });
      }

      const geofence = getGeofenceRow();
      const nowMs = Date.now();
      const generated = generateRotatingQrToken(
        session.id,
        nowMs,
        session.qr_started_at_ms,
        session.qr_expires_at_ms,
        session.qr_refresh_interval_seconds || 5,
        geofence.qr_signing_secret
      );

      const qrDataUrl = await QRCode.toDataURL(generated.token, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      return res.json({
        active: true,
        status: session.status,
        windowIndex: generated.windowIndex,
        secondsUntilNextRefresh: generated.secondsUntilNextRefresh,
        secondsUntilSessionExpiry: generated.secondsUntilSessionExpiry,
        qrToken: generated.token,
        qrDataUrl,
        counts,
        geofenceMode:
          geofence.demo_mode_enabled === 1
            ? 'DEMO_MODE'
            : geofence.gps_enforcement_enabled === 1
            ? geofence.latitude !== null && geofence.longitude !== null
              ? 'GPS_VERIFIED'
              : 'GPS_UNCONFIGURED'
            : 'GPS_DISABLED_BY_FOUNDER',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error generating rotating QR token.' });
    }
  }
);

// End Active QR Session Early (or Finalize Expiry)
attendanceRouter.post(
  '/sessions/:id/end-qr',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(id) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      if (req.user!.role !== 'FOUNDER' && session.faculty_user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Only the session creator or Founder may end this session.' });
      }

      const nowIso = new Date().toISOString();
      db.transaction(() => {
        db.prepare(
          `UPDATE attendance_sessions
           SET status = 'CLOSED', qr_expires_at_ms = MIN(COALESCE(qr_expires_at_ms, ?), ?), updated_at = ?
           WHERE id = ? AND status = 'ACTIVE'`
        ).run(Date.now(), Date.now(), nowIso, id);

        db.prepare(
          `UPDATE attendance_entries
           SET status = 'ABSENT', source = CASE WHEN source = 'ROSTER_INIT' THEN 'QR' ELSE source END, updated_at = ?
           WHERE session_id = ? AND status = 'UNMARKED'`
        ).run(nowIso, id);
      })();

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'QR_ATTENDANCE_SESSION_ENDED',
        details: { sessionId: id },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: 'QR attendance session closed. Remaining unmarked students have been marked Absent for your review.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error ending QR session.' });
    }
  }
);

// Update Period-Wise Attendance Entries (Single Student, Bulk Mark All, Clear All, Save Draft, or Manual Correction)
attendanceRouter.put(
  '/sessions/:id/entries',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const { id } = req.params;
      const { updates, reason } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Attendance updates array is required.' });
      }

      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(id) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      if (req.user!.role !== 'FOUNDER' && session.faculty_user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Only the session creator or Founder can modify this session.' });
      }

      const existingEntries = db
        .prepare(`SELECT * FROM attendance_entries WHERE session_id = ?`)
        .all(id) as any[];
      const entryByStudent = new Map<string, any>();
      for (const e of existingEntries) {
        entryByStudent.set(e.student_user_id, e);
      }

      const nowIso = new Date().toISOString();
      const isCorrectionPhase = session.status === 'CLOSED' || session.status === 'SUBMITTED' || session.method === 'QR';
      const correctionSource =
        session.status === 'SUBMITTED'
          ? 'REOPENED_SESSION'
          : session.method === 'QR'
          ? 'QR_LIVE_OVERRIDE'
          : 'PERIOD_ROSTER';

      const updateStmt = db.prepare(
        `UPDATE attendance_entries
         SET status = ?, source = ?, verification_mode = ?, marked_by_user_id = ?, updated_at = ?
         WHERE session_id = ? AND student_user_id = ?`
      );

      const insertAuditStmt = db.prepare(
        `INSERT INTO attendance_correction_audits (
          id, session_id, student_user_id, roll_number_snapshot,
          previous_status, new_status, editor_user_id, correction_source, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let updatedCount = 0;
      db.transaction(() => {
        for (const item of updates) {
          const studentUserId = String(item.studentUserId || '');
          const nextStatus = String(item.status || '').toUpperCase();
          if (!['PRESENT', 'ABSENT', 'UNMARKED'].includes(nextStatus)) {
            throw new Error(`Invalid attendance status "${nextStatus}".`);
          }

          const currentEntry = entryByStudent.get(studentUserId);
          if (!currentEntry) continue;

          if (currentEntry.status === nextStatus) continue;

          const nextSource = isCorrectionPhase && currentEntry.status !== 'UNMARKED' ? 'CORRECTION' : 'MANUAL';
          updateStmt.run(
            nextStatus,
            nextSource,
            nextSource === 'CORRECTION' ? 'CORRECTION' : 'MANUAL',
            req.user!.id,
            nowIso,
            id,
            studentUserId
          );
          updatedCount++;

          if (isCorrectionPhase && currentEntry.status !== 'UNMARKED') {
            insertAuditStmt.run(
              crypto.randomUUID(),
              id,
              studentUserId,
              currentEntry.roll_number_snapshot,
              currentEntry.status,
              nextStatus,
              req.user!.id,
              correctionSource,
              reason ? String(reason).slice(0, 300) : null,
              nowIso
            );
          }
        }

        db.prepare(`UPDATE attendance_sessions SET updated_at = ? WHERE id = ?`).run(nowIso, id);
      })();

      return res.json({
        success: true,
        updatedCount,
        message: 'Attendance draft saved.',
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Error updating attendance entries.' });
    }
  }
);

// Submit Finalized Attendance Session
attendanceRouter.post(
  '/sessions/:id/submit',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const { id } = req.params;
      const { confirmMarkUnmarkedAbsent } = req.body || {};

      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(id) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      if (req.user!.role !== 'FOUNDER' && session.faculty_user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Only the session creator or Founder can submit this session.' });
      }

      const unmarkedRow = db
        .prepare(`SELECT COUNT(*) as count FROM attendance_entries WHERE session_id = ? AND status = 'UNMARKED'`)
        .get(id) as { count: number };

      if (unmarkedRow.count > 0 && !confirmMarkUnmarkedAbsent) {
        return res.status(400).json({
          error: `There are ${unmarkedRow.count} unmarked student(s). Please mark every student or confirm marking remaining unmarked students as Absent before submitting.`,
          unmarkedCount: unmarkedRow.count,
          requiresConfirmation: true,
        });
      }

      const nowIso = new Date().toISOString();
      db.transaction(() => {
        if (unmarkedRow.count > 0 && confirmMarkUnmarkedAbsent) {
          db.prepare(
            `UPDATE attendance_entries
             SET status = 'ABSENT', source = 'MANUAL', verification_mode = 'MANUAL', marked_by_user_id = ?, updated_at = ?
             WHERE session_id = ? AND status = 'UNMARKED'`
          ).run(req.user!.id, nowIso, id);
        }

        db.prepare(
          `UPDATE attendance_sessions
           SET status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, ?), updated_at = ?
           WHERE id = ?`
        ).run(nowIso, nowIso, id);
      })();

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'ATTENDANCE_SESSION_SUBMITTED',
        details: {
          sessionId: id,
          branch: session.branch_name_snapshot,
          section: session.section,
          sessionDate: session.session_date,
          subjectName: session.subject_name,
        },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: 'Attendance session submitted and published to Daily Reports.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error submitting attendance session.' });
    }
  }
);

// Reopen a Submitted Session for Authorized Corrections
attendanceRouter.post(
  '/sessions/:id/reopen',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(id) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      if (req.user!.role !== 'FOUNDER' && session.faculty_user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Only the session creator or Founder can reopen this session.' });
      }

      const nowIso = new Date().toISOString();
      db.prepare(`UPDATE attendance_sessions SET status = 'CLOSED', updated_at = ? WHERE id = ?`).run(nowIso, id);

      logAuditEvent({
        actorUserId: req.user!.id,
        action: 'ATTENDANCE_SESSION_REOPENED',
        details: { sessionId: id, subjectName: session.subject_name },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
      });

      return res.json({
        success: true,
        message: 'Session reopened for authorized attendance corrections.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error reopening attendance session.' });
    }
  }
);

// ============================================================================
// 4. DAY-WISE ATTENDANCE REPORTS & DIRECT ABSENTEE LIST EDITING
// ============================================================================

attendanceRouter.get(
  '/daily-report',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const rawBranch = String(req.query.branch || '');
      const rawSection = String(req.query.section || '');
      const sessionDate = String(req.query.date || new Date().toISOString().slice(0, 10));

      if (!rawBranch || !rawSection || !sessionDate) {
        return res.status(400).json({ error: 'Branch, section, and date are required to load the daily report.' });
      }

      const parsed = parseBranchSectionInput(rawBranch, rawSection);
      const branchRecord = resolveBranchRecord(parsed.branch);
      const targetBranchName = branchRecord ? branchRecord.name : parsed.branch;

      const sessions = db
        .prepare(
          `SELECT a.*, COALESCE(fp.full_name, u.email) as faculty_name
           FROM attendance_sessions a
           JOIN users u ON a.faculty_user_id = u.id
           LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
           WHERE UPPER(a.branch_name_snapshot) = UPPER(?)
             AND UPPER(a.section) = UPPER(?)
             AND a.session_date = ?
             AND a.status = 'SUBMITTED'
           ORDER BY a.start_time ASC, a.created_at ASC`
        )
        .all(targetBranchName, parsed.section, sessionDate) as any[];

      const getEntriesStmt = db.prepare(
        `SELECT student_user_id, roll_number_snapshot, short_roll_snapshot, full_name_snapshot, status
         FROM attendance_entries
         WHERE session_id = ?
         ORDER BY roll_number_snapshot ASC`
      );

      const periods = sessions.map((s, index) => {
        const entries = getEntriesStmt.all(s.id) as Array<{
          student_user_id: string;
          roll_number_snapshot: string;
          short_roll_snapshot: string;
          full_name_snapshot: string;
          status: string;
        }>;

        const rosterItems: RosterStudentItem[] = entries.map((e) => ({
          studentUserId: e.student_user_id,
          fullName: e.full_name_snapshot,
          rollNumber: e.roll_number_snapshot,
        }));
        const ambiguousShortRolls = detectRosterShortRollAmbiguities(rosterItems);

        const absentees = entries.filter((e) => e.status === 'ABSENT');
        const presentCount = entries.filter((e) => e.status === 'PRESENT').length;

        const absentDisplayRolls = absentees.map((a) =>
          ambiguousShortRolls.has(a.short_roll_snapshot) ? a.roll_number_snapshot : a.short_roll_snapshot
        );

        return {
          sessionId: s.id,
          serialNumber: index + 1,
          startTime: s.start_time,
          endTime: s.end_time,
          timeRange: `${s.start_time} – ${s.end_time}`,
          subjectName: s.subject_name,
          periodNumber: s.period_number,
          method: s.method,
          facultyUserId: s.faculty_user_id,
          facultyName: s.faculty_name,
          canEdit: req.user!.role === 'FOUNDER' || s.faculty_user_id === req.user!.id,
          totalStudents: entries.length,
          presentCount,
          absentCount: absentees.length,
          absentShortRolls: absentDisplayRolls,
          absentShortRollsText: absentDisplayRolls.join(', '),
          absentStudentsDetailed: absentees.map((a) => ({
            studentUserId: a.student_user_id,
            fullName: a.full_name_snapshot,
            rollNumber: a.roll_number_snapshot,
            shortRollNumber: a.short_roll_snapshot,
          })),
          hasAmbiguousShortRolls: ambiguousShortRolls.size > 0,
        };
      });

      const geofence = getGeofenceRow();

      return res.json({
        institutionName: geofence.campus_name,
        branch: targetBranchName,
        section: parsed.section,
        date: sessionDate,
        totalReportedSessions: periods.length,
        generatedAt: new Date().toISOString(),
        periods,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error loading daily attendance report.' });
    }
  }
);

// Direct Editing of Absent Roll Numbers in Day-Wise Report (Synchronizes Period-Wise Records)
attendanceRouter.put(
  '/daily-report/:sessionId/absentees',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { absentRollNumbersInput, reason } = req.body;

      if (typeof absentRollNumbersInput !== 'string') {
        return res.status(400).json({ error: 'absentRollNumbersInput string is required.' });
      }

      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(sessionId) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      if (req.user!.role !== 'FOUNDER' && session.faculty_user_id !== req.user!.id) {
        return res.status(403).json({
          error: 'Access denied: Only the creator faculty member or Founder Administrator can modify this session.',
        });
      }

      const entries = db
        .prepare(
          `SELECT id, student_user_id, roll_number_snapshot, short_roll_snapshot, full_name_snapshot, status
           FROM attendance_entries
           WHERE session_id = ?
           ORDER BY roll_number_snapshot ASC`
        )
        .all(sessionId) as Array<{
        id: string;
        student_user_id: string;
        roll_number_snapshot: string;
        short_roll_snapshot: string;
        full_name_snapshot: string;
        status: string;
      }>;

      const rosterItems: RosterStudentItem[] = entries.map((e) => ({
        studentUserId: e.student_user_id,
        fullName: e.full_name_snapshot,
        rollNumber: e.roll_number_snapshot,
      }));

      const parsed = parseAndValidateAbsenteeInput(absentRollNumbersInput, rosterItems);
      if (!parsed.valid) {
        return res.status(400).json({
          error: parsed.errors.join(' '),
          validationErrors: parsed.errors,
        });
      }

      const absentSet = new Set(parsed.absentStudentUserIds);
      const nowIso = new Date().toISOString();

      const updateEntryStmt = db.prepare(
        `UPDATE attendance_entries
         SET status = ?, source = 'CORRECTION', verification_mode = 'CORRECTION', marked_by_user_id = ?, updated_at = ?
         WHERE id = ?`
      );

      const insertAuditStmt = db.prepare(
        `INSERT INTO attendance_correction_audits (
          id, session_id, student_user_id, roll_number_snapshot,
          previous_status, new_status, editor_user_id, correction_source, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DAILY_REPORT_ABSENTEE_LIST', ?, ?)`
      );

      const changes: Array<{ rollNumber: string; from: string; to: string }> = [];

      db.transaction(() => {
        for (const entry of entries) {
          const targetStatus = absentSet.has(entry.student_user_id) ? 'ABSENT' : 'PRESENT';
          if (entry.status !== targetStatus) {
            updateEntryStmt.run(targetStatus, req.user!.id, nowIso, entry.id);
            insertAuditStmt.run(
              crypto.randomUUID(),
              sessionId,
              entry.student_user_id,
              entry.roll_number_snapshot,
              entry.status,
              targetStatus,
              req.user!.id,
              reason ? String(reason).slice(0, 300) : 'Direct edit in Day-Wise Attendance Report',
              nowIso
            );
            changes.push({
              rollNumber: entry.roll_number_snapshot,
              from: entry.status,
              to: targetStatus,
            });
          }
        }

        db.prepare(`UPDATE attendance_sessions SET updated_at = ? WHERE id = ?`).run(nowIso, sessionId);
      })();

      if (changes.length > 0) {
        logAuditEvent({
          actorUserId: req.user!.id,
          action: 'DAILY_REPORT_ABSENTEES_EDITED',
          details: {
            sessionId,
            subjectName: session.subject_name,
            changesCount: changes.length,
            changes: changes.slice(0, 25),
          },
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
        });
      }

      return res.json({
        success: true,
        changesCount: changes.length,
        absentCount: absentSet.size,
        presentCount: entries.length - absentSet.size,
        absentShortRolls: parsed.normalizedAbsentShortRolls,
        absentShortRollsText: parsed.normalizedAbsentShortRolls.join(', '),
        message:
          changes.length > 0
            ? `Saved ${changes.length} attendance correction(s) and synchronized period-wise roster.`
            : 'No changes needed — absentee list already matches period-wise records.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error saving absentee corrections.' });
    }
  }
);

// ============================================================================
// 5. ATTENDANCE HISTORY (FACULTY & FOUNDER)
// ============================================================================

attendanceRouter.get(
  '/history',
  requireAuth,
  requireRole(['FACULTY', 'FOUNDER']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const branch = req.query.branch ? String(req.query.branch).trim() : '';
      const section = req.query.section ? String(req.query.section).trim() : '';
      const date = req.query.date ? String(req.query.date).trim() : '';
      const method = req.query.method ? String(req.query.method).trim().toUpperCase() : '';
      const status = req.query.status ? String(req.query.status).trim().toUpperCase() : '';
      const mineOnly = req.query.mineOnly === 'true';

      let sql = `
        SELECT a.*,
               COALESCE(fp.full_name, u.email) as faculty_name,
               (SELECT COUNT(*) FROM attendance_entries e WHERE e.session_id = a.id) as total_students,
               (SELECT COUNT(*) FROM attendance_entries e WHERE e.session_id = a.id AND e.status = 'PRESENT') as present_count,
               (SELECT COUNT(*) FROM attendance_entries e WHERE e.session_id = a.id AND e.status = 'ABSENT') as absent_count,
               (SELECT COUNT(*) FROM attendance_entries e WHERE e.session_id = a.id AND e.status = 'UNMARKED') as unmarked_count
        FROM attendance_sessions a
        JOIN users u ON a.faculty_user_id = u.id
        LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (branch) {
        const normBranch = normalizeBranchLabel(branch);
        sql += ` AND UPPER(a.branch_name_snapshot) = UPPER(?)`;
        params.push(normBranch);
      }
      if (section) {
        sql += ` AND UPPER(a.section) = UPPER(?)`;
        params.push(section);
      }
      if (date) {
        sql += ` AND a.session_date = ?`;
        params.push(date);
      }
      if (method && ['MANUAL', 'QR'].includes(method)) {
        sql += ` AND a.method = ?`;
        params.push(method);
      }
      if (status && ['DRAFT', 'ACTIVE', 'CLOSED', 'SUBMITTED'].includes(status)) {
        sql += ` AND a.status = ?`;
        params.push(status);
      }
      if (mineOnly && req.user!.role === 'FACULTY') {
        sql += ` AND a.faculty_user_id = ?`;
        params.push(req.user!.id);
      }

      sql += ` ORDER BY a.session_date DESC, a.start_time DESC, a.created_at DESC LIMIT 100`;

      const rows = db.prepare(sql).all(...params) as any[];
      const sessions = rows.map((r) => ({
        id: r.id,
        facultyUserId: r.faculty_user_id,
        facultyName: r.faculty_name,
        branch: r.branch_name_snapshot,
        section: r.section,
        sessionDate: r.session_date,
        subjectName: r.subject_name,
        periodNumber: r.period_number,
        startTime: r.start_time,
        endTime: r.end_time,
        method: r.method,
        status: r.status,
        totalStudents: r.total_students || 0,
        presentCount: r.present_count || 0,
        absentCount: r.absent_count || 0,
        unmarkedCount: r.unmarked_count || 0,
        canEdit: req.user!.role === 'FOUNDER' || r.faculty_user_id === req.user!.id,
        createdAt: r.created_at,
        submittedAt: r.submitted_at,
      }));

      return res.json({ sessions });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error loading attendance history.' });
    }
  }
);

// ============================================================================
// 6. STUDENT ATTENDANCE OVERVIEW, ACTIVE QR SESSIONS, & QR SCAN VERIFICATION
// ============================================================================

attendanceRouter.get(
  '/student/overview',
  requireAuth,
  requireRole(['STUDENT']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      const studentId = req.user!.id;
      const profile = db
        .prepare(`SELECT * FROM student_profiles WHERE user_id = ?`)
        .get(studentId) as any;

      if (!profile) {
        return res.status(404).json({ error: 'Student profile not found.' });
      }

      const nowMs = Date.now();

      // Active QR sessions where this student is in the eligible roster snapshot
      // NOTE: Never returns the QR token or QR payload to the student dashboard (Option A)
      const activeSessionsRows = db
        .prepare(
          `SELECT a.id, a.branch_name_snapshot, a.section, a.session_date, a.subject_name,
                  a.period_number, a.start_time, a.end_time, a.qr_expires_at_ms, a.gps_verification_mode,
                  COALESCE(fp.full_name, u.email) as faculty_name,
                  e.status as my_status, e.recorded_at as my_recorded_at
           FROM attendance_sessions a
           JOIN attendance_entries e ON e.session_id = a.id AND e.student_user_id = ?
           JOIN users u ON a.faculty_user_id = u.id
           LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
           WHERE a.method = 'QR'
             AND a.status = 'ACTIVE'
             AND UPPER(a.branch_name_snapshot) = UPPER(?)
             AND UPPER(a.section) = UPPER(?)
             AND a.qr_expires_at_ms > ?
           ORDER BY a.created_at DESC`
        )
        .all(studentId, profile.branch, profile.section, nowMs) as any[];

      const geofence = getGeofenceRow();
      const activeQrSessions = activeSessionsRows.map((s) => ({
        sessionId: s.id,
        branch: s.branch_name_snapshot,
        section: s.section,
        sessionDate: s.session_date,
        subjectName: s.subject_name,
        periodNumber: s.period_number,
        startTime: s.start_time,
        endTime: s.end_time,
        facultyName: s.faculty_name,
        expiresAtMs: s.qr_expires_at_ms,
        remainingSeconds: Math.max(0, Math.ceil((s.qr_expires_at_ms - nowMs) / 1000)),
        myStatus: s.my_status,
        myRecordedAt: s.my_recorded_at,
        gpsEnforcementEnabled: geofence.gps_enforcement_enabled === 1 && geofence.demo_mode_enabled !== 1,
        demoModeEnabled: geofence.demo_mode_enabled === 1,
        campusName: geofence.campus_name,
      }));

      // Student's personal attendance records across submitted sessions
      const historyRows = db
        .prepare(
          `SELECT a.id as session_id, a.session_date, a.subject_name, a.period_number,
                  a.start_time, a.end_time, a.method,
                  COALESCE(fp.full_name, u.email) as faculty_name,
                  e.status, e.source, e.verification_mode, e.updated_at
           FROM attendance_entries e
           JOIN attendance_sessions a ON e.session_id = a.id
           JOIN users u ON a.faculty_user_id = u.id
           LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
           WHERE e.student_user_id = ?
             AND a.status = 'SUBMITTED'
           ORDER BY a.session_date DESC, a.start_time DESC
           LIMIT 100`
        )
        .all(studentId) as any[];

      const totalSessions = historyRows.length;
      const presentCount = historyRows.filter((h) => h.status === 'PRESENT').length;
      const absentCount = historyRows.filter((h) => h.status === 'ABSENT').length;
      const attendancePercentage = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 1000) / 10 : null;

      return res.json({
        activeQrSessions,
        summary: {
          totalSessions,
          presentCount,
          absentCount,
          attendancePercentage,
        },
        history: historyRows.map((h) => ({
          sessionId: h.session_id,
          sessionDate: h.session_date,
          subjectName: h.subject_name,
          periodNumber: h.period_number,
          startTime: h.start_time,
          endTime: h.end_time,
          method: h.method,
          facultyName: h.faculty_name,
          status: h.status,
          source: h.source,
          verificationMode: h.verification_mode,
          updatedAt: h.updated_at,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error loading student attendance overview.' });
    }
  }
);

// Student QR Scan & Server-Side Validation (11 Checks)
attendanceRouter.post(
  '/student/scan-qr',
  requireAuth,
  requireRole(['STUDENT']),
  (req: Request, res: Response) => {
    try {
      syncExpiredQrSessions();

      // 1 & 2. Authenticated student identity & Founder-approved ACTIVE status
      const studentUser = req.user!;
      if (studentUser.role !== 'STUDENT' || studentUser.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Only Founder-approved active students can record QR attendance.' });
      }

      const { qrToken, sessionId: expectedSessionId, location } = req.body || {};
      if (!qrToken || typeof qrToken !== 'string') {
        return res.status(400).json({ error: 'Valid QR token is required.' });
      }

      const profile = db
        .prepare(`SELECT * FROM student_profiles WHERE user_id = ?`)
        .get(studentUser.id) as any;
      if (!profile) {
        return res.status(404).json({ error: 'Student profile not found.' });
      }

      const geofenceRow = getGeofenceRow();

      // Extract session ID from token payload to look up session
      const tokenParts = qrToken.trim().split('.');
      if (tokenParts.length !== 2) {
        return res.status(400).json({ error: 'Malformed QR code.' });
      }

      let decodedSid: string | undefined;
      try {
        const parsedPayload = JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString('utf8'));
        decodedSid = parsedPayload?.sid;
      } catch {
        return res.status(400).json({ error: 'Invalid QR code payload.' });
      }

      const targetSessionId = expectedSessionId || decodedSid;
      if (!targetSessionId) {
        return res.status(400).json({ error: 'Attendance session could not be determined from QR code.' });
      }

      const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(targetSessionId) as any;
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      // 6 & 9. Active QR session & non-expired attendance session
      const nowMs = Date.now();
      if (session.method !== 'QR' || session.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'This QR attendance session is no longer active.' });
      }
      if (!session.qr_expires_at_ms || nowMs > session.qr_expires_at_ms) {
        syncExpiredQrSessions(nowMs);
        return res.status(400).json({ error: 'This attendance session has expired.' });
      }

      // 7 & 8. Verify HMAC-SHA256 rotating QR token & non-expired token window
      const tokenVerification = verifyRotatingQrToken(
        qrToken,
        session.id,
        nowMs,
        session.qr_started_at_ms,
        session.qr_expires_at_ms,
        session.qr_refresh_interval_seconds || 5,
        geofenceRow.qr_signing_secret
      );
      if (!tokenVerification.valid) {
        return res.status(400).json({ error: tokenVerification.error || 'Invalid or expired QR code.' });
      }

      // 3 & 4. Matching branch & section
      if (
        normalizeBranchLabel(profile.branch) !== normalizeBranchLabel(session.branch_name_snapshot) ||
        profile.section.trim().toUpperCase() !== session.section.trim().toUpperCase()
      ) {
        return res.status(403).json({
          error: `Cross-section attendance denied: This session is for ${session.branch_name_snapshot} — Section ${session.section}, but your profile is ${profile.branch} — Section ${profile.section}.`,
        });
      }

      // 5. Student included in the session's eligible roster snapshot
      const rosterEntry = db
        .prepare(`SELECT * FROM attendance_entries WHERE session_id = ? AND student_user_id = ?`)
        .get(session.id, studentUser.id) as any;

      if (!rosterEntry) {
        return res.status(403).json({
          error: 'You are not in the eligible student roster snapshot for this attendance session.',
        });
      }

      // 11. Duplicate scan check (Idempotent Already Recorded response)
      if (rosterEntry.status === 'PRESENT') {
        return res.status(200).json({
          success: true,
          alreadyRecorded: true,
          status: 'PRESENT',
          subjectName: session.subject_name,
          recordedAt: rosterEntry.recorded_at,
          message: 'Your attendance has already been recorded as PRESENT for this session.',
        });
      }

      // 10. Campus GPS location verification (or explicit Founder Demo Mode)
      const geofenceConfig: GeofenceConfigState = {
        campusName: geofenceRow.campus_name,
        latitude: geofenceRow.latitude,
        longitude: geofenceRow.longitude,
        radiusMeters: geofenceRow.radius_meters,
        accuracyToleranceMeters: geofenceRow.accuracy_tolerance_meters,
        maxAllowedAccuracyMeters: geofenceRow.max_allowed_accuracy_meters,
        gpsEnforcementEnabled: geofenceRow.gps_enforcement_enabled === 1,
        demoModeEnabled: geofenceRow.demo_mode_enabled === 1,
      };

      const gpsCheck = validateCampusGps(geofenceConfig, location, nowMs);
      if (!gpsCheck.allowed) {
        return res.status(403).json({
          error: gpsCheck.error,
          distanceMeters: gpsCheck.distanceMeters,
          gpsFailure: true,
        });
      }

      // Mark student PRESENT atomically
      const nowIso = new Date(nowMs).toISOString();
      db.prepare(
        `UPDATE attendance_entries
         SET status = 'PRESENT',
             source = 'QR',
             verification_mode = ?,
             distance_meters = ?,
             marked_by_user_id = ?,
             recorded_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        gpsCheck.verificationMode,
        gpsCheck.distanceMeters ?? null,
        studentUser.id,
        nowIso,
        nowIso,
        rosterEntry.id
      );

      return res.json({
        success: true,
        alreadyRecorded: false,
        status: 'PRESENT',
        subjectName: session.subject_name,
        verificationMode: gpsCheck.verificationMode,
        distanceMeters: gpsCheck.distanceMeters ?? null,
        recordedAt: nowIso,
        message:
          gpsCheck.verificationMode === 'DEMO_MODE'
            ? `Attendance marked PRESENT for ${session.subject_name} (Founder Demo Mode — GPS enforcement OFF).`
            : `Attendance marked PRESENT for ${session.subject_name}.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error processing QR attendance scan.' });
    }
  }
);
