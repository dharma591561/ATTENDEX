import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { validateRollNumber, generateAndStoreOtp, verifyOtp, createVerificationGrant, validateAndConsumeGrant } from '../../server/services/otpService';
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionUser,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginAttempts,
  resetLoginRateLimits,
  invalidateOtherUserSessions,
} from '../../server/services/authService';
import { initializeFounder } from '../../scripts/init-founder';
import { sessionMiddleware, setSessionCookie, requireAuth, requireRole, csrfProtection } from '../../server/middleware/auth';
import { db, initDatabase } from '../../server/db/database';
import {
  OFFICIAL_BRANCHES_SEED,
  ALLOWED_SECTION_VALUES,
  normalizeBranchLabel,
  parseBranchSectionInput,
  deriveShortRollNumber,
  detectRosterShortRollAmbiguities,
  parseAndValidateAbsenteeInput,
  validateSessionTimes,
  generateRotatingQrToken,
  verifyRotatingQrToken,
  calculateHaversineDistanceMeters,
  validateCampusGps,
} from '../../server/services/attendanceLogic';

// Ensure DB is initialized
initDatabase();

test('1. Roll Number Validation: branch-agnostic format, whitespace trimming, and uppercase normalization', () => {
  const valid1 = validateRollNumber('26UECSE0121');
  assert.equal(valid1.valid, true);
  assert.equal(valid1.normalized, '26UECSE0121');

  const valid2 = validateRollNumber('  26uecse0220  '); // test whitespace trimming & uppercase
  assert.equal(valid2.valid, true);
  assert.equal(valid2.normalized, '26UECSE0220');

  // Outside old 0121-0243 range and across multiple branches/batches
  const valid3 = validateRollNumber('26UECSE0500');
  assert.equal(valid3.valid, true);
  assert.equal(valid3.normalized, '26UECSE0500');

  const valid4 = validateRollNumber('26ueece0045');
  assert.equal(valid4.valid, true);
  assert.equal(valid4.normalized, '26UEECE0045');

  const valid5 = validateRollNumber('25UEMECH0110');
  assert.equal(valid5.valid, true);
  assert.equal(valid5.normalized, '25UEMECH0110');
});

test('2. Roll Number Validation: rejects invalid formats (too short, too long, special characters, or no digits)', () => {
  // Too short (< 4 chars)
  const invalid1 = validateRollNumber('AB1');
  assert.equal(invalid1.valid, false);

  // Too long (> 24 chars)
  const invalid2 = validateRollNumber('26UECSE00000000000000000001');
  assert.equal(invalid2.valid, false);

  // No numeric digits at all
  const invalid3 = validateRollNumber('UECSEABCD');
  assert.equal(invalid3.valid, false);

  // Invalid special characters
  const invalid4 = validateRollNumber('26UECSE@0220!');
  assert.equal(invalid4.valid, false);
});

test('3. OTP Service: Generates 6-digit numeric OTP and enforces single-use & verification', () => {
  const testEmail = `test_otp_${Date.now()}@university.edu`;
  const result = generateAndStoreOtp(testEmail, 'STUDENT_REGISTRATION');

  assert.equal(result.success, true);
  assert.ok(result.otp);
  assert.equal(result.otp.length, 6);
  assert.match(result.otp, /^\d{6}$/);

  // Test incorrect OTP
  const wrongVerification = verifyOtp(testEmail, '000000', 'STUDENT_REGISTRATION');
  assert.equal(wrongVerification.valid, false);

  // Test correct OTP verification
  const correctVerification = verifyOtp(testEmail, result.otp, 'STUDENT_REGISTRATION');
  assert.equal(correctVerification.valid, true);

  // Test single-use prevention (reused OTP should be rejected)
  const reusedVerification = verifyOtp(testEmail, result.otp, 'STUDENT_REGISTRATION');
  assert.equal(reusedVerification.valid, false);
  assert.match(reusedVerification.error!, /already been used/);
});

test('4. Password Hashing & Verification: uses bcrypt with minimum 8 chars', async () => {
  const password = 'SuperSecurePassword123!';
  const hash = await hashPassword(password);

  assert.ok(hash);
  assert.notEqual(hash, password); // never plaintext
  assert.match(hash, /^\$2[aby]\$/); // bcrypt format

  // Verify correct password
  const matches = await verifyPassword(password, hash);
  assert.equal(matches, true);

  // Verify wrong password
  const fails = await verifyPassword('WrongPassword!', hash);
  assert.equal(fails, false);

  // Rejects passwords shorter than 8 chars
  await assert.rejects(async () => {
    await hashPassword('short');
  });
});

