import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, Mail, Lock, User, Hash, CheckCircle2, AlertCircle, ArrowRight, Clock } from 'lucide-react';

interface StudentRegisterPageProps {
  onNavigate: (view: string) => void;
}

export const StudentRegisterPage: React.FC<StudentRegisterPageProps> = ({ onNavigate }) => {
  const { setUser } = useAuth();

  // Form State
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('CSE');
  const [section, setSection] = useState('A');
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cooldown timer effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Roll number live format validation helper
  const getRollNumberValidation = (val: string) => {
    if (!val) return null;
    const clean = val.trim().toUpperCase();
    if (!clean.startsWith('26UECSE')) {
      return 'Must start with prefix 26UECSE';
    }
    if (clean.length < 11) {
      return 'Needs 4 trailing digits (e.g. 26UECSE0220)';
    }
    if (!/^26UECSE\d{4}$/.test(clean)) {
      return 'Invalid format. Expected: 26UECSE followed by 4 digits';
    }
    const num = parseInt(clean.substring(7), 10);
    if (num < 121 || num > 243) {
      return `Roll number ${clean} is outside the permitted roster range (26UECSE0121 - 26UECSE0243)`;
    }
    return 'valid';
  };

  const rollValidation = getRollNumberValidation(rollNumber);

  // Send OTP
  const handleSendOtp = async () => {
    setError(null);
    setSuccessMsg(null);

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError('Please provide a valid university email address.');
      return;
    }

    setSendingOtp(true);
    try {
      const res = await api.auth.sendOtp(normalizedEmail, 'STUDENT_REGISTRATION');
      setOtpSent(true);
      setCooldown(60);
      setSuccessMsg(res.message || 'Verification code sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Check SMTP settings.');
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
    setSuccessMsg(null);

    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await api.auth.verifyOtp(email.trim().toLowerCase(), otp.trim(), 'STUDENT_REGISTRATION');
      setOtpVerified(true);
      setSuccessMsg(res.message || 'Email successfully verified!');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Complete Registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !rollNumber.trim() || !branch || !section || !email.trim() || !password || !confirmPassword) {
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

    if (rollValidation !== 'valid') {
      setError(rollValidation || 'Invalid roll number.');
      return;
    }

    if (!otpVerified) {
      setError('You must verify your university email before completing registration.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.students.register({
        fullName: fullName.trim(),
        rollNumber: rollNumber.trim().toUpperCase(),
        branch,
        section,
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        otp: otp.trim(),
      });

      setUser(res.user);
      onNavigate('student-dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <GraduationCap className="w-4 h-4 text-slate-700" />
            <span>CSE Student Portal</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Student Account Registration</h2>
          <p className="text-xs text-slate-500 mt-1">
            Permitted Initial CSE Roster Range: <span className="font-mono text-slate-800">26UECSE0121 – 26UECSE0243</span>
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
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
                placeholder="e.g. John Doe"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>

          {/* 2. Roll Number & Academic Branch & Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Roll Number</label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                  placeholder="26UECSE0220"
                  className={`w-full pl-9 pr-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white ${
                    rollValidation === 'valid'
                      ? 'border-emerald-500'
                      : rollNumber && rollValidation !== 'valid'
                      ? 'border-rose-300'
                      : 'border-slate-300'
                  }`}
                />
              </div>
              {rollNumber && rollValidation !== 'valid' && (
                <p className="text-[11px] text-rose-600 mt-1">{rollValidation}</p>
              )}
              {rollValidation === 'valid' && (
                <p className="text-[11px] text-emerald-600 mt-1 font-mono">Format & roster range verified</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="CSE">CSE (Computer Science)</option>
                <option value="ECE">ECE (Electronics)</option>
                <option value="MECH">MECH (Mechanical)</option>
                <option value="CIVIL">CIVIL (Civil)</option>
                <option value="IT">IT (Information Tech)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
                <option value="D">Section D</option>
              </select>
            </div>
          </div>

          {/* 3. University Email & Live OTP System */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">University Email Address</label>
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
                    placeholder="student@university.edu"
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
                <p className="text-[11px] text-slate-500 mt-1">
                  Valid for 5 minutes. If SMTP is not yet configured, check terminal logs or contact the administrator.
                </p>
              </div>
            )}
          </div>

          {/* 4. Password & Confirm Password */}
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
            disabled={submitting || !otpVerified || rollValidation !== 'valid'}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 rounded-lg transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
          >
            {submitting ? (
              <span>Creating Student Account...</span>
            ) : (
              <>
                <span>Complete Student Registration</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          Already registered?{' '}
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="font-semibold text-slate-900 hover:underline cursor-pointer"
          >
            Sign into Student Portal
          </button>
        </div>
      </div>
    </div>
  );
};
