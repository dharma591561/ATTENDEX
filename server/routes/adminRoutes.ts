import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAuditEvent, getAuditLogs } from '../services/auditService';
import { invalidateAllUserSessions } from '../services/authService';

export const adminRouter = Router();

// Protect ALL admin routes with FOUNDER role check
adminRouter.use(requireAuth, requireRole(['FOUNDER']));

// 1. Overview Statistics
adminRouter.get('/overview', (_req: Request, res: Response) => {
  try {
    const totalStudents = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE'").get() as any).count;
    const totalStudentApplications = (db.prepare("SELECT COUNT(*) as count FROM student_applications").get() as any).count;
    const pendingStudentApplications = (db.prepare("SELECT COUNT(*) as count FROM student_applications WHERE status = 'PENDING'").get() as any).count;
    const approvedStudents = (db.prepare("SELECT COUNT(*) as count FROM student_applications WHERE status = 'APPROVED'").get() as any).count;
    const rejectedStudents = (db.prepare("SELECT COUNT(*) as count FROM student_applications WHERE status = 'REJECTED'").get() as any).count;

    const totalFacultyApplications = (db.prepare("SELECT COUNT(*) as count FROM faculty_applications").get() as any).count;
    const pendingFacultyApplications = (db.prepare("SELECT COUNT(*) as count FROM faculty_applications WHERE status = 'PENDING'").get() as any).count;
    const approvedFaculty = (db.prepare("SELECT COUNT(*) as count FROM faculty_applications WHERE status = 'APPROVED'").get() as any).count;
    const rejectedFaculty = (db.prepare("SELECT COUNT(*) as count FROM faculty_applications WHERE status = 'REJECTED'").get() as any).count;

    const recentAuditLogs = db.prepare(`
      SELECT a.*, u.email as actor_email 
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 6
    `).all();

    return res.json({
      stats: {
        totalStudents,
        totalStudentApplications,
        pendingStudentApplications,
        approvedStudents,
        rejectedStudents,
        totalFacultyApplications,
        pendingFacultyApplications,
        approvedFaculty,
        rejectedFaculty,
      },
      recentAuditLogs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching admin overview.' });
  }
});

// 2. Student Directory & Search
adminRouter.get('/students', (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const branch = ((req.query.branch as string) || '').trim();
    const section = ((req.query.section as string) || '').trim();
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    let query = `
      SELECT sp.*, u.email, u.status, u.is_email_verified, u.created_at as account_created_at
      FROM student_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      query += ` AND (sp.full_name LIKE ? OR sp.roll_number LIKE ? OR u.email LIKE ? OR sp.branch LIKE ? OR sp.section LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (branch) {
      query += ` AND sp.branch = ?`;
      params.push(branch.toUpperCase());
    }

    if (section) {
      query += ` AND sp.section = ?`;
      params.push(section.toUpperCase());
    }

    query += ` ORDER BY sp.roll_number ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const students = db.prepare(query).all(...params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM student_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE 1=1
      ${search ? ' AND (sp.full_name LIKE ? OR sp.roll_number LIKE ? OR u.email LIKE ? OR sp.branch LIKE ? OR sp.section LIKE ?)' : ''}
      ${branch ? ' AND sp.branch = ?' : ''}
      ${section ? ' AND sp.section = ?' : ''}
    `;
    const countParams: any[] = [];
    if (search) {
      const term = `%${search}%`;
      countParams.push(term, term, term, term, term);
    }
    if (branch) countParams.push(branch.toUpperCase());
    if (section) countParams.push(section.toUpperCase());

    const totalCount = (db.prepare(countQuery).get(...countParams) as any).total;

    return res.json({
      students,
      total: totalCount,
      limit,
      offset,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error querying students.' });
  }
});

// 2b. Student Applications List, Filter & Search
adminRouter.get('/student-applications', (req: Request, res: Response) => {
  try {
    const status = ((req.query.status as string) || 'ALL').toUpperCase();
    const search = ((req.query.search as string) || '').trim();
    const branch = ((req.query.branch as string) || '').trim();
    const section = ((req.query.section as string) || '').trim();

    let query = `
      SELECT sa.*, u.email, u.is_email_verified, u.status as account_status,
             reviewer.email as reviewer_email
      FROM student_applications sa
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN users reviewer ON sa.reviewed_by_user_id = reviewer.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status !== 'ALL') {
      query += ` AND sa.status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (sa.full_name LIKE ? OR sa.roll_number LIKE ? OR u.email LIKE ? OR sa.branch LIKE ? OR sa.section LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (branch) {
      query += ` AND sa.branch = ?`;
      params.push(branch.toUpperCase());
    }

    if (section) {
      query += ` AND sa.section = ?`;
      params.push(section.toUpperCase());
    }

    query += ` ORDER BY sa.created_at DESC`;

    const applications = db.prepare(query).all(...params);
    return res.json({ applications });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching student applications.' });
  }
});

// 2c. Approve Student Application
adminRouter.post('/student-applications/:id/approve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const application = db.prepare(`
      SELECT * FROM student_applications WHERE id = ? OR user_id = ?
    `).get(id, id) as any;

    if (!application) {
      return res.status(404).json({ error: 'Student application not found.' });
    }

    if (application.status === 'APPROVED') {
      return res.status(400).json({ error: 'Student application is already approved.' });
    }

    const now = new Date().toISOString();
    const reviewerId = req.user!.id;

    const approveTx = db.transaction(() => {
      const current = db.prepare('SELECT status FROM student_applications WHERE id = ?').get(application.id) as any;
      if (!current || current.status === 'APPROVED') {
        throw new Error('ALREADY_APPROVED');
      }

      const updateRes = db.prepare(`
        UPDATE student_applications
        SET status = 'APPROVED', rejection_reason = NULL, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status != 'APPROVED'
      `).run(reviewerId, now, now, application.id);

      if (updateRes.changes === 0) {
        throw new Error('ALREADY_APPROVED');
      }

      db.prepare(`
        UPDATE users
        SET status = 'ACTIVE', updated_at = ?
        WHERE id = ?
      `).run(now, application.user_id);
    });

    approveTx();

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: reviewerId,
      action: 'STUDENT_APPLICATION_APPROVED',
      targetUserId: application.user_id,
      details: {
        applicationId: application.id,
        fullName: application.full_name,
        rollNumber: application.roll_number,
        branch: application.branch,
        section: application.section,
      },
      ipAddress: ip,
    });

    return res.json({
      success: true,
      message: `Student application for ${application.full_name} (${application.roll_number}) has been approved. The student may now log in.`,
    });
  } catch (err: any) {
    if (err.message === 'ALREADY_APPROVED') {
      return res.status(400).json({ error: 'Student application is already approved.' });
    }
    return res.status(500).json({ error: err.message || 'Error approving student application.' });
  }
});

// 2d. Reject Student Application
adminRouter.post('/student-applications/:id/reject', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const application = db.prepare(`
      SELECT * FROM student_applications WHERE id = ? OR user_id = ?
    `).get(id, id) as any;

    if (!application) {
      return res.status(404).json({ error: 'Student application not found.' });
    }

    if (application.status === 'APPROVED') {
      return res.status(400).json({
        error: 'Approved student applications cannot be rejected. Use the Student Directory to suspend an active student account if needed.',
      });
    }

    if (application.status === 'REJECTED') {
      return res.status(400).json({ error: 'Student application is already rejected.' });
    }

    const now = new Date().toISOString();
    const reviewerId = req.user!.id;
    const rejectionReason = ((reason || '').trim() || 'Student application did not meet enrollment verification criteria.').slice(0, 500);

    const rejectTx = db.transaction(() => {
      const current = db.prepare('SELECT status FROM student_applications WHERE id = ?').get(application.id) as any;
      if (!current || current.status === 'APPROVED') {
        throw new Error('CANNOT_REJECT_APPROVED');
      }
      if (current.status === 'REJECTED') {
        throw new Error('ALREADY_REJECTED');
      }

      const updateRes = db.prepare(`
        UPDATE student_applications
        SET status = 'REJECTED', rejection_reason = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'PENDING'
      `).run(rejectionReason, reviewerId, now, now, application.id);

      if (updateRes.changes === 0) {
        throw new Error('INVALID_STATE_TRANSITION');
      }

      db.prepare(`
        UPDATE users
        SET status = 'REJECTED', updated_at = ?
        WHERE id = ? AND status != 'ACTIVE'
      `).run(now, application.user_id);
    });

    rejectTx();

    // Invalidate any potential sessions
    invalidateAllUserSessions(application.user_id);

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: reviewerId,
      action: 'STUDENT_APPLICATION_REJECTED',
      targetUserId: application.user_id,
      details: {
        applicationId: application.id,
        fullName: application.full_name,
        rollNumber: application.roll_number,
        reason: rejectionReason,
      },
      ipAddress: ip,
    });

    return res.json({
      success: true,
      message: `Student application for ${application.full_name} (${application.roll_number}) was rejected.`,
    });
  } catch (err: any) {
    if (err.message === 'CANNOT_REJECT_APPROVED') {
      return res.status(400).json({
        error: 'Approved student applications cannot be rejected. Use the Student Directory to suspend an active student account if needed.',
      });
    }
    if (err.message === 'ALREADY_REJECTED' || err.message === 'INVALID_STATE_TRANSITION') {
      return res.status(400).json({ error: 'Student application cannot be rejected from its current state.' });
    }
    return res.status(500).json({ error: err.message || 'Error rejecting student application.' });
  }
});

// 3. Faculty Applications List
adminRouter.get('/faculty-applications', (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string || 'ALL').toUpperCase();

    let query = `
      SELECT fa.*, u.email, u.is_email_verified, u.status as account_status,
             reviewer.email as reviewer_email
      FROM faculty_applications fa
      JOIN users u ON fa.user_id = u.id
      LEFT JOIN users reviewer ON fa.reviewed_by_user_id = reviewer.id
    `;
    const params: any[] = [];

    if (status !== 'ALL') {
      query += ` WHERE fa.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY fa.created_at DESC`;

    const applications = db.prepare(query).all(...params);
    return res.json({ applications });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching faculty applications.' });
  }
});

// 4. Approve Faculty Application
adminRouter.post('/faculty-applications/:id/approve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const application = db.prepare(`
      SELECT * FROM faculty_applications WHERE id = ?
    `).get(id) as any;

    if (!application) {
      return res.status(404).json({ error: 'Faculty application not found.' });
    }

    if (application.status === 'APPROVED') {
      return res.status(400).json({ error: 'Application is already approved.' });
    }

    const now = new Date().toISOString();
    const reviewerId = req.user!.id;

    // Database transaction to update application and user account status
    const approveTx = db.transaction(() => {
      const current = db.prepare('SELECT status FROM faculty_applications WHERE id = ?').get(id) as any;
      if (!current || current.status === 'APPROVED') {
        throw new Error('ALREADY_APPROVED');
      }

      // Update application
      const updateRes = db.prepare(`
        UPDATE faculty_applications
        SET status = 'APPROVED', reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status != 'APPROVED'
      `).run(reviewerId, now, now, id);

      if (updateRes.changes === 0) {
        throw new Error('ALREADY_APPROVED');
      }

      // Update user account to ACTIVE
      db.prepare(`
        UPDATE users
        SET status = 'ACTIVE', updated_at = ?
        WHERE id = ?
      `).run(now, application.user_id);
    });

    approveTx();

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: reviewerId,
      action: 'FACULTY_APPLICATION_APPROVED',
      targetUserId: application.user_id,
      details: { applicationId: id, fullName: application.full_name, department: application.department },
      ipAddress: ip,
    });

    return res.json({
      success: true,
      message: `Faculty application for ${application.full_name} has been approved. The professor may now log in.`,
    });
  } catch (err: any) {
    if (err.message === 'ALREADY_APPROVED') {
      return res.status(400).json({ error: 'Application is already approved.' });
    }
    return res.status(500).json({ error: err.message || 'Error approving application.' });
  }
});

// 5. Reject Faculty Application
adminRouter.post('/faculty-applications/:id/reject', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const application = db.prepare(`
      SELECT * FROM faculty_applications WHERE id = ?
    `).get(id) as any;

    if (!application) {
      return res.status(404).json({ error: 'Faculty application not found.' });
    }

    if (application.status === 'APPROVED') {
      return res.status(400).json({ error: 'Approved faculty applications cannot be rejected.' });
    }

    if (application.status === 'REJECTED') {
      return res.status(400).json({ error: 'Faculty application is already rejected.' });
    }

    const now = new Date().toISOString();
    const reviewerId = req.user!.id;
    const rejectionReason = ((reason || '').trim() || 'Application did not meet departmental verification criteria.').slice(0, 500);

    const rejectTx = db.transaction(() => {
      const current = db.prepare('SELECT status FROM faculty_applications WHERE id = ?').get(id) as any;
      if (!current || current.status === 'APPROVED') {
        throw new Error('CANNOT_REJECT_APPROVED');
      }
      if (current.status === 'REJECTED') {
        throw new Error('ALREADY_REJECTED');
      }

      const updateRes = db.prepare(`
        UPDATE faculty_applications
        SET status = 'REJECTED', rejection_reason = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'PENDING'
      `).run(rejectionReason, reviewerId, now, now, id);

      if (updateRes.changes === 0) {
        throw new Error('INVALID_STATE_TRANSITION');
      }

      db.prepare(`
        UPDATE users
        SET status = 'REJECTED', updated_at = ?
        WHERE id = ? AND status != 'ACTIVE'
      `).run(now, application.user_id);
    });

    rejectTx();

    // Invalidate any potential sessions
    invalidateAllUserSessions(application.user_id);

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: reviewerId,
      action: 'FACULTY_APPLICATION_REJECTED',
      targetUserId: application.user_id,
      details: { applicationId: id, fullName: application.full_name, reason: rejectionReason },
      ipAddress: ip,
    });

    return res.json({
      success: true,
      message: `Faculty application for ${application.full_name} was rejected.`,
    });
  } catch (err: any) {
    if (err.message === 'CANNOT_REJECT_APPROVED') {
      return res.status(400).json({ error: 'Approved faculty applications cannot be rejected.' });
    }
    if (err.message === 'ALREADY_REJECTED' || err.message === 'INVALID_STATE_TRANSITION') {
      return res.status(400).json({ error: 'Faculty application cannot be rejected from its current state.' });
    }
    return res.status(500).json({ error: err.message || 'Error rejecting application.' });
  }
});

// 6. Manage User Status (Suspend / Reactivate)
adminRouter.patch('/users/:id/status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
    }

    const targetUser = db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').get(id) as any;
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (targetUser.role === 'FOUNDER') {
      return res.status(403).json({ error: 'The founder account cannot be suspended or modified.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);

    if (status === 'SUSPENDED') {
      invalidateAllUserSessions(id);
    }

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    logAuditEvent({
      actorUserId: req.user!.id,
      action: 'USER_STATUS_CHANGED',
      targetUserId: id,
      details: { previousStatus: targetUser.status, newStatus: status, email: targetUser.email },
      ipAddress: ip,
    });

    return res.json({
      success: true,
      message: `User status changed to ${status}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error changing user status.' });
  }
});

// 7. Audit Logs
adminRouter.get('/audit-logs', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const logs = getAuditLogs(limit, offset);
    const total = (db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as any).count;

    return res.json({ logs, total, limit, offset });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching audit logs.' });
  }
});