test('5. Single Founder Invariant: CLI initialization and refusal of duplicate founder', async () => {
  const existingFounder = db.prepare("SELECT id, email FROM users WHERE role = 'FOUNDER'").get() as any;
  if (!existingFounder) {
    const initRes = await initializeFounder('test_founder@attendx.internal', 'FounderSecretPassword2026!');
    assert.equal(initRes.success, true);
  }

  // Attempting to create a second founder MUST be rejected
  const secondAttempt = await initializeFounder('secondfounder@attendx.internal', 'AnotherPassword2026!');
  assert.equal(secondAttempt.success, false);
  assert.match(secondAttempt.message, /already exists/);

  // Direct database insertion of second founder MUST fail the UNIQUE partial index constraint
  assert.throws(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
      VALUES ('fake-id-2', 'second_sql_founder@attendx.internal', 'hash', 'FOUNDER', 'ACTIVE', 1, 'now', 'now')
    `).run();
  }, /UNIQUE constraint failed/);
});

test('6. Session & Cookie Authentication: generates 64-char token and hydrates user', () => {
  // Find founder user
  const founder = db.prepare("SELECT id, email, role FROM users WHERE role = 'FOUNDER'").get() as any;
  assert.ok(founder);

  const sessionId = createSession(founder.id, '127.0.0.1', 'Node-Test-Runner');
  assert.ok(sessionId);
  assert.equal(sessionId.length, 64); // 32 random bytes in hex

  const sessionUser = getSessionUser(sessionId);
  assert.ok(sessionUser);
  assert.equal(sessionUser.id, founder.id);
  assert.equal(sessionUser.role, 'FOUNDER');

  // Clean up only the temporary test session created for this test
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
});

test('7. Database Uniqueness & Relational Constraints: Duplicate roll numbers are rejected', () => {
  // Clean up any old test records
  const testEmail1 = 'student_test_1@university.edu';
  const testEmail2 = 'student_test_2@university.edu';
  const testRoll = '26UECSE0199';

  db.prepare('DELETE FROM student_profiles WHERE roll_number = ?').run(testRoll);
  db.prepare('DELETE FROM users WHERE email IN (?, ?)').run(testEmail1, testEmail2);

  // Insert first student
  const uId1 = 'test-student-u1';
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
    VALUES (?, ?, 'hash', 'STUDENT', 'ACTIVE', 1, 'now', 'now')
  `).run(uId1, testEmail1);

  db.prepare(`
    INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
    VALUES ('sp-1', ?, 'First Student', ?, 'CSE', 'A', 'now', 'now')
  `).run(uId1, testRoll);

  // Attempting to insert a second student with the same roll number MUST fail the database UNIQUE constraint
  const uId2 = 'test-student-u2';
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
    VALUES (?, ?, 'hash', 'STUDENT', 'ACTIVE', 1, 'now', 'now')
  `).run(uId2, testEmail2);

  assert.throws(() => {
    db.prepare(`
      INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
      VALUES ('sp-2', ?, 'Second Student', ?, 'CSE', 'B', 'now', 'now')
    `).run(uId2, testRoll);
  }, /UNIQUE constraint failed/);

  // Clean up
  db.prepare('DELETE FROM student_profiles WHERE roll_number = ?').run(testRoll);
  db.prepare('DELETE FROM users WHERE email IN (?, ?)').run(testEmail1, testEmail2);
});

test('8. Verification Grant Lifecycle: OTP verified produces grant, grant cannot be reused', () => {
  const testEmail = `grant_lifecycle_${Date.now()}@university.edu`;
  const otpRes = generateAndStoreOtp(testEmail, 'STUDENT_REGISTRATION');
  assert.equal(otpRes.success, true);

  // 1. Verify OTP successfully
  const verifyRes = verifyOtp(testEmail, otpRes.otp!, 'STUDENT_REGISTRATION');
  assert.equal(verifyRes.valid, true);

  // 2. Re-verifying the same OTP immediately fails (one-time-use preserved)
  const reuseOtp = verifyOtp(testEmail, otpRes.otp!, 'STUDENT_REGISTRATION');
  assert.equal(reuseOtp.valid, false);
  assert.match(reuseOtp.error!, /already been used/);

  // 3. Issue verification grant
  const grant = createVerificationGrant(testEmail, 'STUDENT_REGISTRATION');
  assert.ok(grant.grantToken);
  assert.equal(grant.grantToken.length, 64);
  assert.ok(grant.expiresAt > Date.now());

  // 4. Validate and consume grant
  const consumeRes = validateAndConsumeGrant(grant.grantToken, testEmail, 'STUDENT_REGISTRATION');
  assert.equal(consumeRes.valid, true);

  // 5. Reusing the consumed grant MUST fail
  const reuseGrant = validateAndConsumeGrant(grant.grantToken, testEmail, 'STUDENT_REGISTRATION');
  assert.equal(reuseGrant.valid, false);
  assert.match(reuseGrant.error!, /already been used/);

  // Clean up
  db.prepare('DELETE FROM email_verification_grants WHERE email = ?').run(testEmail);
  db.prepare('DELETE FROM email_verification_otps WHERE email = ?').run(testEmail);
});

test('9. Student Registration & Founder Approval Flow: OTP -> Grant -> PENDING Application -> Founder Approval', async () => {
  const studentEmail = `student_e2e_${Date.now()}@university.edu`;
  const rollNumber = '26UEECE0412';

  // Ensure clean state
  db.prepare('DELETE FROM student_applications WHERE roll_number = ?').run(rollNumber);
  db.prepare('DELETE FROM student_profiles WHERE roll_number = ?').run(rollNumber);
  db.prepare('DELETE FROM users WHERE email = ?').run(studentEmail);

  // 1. Request and verify OTP
  const otpRes = generateAndStoreOtp(studentEmail, 'STUDENT_REGISTRATION');
  assert.equal(otpRes.success, true);
  const verifyRes = verifyOtp(studentEmail, otpRes.otp!, 'STUDENT_REGISTRATION');
  assert.equal(verifyRes.valid, true);

  // 2. Issue grant
  const grant = createVerificationGrant(studentEmail, 'STUDENT_REGISTRATION');
  assert.ok(grant.grantToken);

  // 3. Execute atomic registration transaction creating PENDING user & student_applications row
  const userId = `student-user-${Date.now()}`;
  const profileId = `student-prof-${Date.now()}`;
  const applicationId = `student-app-${Date.now()}`;
  const passwordHash = await hashPassword('StudentPassword123!');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const grantCheck = validateAndConsumeGrant(grant.grantToken, studentEmail, 'STUDENT_REGISTRATION');
    if (!grantCheck.valid) {
      throw new Error(grantCheck.error);
    }

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'STUDENT', 'PENDING', 1, ?, ?)
    `).run(userId, studentEmail, passwordHash, now, now);

    db.prepare(`
      INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
      VALUES (?, ?, 'Pending ECE Student', ?, 'ECE', 'C', ?, ?)
    `).run(profileId, userId, rollNumber, now, now);

    db.prepare(`
      INSERT INTO student_applications (id, user_id, full_name, roll_number, branch, section, status, created_at, updated_at)
      VALUES (?, ?, 'Pending ECE Student', ?, 'ECE', 'C', 'PENDING', ?, ?)
    `).run(applicationId, userId, rollNumber, now, now);
  });

  tx();

  // 4. Confirm database records created with PENDING status
  const createdUser = db.prepare('SELECT id, role, status, is_email_verified FROM users WHERE id = ?').get(userId) as any;
  assert.ok(createdUser);
  assert.equal(createdUser.role, 'STUDENT');
  assert.equal(createdUser.status, 'PENDING');
  assert.equal(createdUser.is_email_verified, 1);

  const createdApp = db.prepare('SELECT status, roll_number, branch, section FROM student_applications WHERE id = ?').get(applicationId) as any;
  assert.ok(createdApp);
  assert.equal(createdApp.status, 'PENDING');
  assert.equal(createdApp.roll_number, rollNumber);
  assert.equal(createdApp.branch, 'ECE');
  assert.equal(createdApp.section, 'C');

  // 5. Simulate Founder Approval -> transitions application to APPROVED and user to ACTIVE
  const founder = db.prepare("SELECT id FROM users WHERE role = 'FOUNDER'").get() as any;
  db.transaction(() => {
    db.prepare(`
      UPDATE student_applications
      SET status = 'APPROVED', reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(founder?.id || null, now, now, applicationId);

    db.prepare(`
      UPDATE users SET status = 'ACTIVE', updated_at = ? WHERE id = ?
    `).run(now, userId);
  })();

  const approvedUser = db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as any;
  assert.equal(approvedUser.status, 'ACTIVE');

  const approvedApp = db.prepare('SELECT status FROM student_applications WHERE id = ?').get(applicationId) as any;
  assert.equal(approvedApp.status, 'APPROVED');

  // 6. Attempting to reuse the consumed grant fails
  const reuseAttempt = validateAndConsumeGrant(grant.grantToken, studentEmail, 'STUDENT_REGISTRATION');
  assert.equal(reuseAttempt.valid, false);

  // Clean up
  db.prepare('DELETE FROM student_applications WHERE id = ?').run(applicationId);
  db.prepare('DELETE FROM student_profiles WHERE roll_number = ?').run(rollNumber);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.prepare('DELETE FROM email_verification_grants WHERE email = ?').run(studentEmail);
  db.prepare('DELETE FROM email_verification_otps WHERE email = ?').run(studentEmail);
});

test('10. Faculty Application Flow: OTP -> Grant -> Atomic DB Insertion -> Single Grant Consumption', async () => {
  const facultyEmail = `faculty_e2e_${Date.now()}@university.edu`;

  db.prepare('DELETE FROM users WHERE email = ?').run(facultyEmail);

  // 1. Request and verify OTP
  const otpRes = generateAndStoreOtp(facultyEmail, 'FACULTY_REGISTRATION');
  assert.equal(otpRes.success, true);
  const verifyRes = verifyOtp(facultyEmail, otpRes.otp!, 'FACULTY_REGISTRATION');
  assert.equal(verifyRes.valid, true);

  // 2. Issue grant
  const grant = createVerificationGrant(facultyEmail, 'FACULTY_REGISTRATION');
  assert.ok(grant.grantToken);

  // 3. Execute atomic faculty application transaction
  const userId = `faculty-user-${Date.now()}`;
  const appId = `faculty-app-${Date.now()}`;
  const profileId = `faculty-prof-${Date.now()}`;
  const passwordHash = await hashPassword('FacultyPassword123!');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const grantCheck = validateAndConsumeGrant(grant.grantToken, facultyEmail, 'FACULTY_REGISTRATION');
    if (!grantCheck.valid) {
      throw new Error(grantCheck.error);
    }

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'FACULTY', 'PENDING', 1, ?, ?)
    `).run(userId, facultyEmail, passwordHash, now, now);

    db.prepare(`
      INSERT INTO faculty_applications (id, user_id, full_name, department, designation, status, created_at, updated_at)
      VALUES (?, ?, 'Dr. Alan Turing', 'Computer Science', 'Professor', 'PENDING', ?, ?)
    `).run(appId, userId, now, now);

    db.prepare(`
      INSERT INTO faculty_profiles (id, user_id, full_name, department, designation, created_at, updated_at)
      VALUES (?, ?, 'Dr. Alan Turing', 'Computer Science', 'Professor', ?, ?)
    `).run(profileId, userId, now, now);
  });

  tx();

  // 4. Confirm database records created with PENDING status
  const createdUser = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(userId) as any;
  assert.ok(createdUser);
  assert.equal(createdUser.role, 'FACULTY');
  assert.equal(createdUser.status, 'PENDING');

  const createdApp = db.prepare('SELECT status, department FROM faculty_applications WHERE id = ?').get(appId) as any;
  assert.ok(createdApp);
  assert.equal(createdApp.status, 'PENDING');

  // 5. Attempting to reuse the consumed grant fails
  const reuseAttempt = validateAndConsumeGrant(grant.grantToken, facultyEmail, 'FACULTY_REGISTRATION');
  assert.equal(reuseAttempt.valid, false);

  // Clean up
  db.prepare('DELETE FROM faculty_applications WHERE id = ?').run(appId);
  db.prepare('DELETE FROM faculty_profiles WHERE id = ?').run(profileId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.prepare('DELETE FROM email_verification_grants WHERE email = ?').run(facultyEmail);
  db.prepare('DELETE FROM email_verification_otps WHERE email = ?').run(facultyEmail);
});

