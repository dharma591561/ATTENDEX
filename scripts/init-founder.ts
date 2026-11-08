import readline from 'readline';
import crypto from 'crypto';
import { db, initDatabase } from '../server/db/database';
import { hashPassword } from '../server/services/authService';
import { logAuditEvent } from '../server/services/auditService';

// Ensure database tables exist
initDatabase();

function askQuestion(query: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden) {
      // Mask password input
      process.stdout.write(query);
      let input = '';
      
      const onData = (char: Buffer) => {
        const s = char.toString();
        if (s === '\n' || s === '\r' || s === '\u0004') {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode?.(false);
          rl.close();
          process.stdout.write('\n');
          resolve(input);
        } else if (s === '\u0003') { // Ctrl+C
          process.exit(1);
        } else if (s === '\b' || s === '\x7f') { // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += s;
          process.stdout.write('*');
        }
      };

      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.on('data', onData);
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

export async function initializeFounder(customEmail?: string, customPassword?: string): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Check whether a founder already exists in the database
    const existingFounder = db.prepare("SELECT id, email FROM users WHERE role = 'FOUNDER'").get() as { id: string; email: string } | undefined;
    if (existingFounder) {
      const msg = `Security Violation: A Super Administrator / Founder account already exists in this database (${existingFounder.email}). Only exactly ONE founder account is permitted. Creation aborted.`;
      console.error(msg);
      return { success: false, message: msg };
    }

    let email = customEmail;
    let password = customPassword;

    if (!email || !password) {
      console.log('\n======================================================');
      console.log('   ATTENDX — SECURE FOUNDER INITIALIZATION CLI        ');
      console.log('======================================================');
      console.log('This utility configures the single Super Administrator account.');
      console.log('It can be run exactly ONCE. Credentials are never hardcoded.\n');

      if (!email) {
        email = await askQuestion('Enter Founder Email Address: ');
      }

      if (!password) {
        password = await askQuestion('Enter Secure Founder Password (masked): ', true);
        const confirmPassword = await askQuestion('Confirm Secure Founder Password (masked): ', true);

        if (password !== confirmPassword) {
          const err = 'Passwords do not match. Initialization aborted.';
          console.error(err);
          return { success: false, message: err };
        }
      }
    }

    // Validate inputs
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      const err = 'Invalid email address format. Initialization aborted.';
      console.error(err);
      return { success: false, message: err };
    }

    if (!password || password.length < 8) {
      const err = 'Founder password must be at least 8 characters long. Initialization aborted.';
      console.error(err);
      return { success: false, message: err };
    }

    // Check if email is already taken by another role
    const existingUser = db.prepare('SELECT id, role FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (existingUser) {
      const err = `Email ${normalizedEmail} is already assigned to a ${existingUser.role} account. Initialization aborted.`;
      console.error(err);
      return { success: false, message: err };
    }

    // Hash password securely with bcrypt
    const passwordHash = await hashPassword(password);
    const founderId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Insert founder account
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, status, is_email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'FOUNDER', 'ACTIVE', 1, ?, ?)
    `).run(founderId, normalizedEmail, passwordHash, now, now);

    // Record in audit log
    logAuditEvent({
      actorUserId: founderId,
      action: 'FOUNDER_INITIALIZATION',
      targetUserId: founderId,
      details: { email: normalizedEmail, initializedVia: 'CLI_SCRIPT' },
    });

    console.log('\n[SUCCESS] Founder account successfully initialized.');
    console.log(`[ACCOUNT] Super Administrator: ${normalizedEmail}`);
    console.log('[SECURITY] Founder credentials securely hashed and stored. You may now log in via the Founder tab.\n');

    return {
      success: true,
      message: `Founder account successfully initialized for ${normalizedEmail}.`,
    };
  } catch (error: any) {
    console.error('[ERROR] Failed to initialize founder:', error.message || error);
    return { success: false, message: error.message || String(error) };
  }
}

// If executed directly from command line
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('init-founder.ts')) {
  // Check for --email and --password flags if passed
  const args = process.argv.slice(2);
  let cliEmail: string | undefined;
  let cliPassword: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      cliEmail = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      cliPassword = args[i + 1];
      i++;
    }
  }

  initializeFounder(cliEmail, cliPassword).then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}
