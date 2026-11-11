import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { hashPassword, verifyPassword, createSession } from '../services/authService';
import { validateRollNumber, verifyOtp, hasRecentlyVerifiedOtp, createVerificationGrant, validateAndConsumeGrant } from '../services/otpService';
import { requireAuth, requireRole, setSessionCookie } from '../middleware/auth';
import { uploadAvatarMiddleware, validateImageMagicBytes, saveAvatarFile } from '../middleware/upload';
import { logAuditEvent } from '../services/auditService';

export const studentRouter = Router();

// Student Registration / Application Submission
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

    // Roll number validation (no hardcoded range or branch restriction)
    const rollCheck = validateRollNumber(rollNumber);
    if (!rollCheck.valid) {
      return res.status(400).json({ error: rollCheck.error });
    }
    const normalizedRoll = rollCheck.normalized;

    const normalizedBranch = branch.trim().toUpperCase();
    const normalizedSection = section.trim().toUpperCase();
    if (!normalizedBranch || !normalizedSection) {
      return res.status(400).json({ error: 'Branch and section are required.' });
    }

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

    // Check duplicate email (active, pending, or rejected)
    const existingEmail = db.prepare('SELECT id, status FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (existingEmail) {
      return res.status(409).json({
        error: existingEmail.status === 'PENDING'
          ? 'A student application with this email address is already pending approval.'
          : 'An account with this email address is already registered.',
      });
    }

    // Check duplicate roll number (active, pending, or rejected)
    const existingRoll = db.prepare(`
      SELECT id FROM student_profiles WHERE roll_number = ?
      UNION
      SELECT id FROM student_applications WHERE roll_number = ?
    `).get(normalizedRoll, normalizedRoll);
    if (existingRoll) {
      return res.status(409).json({
        error: `Roll number ${normalizedRoll} is already registered or has a pending application.`,
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const applicationId = crypto.randomUUID();
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

    // Execute transaction to ensure atomic application creation and grant consumption
    const registerTx = db.transaction(() => {
      // 1. Validate and consume the verification grant atomically
      const grantResult = validateAndConsumeGrant(grantToValidate, normalizedEmail, 'STUDENT_REGISTRATION');
      if (!grantResult.valid) {
        throw new Error(grantResult.error || 'Invalid verification grant.');
      }

      // 2. Insert user with PENDING status (requires Founder approval before activation)
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
        VALUES (?, ?, ?, 'STUDENT', 'PENDING', 1, ?, ?)
      `).run(userId, normalizedEmail, passwordHash, now, now);

      // 3. Insert student profile
      db.prepare(`
        INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, profile_photo_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(profileId, userId, fullName.trim(), normalizedRoll, normalizedBranch, normalizedSection, photoUrl, now, now);

      // 4. Insert student application record with PENDING status
      db.prepare(`
        INSERT INTO student_applications (id, user_id, full_name, roll_number, branch, section, profile_photo_url, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(applicationId, userId, fullName.trim(), normalizedRoll, normalizedBranch, normalizedSection, photoUrl, now, now);
    });

    registerTx();

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: userId,
      action: 'STUDENT_APPLICATION_SUBMITTED',
      targetUserId: userId,
      details: { applicationId, rollNumber: normalizedRoll, email: normalizedEmail, branch: normalizedBranch, section: normalizedSection },
      ipAddress: ip,
    });

    return res.status(201).json({
      success: true,
      status: 'PENDING',
      message: 'Your student application has been submitted successfully and is awaiting administrator approval.',
      application: {
        id: applicationId,
        user_id: userId,
        full_name: fullName.trim(),
        roll_number: normalizedRoll,
        branch: normalizedBranch,
        section: normalizedSection,
        email: normalizedEmail,
        status: 'PENDING',
        profile_photo_url: photoUrl,
        created_at: now,
      },
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

// Check Student Application Status (Protected against unrestricted email-only enumeration)
async function handleStudentApplicationStatus(req: Request, res: Response) {
  try {
    const rawEmail = (req.body?.email || req.query?.email || '') as string;
    const rawRollNumber = (req.body?.rollNumber || req.query?.rollNumber || '') as string;
    const rawPassword = (req.body?.password || '') as string;

    const email = rawEmail.trim().toLowerCase();
    const rollNumber = rawRollNumber.trim().toUpperCase();

    if (!email) {
      return res.status(400).json({ error: 'University email address is required.' });
    }

    // Protect personal application information: require either Roll Number or Password verification
    if (!rollNumber && !rawPassword) {
      return res.status(400).json({
        error: 'Academic roll number or account password is required along with your email to verify your identity.',
      });
    }

    const record = db.prepare(`
      SELECT sa.id, sa.user_id, sa.full_name, sa.roll_number, sa.branch, sa.section,
             sa.status, sa.rejection_reason, sa.created_at, sa.reviewed_at,
             u.email, u.password_hash, u.status as account_status
      FROM student_applications sa
      JOIN users u ON sa.user_id = u.id
      WHERE u.email = ?
    `).get(email) as any;

    if (!record) {
      return res.status(404).json({ error: 'No student application found matching the provided credentials.' });
    }

    // Verify roll number if provided
    if (rollNumber && record.roll_number.toUpperCase() !== rollNumber) {
      return res.status(403).json({
        error: 'Verification failed. The provided roll number does not match this email address.',
      });
    }

    // Verify password if provided
    if (rawPassword) {
      const validPassword = await verifyPassword(rawPassword, record.password_hash);
      if (!validPassword) {
        return res.status(403).json({
          error: 'Verification failed. Incorrect password for this student application.',
        });
      }
    }

    const effectiveStatus = record.account_status === 'ACTIVE' ? 'APPROVED' : record.status;

    return res.json({
      application: {
        id: record.id,
        full_name: record.full_name,
        roll_number: record.roll_number,
        branch: record.branch,
        section: record.section,
        email: record.email,
        status: effectiveStatus,
        rejection_reason: record.rejection_reason,
        created_at: record.created_at,
        reviewed_at: record.reviewed_at,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error checking student application status.' });
  }
}

studentRouter.post('/application-status', handleStudentApplicationStatus);
studentRouter.get('/application-status', handleStudentApplicationStatus);

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
