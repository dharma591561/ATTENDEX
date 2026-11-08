import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { hashPassword, verifyPassword, createSession, invalidateSession, invalidateAllUserSessions, getSessionUser } from '../services/authService';
import { generateAndStoreOtp, verifyOtp, hasRecentlyVerifiedOtp } from '../services/otpService';
import { sendOtpEmail, isSmtpConfigured, verifySmtpConnection } from '../services/emailService';
import { logAuditEvent } from '../services/auditService';

export const authRouter = Router();

// Check SMTP Configuration Status (Helpful for users & admins)
authRouter.get('/smtp-status', async (_req: Request, res: Response) => {
  const isConfigured = isSmtpConfigured();
  if (!isConfigured) {
    return res.json({
      configured: false,
      message: 'SMTP is not configured in .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS required).',
    });
  }
  const check = await verifySmtpConnection();
  return res.json({
    configured: check.ok,
    message: check.message,
  });
});

// Request an Email OTP
authRouter.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, purpose } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email format.' });
    }

    const validPurposes = ['STUDENT_REGISTRATION', 'FACULTY_REGISTRATION', 'PASSWORD_RESET'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({ error: 'Invalid OTP purpose specified.' });
    }

    // If registering, check if email is already taken
    if (purpose === 'STUDENT_REGISTRATION' || purpose === 'FACULTY_REGISTRATION') {
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ error: 'An account with this email address already exists.' });
      }
    }

    // If password reset, check if user exists
    if (purpose === 'PASSWORD_RESET') {
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (!existingUser) {
        // Safe generic response without leaking enumeration, but don't attempt email
        return res.json({
          success: true,
          message: 'If an account exists with this email, a verification code has been sent.',
        });
      }
    }

    // Generate OTP
    const otpResult = generateAndStoreOtp(normalizedEmail, purpose);
    if (!otpResult.success) {
      return res.status(429).json({
        error: otpResult.error,
        cooldownRemaining: otpResult.cooldownRemaining,
      });
    }

    // Send email via real SMTP
    try {
      await sendOtpEmail(normalizedEmail, otpResult.otp!, purpose);
    } catch (mailError: any) {
      return res.status(503).json({
        error: `Email delivery failed: ${mailError.message || 'SMTP service unavailable'}. Please verify SMTP settings in .env.`,
      });
    }

    // Success - Never return OTP in response
    return res.json({
      success: true,
      message: 'Verification code sent to your email address.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error while sending OTP.' });
  }
});

// Verify an Email OTP
authRouter.post('/verify-otp', (req: Request, res: Response) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!email || !otp || !purpose) {
      return res.status(400).json({ error: 'Email, OTP, and purpose are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = verifyOtp(normalizedEmail, otp, purpose);

    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      message: 'Email verified successfully.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error verifying OTP.' });
  }
});

// User Login (Student, Faculty, Founder)
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, expectedRole } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare(`
      SELECT id, email, password_hash, role, status, is_email_verified, created_at
      FROM users WHERE email = ?
    `).get(normalizedEmail) as any;

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Enforce role separation if specified
    if (expectedRole && user.role !== expectedRole) {
      return res.status(403).json({
        error: `Access denied. This portal is for ${expectedRole.toLowerCase()} accounts.`,
      });
    }

    // Check account status for faculty
    if (user.role === 'FACULTY') {
      if (user.status === 'PENDING') {
        return res.status(403).json({
          error: 'Your faculty application is currently pending administrator approval.',
          status: 'PENDING',
          userId: user.id,
        });
      }
      if (user.status === 'REJECTED') {
        const app = db.prepare('SELECT rejection_reason FROM faculty_applications WHERE user_id = ?').get(user.id) as any;
        return res.status(403).json({
          error: `Your faculty application has been rejected.${app?.rejection_reason ? ` Reason: ${app.rejection_reason}` : ''}`,
          status: 'REJECTED',
        });
      }
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact administrator support.',
        status: 'SUSPENDED',
      });
    }

    // Create session
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const sessionId = createSession(user.id, ip, userAgent);

    // Set HTTP-only Cookie
    res.cookie('attendx_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Audit log founder login
    if (user.role === 'FOUNDER') {
      logAuditEvent({
        actorUserId: user.id,
        action: 'FOUNDER_LOGIN',
        targetUserId: user.id,
        details: { email: user.email },
        ipAddress: ip,
      });
    }

    const fullUser = getSessionUser(sessionId);

    return res.json({
      success: true,
      user: fullUser,
      sessionId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error during login.' });
  }
});

// Logout
authRouter.post('/logout', (req: Request, res: Response) => {
  if (req.sessionId) {
    invalidateSession(req.sessionId);
  }
  res.clearCookie('attendx_session');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Current User Profile / Session Check
authRouter.get('/me', (req: Request, res: Response) => {
  let sessionId = req.cookies?.attendx_session;
  if (!sessionId && req.headers.authorization?.startsWith('Bearer ')) {
    sessionId = req.headers.authorization.slice(7).trim();
  }

  if (!sessionId) {
    return res.json({ user: null });
  }

  const user = getSessionUser(sessionId);
  return res.json({ user: user || null });
});

// Reset Password with OTP
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify OTP
    const verification = verifyOtp(normalizedEmail, otp, 'PASSWORD_RESET');
    if (!verification.valid) {
      return res.status(400).json({ error: verification.error });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: string } | undefined;
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, now, user.id);

    // Invalidate all existing sessions for security
    invalidateAllUserSessions(user.id);

    logAuditEvent({
      actorUserId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      targetUserId: user.id,
      details: { email: normalizedEmail },
    });

    return res.json({
      success: true,
      message: 'Password has been successfully reset. Please log in with your new password.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error resetting password.' });
  }
});
