import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { BookOpen, Mail, Lock, User, Briefcase, CheckCircle2, AlertCircle, ArrowRight, Clock, Building } from 'lucide-react';

interface FacultyApplyPageProps {
  onNavigate: (view: string) => void;
}

export const FacultyApplyPage: React.FC<FacultyApplyPageProps> = ({ onNavigate }) => {
  // Form State
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [designation, setDesignation] = useState('Assistant Professor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP State
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Status feedback
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Cooldown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Send OTP
  const handleSendOtp = async () => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError('Please provide a valid faculty email address.');
      return;
    }

    setSendingOtp(true);
    try {
      await api.auth.sendOtp(normalizedEmail, 'FACULTY_REGISTRATION');
      setOtpSent(true);
      setCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP.');
      if (err.data?.cooldownRemaining) {
        setCooldown(err.data.cooldownRemaining);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async () => {
    setError(null);
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setVerifyingOtp(true);
    try {
      await api.auth.verifyOtp(email.trim().toLowerCase(), otp.trim(), 'FACULTY_REGISTRATION');
      setOtpVerified(true);
    } catch (err: any) {
      setError(err.message || 'Verification code is invalid or expired.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Submit Application
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !department.trim() || !designation.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!otpVerified) {
      setError('You must verify your email address before submitting the application.');
      return;
    }

    setSubmitting(true);

    try {
      await api.faculty.apply({
        fullName: fullName.trim(),
        department: department.trim(),
        designation: designation.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        otp: otp.trim(),
      });

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Application submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-16 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 shadow-xs text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Application Submitted</h2>
          <div className="mt-3 text-xs text-slate-600 space-y-2 text-left bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="font-semibold text-slate-800">Next Steps & Review Process:</p>
            <p>1. Your application status is currently <span className="font-mono font-semibold text-amber-700">PENDING</span>.</p>
            <p>2. The Super Administrator / Founder will review your departmental credentials.</p>
            <p>3. Faculty login permissions will remain disabled until official approval is granted.</p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => onNavigate('application-status')}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Check Application Status
            </button>
            <button
              onClick={() => onNavigate('landing')}
              className="w-full py-2 text-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Return to Portal Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4 text-slate-700" />
            <span>Faculty & Academic Staff Portal</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Faculty Member Application</h2>
          <p className="text-xs text-slate-500 mt-1">
            Faculty accounts require administrative approval before portal access is activated.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Jane Smith"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>

          {/* 2. Department & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Department</label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                  <option value="Electronics & Communication">Electronics & Communication</option>
                  <option value="Mechanical Engineering">Mechanical Engineering</option>
                  <option value="Civil Engineering">Civil Engineering</option>
                  <option value="Mathematics & Computing">Mathematics & Computing</option>
                  <option value="Applied Physics">Applied Physics</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Designation</label>
              <div className="relative">
                <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <select
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="Professor">Professor</option>
                  <option value="Associate Professor">Associate Professor</option>
                  <option value="Assistant Professor">Assistant Professor</option>
                  <option value="Department Chair">Department Chair</option>
                  <option value="Adjunct Lecturer">Adjunct Lecturer</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. University Email & Live OTP */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Official Faculty Email Address</label>
                {otpVerified && (
                  <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="email"
                    required
                    disabled={otpVerified}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="professor@university.edu"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white disabled:bg-slate-100"
                  />
                </div>
                {!otpVerified && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={sendingOtp || cooldown > 0 || !email.trim()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    {sendingOtp ? (
                      <span>Sending...</span>
                    ) : cooldown > 0 ? (
                      <>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Resend ({cooldown}s)</span>
                      </>
                    ) : otpSent ? (
                      <span>Resend OTP</span>
                    ) : (
                      <span>Send OTP</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* OTP Input Field */}
            {otpSent && !otpVerified && (
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter 6-Digit Email Verification Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-40 px-3 py-2 text-base font-mono tracking-widest text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={verifyingOtp || otp.length !== 6}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    {verifyingOtp ? 'Verifying...' : 'Verify Code'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Create Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type password"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !otpVerified}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 rounded-lg transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
          >
            {submitting ? (
              <span>Submitting Application...</span>
            ) : (
              <>
                <span>Submit Faculty Application</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            type="button"
            onClick={() => onNavigate('application-status')}
            className="text-slate-600 hover:text-slate-900 underline cursor-pointer"
          >
            Track Application Status
          </button>
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="font-semibold text-slate-900 hover:underline cursor-pointer"
          >
            Faculty Login
          </button>
        </div>
      </div>
    </div>
  );
};