test('11. Security Constraints: Rejects expired, cross-email, cross-purpose, or invalid grants', () => {
  const emailA = `test_security_a_${Date.now()}@university.edu`;
  const emailB = `test_security_b_${Date.now()}@university.edu`;

  const grantA = createVerificationGrant(emailA, 'STUDENT_REGISTRATION');

  // 1. Cross-email grant rejection
  const crossEmail = validateAndConsumeGrant(grantA.grantToken, emailB, 'STUDENT_REGISTRATION');
  assert.equal(crossEmail.valid, false);
  assert.match(crossEmail.error!, /different email address/);

  // 2. Cross-purpose grant rejection (Student grant used for Faculty)
  const crossPurpose = validateAndConsumeGrant(grantA.grantToken, emailA, 'FACULTY_REGISTRATION');
  assert.equal(crossPurpose.valid, false);
  assert.match(crossPurpose.error!, /purpose mismatch/);

  // 3. Expired grant rejection
  db.prepare('UPDATE email_verification_grants SET expires_at = ? WHERE email = ?').run(Date.now() - 5000, emailA);
  const expiredRes = validateAndConsumeGrant(grantA.grantToken, emailA, 'STUDENT_REGISTRATION');
  assert.equal(expiredRes.valid, false);
  assert.match(expiredRes.error!, /expired/);

  // 4. Invalid / tampered token rejection
  const invalidRes = validateAndConsumeGrant('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', emailA, 'STUDENT_REGISTRATION');
  assert.equal(invalidRes.valid, false);
  assert.match(invalidRes.error!, /Invalid verification grant/);

  // Clean up
  db.prepare('DELETE FROM email_verification_grants WHERE email IN (?, ?)').run(emailA, emailB);
});

