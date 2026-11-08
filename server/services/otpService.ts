import crypto from 'crypto';
import { db } from '../db/database';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

// Hash OTP with salt for secure storage
function hashOtp(otp: string, email: string): string {
  const salt = process.env.SESSION_SECRET || 'attendx_otp_default_salt';
  return crypto.createHmac('sha256', salt).update(`${email.toLowerCase()}:${otp}`).digest('hex');
}

/**
 * Validates roll number format and roster range.
 * Format: ^26UECSE\d{4}$
 * Initial roster range: 26UECSE0121 through 26UECSE0243 inclusive.
 */
export function validateRollNumber(raw: string): { valid: boolean; normalized: string; error?: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, normalized: '', error: 'Roll number is required' };
  }

  const normalized = raw.trim().toUpperCase();
  const formatRegex = /^26UECSE\d{4}$/;

  if (!formatRegex.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Invalid roll number format. Must start with 26UECSE followed by exactly 4 digits (e.g., 26UECSE0220).',
    };
  }

  const suffixStr = normalized.substring(7); // the 4 digits
  const suffixNum = parseInt(suffixStr, 10);

  if (suffixNum < 121 || suffixNum > 243) {
    return {
      valid: false,
      normalized,
      error: `Roll number ${normalized} is outside the permitted initial roster range (26UECSE0121 to 26UECSE0243 inclusive).`,
    };
  }

  return { valid: true, normalized };
}

export interface OtpGenerationResult {
  success: boolean;
  otp?: string;
  cooldownRemaining?: number;
  error?: string;
}

export function generateAndStoreOtp(email: string, purpose: 'STUDENT_REGISTRATION' | 'FACULTY_REGISTRATION' | 'PASSWORD_RESET'): OtpGenerationResult {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  // 1. Check rate limit in window
  const recentRequests = db.prepare(`
    SELECT COUNT(*) as count FROM email_verification_otps
    WHERE email = ? AND created_at > ?
  `).get(normalizedEmail, now - RATE_LIMIT_WINDOW_MS) as { count: number };

  if (recentRequests && recentRequests.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      success: false,
      error: 'Too many OTP requests for this email. Please wait 15 minutes before trying again.',
    };
  }

  // 2. Check 60-second cooldown from the most recent OTP
  const latestOtp = db.prepare(`
    SELECT created_at FROM email_verification_otps
    WHERE email = ? AND purpose = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail, purpose) as { created_at: number } | undefined;

  if (latestOtp) {
    const elapsed = now - latestOtp.created_at;
    if (elapsed < RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        success: false,
        cooldownRemaining: remainingSeconds,
        error: `Please wait ${remainingSeconds} seconds before requesting a new verification code.`,
      };
    }
  }

  // 3. Invalidate any existing unused OTPs for this email and purpose
  db.prepare(`
    UPDATE email_verification_otps
    SET used_at = ?
    WHERE email = ? AND purpose = ? AND used_at IS NULL
  `).run(now, normalizedEmail, purpose);

  // 4. Generate cryptographically secure 6-digit numeric OTP
  const numericOtp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(numericOtp, normalizedEmail);
  const id = crypto.randomUUID();
  const expiresAt = now + OTP_EXPIRY_MS;

  db.prepare(`
    INSERT INTO email_verification_otps (id, email, otp_hash, purpose, attempts, expires_at, created_at, used_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, NULL)
  `).run(id, normalizedEmail, otpHash, purpose, expiresAt, now);

  return {
    success: true,
    otp: numericOtp,
  };
}

export interface OtpVerificationResult {
  valid: boolean;
  error?: string;
}

export function verifyOtp(email: string, otp: string, purpose: 'STUDENT_REGISTRATION' | 'FACULTY_REGISTRATION' | 'PASSWORD_RESET'): OtpVerificationResult {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedOtp = (otp || '').trim();
  const now = Date.now();

  if (!trimmedOtp || trimmedOtp.length !== 6) {
    return { valid: false, error: 'Verification code must be 6 digits.' };
  }

  const record = db.prepare(`
    SELECT id, otp_hash, attempts, expires_at, used_at
    FROM email_verification_otps
    WHERE email = ? AND purpose = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(normalizedEmail, purpose) as { id: string; otp_hash: string; attempts: number; expires_at: number; used_at: number | null } | undefined;

  if (!record) {
    return { valid: false, error: 'No verification code found. Please request a new code.' };
  }

  if (record.used_at !== null) {
    return { valid: false, error: 'This verification code has already been used. Please request a new one.' };
  }

  if (now > record.expires_at) {
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { valid: false, error: 'Maximum verification attempts exceeded. Please request a new code.' };
  }

  // Increment attempt counter
  db.prepare(`
    UPDATE email_verification_otps
    SET attempts = attempts + 1
    WHERE id = ?
  `).run(record.id);

  const incomingHash = hashOtp(trimmedOtp, normalizedEmail);
  if (incomingHash !== record.otp_hash) {
    const remaining = MAX_ATTEMPTS - (record.attempts + 1);
    return {
      valid: false,
      error: remaining > 0
        ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
        : 'Incorrect verification code. Maximum attempts reached. Please request a new code.',
    };
  }

  // Mark as used
  db.prepare(`
    UPDATE email_verification_otps
    SET used_at = ?
    WHERE id = ?
  `).run(now, record.id);

  return { valid: true };
}

/**
 * Check if the email was successfully verified within the last 15 minutes
 */
export function hasRecentlyVerifiedOtp(email: string, purpose: 'STUDENT_REGISTRATION' | 'FACULTY_REGISTRATION' | 'PASSWORD_RESET'): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;

  const verified = db.prepare(`
    SELECT id FROM email_verification_otps
    WHERE email = ? AND purpose = ? AND used_at IS NOT NULL AND used_at > ?
    ORDER BY used_at DESC LIMIT 1
  `).get(normalizedEmail, purpose, fifteenMinutesAgo);

  return Boolean(verified);
}
