import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  AcademicBranchConfig,
  AttendanceSessionInfo,
  AttendanceRosterEntry,
  DailyReportPeriod,
} from '../../types';
import { downloadDailyReportPdf, shareOrDownloadDailyReportPdf } from '../../utils/pdfReport';
import {
  ClipboardCheck,
  QrCode,
  FileText,
  History,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Download,
  Share2,
  Save,
  RotateCcw,
  Play,
  Square,
  ArrowLeft,
  Check,
  X,
  RefreshCw,
  MapPin,
  Edit3,
} from 'lucide-react';

interface AttendanceManagementPageProps {
  onNavigate: (view: string) => void;
  initialTab?: 'TAKE' | 'REPORTS' | 'HISTORY';
}

export const AttendanceManagementPage: React.FC<AttendanceManagementPageProps> = ({
  onNavigate,
  initialTab = 'TAKE',
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'TAKE' | 'REPORTS' | 'HISTORY'>(initialTab);

  // Shared Academic Structure
  const [branches, setBranches] = useState<AcademicBranchConfig[]>([]);
  const [loadingStructure, setLoadingStructure] = useState(true);

  // Global Feedback
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ============================================================================
  // TAB 1: TAKE ATTENDANCE STATE (MANUAL & DYNAMIC QR)
  // ============================================================================
  const todayStr = new Date().toISOString().slice(0, 10);
  const [branch, setBranch] = useState('CSE');
  const [section, setSection] = useState('1');
  const [sessionDate, setSessionDate] = useState(todayStr);
  const [subjectName, setSubjectName] = useState('');
  const [periodNumber, setPeriodNumber] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:50');
  const [method, setMethod] = useState<'MANUAL' | 'QR'>('MANUAL');
  const [qrDurationMinutes, setQrDurationMinutes] = useState<number>(5);
  const [qrRefreshIntervalSeconds, setQrRefreshIntervalSeconds] = useState<number>(5);

  // Roster Preview / Active Session State
  const [overlapWarnings, setOverlapWarnings] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSessionInfo | null>(null);
  const [rosterEntries, setRosterEntries] = useState<AttendanceRosterEntry[]>([]);
  const [correctionLogs, setCorrectionLogs] = useState<any[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingSession, setSubmittingSession] = useState(false);
  const [confirmUnmarkedModal, setConfirmUnmarkedModal] = useState<number | null>(null);

  // Live QR State
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrSecondsToRefresh, setQrSecondsToRefresh] = useState<number>(0);
  const [qrSecondsToExpiry, setQrSecondsToExpiry] = useState<number>(0);
  const [qrGeofenceMode, setQrGeofenceMode] = useState<string>('GPS_VERIFIED');
  const [showLiveRosterDuringQr, setShowLiveRosterDuringQr] = useState<boolean>(true);
  const qrWindowIndexRef = useRef<number | null>(null);

  // ============================================================================
  // TAB 2: DAILY REPORTS STATE
  // ============================================================================
  const [reportBranch, setReportBranch] = useState('CSE');
  const [reportSection, setReportSection] = useState('1');
  const [reportDate, setReportDate] = useState(todayStr);
  const [dailyReport, setDailyReport] = useState<{
    institutionName: string;
    branch: string;
    section: string;
    date: string;
    totalReportedSessions: number;
    generatedAt: string;
    periods: DailyReportPeriod[];
  } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [absenteeEdits, setAbsenteeEdits] = useState<Record<string, string>>({});
  const [savingReportSessionId, setSavingReportSessionId] = useState<string | null>(null);
  const [savingAllReportCorrections, setSavingAllReportCorrections] = useState(false);

  // ============================================================================
  // TAB 3: ATTENDANCE HISTORY STATE
  // ============================================================================
  const [histBranch, setHistBranch] = useState('');
  const [histSection, setHistSection] = useState('');
  const [histDate, setHistDate] = useState('');
  const [histMethod, setHistMethod] = useState('');
  const [histMineOnly, setHistMineOnly] = useState(user?.role === 'FACULTY');
  const [historySessions, setHistorySessions] = useState<AttendanceSessionInfo[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load Academic Structure on mount
  useEffect(() => {
    loadAcademicStructure();
  }, []);

  const loadAcademicStructure = async () => {
    setLoadingStructure(true);
    try {
      const res = await api.attendance.getAcademicStructure();
      const list: AcademicBranchConfig[] = res.branches || [];
      setBranches(list);
      if (list.length > 0) {
        const defaultBranch = list.find((b) => b.name === 'CSE') || list[0];
        setBranch(defaultBranch.name);
        setReportBranch(defaultBranch.name);
        const firstEnabled = defaultBranch.enabledSections?.[0] || '1';
        setSection(firstEnabled);
        setReportSection(firstEnabled);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load academic branches and sections.');
    } finally {
      setLoadingStructure(false);
    }
  };

  // Keep section selector valid when branch changes
  const getEnabledSectionsForBranch = (branchName: string): string[] => {
    const found = branches.find((b) => b.name === branchName);
    if (!found) return ['1', '2', '3'];
    return found.enabledSections || [];
  };

  const handleBranchChange = (newBranch: string, target: 'TAKE' | 'REPORT') => {
    const enabled = getEnabledSectionsForBranch(newBranch);
    if (target === 'TAKE') {
      setBranch(newBranch);
      setSection(enabled[0] || '');
    } else {
      setReportBranch(newBranch);
      setReportSection(enabled[0] || '');
    }
  };

  // ============================================================================
  // LIVE QR POLLING & COUNTDOWN EFFECT
  // ============================================================================
  useEffect(() => {
    if (!activeSession || activeSession.method !== 'QR' || activeSession.status !== 'ACTIVE') {
      return;
    }

    let cancelled = false;

    const fetchQrAndLiveRoster = async () => {
      try {
        const qrRes = await api.attendance.getQrToken(activeSession.id);
        if (cancelled) return;

        if (!qrRes.active) {
          // Session expired or ended on server -> reload full session state
          const full = await api.attendance.getSession(activeSession.id);
          if (!cancelled) {
            setActiveSession(full.session);
            setRosterEntries(full.entries || []);
            setCorrectionLogs(full.corrections || []);
            setQrDataUrl(null);
            setSuccessMsg(
              'QR attendance window completed. Remaining unmarked students have been marked Absent for your review before final submission.'
            );
          }
          return;
        }

        setQrDataUrl(qrRes.qrDataUrl);
        setQrSecondsToRefresh(qrRes.secondsUntilNextRefresh);
        setQrSecondsToExpiry(qrRes.secondsUntilSessionExpiry);
        if (qrRes.geofenceMode) {
          setQrGeofenceMode(qrRes.geofenceMode);
        }
        qrWindowIndexRef.current = qrRes.windowIndex ?? null;

        // Also refresh live roster entries so teacher sees students marked Present in real time
        const full = await api.attendance.getSession(activeSession.id);
        if (!cancelled) {
          setActiveSession(full.session);
          setRosterEntries(full.entries || []);
        }
      } catch {
        // Ignore transient network poll errors
      }
    };

    fetchQrAndLiveRoster();
    const pollInterval = setInterval(fetchQrAndLiveRoster, 1500);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [activeSession?.id, activeSession?.status, activeSession?.method]);

  // ============================================================================
  // TAKE ATTENDANCE HANDLERS
  // ============================================================================

  const handleCheckRosterPreview = async () => {
    setError(null);
    setSuccessMsg(null);
    if (!branch || !section) {
      setError('Please select a valid branch and enabled numeric section.');
      return;
    }
    setLoadingRoster(true);
    try {
      const preview = await api.attendance.getRosterPreview({
        branch,
        section,
        date: sessionDate,
        startTime,
        endTime,
      });
      setOverlapWarnings(preview.overlapWarnings || []);
      setSuccessMsg(
        `Verified ${preview.totalStudents} Founder-approved student(s) in ${preview.branch} — Section ${preview.section}.`
      );
    } catch (err: any) {
      setError(err.message || 'Error previewing student roster.');
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleStartOrLoadSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!branch || !section) {
      setError('Please select a branch and an enabled section (1, 2, or 3).');
      return;
    }
    if (!subjectName.trim()) {
      setError('Please enter the subject or period name.');
      return;
    }

    setLoadingRoster(true);
    try {
      const preview = await api.attendance.getRosterPreview({
        branch,
        section,
        date: sessionDate,
        startTime,
        endTime,
      });
      setOverlapWarnings(preview.overlapWarnings || []);

      const created = await api.attendance.createSession({
        branch,
        section,
        sessionDate,
        subjectName: subjectName.trim(),
        periodNumber: periodNumber.trim() || undefined,
        startTime,
        endTime,
        method,
        qrDurationMinutes: method === 'QR' ? qrDurationMinutes : undefined,
        qrRefreshIntervalSeconds: method === 'QR' ? qrRefreshIntervalSeconds : undefined,
      });

      const full = await api.attendance.getSession(created.sessionId);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setCorrectionLogs(full.corrections || []);
      setSuccessMsg(created.message);
    } catch (err: any) {
      setError(err.message || 'Failed to start attendance session.');
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleLoadExistingSession = async (sessionId: string) => {
    setError(null);
    setSuccessMsg(null);
    setLoadingRoster(true);
    try {
      const full = await api.attendance.getSession(sessionId);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setCorrectionLogs(full.corrections || []);
      setActiveTab('TAKE');
    } catch (err: any) {
      setError(err.message || 'Error loading session.');
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleSetStudentStatus = async (studentUserId: string, nextStatus: 'PRESENT' | 'ABSENT' | 'UNMARKED') => {
    if (!activeSession || !activeSession.canEdit) return;

    // Optimistic UI update
    const previousEntries = [...rosterEntries];
    setRosterEntries((prev) =>
      prev.map((entry) =>
        entry.studentUserId === studentUserId ? { ...entry, status: nextStatus } : entry
      )
    );

    try {
      await api.attendance.updateSessionEntries(activeSession.id, [
        { studentUserId, status: nextStatus },
      ]);
    } catch (err: any) {
      setRosterEntries(previousEntries);
      setError(err.message || 'Failed to update student status.');
    }
  };

  const handleBulkMark = async (targetStatus: 'PRESENT' | 'ABSENT' | 'UNMARKED') => {
    if (!activeSession || !activeSession.canEdit || rosterEntries.length === 0) return;
    setError(null);
    setSavingDraft(true);

    const updates = rosterEntries.map((e) => ({
      studentUserId: e.studentUserId,
      status: targetStatus,
    }));

    try {
      await api.attendance.updateSessionEntries(activeSession.id, updates);
      const full = await api.attendance.getSession(activeSession.id);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setCorrectionLogs(full.corrections || []);
      setSuccessMsg(
        targetStatus === 'PRESENT'
          ? 'Marked all students Present.'
          : targetStatus === 'ABSENT'
          ? 'Marked all students Absent.'
          : 'Cleared all selections to Unmarked.'
      );
    } catch (err: any) {
      setError(err.message || 'Error applying bulk attendance status.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeSession || !activeSession.canEdit) return;
    setSavingDraft(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updates = rosterEntries.map((e) => ({
        studentUserId: e.studentUserId,
        status: e.status,
      }));
      await api.attendance.updateSessionEntries(activeSession.id, updates);
      const full = await api.attendance.getSession(activeSession.id);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setCorrectionLogs(full.corrections || []);
      setSuccessMsg('Attendance draft saved to SQLite database.');
    } catch (err: any) {
      setError(err.message || 'Error saving draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleEndQrEarly = async () => {
    if (!activeSession) return;
    setError(null);
    try {
      const res = await api.attendance.endQrSession(activeSession.id);
      const full = await api.attendance.getSession(activeSession.id);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setQrDataUrl(null);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setError(err.message || 'Error ending QR session.');
    }
  };

  const handleSubmitSession = async (confirmMarkUnmarkedAbsent: boolean = false) => {
    if (!activeSession) return;
    setError(null);
    setSuccessMsg(null);

    const unmarkedCount = rosterEntries.filter((e) => e.status === 'UNMARKED').length;
    if (unmarkedCount > 0 && !confirmMarkUnmarkedAbsent) {
      setConfirmUnmarkedModal(unmarkedCount);
      return;
    }

    setSubmittingSession(true);
    try {
      const res = await api.attendance.submitSession(activeSession.id, confirmMarkUnmarkedAbsent);
      setConfirmUnmarkedModal(null);
      const full = await api.attendance.getSession(activeSession.id);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setCorrectionLogs(full.corrections || []);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setError(err.message || 'Error submitting attendance session.');
    } finally {
      setSubmittingSession(false);
    }
  };

  const handleReopenSession = async () => {
    if (!activeSession) return;
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.attendance.reopenSession(activeSession.id);
      const full = await api.attendance.getSession(activeSession.id);
      setActiveSession(full.session);
      setRosterEntries(full.entries || []);
      setCorrectionLogs(full.corrections || []);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setError(err.message || 'Error reopening session.');
    }
  };

  // ============================================================================
  // DAILY REPORTS HANDLERS
  // ============================================================================

  const loadDailyReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!reportBranch || !reportSection || !reportDate) {
      setError('Please select a branch, section, and date to load the daily report.');
      return;
    }
    setLoadingReport(true);
    setError(null);
    try {
      const res = await api.attendance.getDailyReport({
        branch: reportBranch,
        section: reportSection,
        date: reportDate,
      });
      setDailyReport(res);
      const editsMap: Record<string, string> = {};
      for (const p of res.periods || []) {
        editsMap[p.sessionId] = p.absentShortRollsText || '';
      }
      setAbsenteeEdits(editsMap);
    } catch (err: any) {
      setError(err.message || 'Error loading daily report.');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleSaveSinglePeriodAbsentees = async (sessionId: string) => {
    const rawInput = absenteeEdits[sessionId] ?? '';
    setSavingReportSessionId(sessionId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.attendance.updateDailyReportAbsentees(
        sessionId,
        rawInput,
        'Direct absentee roll number edit in Daily Report'
      );
      setSuccessMsg(res.message);
      await loadDailyReport();
    } catch (err: any) {
      setError(err.message || 'Error saving absentee roll numbers.');
    } finally {
      setSavingReportSessionId(null);
    }
  };

  const handleSaveAllReportCorrections = async () => {
    if (!dailyReport) return;
    setSavingAllReportCorrections(true);
    setError(null);
    setSuccessMsg(null);
    try {
      let totalChanged = 0;
      for (const p of dailyReport.periods) {
        if (!p.canEdit) continue;
        const currentInput = (absenteeEdits[p.sessionId] ?? '').trim();
        if (currentInput !== (p.absentShortRollsText || '').trim()) {
          const res = await api.attendance.updateDailyReportAbsentees(
            p.sessionId,
            currentInput,
            'Direct absentee roll number edit in Daily Report'
          );
          totalChanged += res.changesCount;
        }
      }
      await loadDailyReport();
      setSuccessMsg(
        totalChanged > 0
          ? `Saved ${totalChanged} absentee correction(s) across daily report periods.`
          : 'All period absentee lists are up to date.'
      );
    } catch (err: any) {
      setError(err.message || 'Validation failed while saving daily report corrections.');
    } finally {
      setSavingAllReportCorrections(false);
    }
  };

  // ============================================================================
  // HISTORY HANDLERS
  // ============================================================================

  const loadHistory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoadingHistory(true);
    setError(null);
    try {
      const res = await api.attendance.getHistory({
        branch: histBranch || undefined,
        section: histSection || undefined,
        date: histDate || undefined,
        method: histMethod || undefined,
        mineOnly: histMineOnly,
      });
      setHistorySessions(res.sessions || []);
    } catch (err: any) {
      setError(err.message || 'Error loading attendance history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'REPORTS') {
      loadDailyReport();
    } else if (activeTab === 'HISTORY') {
      loadHistory();
    }
  }, [activeTab]);

  // Derived Roster Filter & Counts
  const filteredRoster = rosterEntries.filter((entry) => {
    if (!rosterSearch.trim()) return true;
    const q = rosterSearch.trim().toLowerCase();
    return (
      entry.fullName.toLowerCase().includes(q) ||
      entry.rollNumber.toLowerCase().includes(q) ||
      entry.shortRollNumber.toLowerCase().includes(q)
    );
  });

  const totalCount = rosterEntries.length;
  const presentCount = rosterEntries.filter((e) => e.status === 'PRESENT').length;
  const absentCount = rosterEntries.filter((e) => e.status === 'ABSENT').length;
  const unmarkedCount = rosterEntries.filter((e) => e.status === 'UNMARKED').length;

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Navigation & Context Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => onNavigate(user?.role === 'FOUNDER' ? 'admin-dashboard' : 'faculty-dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to {user?.role === 'FOUNDER' ? 'Admin Console' : 'Faculty Dashboard'}</span>
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            CLASSYNC Attendance Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Synchronized Period-Wise Manual & Dynamic QR Attendance, Day-Wise Reports, and Audit History
          </p>
        </div>

        {/* Main 3 Module Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl">
          <button
            onClick={() => setActiveTab('TAKE')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'TAKE' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>1. Take Attendance</span>
          </button>
          <button
            onClick={() => setActiveTab('REPORTS')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'REPORTS' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>2. Daily Reports</span>
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'HISTORY' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>3. Attendance History</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================================
          TAB 1: TAKE ATTENDANCE (PERIOD-WISE MANUAL & DYNAMIC QR)
         ============================================================================ */}
      {activeTab === 'TAKE' && (
        <div className="space-y-6">
          {/* Session Configuration Form (Shown when no active session is open, or collapsible to start a new session) */}
          {!activeSession ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Period-Wise Session Setup</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select configured college branch, numeric section, flexible class/lab timings, and attendance method.
                  </p>
                </div>
              </div>

              <form onSubmit={handleStartOrLoadSession} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Branch Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Branch *</label>
                    <select
                      value={branch}
                      onChange={(e) => handleBranchChange(e.target.value, 'TAKE')}
                      disabled={loadingStructure}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Numeric Section Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Section (1, 2, 3) *</label>
                    {getEnabledSectionsForBranch(branch).length === 0 ? (
                      <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
                        No sections enabled for {branch}. Configure in Founder Academic Configuration.
                      </div>
                    ) : (
                      <select
                        value={section}
                        onChange={(e) => setSection(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        {getEnabledSectionsForBranch(branch).map((sec) => (
                          <option key={sec} value={sec}>
                            Section {sec}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                    <input
                      type="date"
                      required
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {/* Optional Period Number */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Period / Slot Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={periodNumber}
                      onChange={(e) => setPeriodNumber(e.target.value)}
                      placeholder="e.g. 1, 2, or Lab 1-3"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Subject Name */}
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Subject or Course Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={subjectName}
                      onChange={(e) => setSubjectName(e.target.value)}
                      placeholder="e.g. Compiler Design / DBMS Lab"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {/* Flexible Start Time */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time (24h) *</label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {/* Flexible End Time */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">End Time (24h) *</label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Attendance Method Selection */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                        Attendance Capture Method
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Both methods store entries in the same unified period-wise roster and daily report database.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMethod('MANUAL')}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
                          method === 'MANUAL'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>Manual Attendance</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethod('QR')}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
                          method === 'QR'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Dynamic QR Attendance</span>
                      </button>
                    </div>
                  </div>

                  {/* QR Presets if QR method selected */}
                  {method === 'QR' && (
                    <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          QR Attendance Window Duration (Default: 5 mins)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[1, 3, 5, 10, 15].map((mins) => (
                            <button
                              type="button"
                              key={mins}
                              onClick={() => setQrDurationMinutes(mins)}
                              className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border cursor-pointer ${
                                qrDurationMinutes === mins
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {mins} min{mins > 1 ? 's' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Rotating QR Token Refresh Interval (Default: 5 secs)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[5, 10, 15, 20, 30].map((secs) => (
                            <button
                              type="button"
                              key={secs}
                              onClick={() => setQrRefreshIntervalSeconds(secs)}
                              className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border cursor-pointer ${
                                qrRefreshIntervalSeconds === secs
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {secs}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Overlap Warnings */}
                {overlapWarnings.length > 0 && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <span>Overlapping Session Notice (Non-Blocking)</span>
                    </div>
                    <p className="text-[11px]">
                      Another session is recorded for {branch} — Section {section} on {sessionDate} during this time range:
                    </p>
                    <ul className="list-disc list-inside text-[11px] font-mono">
                      {overlapWarnings.map((w) => (
                        <li key={w.id}>
                          {w.startTime}–{w.endTime} · {w.subjectName} ({w.method} · {w.status}) by {w.facultyName}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCheckRosterPreview}
                    disabled={loadingRoster || !section}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Verify Roster Count
                  </button>
                  <button
                    type="submit"
                    disabled={loadingRoster || !section}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    {method === 'QR' ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>{loadingRoster ? 'Starting...' : 'Generate & Start QR Session'}</span>
                      </>
                    ) : (
                      <>
                        <Users className="w-3.5 h-3.5" />
                        <span>{loadingRoster ? 'Loading Roster...' : 'Load Students'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ACTIVE SESSION WORKSPACE (QR DISPLAY + LIVE/MANUAL ROSTER TABLE) */
            <div className="space-y-6">
              {/* Session Summary Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-sm bg-slate-900 text-white">
                      {activeSession.branch} — Section {activeSession.section}
                    </span>
                    <span className="px-2.5 py-0.5 text-[11px] font-mono font-semibold rounded-sm bg-slate-100 text-slate-800 border border-slate-200">
                      {activeSession.startTime} – {activeSession.endTime}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 text-[11px] font-mono font-semibold rounded-sm border ${
                        activeSession.status === 'SUBMITTED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeSession.status === 'ACTIVE'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {activeSession.method} · {activeSession.status}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1.5">
                    {activeSession.subjectName}
                    {activeSession.periodNumber ? ` (Period ${activeSession.periodNumber})` : ''}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Date: <span className="font-mono">{activeSession.sessionDate}</span> · Faculty:{' '}
                    <span className="font-medium text-slate-700">{activeSession.facultyName}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeSession.status === 'SUBMITTED' && activeSession.canEdit && (
                    <button
                      onClick={handleReopenSession}
                      className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reopen Session for Corrections</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setActiveSession(null);
                      setRosterEntries([]);
                      setQrDataUrl(null);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    New / Switch Session
                  </button>
                </div>
              </div>

              {/* FACULTY DYNAMIC QR PROJECTION PANEL (When QR Session is ACTIVE) */}
              {activeSession.method === 'QR' && activeSession.status === 'ACTIVE' && (
                <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-8 shadow-md">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    {/* Left: Rotating QR Code */}
                    <div className="lg:col-span-5 flex flex-col items-center">
                      <div className="bg-white p-4 rounded-2xl shadow-lg border-4 border-slate-700 w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt="Rotating Attendance QR Code"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-xs text-slate-500 font-mono text-center">
                            Generating rotating server QR token...
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-slate-300">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>Next QR token rotation in {qrSecondsToRefresh}s</span>
                      </div>
                    </div>

                    {/* Right: Live Session Telemetry & Controls */}
                    <div className="lg:col-span-7 space-y-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-2.5 py-0.5 text-xs font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-sm">
                            LIVE QR ATTENDANCE ACTIVE
                          </span>
                          {qrGeofenceMode === 'DEMO_MODE' ? (
                            <span className="px-2.5 py-0.5 text-xs font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-sm">
                              FOUNDER DEMO MODE (GPS ENFORCEMENT OFF)
                            </span>
                          ) : qrGeofenceMode === 'GPS_UNCONFIGURED' ? (
                            <span className="px-2.5 py-0.5 text-xs font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-sm">
                              WARNING: CAMPUS GPS COORDINATES UNCONFIGURED
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 text-xs font-mono font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-sm">
                              CAMPUS GPS VERIFICATION ACTIVE
                            </span>
                          )}
                        </div>
                        <h3 className="text-2xl font-bold text-white">
                          {activeSession.branch} — Section {activeSession.section} · {activeSession.subjectName}
                        </h3>
                        <p className="text-xs text-slate-300 mt-1">
                          Students enrolled in {activeSession.branch} Section {activeSession.section} automatically see this active session on their dashboard and can scan using their camera.
                        </p>
                      </div>

                      {/* Countdown & Live Counters */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
                          <div className="text-[11px] text-slate-400 uppercase font-mono">Session Expiry</div>
                          <div className="text-2xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
                            {formatCountdown(qrSecondsToExpiry)}
                          </div>
                        </div>
                        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
                          <div className="text-[11px] text-slate-400 uppercase font-mono">Total Roster</div>
                          <div className="text-2xl font-bold font-mono text-white mt-1 tabular-nums">{totalCount}</div>
                        </div>
                        <div className="bg-emerald-950/60 border border-emerald-700/50 rounded-xl p-4">
                          <div className="text-[11px] text-emerald-300 uppercase font-mono">Present Scans</div>
                          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
                            {presentCount}
                          </div>
                        </div>
                        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
                          <div className="text-[11px] text-slate-400 uppercase font-mono">Pending / Unmarked</div>
                          <div className="text-2xl font-bold font-mono text-slate-200 mt-1 tabular-nums">
                            {unmarkedCount}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowLiveRosterDuringQr((prev) => !prev)}
                          className="px-4 py-2.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          {showLiveRosterDuringQr ? 'Hide Live Roster Table' : 'View Live Attendance Roster'}
                        </button>
                        <button
                          type="button"
                          onClick={handleEndQrEarly}
                          className="px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>End QR Session & Review Roster</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PERIOD-WISE ROSTER & MANUAL CONTROLS */}
              {(activeSession.method === 'MANUAL' ||
                activeSession.status !== 'ACTIVE' ||
                showLiveRosterDuringQr) && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  {/* Live Status Counters & Bulk Actions Bar */}
                  <div className="p-5 bg-slate-50 border-b border-slate-200 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white border border-slate-200 rounded-lg p-3.5">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Students</span>
                        <div className="text-xl font-bold font-mono text-slate-900 mt-0.5 tabular-nums">
                          {totalCount}
                        </div>
                      </div>
                      <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3.5">
                        <span className="text-[11px] font-semibold text-emerald-800 uppercase">Present</span>
                        <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5 tabular-nums">
                          {presentCount}
                        </div>
                      </div>
                      <div className="bg-rose-50/60 border border-rose-200 rounded-lg p-3.5">
                        <span className="text-[11px] font-semibold text-rose-800 uppercase">Absent</span>
                        <div className="text-xl font-bold font-mono text-rose-700 mt-0.5 tabular-nums">
                          {absentCount}
                        </div>
                      </div>
                      <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3.5">
                        <span className="text-[11px] font-semibold text-amber-800 uppercase">Unmarked</span>
                        <div className="text-xl font-bold font-mono text-amber-800 mt-0.5 tabular-nums">
                          {unmarkedCount}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                      {/* Search input */}
                      <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          type="text"
                          value={rosterSearch}
                          onChange={(e) => setRosterSearch(e.target.value)}
                          placeholder="Search student by name, roll number, or class roll (e.g. 220)..."
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      {/* Bulk Marking Buttons */}
                      {activeSession.canEdit && activeSession.status !== 'SUBMITTED' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={savingDraft || totalCount === 0}
                            onClick={() => handleBulkMark('PRESENT')}
                            className="px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Mark All Present
                          </button>
                          <button
                            type="button"
                            disabled={savingDraft || totalCount === 0}
                            onClick={() => handleBulkMark('ABSENT')}
                            className="px-3 py-2 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Mark All Absent
                          </button>
                          <button
                            type="button"
                            disabled={savingDraft || totalCount === 0}
                            onClick={() => handleBulkMark('UNMARKED')}
                            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Student Roster Table */}
                  {totalCount === 0 ? (
                    <div className="p-10 text-center text-xs text-slate-500">
                      No Founder-approved active students found for {activeSession.branch} — Section{' '}
                      {activeSession.section}. Approve pending student registrations in the Founder console first.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 w-16">S.No</th>
                            <th className="px-4 py-3">Class Roll</th>
                            <th className="px-4 py-3">Official Roll Number</th>
                            <th className="px-4 py-3">Student Name</th>
                            <th className="px-4 py-3">Current Status</th>
                            <th className="px-4 py-3 text-right">Mark Attendance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredRoster.map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-mono text-slate-500">{entry.serialNumber}</td>
                              <td className="px-4 py-3">
                                <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {entry.shortRollNumber}
                                </span>
                                {entry.isShortRollAmbiguous && (
                                  <span
                                    className="ml-1.5 text-[10px] font-mono text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200"
                                    title="Multiple students share this last-4-digit roll suffix; identify by full official roll number"
                                  >
                                    Duplicate Suffix
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono font-medium text-slate-700">{entry.rollNumber}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{entry.fullName}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-mono font-semibold border ${
                                      entry.status === 'PRESENT'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : entry.status === 'ABSENT'
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    {entry.status}
                                  </span>
                                  {entry.verificationMode && entry.verificationMode !== 'MANUAL' && (
                                    <span className="text-[10px] font-mono text-slate-500">
                                      ({entry.verificationMode})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {/* TWO SIDE-BY-SIDE BUTTONS: [ Present ] [ Absent ] */}
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={!activeSession.canEdit || activeSession.status === 'SUBMITTED'}
                                    onClick={() => handleSetStudentStatus(entry.studentUserId, 'PRESENT')}
                                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                                      entry.status === 'PRESENT'
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Present</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={!activeSession.canEdit || activeSession.status === 'SUBMITTED'}
                                    onClick={() => handleSetStudentStatus(entry.studentUserId, 'ABSENT')}
                                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                                      entry.status === 'ABSENT'
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-rose-500 hover:text-rose-700'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Absent</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Footer Action Bar: Save Draft & Submit */}
                  {activeSession.canEdit && activeSession.status !== 'SUBMITTED' && (
                    <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                      <div className="text-xs text-slate-600">
                        {unmarkedCount > 0 ? (
                          <span>
                            <strong className="text-amber-800">{unmarkedCount}</strong> student(s) are currently{' '}
                            <span className="font-mono">UNMARKED</span>.
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">
                            All {totalCount} students have been marked. Ready for submission.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={savingDraft}
                          onClick={handleSaveDraft}
                          className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={submittingSession}
                          onClick={() => handleSubmitSession(false)}
                          className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{submittingSession ? 'Submitting...' : 'Review & Submit Attendance'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================================
          TAB 2: DAY-WISE ATTENDANCE REPORTS & DIRECT ABSENTEE EDITING
         ============================================================================ */}
      {activeTab === 'REPORTS' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <form onSubmit={loadDailyReport} className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                  <select
                    value={reportBranch}
                    onChange={(e) => handleBranchChange(e.target.value, 'REPORT')}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                  <select
                    value={reportSection}
                    onChange={(e) => setReportSection(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {(['1', '2', '3'] as const).map((sec) => (
                      <option key={sec} value={sec}>
                        Section {sec}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Report Date</label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loadingReport}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  {loadingReport ? 'Loading...' : 'Load Daily Report'}
                </button>
              </div>

              {/* Action Buttons: Save Corrections, Download PDF, Share Report */}
              {dailyReport && dailyReport.periods.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingAllReportCorrections}
                    onClick={handleSaveAllReportCorrections}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingAllReportCorrections ? 'Saving...' : 'Save Corrections'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const file = downloadDailyReportPdf(dailyReport);
                      setSuccessMsg(`Downloaded official PDF report: ${file}`);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const result = await shareOrDownloadDailyReportPdf(dailyReport);
                        setSuccessMsg(result.message);
                      } catch (err: any) {
                        if (err?.name !== 'AbortError') {
                          setError(err.message || 'Could not share report.');
                        }
                      }
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Report</span>
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Day-Wise Report Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Day-Wise Attendance Report — {reportBranch} · Section {reportSection} ({reportDate})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Directly edit absent class roll numbers (comma or space separated, e.g. <span className="font-mono">123, 220</span>) to update both the daily report and period-wise records.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                {dailyReport?.totalReportedSessions ?? 0} Submitted Period(s)
              </span>
            </div>

            {!dailyReport || dailyReport.periods.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No submitted attendance sessions found for {reportBranch} — Section {reportSection} on {reportDate}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-14">S.No</th>
                      <th className="px-4 py-3 w-32">Time Range</th>
                      <th className="px-4 py-3 w-56">Subject / Period</th>
                      <th className="px-4 py-3 w-28 text-center">Absentees</th>
                      <th className="px-4 py-3">Absent Class Roll Numbers (Direct Edit)</th>
                      <th className="px-4 py-3 w-36 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyReport.periods.map((period) => {
                      const editedValue = absenteeEdits[period.sessionId] ?? period.absentShortRollsText;
                      const isDirty = editedValue.trim() !== (period.absentShortRollsText || '').trim();

                      return (
                        <tr key={period.sessionId} className="hover:bg-slate-50/70 align-top">
                          <td className="px-4 py-4 font-mono font-bold text-slate-700">{period.serialNumber}</td>
                          <td className="px-4 py-4 font-mono text-slate-800 whitespace-nowrap">
                            {period.startTime} – {period.endTime}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-bold text-slate-900">
                              {period.subjectName}
                              {period.periodNumber ? ` (P${period.periodNumber})` : ''}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {period.facultyName} · <span className="font-mono">{period.method}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-mono font-bold text-xs ${
                                period.absentCount === 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border border-rose-200'
                              }`}
                            >
                              {period.absentCount} / {period.totalStudents}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {period.canEdit ? (
                              <div className="space-y-1.5">
                                <textarea
                                  rows={2}
                                  value={editedValue}
                                  onChange={(e) =>
                                    setAbsenteeEdits((prev) => ({
                                      ...prev,
                                      [period.sessionId]: e.target.value,
                                    }))
                                  }
                                  placeholder="Enter absent roll numbers separated by commas (leave empty if all Present)"
                                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                                />
                                <div className="text-[11px] text-slate-400">
                                  {period.absentCount === 0
                                    ? 'Currently NIL (All students Present)'
                                    : `Saved absentees: ${period.absentShortRollsText}`}
                                </div>
                              </div>
                            ) : (
                              <div className="font-mono text-xs text-slate-800">
                                {period.absentCount === 0 ? 'NIL (All Present)' : period.absentShortRollsText}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right space-y-1.5">
                            {period.canEdit && (
                              <button
                                type="button"
                                disabled={savingReportSessionId === period.sessionId}
                                onClick={() => handleSaveSinglePeriodAbsentees(period.sessionId)}
                                className={`w-full px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                                  isDirty
                                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                <Save className="w-3 h-3" />
                                <span>
                                  {savingReportSessionId === period.sessionId ? 'Saving...' : 'Save Row'}
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleLoadExistingSession(period.sessionId)}
                              className="w-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                            >
                              Open Roster
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================================
          TAB 3: ATTENDANCE HISTORY
         ============================================================================ */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <form onSubmit={loadHistory} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                <select
                  value={histBranch}
                  onChange={(e) => setHistBranch(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                <select
                  value={histSection}
                  onChange={(e) => setHistSection(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Sections</option>
                  <option value="1">Section 1</option>
                  <option value="2">Section 2</option>
                  <option value="3">Section 3</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={histDate}
                  onChange={(e) => setHistDate(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Method</label>
                <select
                  value={histMethod}
                  onChange={(e) => setHistMethod(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">All Methods</option>
                  <option value="MANUAL">MANUAL</option>
                  <option value="QR">QR</option>
                </select>
              </div>

              {user?.role === 'FACULTY' && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={histMineOnly}
                    onChange={(e) => setHistMineOnly(e.target.checked)}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <span>My Sessions Only</span>
                </label>
              )}

              <button
                type="submit"
                disabled={loadingHistory}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {loadingHistory ? 'Filtering...' : 'Filter History'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">Branch & Sec</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Faculty</th>
                    <th className="px-4 py-3">Method & Status</th>
                    <th className="px-4 py-3">Present / Total</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Loading attendance history...
                      </td>
                    </tr>
                  ) : historySessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No attendance sessions match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    historySessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3.5 font-mono">
                          <div className="font-semibold text-slate-900">{s.sessionDate}</div>
                          <div className="text-[11px] text-slate-500">
                            {s.startTime} – {s.endTime}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800">
                          {s.branch} · Sec {s.section}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-900">
                          {s.subjectName}
                          {s.periodNumber ? ` (P${s.periodNumber})` : ''}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{s.facultyName}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {s.method} · {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono">
                          <span className="text-emerald-700 font-bold">{s.presentCount ?? 0}</span> Present ·{' '}
                          <span className="text-rose-700 font-bold">{s.absentCount ?? 0}</span> Absent /{' '}
                          {s.totalStudents ?? 0}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => handleLoadExistingSession(s.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            {s.canEdit ? 'View / Correct' : 'View Roster'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Unmarked -> Absent Modal before Submission */}
      {confirmUnmarkedModal !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
            <h3 className="text-base font-bold text-slate-900 mb-2">Resolve Unmarked Students</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              There are currently <strong className="text-slate-900">{confirmUnmarkedModal}</strong> student(s) with{' '}
              <span className="font-mono font-semibold">UNMARKED</span> status. Would you like to mark all remaining
              unmarked students as <span className="font-mono font-semibold text-rose-700">ABSENT</span> and submit the
              completed session?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmUnmarkedModal(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Go Back & Review
              </button>
              <button
                type="button"
                disabled={submittingSession}
                onClick={() => handleSubmitSession(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                {submittingSession ? 'Submitting...' : 'Mark Unmarked as Absent & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
