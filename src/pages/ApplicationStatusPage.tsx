import React, { useState } from 'react';
import { api } from '../api/client';
import { FacultyApplication, StudentApplication } from '../types';
import { BookOpen, GraduationCap, Search, CheckCircle2, Clock, AlertTriangle, ArrowRight, Mail, Hash } from 'lucide-react';

interface ApplicationStatusPageProps {
  onNavigate: (view: string) => void;
}

export const ApplicationStatusPage: React.FC<ApplicationStatusPageProps> = ({ onNavigate }) => {
  const [roleType, setRoleType] = useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [email, setEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [studentApp, setStudentApp] = useState<StudentApplication | null>(null);
  const [facultyApp, setFacultyApp] = useState<FacultyApplication | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSwitch = (nextRole: 'STUDENT' | 'FACULTY') => {
    setRoleType(nextRole);
    setError(null);
    setSearched(false);
    setStudentApp(null);
    setFacultyApp(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSearched(false);
    setStudentApp(null);
    setFacultyApp(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your university email address.');
      return;
    }

    if (roleType === 'STUDENT' && !rollNumber.trim()) {
      setError('Please enter your academic roll number to verify your identity.');
      return;
    }

    setLoading(true);

    try {
      if (roleType === 'STUDENT') {
        const res = await api.students.getStatus({
          email: cleanEmail,
          rollNumber: rollNumber.trim().toUpperCase(),
        });
        setStudentApp(res.application);
      } else {
        const res = await api.faculty.getStatus(cleanEmail);
        setFacultyApp(res.application);
      }
      setSearched(true);
    } catch (err: any) {
      setError(err.message || 'No matching application found for the provided credentials.');
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
            {roleType === 'STUDENT' ? (
              <GraduationCap className="w-4 h-4 text-slate-700" />
            ) : (
              <BookOpen className="w-4 h-4 text-slate-700" />
            )}
            <span>Application Tracking</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {roleType === 'STUDENT' ? 'Student Application Status' : 'Faculty Application Status'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {roleType === 'STUDENT'
              ? 'Verify your university email and academic roll number to check your registration approval status.'
              : 'Enter the university email address you used when submitting your faculty application.'}
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6">
          <button
            type="button"
            onClick={() => handleRoleSwitch('STUDENT')}
            className={`py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              roleType === 'STUDENT'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Student Application</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleSwitch('FACULTY')}
            className={`py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              roleType === 'FACULTY'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Faculty Application</span>
          </button>
        </div>

        <form onSubmit={handleSearch} className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">University Email Address *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={roleType === 'STUDENT' ? 'student@university.edu' : 'professor@university.edu'}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>

          {roleType === 'STUDENT' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Roll Number (Verification) *</label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                  placeholder="26UECSE0220"
                  className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{loading ? 'Checking Status...' : 'Check Application Status'}</span>
          </button>
        </form>

        {error && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 mb-6">
            <p className="font-semibold text-slate-800">{error}</p>
            <p className="mt-1">
              If you haven't registered yet, you can submit your application via the{' '}
              <button
                onClick={() => onNavigate(roleType === 'STUDENT' ? 'student-register' : 'faculty-apply')}
                className="text-slate-900 underline font-semibold cursor-pointer"
              >
                {roleType === 'STUDENT' ? 'Student Registration Form' : 'Faculty Application Form'}
              </button>
              .
            </p>
          </div>
        )}

        {/* Student Application Result */}
        {searched && roleType === 'STUDENT' && studentApp && (
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{studentApp.full_name}</h3>
                <p className="text-xs text-slate-600 font-mono font-semibold mt-0.5">{studentApp.roll_number}</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Branch: <span className="font-semibold text-slate-800">{studentApp.branch}</span> · Section:{' '}
                  <span className="font-semibold text-slate-800">{studentApp.section}</span>
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{studentApp.email}</p>
              </div>

              {studentApp.status === 'PENDING' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Review</span>
                </div>
              )}

              {studentApp.status === 'APPROVED' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved</span>
                </div>
              )}

              {studentApp.status === 'REJECTED' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Rejected</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 text-xs space-y-2">
              <div className="flex justify-between text-slate-500">
                <span>Submitted On:</span>
                <span className="font-mono text-slate-700">{new Date(studentApp.created_at).toLocaleDateString()}</span>
              </div>

              {studentApp.reviewed_at && (
                <div className="flex justify-between text-slate-500">
                  <span>Reviewed On:</span>
                  <span className="font-mono text-slate-700">{new Date(studentApp.reviewed_at).toLocaleDateString()}</span>
                </div>
              )}

              {studentApp.status === 'REJECTED' && studentApp.rejection_reason && (
                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-md text-rose-900 mt-2">
                  <span className="font-semibold block mb-0.5">Administrative Reason:</span>
                  <span>{studentApp.rejection_reason}</span>
                </div>
              )}

              {studentApp.status === 'APPROVED' && (
                <div className="pt-2">
                  <button
                    onClick={() => onNavigate('login')}
                    className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to Student Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {studentApp.status === 'PENDING' && (
                <p className="text-[11px] text-slate-500 pt-1">
                  Your student registration application is currently awaiting Founder Administrator review. Once approved, you will be able to log in using the password you created during registration.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Faculty Application Result */}
        {searched && roleType === 'FACULTY' && facultyApp && (
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{facultyApp.full_name}</h3>
                <p className="text-xs text-slate-600">{facultyApp.designation} · {facultyApp.department}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{facultyApp.email}</p>
              </div>

              {facultyApp.status === 'PENDING' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Pending Review</span>
                </div>
              )}

              {facultyApp.status === 'APPROVED' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved</span>
                </div>
              )}

              {facultyApp.status === 'REJECTED' && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Rejected</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 text-xs space-y-2">
              <div className="flex justify-between text-slate-500">
                <span>Submitted On:</span>
                <span className="font-mono text-slate-700">{new Date(facultyApp.created_at).toLocaleDateString()}</span>
              </div>

              {facultyApp.reviewed_at && (
                <div className="flex justify-between text-slate-500">
                  <span>Reviewed On:</span>
                  <span className="font-mono text-slate-700">{new Date(facultyApp.reviewed_at).toLocaleDateString()}</span>
                </div>
              )}

              {facultyApp.status === 'REJECTED' && facultyApp.rejection_reason && (
                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-md text-rose-900 mt-2">
                  <span className="font-semibold block mb-0.5">Administrative Reason:</span>
                  <span>{facultyApp.rejection_reason}</span>
                </div>
              )}

              {facultyApp.status === 'APPROVED' && (
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

              {facultyApp.status === 'PENDING' && (
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
            onClick={() => onNavigate(roleType === 'STUDENT' ? 'student-register' : 'faculty-apply')}
            className="font-semibold text-slate-900 hover:underline cursor-pointer"
          >
            {roleType === 'STUDENT' ? 'New Student Registration' : 'Submit Faculty Application'}
          </button>
        </div>
      </div>
    </div>
  );
};

