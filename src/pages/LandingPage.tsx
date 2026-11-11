import React from 'react';
import { GraduationCap, BookOpen, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

interface LandingPageProps {
  onNavigate: (view: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Official College Academic System
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              CLASSYNC College Portal
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
              A centralized academic platform for student registration, faculty membership applications, attendance management, and institutional administration.
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

      {/* Account Roles & Portals Section */}
      <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900">Academic Portals & Access Control</h2>
          <p className="text-sm text-slate-600 mt-1">Select your academic role to register, check your application status, or sign in.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Student Role Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Student Portal</h3>
              <p className="text-xs text-slate-500 mt-1">Academic Enrollment & Profile Access</p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Register with your university email and academic roll number</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Track your registration approval status online</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Access your student dashboard and profile once approved</span>
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
              <p className="text-xs text-slate-500 mt-1">Departmental & Course Management</p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Submit your application with department and designation details</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Verify your university email during application submission</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Access the faculty console after administrator approval</span>
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
              <p className="text-xs text-slate-500 mt-1">Institutional Administration & Oversight</p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Review and approve student registration applications</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Evaluate and manage faculty membership applications</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Manage the student directory and administrative audit records</span>
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
      </section>
    </div>
  );
};


