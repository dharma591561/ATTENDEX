import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { StudentRegisterPage } from './pages/StudentRegisterPage';
import { FacultyApplyPage } from './pages/FacultyApplyPage';
import { ApplicationStatusPage } from './pages/ApplicationStatusPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';

// Student Pages
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentProfilePage } from './pages/student/StudentProfilePage';

// Faculty Pages
import { FacultyDashboard } from './pages/faculty/FacultyDashboard';
import { FacultyProfilePage } from './pages/faculty/FacultyProfilePage';
import { AttendanceManagementPage } from './pages/faculty/AttendanceManagementPage';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminFacultyPage } from './pages/admin/AdminFacultyPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { AdminAcademicConfigPage } from './pages/admin/AdminAcademicConfigPage';
import { PeopleSearchPage } from './pages/PeopleSearchPage';

function getUrlProfileParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('profile');
    return p && p.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}

function MainRouter() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => {
    const profileParam = getUrlProfileParam();
    return profileParam ? `profile:${profileParam}` : 'landing';
  });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Connecting to CLASSYNC Portal...</p>
      </div>
    );
  }

  // Guard routing based on role
  const navigate = (view: string) => {
    const urlProfile = getUrlProfileParam();
    if (!view.startsWith('profile:') && urlProfile) {
      window.history.pushState({}, '', window.location.pathname);
    }

    // If user is logged in and selects landing or login, route to their role dashboard (or pending shared profile)
    if (user && (view === 'login' || view === 'landing')) {
      if (urlProfile) {
        setCurrentView(`profile:${urlProfile}`);
        return;
      }
      if (user.role === 'STUDENT') {
        setCurrentView('student-dashboard');
        return;
      }
      if (user.role === 'FACULTY') {
        setCurrentView('faculty-dashboard');
        return;
      }
      if (user.role === 'FOUNDER') {
        setCurrentView('admin-dashboard');
        return;
      }
    }

    // People Search & Profile View protection: must be an authenticated, approved user
    if ((view === 'people-search' || view.startsWith('profile:')) && !user) {
      setCurrentView('login');
      return;
    }

    // Role protection - student registration and faculty application are public entry points
    if (view.startsWith('student-') && view !== 'student-register' && (!user || user.role !== 'STUDENT')) {
      setCurrentView('login');
      return;
    }
    if (view.startsWith('faculty-') && view !== 'faculty-apply' && (!user || (user.role !== 'FACULTY' && user.role !== 'FOUNDER'))) {
      setCurrentView('login');
      return;
    }
    if (view.startsWith('admin-') && (!user || user.role !== 'FOUNDER')) {
      setCurrentView('login');
      return;
    }

    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    // Direct shareable profile URL requires authentication
    if (currentView.startsWith('profile:')) {
      const targetProfileId = currentView.slice('profile:'.length);
      if (!user) {
        return <LoginPage onNavigate={navigate} />;
      }
      return <PeopleSearchPage onNavigate={navigate} initialProfileUserId={targetProfileId} />;
    }

    switch (currentView) {
      case 'landing':
        return <LandingPage onNavigate={navigate} />;
      case 'login':
        return <LoginPage onNavigate={navigate} />;
      case 'student-register':
        return <StudentRegisterPage onNavigate={navigate} />;
      case 'faculty-apply':
        return <FacultyApplyPage onNavigate={navigate} />;
      case 'application-status':
        return <ApplicationStatusPage onNavigate={navigate} />;
      case 'forgot-password':
        return <ForgotPasswordPage onNavigate={navigate} />;

      // People Search & Directory
      case 'people-search':
        if (!user) return <LoginPage onNavigate={navigate} />;
        return <PeopleSearchPage onNavigate={navigate} />;

      // Student views
      case 'student-dashboard':
        return <StudentDashboard onNavigate={navigate} />;
      case 'student-profile':
        return <StudentProfilePage onNavigate={navigate} />;

      // Faculty views
      case 'faculty-dashboard':
        return <FacultyDashboard onNavigate={navigate} />;
      case 'faculty-profile':
        return <FacultyProfilePage onNavigate={navigate} />;
      case 'faculty-attendance':
        return <AttendanceManagementPage onNavigate={navigate} />;

      // Admin views
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={navigate} />;
      case 'admin-students':
        return <AdminStudentsPage onNavigate={navigate} />;
      case 'admin-faculty':
        return <AdminFacultyPage onNavigate={navigate} />;
      case 'admin-audit':
        return <AdminAuditLogsPage onNavigate={navigate} />;
      case 'admin-academic':
        return <AdminAcademicConfigPage onNavigate={navigate} />;
      case 'admin-attendance':
        return <AttendanceManagementPage onNavigate={navigate} />;

      default:
        return <LandingPage onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
      <Navbar currentView={currentView} onNavigate={navigate} />
      <main className="flex-1 flex flex-col">
        {renderContent()}
      </main>
      <Footer onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}
