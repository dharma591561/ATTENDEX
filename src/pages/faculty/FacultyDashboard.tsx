import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { AttendanceSessionInfo } from '../../types';
import {
  BookOpen,
  Briefcase,
  Building,
  ArrowRight,
  UserCheck,
  QrCode,
  ClipboardCheck,
  FileText,
  History,
  Calendar,
} from 'lucide-react';

interface FacultyDashboardProps {
  onNavigate: (view: string) => void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const profile = user?.faculty_profile;
  const [recentSessions, setRecentSessions] = useState<AttendanceSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.attendance
      .getHistory({ mineOnly: true })
      .then((res) => {
        setRecentSessions((res.sessions || []).slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl bg-amber-900 text-white flex items-center justify-center font-bold text-xl overflow-hidden shrink-0 border border-slate-200">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt={profile.full_name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <BookOpen className="w-8 h-8 text-white" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {profile?.full_name || 'Faculty Member'}
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
                Approved Faculty
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{profile?.designation}</span>
              <span>·</span>
              <span>{profile?.department}</span>
              <span>·</span>
              <span>{user?.email}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('faculty-attendance')}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Open Attendance Console</span>
          </button>
          <button
            onClick={() => onNavigate('people-search')}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            People Search
          </button>
          <button
            onClick={() => onNavigate('faculty-profile')}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Manage Profile
          </button>
        </div>
      </div>

      {/* Faculty Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Academic Department</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold tracking-tight text-slate-900">
            {profile?.department || 'N/A'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Authorized teaching faculty member.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Faculty Rank</span>
            <Briefcase className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold tracking-tight text-slate-900">
            {profile?.designation || 'Professor'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Official academic appointment rank.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Application Decision</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold tracking-tight text-emerald-700">Verified & Active</div>
          <p className="text-[11px] text-slate-500 mt-2">Approved by Super Administrator.</p>
        </div>
      </div>

      {/* Attendance Operations Console Launchpad */}
      <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-1">
              Attendance Management System
            </div>
            <h2 className="text-xl font-bold text-white">
              Period-Wise Manual Attendance, Rotating QR & Day-Wise Reports
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Record period-wise manual attendance with adjacent Present/Absent controls, project rotating HMAC-signed classroom QR codes with campus GPS verification, edit day-wise absentee roll numbers directly, and export institutional PDF reports.
            </p>
          </div>
          <button
            onClick={() => onNavigate('faculty-attendance')}
            className="px-5 py-2.5 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2 cursor-pointer shrink-0"
          >
            <span>Launch Attendance Console</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800">
          <button
            onClick={() => onNavigate('faculty-attendance')}
            className="text-left p-4 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>Take Attendance (Manual & QR)</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Load approved class rosters by branch & numeric section (1, 2, 3) or project a live rotating QR code.
            </p>
          </button>

          <button
            onClick={() => onNavigate('faculty-attendance')}
            className="text-left p-4 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Day-Wise Reports & PDF Export</span>
            </div>
            <p className="text-[11px] text-slate-300">
              View chronological period rows, directly edit absent short roll numbers, and download or share PDF reports.
            </p>
          </button>

          <button
            onClick={() => onNavigate('faculty-attendance')}
            className="text-left p-4 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
              <History className="w-4 h-4 text-sky-400" />
              <span>Session History & Corrections</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Filter past attendance sessions by branch, section, date, or method and reopen sessions for audited corrections.
            </p>
          </button>
        </div>
      </div>

      {/* Recent Faculty Sessions */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">My Recent Attendance Sessions</h2>
          </div>
          <button
            onClick={() => onNavigate('faculty-attendance')}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            View All in Console →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Branch & Sec</th>
                <th className="px-5 py-3">Period & Time</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Present / Total</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    Loading recent sessions...
                  </td>
                </tr>
              ) : recentSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    No attendance sessions created yet. Click "Open Attendance Console" above to start.
                  </td>
                </tr>
              ) : (
                recentSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">{s.sessionDate}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      {s.branch} — Sec {s.section}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <div>{s.periodNumber || 'Period'}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {s.startTime} – {s.endTime}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{s.subjectName}</td>
                    <td className="px-5 py-3.5 font-mono">{s.method}</td>
                    <td className="px-5 py-3.5 font-mono">
                      <span className="text-emerald-700 font-semibold">{s.presentCount ?? 0}</span> /{' '}
                      <span>{s.totalStudents ?? 0}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-800 border border-slate-200">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
