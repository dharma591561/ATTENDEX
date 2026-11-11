import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, BookOpen, ShieldCheck, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (view: string) => void;
  defaultRole?: 'STUDENT' | 'FACULTY' | 'FOUNDER';
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate, defaultRole = 'STUDENT' }) => {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<'STUDENT' | 'FACULTY' | 'FOUNDER'>(defaultRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please provide both email address and password.');
      return;
    }

    setLoading(true);

    try {
      const user = await login({
        email: email.trim(),
        password,
        expectedRole: selectedRole,
      });

      // Route to appropriate dashboard
      if (user.role === 'STUDENT') {
        onNavigate('student-dashboard');
      } else if (user.role === 'FACULTY') {
        onNavigate('faculty-dashboard');
      } else if (user.role === 'FOUNDER') {
        onNavigate('admin-dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">CLASSYNC Login Portal</h2>
          <p className="text-xs text-slate-500 mt-1">Select your academic role to access your portal</p>
        </div>

        {/* 3 Role Selection Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-6">
          <button
            type="button"
            onClick={() => {
              setSelectedRole('STUDENT');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              selectedRole === 'STUDENT'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Student</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole('FACULTY');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              selectedRole === 'FACULTY'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Faculty</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole('FOUNDER');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              selectedRole === 'FOUNDER'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Founder</span>
          </button>
        </div>

        {/* Notice for Founder Tab */}
        {selectedRole === 'FOUNDER' && (
          <div className="mb-4 p-3 bg-purple-50/70 border border-purple-200/80 rounded-lg text-xs text-purple-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Super Administrator Access:</span>
              <p className="mt-0.5 text-purple-800 text-[11px]">
                Founder accounts are initialized privately via the server-side CLI command (<code className="bg-purple-100 px-1 py-0.5 rounded">npm run init-founder</code>). No public signup is permitted.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
              {(selectedRole === 'FACULTY' || selectedRole === 'STUDENT') &&
                (error.toLowerCase().includes('pending') || error.toLowerCase().includes('rejected')) && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('application-status')}
                      className="font-semibold text-rose-900 underline hover:text-rose-950 cursor-pointer"
                    >
                      Check Application Status →
                    </button>
                  </div>
                )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {selectedRole === 'STUDENT'
                ? 'University Email Address'
                : selectedRole === 'FACULTY'
                ? 'Faculty Email Address'
                : 'Founder Administrator Email'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  selectedRole === 'STUDENT'
                    ? 'student@university.edu'
                    : selectedRole === 'FACULTY'
                    ? 'professor@university.edu'
                    : 'founder@classync.internal'
                }
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Password</label>
              <button
                type="button"
                onClick={() => onNavigate('forgot-password')}
                className="text-xs text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign in as {selectedRole.charAt(0) + selectedRole.slice(1).toLowerCase()}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Footer Links based on Role */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          {selectedRole === 'STUDENT' && (
            <div className="space-y-1">
              <p>
                New student?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('student-register')}
                  className="font-semibold text-slate-900 hover:underline cursor-pointer"
                >
                  Register your account
                </button>
              </p>
              <p>
                Registered recently?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('application-status')}
                  className="text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Check Application Status
                </button>
              </p>
            </div>
          )}

          {selectedRole === 'FACULTY' && (
            <div className="space-y-1">
              <p>
                Not yet registered?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('faculty-apply')}
                  className="font-semibold text-slate-900 hover:underline cursor-pointer"
                >
                  Submit Faculty Application
                </button>
              </p>
              <p>
                Applied previously?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('application-status')}
                  className="text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Check Application Status
                </button>
              </p>
            </div>
          )}

          {selectedRole === 'FOUNDER' && (
            <p className="text-[11px] text-slate-400">
              Founder login requires prior CLI initialization on the server.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