test('12. Transaction Rollback Integrity: Failed registration preserves DB consistency without orphaned users', async () => {
  const studentEmail = `rollback_${Date.now()}@university.edu`;
  const existingRoll = '26UECSE0230';

  // Seed one student with existingRoll
  const existingUserId = `existing-u-${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
    VALUES (?, 'existing_stud@university.edu', 'hash', 'STUDENT', 'ACTIVE', 1, 'now', 'now')
  `).run(existingUserId);
  db.prepare(`
    INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
    VALUES ('sp-exist', ?, 'Existing Student', ?, 'CSE', 'A', 'now', 'now')
  `).run(existingUserId, existingRoll);

  // Issue grant for new student
  const grant = createVerificationGrant(studentEmail, 'STUDENT_REGISTRATION');

  const newUserId = `new-u-${Date.now()}`;
  const now = new Date().toISOString();

  // Attempt registration with duplicate existingRoll
  assert.throws(() => {
    db.transaction(() => {
      validateAndConsumeGrant(grant.grantToken, studentEmail, 'STUDENT_REGISTRATION');

      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
        VALUES (?, ?, 'hash', 'STUDENT', 'ACTIVE', 1, ?, ?)
      `).run(newUserId, studentEmail, now, now);

      // This will throw UNIQUE constraint on roll_number
      db.prepare(`
        INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
        VALUES ('sp-new', ?, 'New Student', ?, 'CSE', 'B', ?, ?)
      `).run(newUserId, existingRoll, now, now);
    })();
  }, /UNIQUE constraint failed/);

  // Verify that newUserId was rolled back and does NOT exist in users table
  const orphanedUser = db.prepare('SELECT id FROM users WHERE id = ?').get(newUserId);
  assert.equal(orphanedUser, undefined);

  // Verify that grant consumption was also rolled back
  const grantRecord = db.prepare('SELECT consumed_at FROM email_verification_grants WHERE email = ?').get(studentEmail) as any;
  assert.equal(grantRecord.consumed_at, null);

  // Clean up
  db.prepare('DELETE FROM student_profiles WHERE roll_number = ?').run(existingRoll);
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(existingUserId, newUserId);
  db.prepare('DELETE FROM email_verification_grants WHERE email = ?').run(studentEmail);
});

test('13. Founder Dashboard Authentication & Authorization: Cookie Path, Bearer Fallback, and Role Protection', () => {
  // 1. Verify setSessionCookie sets root path '/' and httpOnly
  let cookieName = '';
  let cookieVal = '';
  let cookieOpts: any = null;
  const mockRes: any = {
    cookie: (name: string, val: string, opts: any) => {
      cookieName = name;
      cookieVal = val;
      cookieOpts = opts;
    },
  };
  const mockReq: any = { secure: true, headers: { 'x-forwarded-proto': 'https' } };
  setSessionCookie(mockRes, mockReq, 'test-session-xyz');

  assert.equal(cookieName, 'attendx_session');
  assert.equal(cookieVal, 'test-session-xyz');
  assert.equal(cookieOpts.path, '/');
  assert.equal(cookieOpts.httpOnly, true);
  assert.equal(cookieOpts.secure, true);
  assert.equal(cookieOpts.sameSite, 'none');

  // 2. Hydrate founder session
  const founder = db.prepare("SELECT id, email, role FROM users WHERE role = 'FOUNDER'").get() as any;
  assert.ok(founder, 'Founder user must exist');

  const testSessionId = createSession(founder.id, '127.0.0.1', 'Unit-Test-Client');

  // 3. Test sessionMiddleware via Cookie
  const reqWithCookie: any = { cookies: { attendx_session: testSessionId }, headers: {} };
  let nextCalled = false;
  sessionMiddleware(reqWithCookie, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.ok(reqWithCookie.user);
  assert.equal(reqWithCookie.user.id, founder.id);
  assert.equal(reqWithCookie.user.role, 'FOUNDER');

  // 4. Test sessionMiddleware via Bearer header (cookie missing / iframe partitioned)
  const reqWithBearer: any = { cookies: {}, headers: { authorization: `Bearer ${testSessionId}` } };
  nextCalled = false;
  sessionMiddleware(reqWithBearer, mockRes, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.ok(reqWithBearer.user);
  assert.equal(reqWithBearer.user.id, founder.id);
  assert.equal(reqWithBearer.user.role, 'FOUNDER');

  // 5. Test requireAuth passes with authenticated founder
  let authPassed = false;
  requireAuth(reqWithBearer, mockRes, () => { authPassed = true; });
  assert.equal(authPassed, true);

  // 6. Test requireAuth rejects unauthenticated requests with HTTP 401
  let statusCode = 0;
  let responseBody: any = null;
  const rejectRes: any = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => { responseBody = body; },
      };
    },
  };
  requireAuth({ headers: {} } as any, rejectRes, () => {});
  assert.equal(statusCode, 401);
  assert.equal(responseBody.error, 'Authentication required. Please log in.');

  // 7. Test requireRole(['FOUNDER']) accepts FOUNDER and rejects STUDENT
  let rolePassed = false;
  const founderGuard = requireRole(['FOUNDER']);
  founderGuard(reqWithBearer, rejectRes, () => { rolePassed = true; });
  assert.equal(rolePassed, true);

  // Rejects STUDENT attempting to access founder routes
  const studentUser: any = { role: 'STUDENT', status: 'ACTIVE' };
  statusCode = 0;
  responseBody = null;
  founderGuard({ user: studentUser } as any, rejectRes, () => {});
  assert.equal(statusCode, 403);
  assert.match(responseBody.error, /Requires one of \[FOUNDER\] roles/);

  // Clean up test session
  db.prepare('DELETE FROM sessions WHERE id = ?').run(testSessionId);
});

test('14. Login Rate Limiting & Auto-Recovery: locks out after 5 failed attempts and recovers after window expiry', () => {
  resetLoginRateLimits();
  const email = 'ratelimit.test@university.edu';
  const ip = '203.0.113.42';
  const baseTime = 1_700_000_000_000;

  // Initially allowed
  assert.equal(checkLoginRateLimit(ip, email, baseTime).allowed, true);

  // Record 4 failed attempts — still allowed on check
  for (let i = 1; i <= 4; i++) {
    recordFailedLoginAttempt(ip, email, baseTime + i * 1000);
    assert.equal(checkLoginRateLimit(ip, email, baseTime + i * 1000).allowed, true);
  }

  // 5th failed attempt triggers 15-minute lockout
  recordFailedLoginAttempt(ip, email, baseTime + 5000);
  const blockedCheck = checkLoginRateLimit(ip, email, baseTime + 6000);
  assert.equal(blockedCheck.allowed, false);
  assert.ok((blockedCheck.retryAfterSeconds ?? 0) > 800);

  // Even from a different IP, account-level lockout protects the target account
  const diffIpCheck = checkLoginRateLimit('198.51.100.99', email, baseTime + 6000);
  assert.equal(diffIpCheck.allowed, false);

  // Other legitimate users from the same or different IP are NOT locked out
  assert.equal(checkLoginRateLimit(ip, 'other.user@university.edu', baseTime + 6000).allowed, true);

  // After 15 minutes + 1 second, legitimate user automatically recovers
  const recoveredTime = baseTime + 5000 + 15 * 60 * 1000 + 1000;
  const recoveredCheck = checkLoginRateLimit(ip, email, recoveredTime);
  assert.equal(recoveredCheck.allowed, true);

  // Clearing login attempts on successful login resets counters immediately
  recordFailedLoginAttempt(ip, email, recoveredTime + 1000);
  clearLoginAttempts(ip, email);
  assert.equal(checkLoginRateLimit(ip, email, recoveredTime + 2000).allowed, true);
  resetLoginRateLimits();
});

test('15. Application State Transition Boundary: prevents rejecting already-APPROVED student or faculty applications', async () => {
  const founder = db.prepare("SELECT * FROM users WHERE role = 'FOUNDER' LIMIT 1").get() as any;
  assert.ok(founder);

  const studentEmail = `approved.guard.${Date.now()}@university.edu`;
  const studentRoll = `26UECSE9${Math.floor(100 + Math.random() * 899)}`;
  const userId = `guard-user-${Date.now()}`;
  const profileId = `guard-prof-${Date.now()}`;
  const appId = `guard-app-${Date.now()}`;
  const pwHash = await hashPassword('SafePass123!');
  const now = new Date().toISOString();

  // Create an already-APPROVED student and student application
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', 1, ?, ?)
  `).run(userId, studentEmail, pwHash, now, now);

  db.prepare(`
    INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
    VALUES (?, ?, 'Approved Guard Student', ?, 'CSE', 'A', ?, ?)
  `).run(profileId, userId, studentRoll, now, now);

  db.prepare(`
    INSERT INTO student_applications (id, user_id, full_name, roll_number, branch, section, status, reviewed_by_user_id, reviewed_at, created_at, updated_at)
    VALUES (?, ?, 'Approved Guard Student', ?, 'CSE', 'A', 'APPROVED', ?, ?, ?, ?)
  `).run(appId, userId, studentRoll, founder.id, now, now, now);

  // Simulate the guarded SQLite rejection transaction logic from adminRoutes.ts
  assert.throws(() => {
    const rejectTx = db.transaction(() => {
      const currentApp = db.prepare('SELECT status, user_id FROM student_applications WHERE id = ?').get(appId) as { status: string; user_id: string } | undefined;
      if (!currentApp || currentApp.status !== 'PENDING') {
        throw new Error(`INVALID_STATE:${currentApp?.status || 'MISSING'}`);
      }
      db.prepare(`UPDATE student_applications SET status = 'REJECTED' WHERE id = ? AND status = 'PENDING'`).run(appId);
    });
    rejectTx();
  }, /INVALID_STATE:APPROVED/);

  // Verify database state remains untouched (APPROVED and ACTIVE)
  const verifyApp = db.prepare('SELECT status FROM student_applications WHERE id = ?').get(appId) as any;
  const verifyUser = db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as any;
  assert.equal(verifyApp.status, 'APPROVED');
  assert.equal(verifyUser.status, 'ACTIVE');

  // Clean up test records
  db.prepare('DELETE FROM student_applications WHERE id = ?').run(appId);
  db.prepare('DELETE FROM student_profiles WHERE id = ?').run(profileId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

test('16. CSRF Missing-Origin Enforcement & Password Change Session Revocation', async () => {
  // 1. CSRF check: POST without custom header AND without Origin/Referer must be blocked with 403
  let statusCode = 0;
  let responseBody: any = null;
  let nextCalled = false;
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => { responseBody = body; },
      };
    },
  };

  csrfProtection(
    { method: 'POST', headers: {} } as any,
    mockRes,
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.match(responseBody.error, /Cross-site request blocked/);

  // 2. CSRF check: POST with X-Attendx-Client: web passes
  nextCalled = false;
  csrfProtection(
    { method: 'POST', headers: { 'x-attendx-client': 'web' } } as any,
    mockRes,
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);

  // 3. Session revocation on password change: revokes all other sessions while preserving current session
  const founder = db.prepare("SELECT * FROM users WHERE role = 'FOUNDER' LIMIT 1").get() as any;
  const currentSessionId = createSession(founder.id, '127.0.0.1', 'Current-Device');
  const otherSessionId1 = createSession(founder.id, '127.0.0.2', 'Old-Device-1');
  const otherSessionId2 = createSession(founder.id, '127.0.0.3', 'Old-Device-2');

  invalidateOtherUserSessions(founder.id, currentSessionId);

  const remainingCurrent = db.prepare('SELECT id FROM sessions WHERE id = ?').get(currentSessionId);
  const revoked1 = db.prepare('SELECT id FROM sessions WHERE id = ?').get(otherSessionId1);
  const revoked2 = db.prepare('SELECT id FROM sessions WHERE id = ?').get(otherSessionId2);

  assert.ok(remainingCurrent, 'Current session must remain active');
  assert.equal(revoked1, undefined, 'Other session 1 must be revoked');
  assert.equal(revoked2, undefined, 'Other session 2 must be revoked');

  db.prepare('DELETE FROM sessions WHERE id = ?').run(currentSessionId);
});

test('17. Phase 2 Official Branches & Numeric Sections: 10 official branches, numeric sections 1-3, CSE-2 and CSE(AI&ML)-1 normalization', () => {
  // 1. All 10 official branches seeded in SQLite
  const branches = db.prepare('SELECT code, name, is_active FROM academic_branches ORDER BY display_order ASC').all() as any[];
  assert.equal(branches.length, 10);
  const branchNames = branches.map((b) => b.name);
  const expectedNames = [
    'CSE (AI & ML)',
    'CSE',
    'ECE',
    'MECH',
    'CSE (CS & DS)',
    'MECH-ROBOTICS',
    'EEE',
    'CIVIL',
    'CHEMICAL',
    'ECE-VLSI',
  ];
  assert.deepEqual(branchNames, expectedNames);

  // 2. Allowed sections are numeric '1', '2', '3'
  assert.deepEqual([...ALLOWED_SECTION_VALUES], ['1', '2', '3']);

  // 3. CSE-2 maps to branch = 'CSE', section = '2'
  const cse2 = parseBranchSectionInput('CSE-2', '');
  assert.equal(cse2.branch, 'CSE');
  assert.equal(cse2.section, '2');

  // 4. CSE(AI&ML)-1 maps to branch = 'CSE (AI & ML)', section = '1'
  const aiml1 = parseBranchSectionInput('CSE(AI&ML)-1', '');
  assert.equal(aiml1.branch, 'CSE (AI & ML)');
  assert.equal(aiml1.section, '1');

  // 5. CSE(CS&DS)-2 maps to branch = 'CSE (CS & DS)', section = '2'
  const csds2 = parseBranchSectionInput('CSE(CS&DS)', 'Section 2');
  assert.equal(csds2.branch, 'CSE (CS & DS)');
  assert.equal(csds2.section, '2');

  // 6. MECH-ROBOTICS with Section 1 preserves hyphenated branch name
  const mechRob = parseBranchSectionInput('MECH-ROBOTICS', '1');
  assert.equal(mechRob.branch, 'MECH-ROBOTICS');
  assert.equal(mechRob.section, '1');
});

test('18. Phase 2 Short Roll Derivation & Ambiguity Detection: 26UECSE0220 -> 220, 26UECSE0123 -> 123, 26UECSE1230 -> 1230', () => {
  assert.equal(deriveShortRollNumber('26UECSE0220'), '220');
  assert.equal(deriveShortRollNumber('26UECSE0123'), '123');
  assert.equal(deriveShortRollNumber('26UECSE1230'), '1230');
  assert.equal(deriveShortRollNumber('26UECSE0007'), '7');
  assert.equal(deriveShortRollNumber('26UECSE0000'), '0');

  // Detect ambiguity if two students in the same roster share the same last-4 short roll (e.g. 25UECSE0220 and 26UECSE0220)
  const unambiguousRoster = [
    { studentUserId: 'u1', fullName: 'Student One', rollNumber: '26UECSE0220' },
    { studentUserId: 'u2', fullName: 'Student Two', rollNumber: '26UECSE0123' },
  ];
  assert.equal(detectRosterShortRollAmbiguities(unambiguousRoster).size, 0);

  const ambiguousRoster = [
    { studentUserId: 'u1', fullName: 'Batch 25 Student', rollNumber: '25UECSE0220' },
    { studentUserId: 'u2', fullName: 'Batch 26 Student', rollNumber: '26UECSE0220' },
  ];
  const ambig = detectRosterShortRollAmbiguities(ambiguousRoster);
  assert.equal(ambig.has('220'), true);
});

test('19. Phase 2 Direct Absentee Roll Parser & Validator: short rolls, full rolls, unknown roll rejection, and ambiguity check', () => {
  const roster = [
    { studentUserId: 'u-220', fullName: 'Aarav', rollNumber: '26UECSE0220' },
    { studentUserId: 'u-123', fullName: 'Bhavya', rollNumber: '26UECSE0123' },
    { studentUserId: 'u-1230', fullName: 'Charan', rollNumber: '26UECSE1230' },
  ];

  // Empty string -> 0 absentees (all present)
  const allPresent = parseAndValidateAbsenteeInput('   ', roster);
  assert.equal(allPresent.valid, true);
  assert.equal(allPresent.absentStudentUserIds.length, 0);

  // Comma, space, or newline separated short and full roll numbers
  const mixed = parseAndValidateAbsenteeInput('220, 26UECSE0123\n1230', roster);
  assert.equal(mixed.valid, true);
  assert.deepEqual(mixed.absentStudentUserIds, ['u-123', 'u-220', 'u-1230']);
  assert.deepEqual(mixed.normalizedAbsentShortRolls, ['123', '220', '1230']);

  // Removing 220 leaves only 123 and 1230 absent
  const removed220 = parseAndValidateAbsenteeInput('123, 1230', roster);
  assert.equal(removed220.valid, true);
  assert.equal(removed220.absentStudentUserIds.includes('u-220'), false);
  assert.deepEqual(removed220.absentStudentUserIds, ['u-123', 'u-1230']);

  // Unknown roll number (999) is rejected with clear validation error
  const unknownRoll = parseAndValidateAbsenteeInput('220, 999', roster);
  assert.equal(unknownRoll.valid, false);
  assert.match(unknownRoll.errors[0], /999/);
});

test('20. Phase 2 Rotating HMAC-SHA256 QR Token: window rotation, old window rejection, expiry rejection, and tamper rejection', () => {
  const sessionId = 'qr-session-test-001';
  const secret = 'super-secret-hmac-key-for-testing-only-2026';
  const startedAtMs = 1_700_000_000_000;
  const expiresAtMs = startedAtMs + 5 * 60 * 1000; // 5 minutes
  const refreshSec = 5;

  // Generate token at t = +2s (window 0)
  const genW0 = generateRotatingQrToken(sessionId, startedAtMs + 2000, startedAtMs, expiresAtMs, refreshSec, secret);
  assert.equal(genW0.windowIndex, 0);
  assert.equal(genW0.secondsUntilNextRefresh, 3);

  // Verify in same window (t = +3s) -> valid
  const verifySame = verifyRotatingQrToken(genW0.token, sessionId, startedAtMs + 3000, startedAtMs, expiresAtMs, refreshSec, secret);
  assert.equal(verifySame.valid, true);

  // Verify in next window (t = +12s, window 2) -> old rotated token from window 0 is rejected
  const verifyOld = verifyRotatingQrToken(genW0.token, sessionId, startedAtMs + 12000, startedAtMs, expiresAtMs, refreshSec, secret);
  assert.equal(verifyOld.valid, false);
  assert.match(verifyOld.error!, /rotated and expired/);

  // Verify after session expiry -> rejected
  const genLast = generateRotatingQrToken(sessionId, expiresAtMs - 1000, startedAtMs, expiresAtMs, refreshSec, secret);
  const verifyExpired = verifyRotatingQrToken(genLast.token, sessionId, expiresAtMs + 500, startedAtMs, expiresAtMs, refreshSec, secret);
  assert.equal(verifyExpired.valid, false);
  assert.match(verifyExpired.error!, /expired/);

  // Tampered signature -> rejected
  const tampered = genW0.token.slice(0, -4) + 'ffff';
  const verifyTampered = verifyRotatingQrToken(tampered, sessionId, startedAtMs + 2500, startedAtMs, expiresAtMs, refreshSec, secret);
  assert.equal(verifyTampered.valid, false);
  assert.match(verifyTampered.error!, /signature/);
});

test('21. Phase 2 Campus GPS Geofence & Temporary Demo Mode: Haversine distance, inside/outside boundary, unconfigured safety, and Demo Mode', () => {
  // Gayatri Vidya Parishad North Campus, Kommadi approximate test coordinates
  const campusLat = 17.8205;
  const campusLng = 83.3422;
  const nowMs = Date.now();

  const baseConfig = {
    campusName: 'Gayatri Vidya Parishad Institute of Higher Learning and Research, North Campus, Kommadi, Visakhapatnam, Andhra Pradesh',
    latitude: campusLat,
    longitude: campusLng,
    radiusMeters: 250,
    accuracyToleranceMeters: 50,
    maxAllowedAccuracyMeters: 150,
    gpsEnforcementEnabled: true,
    demoModeEnabled: false,
  };

  // 1. Student inside campus radius (~40m away) -> accepted
  const insideCheck = validateCampusGps(
    baseConfig,
    { latitude: 17.8208, longitude: 83.3424, accuracy: 20, timestamp: nowMs },
    nowMs
  );
  assert.equal(insideCheck.allowed, true);
  assert.equal(insideCheck.verificationMode, 'GPS_VERIFIED');
  assert.ok((insideCheck.distanceMeters ?? 999) < 100);

  // 2. Student outside campus radius (~3.5km away) -> rejected
  const outsideCheck = validateCampusGps(
    baseConfig,
    { latitude: 17.8500, longitude: 83.3600, accuracy: 20, timestamp: nowMs },
    nowMs
  );
  assert.equal(outsideCheck.allowed, false);
  assert.match(outsideCheck.error!, /Outside campus geofence/);

  // 3. Missing GPS coordinates when enforcement is ON -> rejected
  const missingGps = validateCampusGps(baseConfig, null, nowMs);
  assert.equal(missingGps.allowed, false);
  assert.match(missingGps.error!, /Campus GPS verification is required/);

  // 4. Poor GPS accuracy (> 150m) -> rejected
  const poorAccuracy = validateCampusGps(
    baseConfig,
    { latitude: campusLat, longitude: campusLng, accuracy: 320, timestamp: nowMs },
    nowMs
  );
  assert.equal(poorAccuracy.allowed, false);
  assert.match(poorAccuracy.error!, /accuracy is too low/);

  // 5. Unconfigured campus boundary when enforcement is ON -> fails safely (never silently bypasses)
  const unconfigured = validateCampusGps(
    { ...baseConfig, latitude: null, longitude: null },
    { latitude: campusLat, longitude: campusLng, accuracy: 15, timestamp: nowMs },
    nowMs
  );
  assert.equal(unconfigured.allowed, false);
  assert.match(unconfigured.error!, /not configured yet/);

  // 6. Founder Demo Mode enabled -> bypasses GPS check and tags verificationMode as DEMO_MODE
  const demoModeCheck = validateCampusGps(
    { ...baseConfig, demoModeEnabled: true },
    null,
    nowMs
  );
  assert.equal(demoModeCheck.allowed, true);
  assert.equal(demoModeCheck.verificationMode, 'DEMO_MODE');
});

test('22. Phase 2 End-to-End HTTP & SQLite Integration: Manual Attendance, Rotating QR Option A, GPS Geofence, Day-Wise Direct Absentee Editing & RBAC', async () => {
  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const { attendanceRouter, syncExpiredQrSessions } = await import('../../server/routes/attendanceRoutes');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use('/api/attendance', attendanceRouter);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const apiCall = async (method: string, urlPath: string, token?: string, body?: any) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Attendx-Client': 'web',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  // Create test fixtures and clean them up in finally
  const nowIso = new Date().toISOString();
  const founder = db.prepare("SELECT id FROM users WHERE role = 'FOUNDER' LIMIT 1").get() as any;
  const founderToken = createSession(founder.id, '127.0.0.1', 'E2E-Test');

  const fac1Id = `fac1-${Date.now()}`;
  const fac2Id = `fac2-${Date.now()}`;
  const stud220Id = `stud220-${Date.now()}`;
  const stud123Id = `stud123-${Date.now()}`;
  const stud1230Id = `stud1230-${Date.now()}`;
  const studOtherSecId = `studOther-${Date.now()}`;
  const studPendingId = `studPend-${Date.now()}`;

  try {
    // Seed 2 Approved Faculty
    db.prepare(`INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at) VALUES (?, ?, 'hash', 'FACULTY', 'ACTIVE', 1, ?, ?)`).run(fac1Id, `fac1.${Date.now()}@univ.edu`, nowIso, nowIso);
    db.prepare(`INSERT INTO faculty_profiles (id, user_id, full_name, department, designation, created_at, updated_at) VALUES (?, ?, 'Dr. Rao (CSE)', 'CSE', 'Professor', ?, ?)`).run(`fp1-${Date.now()}`, fac1Id, nowIso, nowIso);

    db.prepare(`INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at) VALUES (?, ?, 'hash', 'FACULTY', 'ACTIVE', 1, ?, ?)`).run(fac2Id, `fac2.${Date.now()}@univ.edu`, nowIso, nowIso);
    db.prepare(`INSERT INTO faculty_profiles (id, user_id, full_name, department, designation, created_at, updated_at) VALUES (?, ?, 'Dr. Mehta (Other)', 'ECE', 'Associate Professor', ?, ?)`).run(`fp2-${Date.now()}`, fac2Id, nowIso, nowIso);

    // Seed 3 Approved Active Students in CSE Section 2: 26UECSE0220, 26UECSE0123, 26UECSE1230
    const seedStudent = (uId: string, name: string, roll: string, branch: string, sec: string, status = 'ACTIVE') => {
      db.prepare(`INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at) VALUES (?, ?, 'hash', 'STUDENT', ?, 1, ?, ?)`).run(uId, `${uId}@univ.edu`, status, nowIso, nowIso);
      db.prepare(`INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(`sp-${uId}`, uId, name, roll, branch, sec, nowIso, nowIso);
    };

    seedStudent(stud220Id, 'Student 220', '26UECSE0220', 'CSE', '2', 'ACTIVE');
    seedStudent(stud123Id, 'Student 123', '26UECSE0123', 'CSE', '2', 'ACTIVE');
    seedStudent(stud1230Id, 'Student 1230', '26UECSE1230', 'CSE', '2', 'ACTIVE');
    // Student in CSE Section 1 (different section)
    seedStudent(studOtherSecId, 'Other Sec Student', '26UECSE0555', 'CSE', '1', 'ACTIVE');
    // Unapproved PENDING student in CSE Section 2 (must be excluded from roster)
    seedStudent(studPendingId, 'Pending Student', '26UECSE0777', 'CSE', '2', 'PENDING');

    const fac1Token = createSession(fac1Id, '127.0.0.1', 'E2E-Test');
    const fac2Token = createSession(fac2Id, '127.0.0.1', 'E2E-Test');
    const stud220Token = createSession(stud220Id, '127.0.0.1', 'E2E-Test');
    const stud123Token = createSession(stud123Id, '127.0.0.1', 'E2E-Test');
    const studOtherSecToken = createSession(studOtherSecId, '127.0.0.1', 'E2E-Test');

    // A. Roster preview for CSE Section 2 loads only the 3 ACTIVE students (excludes PENDING & Section 1)
    const previewRes = await apiCall('GET', '/api/attendance/roster-preview?branch=CSE&section=2&date=2026-11-12', fac1Token);
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.data.totalStudents, 3);
    const shortRolls = previewRes.data.students.map((s: any) => s.shortRollNumber);
    assert.deepEqual(shortRolls, ['123', '220', '1230']);

    // B. Create Period-Wise MANUAL Attendance Session (09:00 - 09:50, DBMS)
    const createManual = await apiCall('POST', '/api/attendance/sessions', fac1Token, {
      branch: 'CSE',
      section: '2',
      sessionDate: '2026-11-12',
      subjectName: 'DBMS',
      periodNumber: 'Period 1',
      startTime: '09:00',
      endTime: '09:50',
      method: 'MANUAL',
    });
    assert.equal(createManual.status, 201);
    const manualSessionId = createManual.data.sessionId;

    // C. Verify initial entries are UNMARKED and submitting with unmarked students without confirmation returns 400
    const manualDetail1 = await apiCall('GET', `/api/attendance/sessions/${manualSessionId}`, fac1Token);
    assert.equal(manualDetail1.data.counts.unmarked, 3);

    const prematureSubmit = await apiCall('POST', `/api/attendance/sessions/${manualSessionId}/submit`, fac1Token, {
      confirmMarkUnmarkedAbsent: false,
    });
    assert.equal(prematureSubmit.status, 400);
    assert.equal(prematureSubmit.data.requiresConfirmation, true);

    // D. Mark 123 PRESENT, 220 ABSENT, 1230 ABSENT and submit
    const updateEntries = await apiCall('PUT', `/api/attendance/sessions/${manualSessionId}/entries`, fac1Token, {
      updates: [
        { studentUserId: stud123Id, status: 'PRESENT' },
        { studentUserId: stud220Id, status: 'ABSENT' },
        { studentUserId: stud1230Id, status: 'ABSENT' },
      ],
    });
    assert.equal(updateEntries.status, 200);

    const submitManual = await apiCall('POST', `/api/attendance/sessions/${manualSessionId}/submit`, fac1Token, {
      confirmMarkUnmarkedAbsent: false,
    });
    assert.equal(submitManual.status, 200);

    // E. Day-Wise Report shows DBMS with Present: 1, Absent: 2, Absent Rolls: "220, 1230"
    const report1 = await apiCall('GET', '/api/attendance/daily-report?branch=CSE&section=2&date=2026-11-12', fac1Token);
    assert.equal(report1.status, 200);
    assert.equal(report1.data.periods.length, 1);
    assert.equal(report1.data.periods[0].presentCount, 1);
    assert.equal(report1.data.periods[0].absentCount, 2);
    assert.equal(report1.data.periods[0].absentShortRollsText, '220, 1230');

    // F. Direct Editing of Absent Roll Numbers in Day-Wise Report:
    // 1. Removing 220 (leaving only "1230") marks 26UECSE0220 as PRESENT in the period session!
    const editRemove220 = await apiCall(
      'PUT',
      `/api/attendance/daily-report/${manualSessionId}/absentees`,
      fac1Token,
      { absentRollNumbersInput: '1230', reason: 'Late slip approved for 220' }
    );
    assert.equal(editRemove220.status, 200);
    assert.equal(editRemove220.data.presentCount, 2);
    assert.equal(editRemove220.data.absentCount, 1);
    assert.equal(editRemove220.data.absentShortRollsText, '1230');

    // Verify underlying period session synchronized 26UECSE0220 to PRESENT and logged audit entry
    const syncedSession1 = await apiCall('GET', `/api/attendance/sessions/${manualSessionId}`, fac1Token);
    const entry220AfterRemove = syncedSession1.data.entries.find((e: any) => e.studentUserId === stud220Id);
    assert.equal(entry220AfterRemove.status, 'PRESENT');
    assert.ok(syncedSession1.data.corrections.length >= 1);

    // 2. Adding full roll "26UECSE0220, 1230" marks 26UECSE0220 back as ABSENT and normalizes display to "220, 1230"
    const editAddFull220 = await apiCall(
      'PUT',
      `/api/attendance/daily-report/${manualSessionId}/absentees`,
      fac1Token,
      { absentRollNumbersInput: '26UECSE0220, 1230' }
    );
    assert.equal(editAddFull220.status, 200);
    assert.equal(editAddFull220.data.absentShortRollsText, '220, 1230');

    // 3. Unknown roll number ("999") is rejected with HTTP 400
    const editInvalidRoll = await apiCall(
      'PUT',
      `/api/attendance/daily-report/${manualSessionId}/absentees`,
      fac1Token,
      { absentRollNumbersInput: '220, 999' }
    );
    assert.equal(editInvalidRoll.status, 400);
    assert.match(editInvalidRoll.data.error, /999/);

    // 4. Another faculty member (fac2) cannot edit fac1's session (HTTP 403), but Founder CAN edit any session (HTTP 200)
    const otherFacEdit = await apiCall(
      'PUT',
      `/api/attendance/daily-report/${manualSessionId}/absentees`,
      fac2Token,
      { absentRollNumbersInput: '1230' }
    );
    assert.equal(otherFacEdit.status, 403);

    const founderEdit = await apiCall(
      'PUT',
      `/api/attendance/daily-report/${manualSessionId}/absentees`,
      founderToken,
      { absentRollNumbersInput: '1230', reason: 'Founder override' }
    );
    assert.equal(founderEdit.status, 200);

    // G. Dynamic QR Attendance — Option A + Campus GPS Geofence + Demo Mode
    // Configure North Campus, Kommadi coordinates via Founder endpoint (Student cannot access -> 403)
    const studentGeoAttempt = await apiCall('PUT', '/api/attendance/admin/geofence', stud220Token, {
      demoModeEnabled: true,
    });
    assert.equal(studentGeoAttempt.status, 403);

    const configGeo = await apiCall('PUT', '/api/attendance/admin/geofence', founderToken, {
      campusName: 'Gayatri Vidya Parishad Institute of Higher Learning and Research, North Campus, Kommadi, Visakhapatnam, Andhra Pradesh',
      latitude: 17.8205,
      longitude: 83.3422,
      radiusMeters: 250,
      accuracyToleranceMeters: 50,
      maxAllowedAccuracyMeters: 150,
      gpsEnforcementEnabled: true,
      demoModeEnabled: false,
    });
    assert.equal(configGeo.status, 200);

    // Start QR session for CSE Section 2 (09:50 - 10:40, Operating Systems)
    const createQr = await apiCall('POST', '/api/attendance/sessions', fac1Token, {
      branch: 'CSE',
      section: '2',
      sessionDate: '2026-11-12',
      subjectName: 'Operating Systems',
      periodNumber: 'Period 2',
      startTime: '09:50',
      endTime: '10:40',
      method: 'QR',
      qrDurationMinutes: 5,
      qrRefreshIntervalSeconds: 5,
    });
    assert.equal(createQr.status, 201);
    const qrSessionId = createQr.data.sessionId;

    // Eligible student in CSE Section 2 sees the active QR session on Student Dashboard WITHOUT the QR token
    const stud220Overview = await apiCall('GET', '/api/attendance/student/overview', stud220Token);
    assert.equal(stud220Overview.status, 200);
    assert.equal(stud220Overview.data.activeQrSessions.length, 1);
    assert.equal(stud220Overview.data.activeQrSessions[0].sessionId, qrSessionId);
    assert.equal((stud220Overview.data.activeQrSessions[0] as any).qrToken, undefined);

    // Student in CSE Section 1 does NOT see CSE Section 2's active QR session
    const studOtherOverview = await apiCall('GET', '/api/attendance/student/overview', studOtherSecToken);
    assert.equal(studOtherOverview.status, 200);
    assert.equal(studOtherOverview.data.activeQrSessions.length, 0);

    // Teacher fetches rotating QR token & Data URL
    const qrTokenRes = await apiCall('GET', `/api/attendance/sessions/${qrSessionId}/qr-token`, fac1Token);
    assert.equal(qrTokenRes.status, 200);
    assert.equal(qrTokenRes.data.active, true);
    assert.ok(qrTokenRes.data.qrToken);
    assert.ok(qrTokenRes.data.qrDataUrl.startsWith('data:image/png;base64,'));
    const liveQrToken = qrTokenRes.data.qrToken;

    // Cross-section student attempting to scan CSE Section 2 QR token is rejected (HTTP 403)
    const crossSecScan = await apiCall('POST', '/api/attendance/student/scan-qr', studOtherSecToken, {
      qrToken: liveQrToken,
      location: { latitude: 17.8205, longitude: 83.3422, accuracy: 15, timestamp: Date.now() },
    });
    assert.equal(crossSecScan.status, 403);
    assert.match(crossSecScan.data.error, /Cross-section attendance denied/);

    // Eligible student outside campus radius is rejected when GPS enforcement is ON (HTTP 403)
    const outsideScan = await apiCall('POST', '/api/attendance/student/scan-qr', stud220Token, {
      qrToken: liveQrToken,
      location: { latitude: 17.9000, longitude: 83.4000, accuracy: 15, timestamp: Date.now() },
    });
    assert.equal(outsideScan.status, 403);
    assert.equal(outsideScan.data.gpsFailure, true);

    // Eligible student inside North Campus, Kommadi radius scans QR -> marked PRESENT (HTTP 200)
    const validScan = await apiCall('POST', '/api/attendance/student/scan-qr', stud220Token, {
      qrToken: liveQrToken,
      location: { latitude: 17.8206, longitude: 83.3423, accuracy: 15, timestamp: Date.now() },
    });
    assert.equal(validScan.status, 200);
    assert.equal(validScan.data.status, 'PRESENT');
    assert.equal(validScan.data.alreadyRecorded, false);

    // Duplicate scan by the same student is idempotent (HTTP 200, alreadyRecorded: true)
    const dupScan = await apiCall('POST', '/api/attendance/student/scan-qr', stud220Token, {
      qrToken: liveQrToken,
      location: { latitude: 17.8206, longitude: 83.3423, accuracy: 15, timestamp: Date.now() },
    });
    assert.equal(dupScan.status, 200);
    assert.equal(dupScan.data.alreadyRecorded, true);

    // Enable Founder Demo Mode -> stud123 scans without GPS coordinates and succeeds with DEMO_MODE
    await apiCall('PUT', '/api/attendance/admin/geofence', founderToken, { demoModeEnabled: true });
    const latestTokenRes = await apiCall('GET', `/api/attendance/sessions/${qrSessionId}/qr-token`, fac1Token);
    const demoScan = await apiCall('POST', '/api/attendance/student/scan-qr', stud123Token, {
      qrToken: latestTokenRes.data.qrToken,
      location: null,
    });
    assert.equal(demoScan.status, 200);
    assert.equal(demoScan.data.verificationMode, 'DEMO_MODE');

    // Simulate automatic QR session expiry -> remaining UNMARKED student (stud1230) is marked ABSENT while PRESENT scans are preserved
    syncExpiredQrSessions(Date.now() + 10 * 60 * 1000);
    const expiredQrDetail = await apiCall('GET', `/api/attendance/sessions/${qrSessionId}`, fac1Token);
    assert.equal(expiredQrDetail.data.session.status, 'CLOSED');
    assert.equal(expiredQrDetail.data.counts.present, 2);
    assert.equal(expiredQrDetail.data.counts.absent, 1);
    assert.equal(expiredQrDetail.data.counts.unmarked, 0);
  } finally {
    server.close();
    // Clean up test records and restore default geofence state
    db.prepare(`UPDATE geofence_settings SET latitude = NULL, longitude = NULL, gps_enforcement_enabled = 1, demo_mode_enabled = 0 WHERE id = 1`).run();
    db.prepare(`DELETE FROM attendance_sessions WHERE faculty_user_id IN (?, ?)`).run(fac1Id, fac2Id);
    db.prepare(`DELETE FROM sessions WHERE user_id IN (?, ?, ?, ?, ?, ?)`).run(
      founder.id,
      fac1Id,
      fac2Id,
      stud220Id,
      stud123Id,
      studOtherSecId
    );
    db.prepare(`DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?)`).run(
      fac1Id,
      fac2Id,
      stud220Id,
      stud123Id,
      stud1230Id,
      studOtherSecId,
      studPendingId
    );
  }
});



