import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
}

// Clean up expired sessions periodically
export function cleanExpiredSessions() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}
