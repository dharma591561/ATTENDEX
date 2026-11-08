import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { validateRollNumber, generateAndStoreOtp, verifyOtp } from '../../server/services/otpService';
import { hashPassword, verifyPassword, createSession, getSessionUser } from '../../server/services/authService';
import { initializeFounder } from '../../scripts/init-founder';
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
  // Check if a founder already exists, or create test founder
  const existing = db.prepare("SELECT id FROM users WHERE role = 'FOUNDER'").get();
  
  if (!existing) {
    const initRes = await initializeFounder('founder@attendx.internal', 'FounderSecretPassword2026!');
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
