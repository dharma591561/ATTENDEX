import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, ShieldCheck, Briefcase, Building, Mail, ArrowRight, UserCheck } from 'lucide-react';

interface FacultyDashboardProps {
  onNavigate: (view: string) => void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const profile = user?.faculty_profile;

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

        <button
          onClick={() => onNavigate('faculty-profile')}
          className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          Manage Profile
        </button>
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
          <p className="text-[11px] text-slate-500 mt-2">
            Authorized teaching faculty member.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Faculty Rank</span>
            <Briefcase className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold tracking-tight text-slate-900">
            {profile?.designation || 'Professor'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Official academic appointment rank.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Application Decision</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold tracking-tight text-emerald-700">
            Verified & Active
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Approved by Super Administrator.
          </p>
        </div>
      </div>

      {/* Phase 2 Faculty Architecture Notice */}
      <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
            Faculty Console Roadmap
          </div>
          <h2 className="text-xl font-bold text-white">Phase 1 Faculty Verification Completed</h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
            Your application has passed administrative review. Phase 2 modules will equip you to create subject period schedules, initiate live QR attendance sessions, generate student attendance reports, and review roll number rosters.
          </p>
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={() => onNavigate('faculty-profile')}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Faculty Profile Settings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
