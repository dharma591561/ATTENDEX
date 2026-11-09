import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { User } from './types';

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

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminFacultyPage } from './pages/admin/AdminFacultyPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';

function MainRouter() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<string>('landing');

  // Automatically route to role dashboard upon login or to landing upon logout
  useEffect(() => {
    if (user) {
      if (currentView === 'login' || currentView === 'landing') {
        if (user.role === 'STUDENT') setCurrentView('student-dashboard');
        else if (user.role === 'FACULTY') setCurrentView('faculty-dashboard');
        else if (user.role === 'FOUNDER') setCurrentView('admin-dashboard');
      }
    } else {
      if (currentView.startsWith('admin-') || (currentView.startsWith('student-') && currentView !== 'student-register') || (currentView.startsWith('faculty-') && currentView !== 'faculty-apply')) {
        setCurrentView('landing');
      }
    }
  }, [user]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Connecting to ATTENDX Portal...</p>
      </div>
    );
  }

  // Guard routing based on role
  const navigate = (view: string, currentUser?: User | null) => {
    const activeUser = currentUser !== undefined ? currentUser : user;

    // If user is logged in and selects landing or login, route to their role dashboard
    if (activeUser && (view === 'login' || view === 'landing')) {
      if (activeUser.role === 'STUDENT') {
        setCurrentView('student-dashboard');
        return;
      }
      if (activeUser.role === 'FACULTY') {
        setCurrentView('faculty-dashboard');
        return;
      }
      if (activeUser.role === 'FOUNDER') {
        setCurrentView('admin-dashboard');
        return;
      }
    }

    // Role protection - student registration and faculty application are public entry points
    if (view.startsWith('student-') && view !== 'student-register' && (!activeUser || activeUser.role !== 'STUDENT')) {
      setCurrentView('login');
      return;
    }
    if (view.startsWith('faculty-') && view !== 'faculty-apply' && (!activeUser || activeUser.role !== 'FACULTY')) {
      setCurrentView('login');
      return;
    }
    if (view.startsWith('admin-') && (!activeUser || activeUser.role !== 'FOUNDER')) {
      setCurrentView('login');
      return;
    }

    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
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

      // Admin views
      case 'admin-dashboard':
        return <AdminDashboard onNavigate={navigate} />;
      case 'admin-students':
        return <AdminStudentsPage onNavigate={navigate} />;
      case 'admin-faculty':
        return <AdminFacultyPage onNavigate={navigate} />;
      case 'admin-audit':
        return <AdminAuditLogsPage onNavigate={navigate} />;
      case 'admin-settings':
        return <AdminSettingsPage onNavigate={navigate} />;

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
