import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { validateRollNumber, generateAndStoreOtp, verifyOtp, createVerificationGrant, validateAndConsumeGrant } from '../../server/services/otpService';
import { hashPassword, verifyPassword, createSession, getSessionUser } from '../../server/services/authService';
import { initializeFounder } from '../../scripts/init-founder';
import { sessionMiddleware, setSessionCookie, requireAuth, requireRole } from '../../server/middleware/auth';
import { db, initDatabase } from '../../server/db/database';

// Ensure DB is initialized
initDatabase();

test('1. Roll Number Validation: correct format & within permitted initial roster range', () => {
  // Valid within range 26UECSE0121 - 26UECSE0243
  const valid1 = validateRollNumber('26UECSE0121');
  assert.equal(valid1.valid, true);
  assert.equal(valid1.normalized, '26UECSE0121');

  const valid2 = validateRollNumber('  26uecse0220  '); // test whitespace trimming & uppercase
  assert.equal(valid2.valid, true);
  assert.equal(valid2.normalized, '26UECSE0220');

  const valid3 = validateRollNumber('26UECSE0243');
  assert.equal(valid3.valid, true);
  assert.equal(valid3.normalized, '26UECSE0243');
});

test('2. Roll Number Validation: rejects invalid formats and out-of-range numbers', () => {
  // Wrong prefix
  const invalid1 = validateRollNumber('25UECSE0150');
  assert.equal(invalid1.valid, false);

  // Missing digits
  const invalid2 = validateRollNumber('26UECSE12');
  assert.equal(invalid2.valid, false);

  // Non-numeric suffix
  const invalid3 = validateRollNumber('26UECSEABCD');
  assert.equal(invalid3.valid, false);

  // Below range (0120 < 0121)
  const outOfRangeLow = validateRollNumber('26UECSE0120');
  assert.equal(outOfRangeLow.valid, false);
  assert.match(outOfRangeLow.error!, /outside the permitted initial roster range/);

  // Above range (0244 > 0243)
  const outOfRangeHigh = validateRollNumber('26UECSE0244');
  assert.equal(outOfRangeHigh.valid, false);
  assert.match(outOfRangeHigh.error!, /outside the permitted initial roster range/);
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

test('9. Student Registration Flow: OTP -> Grant -> Atomic DB Insertion -> Single Grant Consumption', async () => {
  const studentEmail = `student_e2e_${Date.now()}@university.edu`;
  const rollNumber = '26UECSE0225';

  // Ensure clean state
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

  // 3. Execute atomic registration transaction
  const userId = `student-user-${Date.now()}`;
  const profileId = `student-prof-${Date.now()}`;
  const passwordHash = await hashPassword('StudentPassword123!');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const grantCheck = validateAndConsumeGrant(grant.grantToken, studentEmail, 'STUDENT_REGISTRATION');
    if (!grantCheck.valid) {
      throw new Error(grantCheck.error);
    }

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', 1, ?, ?)
    `).run(userId, studentEmail, passwordHash, now, now);

    db.prepare(`
      INSERT INTO student_profiles (id, user_id, full_name, roll_number, branch, section, created_at, updated_at)
      VALUES (?, ?, 'Verified Student', ?, 'CSE', 'A', ?, ?)
    `).run(profileId, userId, rollNumber, now, now);
  });

  tx();

  // 4. Confirm database records created
  const createdUser = db.prepare('SELECT id, role, status, is_email_verified FROM users WHERE id = ?').get(userId) as any;
  assert.ok(createdUser);
  assert.equal(createdUser.role, 'STUDENT');
  assert.equal(createdUser.status, 'ACTIVE');
  assert.equal(createdUser.is_email_verified, 1);

  const createdProfile = db.prepare('SELECT roll_number, branch FROM student_profiles WHERE user_id = ?').get(userId) as any;
  assert.ok(createdProfile);
  assert.equal(createdProfile.roll_number, rollNumber);

  // 5. Attempting to reuse the consumed grant fails
  const reuseAttempt = validateAndConsumeGrant(grant.grantToken, studentEmail, 'STUDENT_REGISTRATION');
  assert.equal(reuseAttempt.valid, false);

  // Clean up
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
