import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Database, Mail, ShieldCheck, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface AdminSettingsPageProps {
  onNavigate: (view: string) => void;
}

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ onNavigate }) => {
  const [smtpStatus, setSmtpStatus] = useState<{ configured: boolean; message: string } | null>(null);
  const [checkingSmtp, setCheckingSmtp] = useState(false);

  useEffect(() => {
    checkSmtp();
  }, []);

  const checkSmtp = async () => {
    setCheckingSmtp(true);
    try {
      const res = await api.auth.getSmtpStatus();
      setSmtpStatus(res);
    } catch {
      setSmtpStatus({ configured: false, message: 'Failed to query SMTP status endpoint.' });
    } finally {
      setCheckingSmtp(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button
        onClick={() => onNavigate('admin-dashboard')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Admin Dashboard</span>
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">System & Infrastructure Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Verify database persistence, email SMTP delivery, and security invariants
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. Database Storage Verification */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Relational Database Persistence</h2>
              <p className="text-xs text-slate-500">Persistent disk storage configuration</p>
            </div>
          </div>

          <div className="space-y-2 text-xs bg-slate-50 border border-slate-200 p-4 rounded-lg font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Database Engine:</span>
              <span className="font-semibold text-slate-900">SQLite 3 (better-sqlite3)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Storage Location:</span>
              <span className="text-slate-900">./data/attendx.db</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Journal Mode:</span>
              <span className="text-emerald-700 font-semibold">WAL (Write-Ahead Logging)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Foreign Key Constraints:</span>
              <span className="text-emerald-700 font-semibold">ENFORCED (PRAGMA foreign_keys = ON)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Single Founder Invariant:</span>
              <span className="text-emerald-700 font-semibold">ENFORCED (idx_single_founder)</span>
            </div>
          </div>
        </div>

        {/* 2. Real SMTP Email Service Diagnostics */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Real Email & SMTP Delivery</h2>
                <p className="text-xs text-slate-500">Nodemailer SMTP transport configuration</p>
              </div>
            </div>

            <button
              onClick={checkSmtp}
              disabled={checkingSmtp}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingSmtp ? 'animate-spin' : ''}`} />
              <span>Verify SMTP</span>
            </button>
          </div>

          <div className="p-4 rounded-lg border mb-4 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-slate-800">Connection Status:</span>
              {smtpStatus?.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-mono font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Configured & Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-mono font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" /> Missing Credentials
                </span>
              )}
            </div>
            <p className="text-slate-600">{smtpStatus?.message || 'Testing connection...'}</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-2 text-slate-700">
            <p className="font-semibold text-slate-900">Step-by-step Gmail SMTP Configuration:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
              <li>Log into your Google Account and visit <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noreferrer" className="text-blue-600 underline">2-Step Verification</a>.</li>
              <li>Generate a 16-character App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">Google App Passwords</a> (select app "Mail").</li>
              <li>Open your project's <code className="bg-slate-200 px-1 py-0.5 rounded">.env</code> file.</li>
              <li>Set <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_HOST=smtp.gmail.com</code></li>
              <li>Set <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_PORT=587</code></li>
              <li>Set <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_USER=your_email@gmail.com</code></li>
              <li>Set <code className="bg-slate-200 px-1 py-0.5 rounded">SMTP_PASS=your_16_char_password</code></li>
            </ol>
            <p className="text-[11px] text-slate-500 pt-1">
              Note: Never use your regular personal Gmail password. Google requires an App Password for secure SMTP.
            </p>
          </div>
        </div>

        {/* 3. Security Invariant & Audit Rule */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Founder Account Security Architecture</h2>
              <p className="text-xs text-slate-500">Zero public registration and one-founder policy</p>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-2">
            <p>
              • <strong>No Public Endpoints:</strong> No HTTP API or registration form can initialize or promote an account to the Founder role.
            </p>
            <p>
              • <strong>CLI Initialization Only:</strong> Founder accounts are created via <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-900 font-mono">npm run init-founder</code> in a trusted server terminal.
            </p>
            <p>
              • <strong>Database Invariant:</strong> The database table schema enforces <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-900 font-mono">CREATE UNIQUE INDEX idx_single_founder ON users(role) WHERE role = 'FOUNDER';</code>, preventing duplicate administrators even under direct SQL insertion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
