import nodemailer, { Transporter } from 'nodemailer';

let customTransporter: Transporter | null = null;

export function setTestTransporter(transporter: Transporter | null) {
  customTransporter = transporter;
}

export function isSmtpConfigured(): boolean {
  if (customTransporter) return true;
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

export function getTransporter(): Transporter {
  if (customTransporter) {
    return customTransporter;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in your environment.'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    if (!isSmtpConfigured()) {
      return {
        ok: false,
        message: 'SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) are not set in environment.',
      };
    }
    const transporter = getTransporter();
    await transporter.verify();
    return { ok: true, message: 'SMTP connection successfully verified.' };
  } catch (err: any) {
    return {
      ok: false,
      message: `SMTP verification failed: ${err.message || String(err)}`,
    };
  }
}

export async function sendOtpEmail(toEmail: string, otp: string, purpose: string): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"CLASSYNC College Portal" <${process.env.SMTP_USER || 'noreply@classync.edu'}>`;

  let subject = 'Your CLASSYNC Verification Code';
  let purposeDesc = 'verify your email address';

  if (purpose === 'STUDENT_REGISTRATION') {
    subject = 'CLASSYNC — Student Registration Verification Code';
    purposeDesc = 'complete your student registration';
  } else if (purpose === 'FACULTY_REGISTRATION') {
    subject = 'CLASSYNC — Faculty Application Verification Code';
    purposeDesc = 'submit your faculty application';
  } else if (purpose === 'PASSWORD_RESET') {
    subject = 'CLASSYNC — Password Reset Code';
    purposeDesc = 'reset your account password';
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">CLASSYNC Portal</h2>
      <p style="color: #475569; font-size: 15px;">Use the following one-time verification code to ${purposeDesc}:</p>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0284c7;">${otp}</span>
      </div>
      <p style="color: #64748b; font-size: 13px;">This code is valid for <strong>5 minutes</strong>. If you did not request this code, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; margin: 0;">CLASSYNC College Attendance & Student Management Portal. Do not reply to this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    html,
    text: `Your CLASSYNC verification code is: ${otp}. It expires in 5 minutes.`,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetLink: string): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"CLASSYNC College Portal" <${process.env.SMTP_USER || 'noreply@classync.edu'}>`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #0f172a; margin-top: 0;">CLASSYNC Portal</h2>
      <p style="color: #475569; font-size: 15px;">We received a request to reset your password. Click the button below to choose a new password:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetLink}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
      </div>
      <p style="color: #64748b; font-size: 13px;">Or copy and paste this link in your browser:<br/><a href="${resetLink}" style="color: #0284c7;">${resetLink}</a></p>
      <p style="color: #64748b; font-size: 13px;">This link is valid for <strong>15 minutes</strong> and can only be used once.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; margin: 0;">CLASSYNC College Attendance & Student Management Portal.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'CLASSYNC — Password Reset Request',
    html,
    text: `Click the link to reset your CLASSYNC password: ${resetLink}. Valid for 15 minutes.`,
  });
}
