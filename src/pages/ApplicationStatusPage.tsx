import React, { useState } from 'react';
import { api } from '../api/client';
import { FacultyApplication } from '../types';
import { BookOpen, Search, CheckCircle2, Clock, AlertTriangle, ArrowRight, Mail } from 'lucide-react';

interface ApplicationStatusPageProps {
  onNavigate: (view: string) => void;
}

export const ApplicationStatusPage: React.FC<ApplicationStatusPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [application, setApplication] = useState<FacultyApplication | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSearched(false);
    setApplication(null);

    const clean = email.trim().toLowerCase();
    if (!clean) {
      setError('Please enter your faculty application email address.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.faculty.getStatus(clean);
      setApplication(res.application);
      setSearched(true);
    } catch (err: any) {
      setError(err.message || 'No application found for this email address.');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4 text-slate-700" />
            <span>Application Tracking</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Faculty Application Status</h2>
          <p className="text-xs text-slate-500 mt-1">
            Enter the university email address you used when submitting your faculty application.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="professor@university.edu"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{loading ? 'Searching...' : 'Check Status'}</span>
          </button>
        </form>

        {error && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 mb-6">
            <p className="font-semibold text-slate-800">{error}</p>
            <p className="mt-1">
              If you haven't applied yet, you can submit an application via the{' '}
              <button
                onClick={() => onNavigate('faculty-apply')}
                className="text-slate-900 underline font-semibold cursor-pointer"
              >
                Faculty Application Form
              </button>
              .
            </p>
          </div>
        )}

        {searched && application && (
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{application.full_name}</h3>
                <p className="text-xs text-slate-600">{application.designation} · {application.department}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{application.email}</p>
              </div>

              {application.status === 'PENDING' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Review</span>
                </div>
              )}

              {application.status === 'APPROVED' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved</span>
                </div>
              )}

              {application.status === 'REJECTED' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Rejected</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 text-xs space-y-2">
              <div className="flex justify-between text-slate-500">
                <span>Submitted On:</span>
                <span className="font-mono text-slate-700">{new Date(application.created_at).toLocaleDateString()}</span>
              </div>

              {application.reviewed_at && (
                <div className="flex justify-between text-slate-500">
                  <span>Reviewed On:</span>
                  <span className="font-mono text-slate-700">{new Date(application.reviewed_at).toLocaleDateString()}</span>
                </div>
              )}

              {application.status === 'REJECTED' && application.rejection_reason && (
                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-md text-rose-900 mt-2">
                  <span className="font-semibold block mb-0.5">Administrative Reason:</span>
                  <span>{application.rejection_reason}</span>
                </div>
              )}

              {application.status === 'APPROVED' && (
                <div className="pt-2">
                  <button
                    onClick={() => onNavigate('login')}
                    className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to Faculty Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {application.status === 'PENDING' && (
                <p className="text-[11px] text-slate-500 pt-1">
                  Your application is currently queued for the Super Administrator. Once approved, you will be able to log in using the password created during application.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <button
            onClick={() => onNavigate('landing')}
            className="hover:text-slate-900 transition-colors cursor-pointer"
          >
            ← Back to Home
          </button>
          <button
            onClick={() => onNavigate('faculty-apply')}
            className="font-semibold text-slate-900 hover:underline cursor-pointer"
          >
            Submit New Application
          </button>
        </div>
      </div>
    </div>
  );
};
