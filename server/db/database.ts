import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { OFFICIAL_BRANCHES_SEED, ALLOWED_SECTION_VALUES, parseBranchSectionInput } from '../services/attendanceLogic';

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'attendx.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Checkpoint any existing WAL frames into the main database file and use DELETE journal mode
// with FULL synchronous durability so every transaction is immediately committed to ./data/attendx.db on disk.
try {
  db.pragma('wal_checkpoint(TRUNCATE)');
} catch {
  // Ignore if not in WAL mode
}
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT', 'FACULTY', 'FOUNDER')),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED')),
      is_email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Enforce STRICT single founder constraint at the database level
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_single_founder ON users(role) WHERE role = 'FOUNDER';
  `);

  // 2. Student Profiles
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      roll_number TEXT UNIQUE NOT NULL COLLATE NOCASE,
      branch TEXT NOT NULL,
      section TEXT NOT NULL,
      profile_photo_url TEXT,
      bio TEXT,
      phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 2b. Student Applications (Additive migration preserving existing ACTIVE student accounts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      roll_number TEXT UNIQUE NOT NULL COLLATE NOCASE,
      branch TEXT NOT NULL,
      section TEXT NOT NULL,
      profile_photo_url TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      rejection_reason TEXT,
      reviewed_by_user_id TEXT REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Backward-compatible backfill: ensure any pre-existing student in student_profiles has a matching student_applications record
  db.exec(`
    INSERT OR IGNORE INTO student_applications (
      id, user_id, full_name, roll_number, branch, section, profile_photo_url, status, created_at, updated_at
    )
    SELECT
      sp.id, sp.user_id, sp.full_name, sp.roll_number, sp.branch, sp.section, sp.profile_photo_url,
      CASE
        WHEN u.status = 'ACTIVE' THEN 'APPROVED'
        WHEN u.status = 'REJECTED' THEN 'REJECTED'
        ELSE 'PENDING'
      END,
      sp.created_at, sp.updated_at
    FROM student_profiles sp
    JOIN users u ON sp.user_id = u.id
    WHERE NOT EXISTS (
      SELECT 1 FROM student_applications sa WHERE sa.user_id = sp.user_id
    );
  `);

  // 3. Faculty Profiles
  db.exec(`
    CREATE TABLE IF NOT EXISTS faculty_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      profile_photo_url TEXT,
      bio TEXT,
      phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 4. Faculty Applications
  db.exec(`
    CREATE TABLE IF NOT EXISTS faculty_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      rejection_reason TEXT,
      reviewed_by_user_id TEXT REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 5. Email Verification OTPs
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE,
      otp_hash TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('STUDENT_REGISTRATION', 'FACULTY_REGISTRATION', 'PASSWORD_RESET')),
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON email_verification_otps(email, purpose);
  `);

  // 6. Password Reset Tokens
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pwd_reset_token ON password_reset_tokens(token_hash);
  `);

  // 7. Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_session_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_session_expiry ON sessions(expires_at);
  `);

  // 8. Administrative Audit Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target_user_id TEXT REFERENCES users(id),
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // 9. Email Verification Grants (issued upon OTP verification, consumed atomically at registration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_grants (
      id TEXT PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      purpose TEXT NOT NULL CHECK(purpose IN ('STUDENT_REGISTRATION', 'FACULTY_REGISTRATION', 'PASSWORD_RESET')),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_grants_email_purpose ON email_verification_grants(email, purpose);
    CREATE INDEX IF NOT EXISTS idx_grants_token_hash ON email_verification_grants(token_hash);
  `);

  // ============================================================================
  // PHASE 2 ADDITIVE MIGRATIONS: ACADEMIC CONFIGURATION, GEOFENCE, & ATTENDANCE
  // ============================================================================

  // 10. Official Academic Branches (stable internal IDs, mutable display names)
  db.exec(`
    CREATE TABLE IF NOT EXISTS academic_branches (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 11. Official Branch-Section Configurations (sections 1, 2, 3 per branch)
  db.exec(`
    CREATE TABLE IF NOT EXISTS academic_branch_sections (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL REFERENCES academic_branches(id) ON DELETE RESTRICT,
      section TEXT NOT NULL CHECK(section IN ('1', '2', '3')),
      is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(branch_id, section)
    );
    CREATE INDEX IF NOT EXISTS idx_branch_sections_branch ON academic_branch_sections(branch_id);
  `);

  // Seed the 10 official branches and their sections (1, 2, 3) idempotently
  const nowIso = new Date().toISOString();
  const insertBranchStmt = db.prepare(`
    INSERT OR IGNORE INTO academic_branches (id, code, name, display_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);
  const insertSectionStmt = db.prepare(`
    INSERT OR IGNORE INTO academic_branch_sections (id, branch_id, section, is_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedAcademicTx = db.transaction(() => {
    for (const b of OFFICIAL_BRANCHES_SEED) {
      insertBranchStmt.run(b.id, b.code, b.name, b.displayOrder, nowIso, nowIso);
      const existingBranch = db.prepare('SELECT id FROM academic_branches WHERE code = ? OR name = ?').get(b.code, b.name) as { id: string } | undefined;
      const targetBranchId = existingBranch?.id || b.id;

      for (const sec of ALLOWED_SECTION_VALUES) {
        const isEnabled = b.defaultEnabledSections.includes(sec) ? 1 : 0;
        const secId = `${targetBranchId}-sec-${sec}`;
        insertSectionStmt.run(secId, targetBranchId, sec, isEnabled, nowIso, nowIso);
      }
    }
  });
  seedAcademicTx();

  // Safe, unambiguous normalization for existing student records that explicitly stored combined strings like "CSE-2" or "CSE(AI&ML)-1"
  // Never overwrites ambiguous records (such as branch="CSE", section="A")
  const existingProfiles = db.prepare('SELECT id, user_id, branch, section FROM student_profiles').all() as Array<{
    id: string;
    user_id: string;
    branch: string;
    section: string;
  }>;

  const normalizeExistingTx = db.transaction(() => {
    for (const prof of existingProfiles) {
      // Only normalize if the branch string itself explicitly contains "-1", "-2", or "-3" (e.g. "CSE-2", "CSE(AI&ML)-1")
      // or if branch is "CSE(AI&ML)" with an already numeric section "1"/"2"/"3"
      const hasCombinedSuffix = /^(.*?)\s*-\s*([123])$/.test((prof.branch || '').trim());
      if (hasCombinedSuffix) {
        const parsed = parseBranchSectionInput(prof.branch, '');
        if (parsed.unambiguousNewStandard) {
          db.prepare('UPDATE student_profiles SET branch = ?, section = ?, updated_at = ? WHERE id = ?').run(
            parsed.branch,
            parsed.section,
            nowIso,
            prof.id
          );
          db.prepare('UPDATE student_applications SET branch = ?, section = ?, updated_at = ? WHERE user_id = ?').run(
            parsed.branch,
            parsed.section,
            nowIso,
            prof.user_id
          );
        }
      }
    }
  });
  normalizeExistingTx();

  // 12. Campus Geofence & Demo Mode Settings (Singleton row id = 'default')
  db.exec(`
    CREATE TABLE IF NOT EXISTS geofence_settings (
      id TEXT PRIMARY KEY CHECK(id = 'default'),
      campus_name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      radius_meters INTEGER NOT NULL DEFAULT 300,
      accuracy_tolerance_meters INTEGER NOT NULL DEFAULT 75,
      max_allowed_accuracy_meters INTEGER NOT NULL DEFAULT 350,
      gps_enforcement_enabled INTEGER NOT NULL DEFAULT 1,
      demo_mode_enabled INTEGER NOT NULL DEFAULT 0,
      qr_signing_secret TEXT NOT NULL,
      updated_by_user_id TEXT REFERENCES users(id),
      updated_at TEXT NOT NULL
    );
  `);

  const defaultSecret = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT OR IGNORE INTO geofence_settings (
      id, campus_name, latitude, longitude, radius_meters,
      accuracy_tolerance_meters, max_allowed_accuracy_meters,
      gps_enforcement_enabled, demo_mode_enabled, qr_signing_secret, updated_at
    ) VALUES (
      'default',
      'Gayatri Vidya Parishad Institute of Higher Learning and Research, North Campus, Kommadi, Visakhapatnam, Andhra Pradesh',
      NULL,
      NULL,
      300,
      75,
      350,
      1,
      0,
      ?,
      ?
    )
  `).run(defaultSecret, nowIso);

  // 13. Shared Attendance Sessions (Manual & Dynamic QR)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      faculty_user_id TEXT NOT NULL REFERENCES users(id),
      branch_id TEXT NOT NULL REFERENCES academic_branches(id),
      branch_name_snapshot TEXT NOT NULL,
      section TEXT NOT NULL,
      session_date TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      period_number TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('MANUAL', 'QR')),
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'SUBMITTED')),
      qr_duration_minutes INTEGER,
      qr_refresh_interval_seconds INTEGER,
      qr_started_at_ms INTEGER,
      qr_expires_at_ms INTEGER,
      gps_verification_mode TEXT,
      submitted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_att_sessions_branch_sec_date ON attendance_sessions(branch_id, section, session_date);
    CREATE INDEX IF NOT EXISTS idx_att_sessions_faculty_date ON attendance_sessions(faculty_user_id, session_date);
    CREATE INDEX IF NOT EXISTS idx_att_sessions_status_method ON attendance_sessions(status, method);
  `);

  // 14. Shared Attendance Entries (One entry per student per session, roster snapshot)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_user_id TEXT NOT NULL REFERENCES users(id),
      student_profile_id TEXT NOT NULL REFERENCES student_profiles(id),
      roll_number_snapshot TEXT NOT NULL,
      short_roll_snapshot TEXT NOT NULL,
      full_name_snapshot TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT', 'UNMARKED')),
      source TEXT NOT NULL CHECK(source IN ('ROSTER_INIT', 'MANUAL', 'QR', 'CORRECTION')),
      verification_mode TEXT,
      distance_meters INTEGER,
      marked_by_user_id TEXT REFERENCES users(id),
      recorded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(session_id, student_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_att_entries_session_status ON attendance_entries(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_att_entries_student ON attendance_entries(student_user_id, recorded_at);
  `);

  // 15. Attendance Correction Audit Trail
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_correction_audits (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_user_id TEXT NOT NULL REFERENCES users(id),
      roll_number_snapshot TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      editor_user_id TEXT NOT NULL REFERENCES users(id),
      correction_source TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_att_corr_session ON attendance_correction_audits(session_id, created_at);
  `);
}

// Clean up expired sessions periodically
export function cleanExpiredSessions() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}

