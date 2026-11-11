import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { ActiveStudentQrSession, StudentAttendanceHistoryItem, GeofenceConfig } from '../../types';
import {
  GraduationCap,
  ShieldCheck,
  BookOpen,
  QrCode,
  Camera,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  AlertCircle,
  RefreshCw,
  Upload,
  X,
  Calendar,
} from 'lucide-react';

interface StudentDashboardProps {
  onNavigate: (view: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const profile = user?.student_profile;

  const [activeSessions, setActiveSessions] = useState<ActiveStudentQrSession[]>([]);
  const [history, setHistory] = useState<StudentAttendanceHistoryItem[]>([]);
  const [summary, setSummary] = useState<{
    totalSessions: number;
    presentCount: number;
    absentCount: number;
    attendancePercentage: number | null;
  }>({
    totalSessions: 0,
    presentCount: 0,
    absentCount: 0,
    attendancePercentage: null,
  });
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  // QR Scanner Modal State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [targetSession, setTargetSession] = useState<ActiveStudentQrSession | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'IDLE' | 'LOCATING' | 'SUBMITTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingTokenRef = useRef<boolean>(false);

  const loadStudentOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [overviewRes, geoRes] = await Promise.all([
        api.attendance.getStudentOverview(),
        api.attendance.getGeofenceStatus(),
      ]);
      setActiveSessions(overviewRes.activeQrSessions || []);
      setHistory(overviewRes.history || []);
      setSummary(
        overviewRes.summary || {
          totalSessions: 0,
          presentCount: 0,
          absentCount: 0,
          attendancePercentage: null,
        }
      );
      if (geoRes?.geofence) {
        setGeofenceStatus(geoRes.geofence);
      }
    } catch {
      // Keep existing state on transient poll error
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudentOverview(false);
    const pollInterval = setInterval(() => {
      loadStudentOverview(true);
    }, 4000);
    return () => clearInterval(pollInterval);
  }, [loadStudentOverview]);

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const requestCurrentGps = useCallback((): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsError('Browser geolocation is not supported on this device.');
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          };
          setGpsCoords(coords);
          setGpsError(null);
          resolve(coords);
        },
        (err) => {
          let msg = 'Unable to retrieve your campus GPS location.';
          if (err.code === err.PERMISSION_DENIED) {
            msg = 'Location permission was denied. Please allow location access in your browser settings.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            msg = 'GPS location information is unavailable on this device.';
          } else if (err.code === err.TIMEOUT) {
            msg = 'GPS location request timed out. Please move to an area with clearer sky view.';
          }
          setGpsError(msg);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }, []);

  const submitDecodedQrToken = useCallback(
    async (rawQrPayload: string) => {
      if (processingTokenRef.current) return;
      processingTokenRef.current = true;
      setScanStatus('LOCATING');
      setScanFeedback('Verifying campus GPS coordinates...');

      try {
        let tokenToSubmit = rawQrPayload.trim();
        if (tokenToSubmit.startsWith('{')) {
          try {
            const parsed = JSON.parse(tokenToSubmit);
            if (parsed.qrToken) tokenToSubmit = String(parsed.qrToken);
          } catch {
            // Keep raw string
          }
        }

        let coords = gpsCoords;
        const needsGps = geofenceStatus ? geofenceStatus.gpsEnforcementEnabled && !geofenceStatus.demoModeEnabled : true;
        if (needsGps && !coords) {
          coords = await requestCurrentGps();
        }

        setScanStatus('SUBMITTING');
        setScanFeedback('Validating rotating QR signature and roster...');

        const res = await api.attendance.scanQr({
          qrToken: tokenToSubmit,
          sessionId: targetSession?.sessionId,
          location: coords
            ? {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                timestamp: Date.now(),
              }
            : null,
        });

        stopCamera();
        setScanStatus('SUCCESS');
        setScanFeedback(res.message || 'Attendance marked as PRESENT!');
        await loadStudentOverview(true);
      } catch (err: any) {
        setScanStatus('ERROR');
        setScanFeedback(err.message || 'QR attendance verification failed.');
        processingTokenRef.current = false;
      }
    },
    [geofenceStatus, gpsCoords, loadStudentOverview, requestCurrentGps, stopCamera, targetSession]
  );

  const scanVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && code.data && !processingTokenRef.current) {
          submitDecodedQrToken(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanVideoFrame);
  }, [submitDecodedQrToken]);

  const startCameraScanner = useCallback(async () => {
    setCameraError(null);
    setScanStatus('IDLE');
    setScanFeedback(null);
    processingTokenRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported in this browser context. You can scan a captured QR image below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(scanVideoFrame);
    } catch (err: any) {
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please grant camera access in your browser settings or upload a QR frame below.'
          : 'Could not start camera feed on this device. You can upload a captured QR frame below.'
      );
    }
  }, [scanVideoFrame]);

  const openScannerModal = async (session: ActiveStudentQrSession) => {
    setTargetSession(session);
    setScannerOpen(true);
    setScanStatus('IDLE');
    setScanFeedback(null);
    setGpsError(null);
    processingTokenRef.current = false;

    if (session.gpsEnforcementEnabled && !session.demoModeEnabled) {
      requestCurrentGps();
    }
    setTimeout(() => {
      startCameraScanner();
    }, 100);
  };

  const closeScannerModal = () => {
    stopCamera();
    setScannerOpen(false);
    setTargetSession(null);
    setScanStatus('IDLE');
    setScanFeedback(null);
    processingTokenRef.current = false;
  };

  const handleQrImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanStatus('IDLE');
    setScanFeedback(null);
    processingTokenRef.current = false;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          submitDecodedQrToken(code.data);
        } else {
          setScanStatus('ERROR');
          setScanFeedback('No valid QR code was detected in the selected image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const formatCountdown = (expiresAtMs: number | null) => {
    if (!expiresAtMs) return 'Active';
    const remainingSec = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const isLegacySection = profile?.section && !['1', '2', '3'].includes(profile.section);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Welcome Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xl overflow-hidden shrink-0 border border-slate-200">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt={profile.full_name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <GraduationCap className="w-8 h-8 text-white" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {profile?.full_name || 'Student Portal'}
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified Student
              </span>
              {geofenceStatus?.demoModeEnabled && (
                <span className="text-xs font-mono px-2 py-0.5 rounded-sm bg-amber-50 text-amber-800 border border-amber-300">
                  Demo Mode — GPS Bypassed
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700">{profile?.roll_number}</span>
              <span>·</span>
              <span>
                {profile?.branch} — Section {profile?.section}
              </span>
              <span>·</span>
              <span>{user?.email}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigate('people-search')}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            People Search
          </button>
          <button
            onClick={() => loadStudentOverview(false)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => onNavigate('student-profile')}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Edit Profile
          </button>
        </div>
      </div>

      {isLegacySection && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Section Assignment Notice:</span> Your profile currently has legacy section{' '}
            <span className="font-mono font-bold">Section {profile?.section}</span>. Official class sections use numeric format (
            <span className="font-mono">1, 2, 3</span>). Please contact the Administrator to update your numeric section assignment.
          </div>
        </div>
      )}

      {/* Active Attendance Session Banner (Auto-discovered for matching Branch & Section) */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-slate-800" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Active Attendance Session ({profile?.branch} — Section {profile?.section})
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">Live auto-sync every 4s</span>
        </div>

        {activeSessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                No live QR attendance session is currently active for {profile?.branch} — Section {profile?.section}.
              </div>
              <p className="text-xs text-slate-500 mt-1">
                When your faculty starts a live QR attendance session for your branch and section, it will appear here automatically.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-sm bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
              Standby
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {activeSessions.map((session) => {
              const alreadyMarked = session.myStatus === 'PRESENT';
              const countdown = formatCountdown(session.expiresAtMs);
              return (
                <div
                  key={session.sessionId}
                  className="bg-slate-900 text-white rounded-xl p-6 border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Live QR Session Active
                      </span>
                      <span className="text-xs font-mono text-slate-300">
                        {session.branch} · Section {session.section}
                      </span>
                      <span className="text-xs font-mono text-amber-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Remaining: {countdown}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white">{session.subjectName}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                      <span>Period: {session.periodNumber || 'Scheduled Period'}</span>
                      <span>·</span>
                      <span>
                        Time: {session.startTime} – {session.endTime}
                      </span>
                      <span>·</span>
                      <span>Faculty: {session.facultyName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {alreadyMarked ? (
                      <div className="px-4 py-2.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Attendance Marked PRESENT</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => openScannerModal(session)}
                        className="px-5 py-2.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Scan QR</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attendance Summary & Academic Identity Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Attendance Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
            {loading
              ? '...'
              : summary.attendancePercentage !== null
              ? `${summary.attendancePercentage}%`
              : 'N/A'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {summary.presentCount} Present / {summary.totalSessions} Total Sessions
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Sessions Present</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-emerald-700 tabular-nums">
            {loading ? '...' : summary.presentCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Verified class periods attended</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Sessions Absent</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-rose-700 tabular-nums">
            {loading ? '...' : summary.absentCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Recorded absent periods</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">Department & Section</span>
            <BookOpen className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold tracking-tight text-slate-900 truncate">
            {profile?.branch} · Sec {profile?.section}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Roll: {profile?.roll_number}
          </p>
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">My Period-Wise Attendance Record</h2>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {history.length} recorded period{history.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Period & Time</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Faculty</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Loading attendance history...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No submitted attendance sessions recorded for your roster yet.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.sessionId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">
                      {item.sessionDate}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">
                      <div className="font-semibold text-slate-900">{item.periodNumber || 'Period'}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {item.startTime} – {item.endTime}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{item.subjectName}</td>
                    <td className="px-5 py-3.5 text-slate-600">{item.facultyName}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 border border-slate-200">
                        {item.method}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-sm ${
                          item.status === 'PRESENT'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {item.status === 'PRESENT' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Camera QR Scanner Modal */}
      {scannerOpen && targetSession && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-slate-900" />
                  <h3 className="text-base font-bold text-slate-900">Scan Classroom QR Code</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {targetSession.subjectName} · {targetSession.periodNumber || 'Period'} ({targetSession.startTime}–
                  {targetSession.endTime})
                </p>
              </div>
              <button
                onClick={closeScannerModal}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Campus GPS Verification Status Bar */}
            <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-600" />
                  <span>Campus Location Check</span>
                </span>
                {targetSession.demoModeEnabled || geofenceStatus?.demoModeEnabled ? (
                  <span className="font-mono text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-sm border border-amber-200">
                    Demo Mode (GPS Bypassed)
                  </span>
                ) : gpsCoords ? (
                  <span className="font-mono text-[11px] text-emerald-700">
                    GPS Ready (±{Math.round(gpsCoords.accuracy)}m)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={requestCurrentGps}
                    className="font-semibold text-slate-900 underline cursor-pointer text-[11px]"
                  >
                    Acquire GPS
                  </button>
                )}
              </div>
              {gpsError && !targetSession.demoModeEnabled && !geofenceStatus?.demoModeEnabled && (
                <p className="text-[11px] text-rose-600 mt-1.5">{gpsError}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                Target: {targetSession.campusName || geofenceStatus?.campusName}
              </p>
            </div>

            {/* Video Viewfinder */}
            {scanStatus !== 'SUCCESS' && (
              <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-square mb-4 flex items-center justify-center border border-slate-800">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                />
                <canvas ref={canvasRef} className="hidden" />

                {cameraActive && (
                  <div className="absolute inset-8 border-2 border-emerald-400/70 rounded-xl pointer-events-none flex items-end justify-center pb-3">
                    <span className="text-[11px] font-mono bg-black/70 text-white px-2.5 py-1 rounded-sm">
                      Align rotating QR inside frame
                    </span>
                  </div>
                )}

                {!cameraActive && (
                  <div className="p-6 text-center text-xs text-slate-300 space-y-3">
                    <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                    <p>{cameraError || 'Initializing camera stream...'}</p>
                    <button
                      type="button"
                      onClick={startCameraScanner}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      Retry Camera
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Upload QR Frame Fallback (for devices without camera hardware) */}
            {scanStatus !== 'SUCCESS' && (
              <div className="mb-4 flex items-center justify-between p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs">
                <span className="text-slate-600">Camera unavailable? Scan a QR image frame:</span>
                <label className="px-3 py-1.5 font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer flex items-center gap-1.5 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrImageFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Scan Feedback */}
            {scanFeedback && (
              <div
                className={`mb-4 p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  scanStatus === 'SUCCESS'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : scanStatus === 'ERROR'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-slate-100 border-slate-200 text-slate-800'
                }`}
              >
                {scanStatus === 'SUCCESS' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : scanStatus === 'ERROR' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-slate-600 animate-spin shrink-0 mt-0.5" />
                )}
                <span>{scanFeedback}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {scanStatus === 'ERROR' && (
                <button
                  type="button"
                  onClick={() => {
                    setScanStatus('IDLE');
                    setScanFeedback(null);
                    processingTokenRef.current = false;
                    startCameraScanner();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Scan Again
                </button>
              )}
              <button
                type="button"
                onClick={closeScannerModal}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                {scanStatus === 'SUCCESS' ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
