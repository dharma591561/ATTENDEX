import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { FacultyApplication } from '../../types';
import { BookOpen, CheckCircle2, XCircle, Clock, AlertTriangle, ArrowLeft, Check, X } from 'lucide-react';

interface AdminFacultyPageProps {
  onNavigate: (view: string) => void;
}

export const AdminFacultyPage: React.FC<AdminFacultyPageProps> = ({ onNavigate }) => {
  const [applications, setApplications] = useState<FacultyApplication[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval / Rejection Modal State
  const [actionTarget, setActionTarget] = useState<{ app: FacultyApplication; type: 'APPROVE' | 'REJECT' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadApplications();
  }, [filter]);

  const loadApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getApplications(filter);
      setApplications(res.applications || []);
    } catch (err: any) {
      setError(err.message || 'Error loading faculty applications.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!actionTarget) return;

    setActionLoading(true);
    try {
      if (actionTarget.type === 'APPROVE') {
        await api.admin.approveApplication(actionTarget.app.id);
      } else {
        await api.admin.rejectApplication(actionTarget.app.id, rejectionReason.trim());
      }
      setActionTarget(null);
      setRejectionReason('');
      await loadApplications();
    } catch (err: any) {
      alert(err.message || 'Error processing application decision.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button
        onClick={() => onNavigate('admin-dashboard')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Admin Dashboard</span>
      </button>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Faculty Applications</h1>
          <p className="text-xs text-slate-500 mt-1">Review, approve, or reject candidate professor credentials</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Applications Grid */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            Loading applications...
          </div>
        ) : applications.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            No {filter !== 'ALL' ? filter.toLowerCase() : ''} faculty applications in record.
          </div>
        ) : (
          applications.map((app) => (
            <div
              key={app.id}
              className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-slate-900">{app.full_name}</h3>
                  <span
                    className={`inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-sm ${
                      app.status === 'PENDING'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : app.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {app.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{app.designation}</span>
                  <span>·</span>
                  <span>{app.department}</span>
                  <span>·</span>
                  <span className="font-mono text-slate-500">{app.email}</span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono pt-1">
                  Submitted: {new Date(app.created_at).toLocaleString()}
                  {app.reviewed_at && (
                    <span> · Reviewed: {new Date(app.reviewed_at).toLocaleDateString()}</span>
                  )}
                </div>

                {app.status === 'REJECTED' && app.rejection_reason && (
                  <div className="mt-2 text-xs bg-rose-50 border border-rose-200 text-rose-900 p-2.5 rounded-md">
                    <span className="font-semibold block mb-0.5">Rejection Reason:</span>
                    <span>{app.rejection_reason}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons for Pending or Re-decision */}
              <div className="flex items-center gap-2 shrink-0">
                {app.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => setActionTarget({ app, type: 'APPROVE' })}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => setActionTarget({ app, type: 'REJECT' })}
                      className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {app.status === 'APPROVED' && (
                  <span className="text-xs font-mono text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Faculty Login Enabled
                  </span>
                )}

                {app.status === 'REJECTED' && (
                  <button
                    onClick={() => setActionTarget({ app, type: 'APPROVE' })}
                    className="px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Reconsider & Approve
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Decision Confirmation Modal */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {actionTarget.type === 'APPROVE' ? 'Approve Faculty Application' : 'Reject Faculty Application'}
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Applicant: <span className="font-semibold text-slate-900">{actionTarget.app.full_name}</span> ({actionTarget.app.department})
            </p>

            {actionTarget.type === 'APPROVE' ? (
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                Approving this application will immediately update the applicant's account status to <span className="font-semibold text-emerald-700">ACTIVE</span>. They will be granted full access to the faculty console using their existing credentials.
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-slate-600">
                  Rejecting this application will prevent faculty portal login. You may provide an optional reason for the candidate:
                </p>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Incomplete departmental documentation provided..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors cursor-pointer ${
                  actionTarget.type === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionLoading ? 'Processing...' : actionTarget.type === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
