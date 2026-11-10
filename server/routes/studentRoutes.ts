import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { hashPassword, verifyPassword, createSession } from '../services/authService';
import { validateRollNumber, verifyOtp, hasRecentlyVerifiedOtp, createVerificationGrant, validateAndConsumeGrant } from '../services/otpService';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadAvatarMiddleware, validateImageMagicBytes, saveAvatarFile } from '../middleware/upload';
import { logAuditEvent } from '../services/auditService';

export const studentRouter = Router();

// Student Registration
studentRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { fullName, rollNumber, branch, section, email, password, confirmPassword, verificationGrant, otp, profilePhoto } = req.body;

    // Validate required fields
    if (!fullName || !rollNumber || !branch || !section || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid university email address.' });
    }

    // Roll number validation
    const rollCheck = validateRollNumber(rollNumber);
    if (!rollCheck.valid) {
      return res.status(400).json({ error: rollCheck.error });
    }
    const normalizedRoll = rollCheck.normalized;

    // Determine verification grant to validate
    let grantToValidate = verificationGrant;
    if (!grantToValidate && otp) {
      // If OTP was submitted directly without prior verify-otp call
      const otpCheck = verifyOtp(normalizedEmail, otp, 'STUDENT_REGISTRATION');
      if (!otpCheck.valid) {
        return res.status(400).json({ error: otpCheck.error });
      }
      const issued = createVerificationGrant(normalizedEmail, 'STUDENT_REGISTRATION');
      grantToValidate = issued.grantToken;
    }

    if (!grantToValidate) {
      return res.status(400).json({ error: 'Email verification is required before registration.' });
    }

    // Check duplicate email
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email address is already registered.' });
    }

    // Check duplicate roll number
    const existingRoll = db.prepare('SELECT id FROM student_profiles WHERE roll_number = ?').get(normalizedRoll);
    if (existingRoll) {
      return res.status(409).json({ error: `Roll number ${normalizedRoll} is already registered to an existing student.` });
    }

    // Hash password
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Process optional profile photo
    let photoUrl: string | null = null;
    if (profilePhoto && typeof profilePhoto === 'string' && profilePhoto.startsWith('data:image/')) {
      try {
        const base64Data = profilePhoto.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const magic = validateImageMagicBytes(buffer);
        if (magic.valid) {
          photoUrl = saveAvatarFile(userId, buffer, magic.ext);
        }
      } catch {
        // Optional profile photo error is non-fatal
      }
    }

    // Execute transaction to ensure atomic registration and grant consumption
    const registerTx = db.transaction(() => {
      // 1. Validate and consume the verification grant atomically
      const grantResult = validateAndConsumeGrant(grantToValidate, normalizedEmail, 'STUDENT_REGISTRATION');
      if (!grantResult.valid) {
        throw new Error(grantResult.error || 'Invalid verification grant.');
      }

      // 2. Insert user
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', 1, ?, ?)
      `).run(userId, normalizedEmail, passwordHash, now, now);

      // 3. Insert student profile
      db.prepare(`
        INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, profile_photo_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(profileId, userId, fullName.trim(), normalizedRoll, branch.trim().toUpperCase(), section.trim().toUpperCase(), photoUrl, now, now);
    });

    registerTx();

    // Create session and set cookie
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const sessionId = createSession(userId, ip, userAgent);

    const isHttps = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('attendx_session', sessionId, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logAuditEvent({
      actorUserId: userId,
      action: 'STUDENT_REGISTERED',
      targetUserId: userId,
      details: { rollNumber: normalizedRoll, email: normalizedEmail, branch, section },
      ipAddress: ip,
    });

    return res.status(201).json({
      success: true,
      message: 'Student registration completed successfully.',
      user: {
        id: userId,
        email: normalizedEmail,
        role: 'STUDENT',
        status: 'ACTIVE',
        is_email_verified: 1,
        student_profile: {
          id: profileId,
          full_name: fullName.trim(),
          roll_number: normalizedRoll,
          branch: branch.trim().toUpperCase(),
          section: section.trim().toUpperCase(),
          profile_photo_url: photoUrl,
        },
      },
      sessionId,
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      if (err.message.includes('roll_number')) {
        return res.status(409).json({ error: 'Roll number is already registered.' });
      }
      if (err.message.includes('email')) {
        return res.status(409).json({ error: 'Email address is already registered.' });
      }
    }
    if (err.message && (err.message.includes('verification') || err.message.includes('grant') || err.message.includes('Verification'))) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Error completing registration.' });
  }
});

// Get Student Profile
studentRouter.get('/me', requireAuth, requireRole(['STUDENT']), (req: Request, res: Response) => {
  const profile = db.prepare(`
    SELECT sp.*, u.email, u.is_email_verified, u.status, u.created_at as account_created_at
    FROM student_profiles sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.user_id = ?
  `).get(req.user!.id);

  if (!profile) {
    return res.status(404).json({ error: 'Student profile not found.' });
  }

  return res.json({ profile });
});

// Update Permitted Student Details
studentRouter.patch('/me', requireAuth, requireRole(['STUDENT']), (req: Request, res: Response) => {
  try {
    const { fullName, bio, phone, roll_number, rollNumber, role, status, is_email_verified } = req.body;

    // Explicitly reject immutable fields
    if (roll_number !== undefined || rollNumber !== undefined) {
      return res.status(403).json({ error: 'Students are not permitted to change their roll number.' });
    }
    if (role !== undefined || status !== undefined || is_email_verified !== undefined) {
      return res.status(403).json({ error: 'Modifying account roles, statuses or verification is prohibited.' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (fullName !== undefined) {
      if (!fullName.trim()) {
        return res.status(400).json({ error: 'Full name cannot be empty.' });
      }
      updates.push('full_name = ?');
      values.push(fullName.trim());
    }

    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio ? bio.trim() : null);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone ? phone.trim() : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid editable fields provided.' });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(req.user!.id);

    db.prepare(`
      UPDATE student_profiles
      SET ${updates.join(', ')}
      WHERE user_id = ?
    `).run(...values);

    logAuditEvent({
      actorUserId: req.user!.id,
      action: 'STUDENT_PROFILE_UPDATED',
      targetUserId: req.user!.id,
      details: { updatedFields: updates },
    });

    const updated = db.prepare(`
      SELECT sp.*, u.email, u.is_email_verified, u.status
      FROM student_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.user_id = ?
    `).get(req.user!.id);

    return res.json({ success: true, profile: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error updating student profile.' });
  }
});

// Upload Student Profile Photo
studentRouter.post('/me/avatar', requireAuth, requireRole(['STUDENT']), (req: Request, res: Response) => {
  uploadAvatarMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Image upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const magic = validateImageMagicBytes(req.file.buffer);
    if (!magic.valid) {
      return res.status(400).json({ error: 'Corrupt or invalid image file. Only genuine JPEG, PNG, and WebP images are allowed.' });
    }

    const photoUrl = saveAvatarFile(req.user!.id, req.file.buffer, magic.ext);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE student_profiles
      SET profile_photo_url = ?, updated_at = ?
      WHERE user_id = ?
    `).run(photoUrl, now, req.user!.id);

    return res.json({
      success: true,
      profile_photo_url: photoUrl,
      message: 'Profile photograph uploaded successfully.',
    });
  });
});

// Change Password
studentRouter.post('/me/change-password', requireAuth, requireRole(['STUDENT']), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `).run(newHash, now, req.user!.id);

    logAuditEvent({
      actorUserId: req.user!.id,
      action: 'PASSWORD_CHANGED',
      targetUserId: req.user!.id,
    });

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error changing password.' });
  }
});
