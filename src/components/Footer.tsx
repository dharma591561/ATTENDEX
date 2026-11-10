import React from 'react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">CLASSYNC</span>
            <span>·</span>
            <span>College Attendance & Student Management Platform</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => onNavigate('landing')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              System Overview
            </button>
            <button
              onClick={() => onNavigate('student-register')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Student Roster
            </button>
            <button
              onClick={() => onNavigate('faculty-apply')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Faculty Applications
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Login Portal
            </button>
          </div>

          <div>
            <span>Phase 1 Verified Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
