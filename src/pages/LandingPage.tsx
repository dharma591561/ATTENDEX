import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { GraduationCap, BookOpen, ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, Mail, Database } from 'lucide-react';

interface LandingPageProps {
  onNavigate: (view: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [smtpStatus, setSmtpStatus] = useState<{ configured: boolean; message: string } | null>(null);

  useEffect(() => {
    api.auth.getSmtpStatus().then(setSmtpStatus).catch(() => {
      setSmtpStatus({ configured: false, message: 'Unable to check SMTP status' });
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Official College Academic System · Phase 1
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              CLASSYNC College Portal
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
              A secure, relational database-backed college platform supporting student registration, verified academic roll number mapping, faculty application review, and super administrator oversight.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => onNavigate('student-register')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-xs cursor-pointer flex items-center gap-2"
              >
                <span>Student Registration</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('faculty-apply')}
                className="px-5 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Faculty Application
              </button>
              <button
                onClick={() => onNavigate('login')}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Account Login →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Account Roles & Architecture Section */}
      <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900">Academic Portals & Access Control</h2>
          <p className="text-sm text-slate-600 mt-1">Three distinct access levels with server-side validation and role authorization.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Student Role Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Student Portal</h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">Format: 26UECSE0121 to 26UECSE0243</p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>University email OTP verification required</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Enforces unique normalized roll numbers</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Personal profile and photo upload</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => onNavigate('student-register')}
                className="text-xs font-semibold text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
              >
                Register as Student →
              </button>
            </div>
          </div>

          {/* Faculty Role Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center mb-4">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Faculty & Professors</h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">Status: PENDING → APPROVED</p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Department and designation application</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Email verification during submission</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Requires Founder approval before login is unlocked</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => onNavigate('faculty-apply')}
                className="text-xs font-semibold text-slate-900 hover:text-amber-700 transition-colors cursor-pointer"
              >
                Submit Application →
              </button>
            </div>
          </div>

          {/* Founder Role Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Founder & Super Admin</h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">Strict Invariant: Exactly 1 Account</p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>No public registration or signup endpoints</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Created privately via terminal CLI script</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Review faculty applications and manage roster</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => onNavigate('login')}
                className="text-xs font-semibold text-slate-900 hover:text-purple-700 transition-colors cursor-pointer"
              >
                Founder Login Portal →
              </button>
            </div>
          </div>
        </div>

        {/* System & SMTP Environment Status Notice */}
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-900">Real Email & SMTP Status</h4>
                {smtpStatus && (
                  <span
                    className={`inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-sm ${
                      smtpStatus.configured
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {smtpStatus.configured ? 'SMTP Configured & Verified' : 'SMTP Credentials Needed'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {smtpStatus?.message || 'Checking backend SMTP configuration...'}
              </p>
              {!smtpStatus?.configured && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                  <p className="font-semibold text-slate-800 mb-1">How to enable real Gmail SMTP delivery:</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600">
                    <li>Create a 16-character App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">Google Account Security</a>.</li>
                    <li>Configure <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_HOST=smtp.gmail.com</code>, <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_PORT=587</code>, <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_USER=your_email@gmail.com</code>, and <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_PASS=your_app_password</code> in <code className="bg-slate-200 px-1 py-0.5 rounded">.env</code>.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Database & Roster Info */}
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-900">Persistent Relational Storage</div>
              <div className="text-xs text-slate-500 font-mono">SQLite (WAL Mode) · Database Table Indexes Active</div>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            Initial Authorized CSE Student Roster: <span className="font-mono font-semibold text-slate-900">26UECSE0121 – 26UECSE0243</span>
          </div>
        </div>
      </section>
    </div>
  );
};
