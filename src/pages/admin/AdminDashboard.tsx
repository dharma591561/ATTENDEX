import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { AdminStats, AuditLog } from '../../types';
import { ShieldCheck, Users, BookOpen, Clock, CheckCircle2, XCircle, ArrowRight, Activity, AlertCircle } from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getOverview();
      setStats(res.stats);
      setRecentLogs(res.recentAuditLogs || []);
    } catch (err: any) {
      setError(err.message || 'Error loading administrator overview.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Super Administrator Console</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Oversight & Governance</h1>
          <p className="text-xs text-slate-500 mt-1">Institutional overview, application queues, and administrative activity</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('admin-students')}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Student Applications ({stats?.pendingStudentApplications ?? 0} Pending)
          </button>
          <button
            onClick={() => onNavigate('admin-faculty')}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            Faculty Applications ({stats?.pendingFacultyApplications ?? 0} Pending)
          </button>
          <button
            onClick={loadOverview}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Total Active Students */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Active Students</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {loading ? '...' : stats?.totalStudents ?? stats?.approvedStudents ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Active student accounts</p>
        </div>

        {/* Pending Student Applications */}
        <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/20 p-5">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-2">
            <span className="font-semibold">Pending Students</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-amber-900 tabular-nums">
            {loading ? '...' : stats?.pendingStudentApplications ?? 0}
          </div>
          <p className="text-[11px] text-amber-700 mt-1">Student apps awaiting approval</p>
        </div>

        {/* Pending Faculty Applications */}
        <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/20 p-5">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-2">
            <span className="font-semibold">Pending Faculty</span>
            <BookOpen className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-amber-900 tabular-nums">
            {loading ? '...' : stats?.pendingFacultyApplications ?? 0}
          </div>
          <p className="text-[11px] text-amber-700 mt-1">Faculty apps awaiting approval</p>
        </div>

        {/* Approved Faculty */}
        <div className="bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 p-5">
          <div className="flex items-center justify-between text-xs text-emerald-800 mb-2">
            <span className="font-semibold">Approved Faculty</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-900 tabular-nums">
            {loading ? '...' : stats?.approvedFaculty ?? 0}
          </div>
          <p className="text-[11px] text-emerald-700 mt-1">Active faculty accounts</p>
        </div>

        {/* Rejected Applications */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Rejected Apps</span>
            <XCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-700 tabular-nums">
            {loading ? '...' : (stats?.rejectedStudents ?? 0) + (stats?.rejectedFaculty ?? 0)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Declined student & faculty apps</p>
        </div>
      </div>

      {/* Main Grid: Shortcuts & Audit Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Navigation / Management Panels */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Management Consoles</h2>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('admin-students')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">Student Applications & Directory</div>
                  <div className="text-[11px] text-slate-500">Approve or reject student registrations & search roster</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('admin-faculty')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">Faculty Applications</div>
                  <div className="text-[11px] text-slate-500">Approve or reject professor applications</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('admin-attendance')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">Attendance Console & Daily Reports</div>
                  <div className="text-[11px] text-slate-500">Take attendance, edit day-wise absentees, & export PDF reports</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('admin-academic')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">Branches, Sections & Campus Geofence</div>
                  <div className="text-[11px] text-slate-500">Configure 10 official branches, sections 1–3, GPS boundary & Demo Mode</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('admin-audit')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">Administrative Audit Trail</div>
                  <div className="text-[11px] text-slate-500">Review security events and actions</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Recent Audit Logs Feed */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">Recent Administrative Audit Logs</h2>
            </div>
            <button
              onClick={() => onNavigate('admin-audit')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              View All →
            </button>
          </div>

          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No audit records logged yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 font-mono">
                        {log.action}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Actor: <span className="font-mono text-slate-700">{log.actor_email || 'System'}</span>
                      {log.ip_address && (
                        <span> · IP: {log.ip_address}</span>
                      )}
                    </p>
                    {log.details && (
                      <p className="text-[11px] text-slate-600 font-mono mt-0.5 truncate max-w-md">
                        {log.details}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
