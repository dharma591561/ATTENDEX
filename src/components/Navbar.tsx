import React from 'react';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, LogOut, User as UserIcon } from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    onNavigate('login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => onNavigate(user ? `${user.role.toLowerCase()}-dashboard` : 'landing')}
          className="flex items-center gap-2.5 text-left text-slate-900 hover:text-slate-700 transition-colors whitespace-nowrap shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded-md"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold shadow-xs">
            <GraduationCap className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">ATTENDX</span>
        </button>

        {/* Zone 2: Navigation Links (1-2 word labels, single-line, clean typography) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          {!user && (
            <>
              <button
                onClick={() => onNavigate('landing')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'landing' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => onNavigate('student-register')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'student-register' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Student Registration
              </button>
              <button
                onClick={() => onNavigate('faculty-apply')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'faculty-apply' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Faculty Application
              </button>
              <button
                onClick={() => onNavigate('application-status')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'application-status' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Status Inquiry
              </button>
            </>
          )}

          {user && user.role === 'STUDENT' && (
            <>
              <button
                onClick={() => onNavigate('student-dashboard')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'student-dashboard' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => onNavigate('student-profile')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'student-profile' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                My Profile
              </button>
            </>
          )}

          {user && user.role === 'FACULTY' && (
            <>
              <button
                onClick={() => onNavigate('faculty-dashboard')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'faculty-dashboard' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Faculty Console
              </button>
              <button
                onClick={() => onNavigate('faculty-profile')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'faculty-profile' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                My Profile
              </button>
            </>
          )}

          {user && user.role === 'FOUNDER' && (
            <>
              <button
                onClick={() => onNavigate('admin-dashboard')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'admin-dashboard' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Analytics
              </button>
              <button
                onClick={() => onNavigate('admin-students')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'admin-students' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Students Directory
              </button>
              <button
                onClick={() => onNavigate('admin-faculty')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'admin-faculty' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Faculty Applications
              </button>
              <button
                onClick={() => onNavigate('admin-audit')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'admin-audit' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                Audit Records
              </button>
              <button
                onClick={() => onNavigate('admin-settings')}
                className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  currentView === 'admin-settings' ? 'text-slate-900 font-semibold' : ''
                }`}
              >
                System & SMTP
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {!user ? (
            <button
              onClick={() => onNavigate('login')}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 shadow-xs cursor-pointer"
            >
              Portal Login
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-900 truncate max-w-[140px]">
                  {user.student_profile?.full_name || user.faculty_profile?.full_name || user.email}
                </span>
                <span className="text-[11px] text-slate-500 font-mono tracking-tight">
                  {user.role} · {user.status}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out of your account"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
