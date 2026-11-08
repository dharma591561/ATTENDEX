import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { hashPassword, verifyPassword } from '../services/authService';
import { verifyOtp, hasRecentlyVerifiedOtp } from '../services/otpService';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadAvatarMiddleware, validateImageMagicBytes, saveAvatarFile } from '../middleware/upload';
import { logAuditEvent } from '../services/auditService';

export const facultyRouter = Router();

// Submit Faculty Application
facultyRouter.post('/applications', async (req: Request, res: Response) => {
  try {
    const { fullName, department, designation, email, password, confirmPassword, otp } = req.body;

    if (!fullName || !department || !designation || !email || !password || !confirmPassword) {
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
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Verify OTP
    if (otp) {
      const otpCheck = verifyOtp(normalizedEmail, otp, 'FACULTY_REGISTRATION');
      if (!otpCheck.valid) {
        return res.status(400).json({ error: otpCheck.error });
      }
    } else {
      const recentlyVerified = hasRecentlyVerifiedOtp(normalizedEmail, 'FACULTY_REGISTRATION');
      if (!recentlyVerified) {
        return res.status(400).json({ error: 'Email verification is required before application submission.' });
      }
    }

    // Check duplicate email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const applicationId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const now = new Date().toISOString();

    const applicationTx = db.transaction(() => {
      // 1. Insert user with PENDING status and FACULTY role
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'FACULTY', 'PENDING', 1, ?, ?)
      `).run(userId, normalizedEmail, passwordHash, now, now);

      // 2. Insert application record
      db.prepare(`
        INSERT INTO faculty_applications (id, user_id, full_name, department, designation, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(applicationId, userId, fullName.trim(), department.trim(), designation.trim(), now, now);

      // 3. Insert initial profile
      db.prepare(`
        INSERT INTO faculty_profiles (id, user_id, full_name, department, designation, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(profileId, userId, fullName.trim(), department.trim(), designation.trim(), now, now);
    });

    applicationTx();

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: userId,
      action: 'FACULTY_APPLICATION_SUBMITTED',
      targetUserId: userId,
      details: { email: normalizedEmail, department, designation },
      ipAddress: ip,
    });

    return res.status(201).json({
      success: true,
      status: 'PENDING',
      message: 'Faculty application submitted successfully. Your credentials are saved, but login will only be enabled after administrator approval.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error submitting faculty application.' });
  }
});

// Check Faculty Application Status
facultyRouter.get('/application-status', (req: Request, res: Response) => {
  const email = (req.query.email as string || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required.' });
  }

  const application = db.prepare(`
    SELECT fa.id, fa.full_name, fa.department, fa.designation, fa.status, 
           fa.rejection_reason, fa.created_at, fa.reviewed_at, u.email
    FROM faculty_applications fa
    JOIN users u ON fa.user_id = u.id
    WHERE u.email = ?
  `).get(email);

  if (!application) {
    return res.status(404).json({ error: 'No faculty application found for this email address.' });
  }

  return res.json({ application });
});

// Get Faculty Profile (Approved Only)
facultyRouter.get('/me', requireAuth, requireRole(['FACULTY']), (req: Request, res: Response) => {
  const profile = db.prepare(`
    SELECT fp.*, u.email, u.status, u.is_email_verified, u.created_at as account_created_at
    FROM faculty_profiles fp
    JOIN users u ON fp.user_id = u.id
    WHERE fp.user_id = ?
  `).get(req.user!.id);

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found.' });
  }

  return res.json({ profile });
});

// Update Permitted Faculty Profile Details
facultyRouter.patch('/me', requireAuth, requireRole(['FACULTY']), (req: Request, res: Response) => {
  try {
    const { fullName, department, designation, bio, phone, role, status, is_email_verified } = req.body;

    // Reject privilege escalation or status manipulation
    if (role !== undefined || status !== undefined || is_email_verified !== undefined) {
      return res.status(403).json({ error: 'Modifying account roles, statuses or verification is prohibited.' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (fullName !== undefined) {
      if (!fullName.trim()) return res.status(400).json({ error: 'Full name cannot be empty.' });
      updates.push('full_name = ?');
      values.push(fullName.trim());
    }

    if (department !== undefined) {
      updates.push('department = ?');
      values.push(department.trim());
    }

    if (designation !== undefined) {
      updates.push('designation = ?');
      values.push(designation.trim());
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
      return res.status(400).json({ error: 'No editable fields provided.' });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(req.user!.id);

    db.prepare(`
      UPDATE faculty_profiles
      SET ${updates.join(', ')}
      WHERE user_id = ?
    `).run(...values);

    logAuditEvent({
      actorUserId: req.user!.id,
      action: 'FACULTY_PROFILE_UPDATED',
      targetUserId: req.user!.id,
      details: { updatedFields: updates },
    });

    const updated = db.prepare(`
      SELECT fp.*, u.email, u.status, u.is_email_verified
      FROM faculty_profiles fp
      JOIN users u ON fp.user_id = u.id
      WHERE fp.user_id = ?
    `).get(req.user!.id);

    return res.json({ success: true, profile: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error updating faculty profile.' });
  }
});

// Upload Faculty Profile Photo
facultyRouter.post('/me/avatar', requireAuth, requireRole(['FACULTY']), (req: Request, res: Response) => {
  uploadAvatarMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Image upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const magic = validateImageMagicBytes(req.file.buffer);
    if (!magic.valid) {
      return res.status(400).json({ error: 'Invalid image file. Only JPEG, PNG, and WebP are allowed.' });
    }

    const photoUrl = saveAvatarFile(req.user!.id, req.file.buffer, magic.ext);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE faculty_profiles
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
facultyRouter.post('/me/change-password', requireAuth, requireRole(['FACULTY']), async (req: Request, res: Response) => {
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

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, req.user!.id);

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
