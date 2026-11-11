import { User, StudentProfile, StudentApplication, FacultyProfile, FacultyApplication, AdminStats, AuditLog } from '../types';

const SESSION_STORAGE_KEY = 'attendx_session_token';

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {}
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Attendx-Client', 'web');
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach session token in Authorization header for cross-origin / iframe compatibility
  const token = getStoredSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // sends and receives cookies
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.error || (typeof data === 'string' ? data : `Request failed with status ${response.status}`);
    const error: any = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const api = {
  auth: {
    getMe: async () => {
      try {
        const res = await request<{ user: User | null }>('/api/auth/me');
        if (!res.user) {
          setStoredSessionToken(null);
        }
        return res;
      } catch (err) {
        setStoredSessionToken(null);
        throw err;
      }
    },
    login: async (credentials: { email: string; password: string; expectedRole?: string }) => {
      const res = await request<{ success: boolean; user: User; sessionId: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      if (res.sessionId) {
        setStoredSessionToken(res.sessionId);
      }
      return res;
    },
    logout: async () => {
      try {
        return await request<{ success: boolean; message: string }>('/api/auth/logout', { method: 'POST' });
      } finally {
        setStoredSessionToken(null);
      }
    },
    sendOtp: (email: string, purpose: 'STUDENT_REGISTRATION' | 'FACULTY_REGISTRATION' | 'PASSWORD_RESET') =>
      request<{ success: boolean; message: string }>('/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email, purpose }),
      }),
    verifyOtp: (email: string, otp: string, purpose: 'STUDENT_REGISTRATION' | 'FACULTY_REGISTRATION' | 'PASSWORD_RESET') =>
      request<{ success: boolean; message: string; verificationGrant?: string; expiresAt?: number }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp, purpose }),
      }),
    resetPassword: (payload: { email: string; otp: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getSmtpStatus: () => request<{ configured: boolean; message: string }>('/api/auth/smtp-status'),
  },

  students: {
    register: async (payload: any) =>
      request<{ success: boolean; status: string; message: string; application: StudentApplication }>('/api/students/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getStatus: (payload: { email: string; rollNumber?: string; password?: string }) =>
      request<{ application: StudentApplication }>('/api/students/application-status', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getProfile: () => request<{ profile: StudentProfile }>('/api/students/me'),
    updateProfile: (updates: { fullName?: string; bio?: string; phone?: string }) =>
      request<{ success: boolean; profile: StudentProfile }>('/api/students/me', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    uploadAvatar: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      return request<{ success: boolean; profile_photo_url: string; message: string }>('/api/students/me/avatar', {
        method: 'POST',
        body: formData,
      });
    },
    changePassword: (payload: { currentPassword: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/api/students/me/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  faculty: {
    apply: (payload: any) =>
      request<{ success: boolean; status: string; message: string }>('/api/faculty/applications', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getStatus: (email: string) =>
      request<{ application: FacultyApplication }>(`/api/faculty/application-status?email=${encodeURIComponent(email)}`),
    getProfile: () => request<{ profile: FacultyProfile }>('/api/faculty/me'),
    updateProfile: (updates: { fullName?: string; department?: string; designation?: string; bio?: string; phone?: string }) =>
      request<{ success: boolean; profile: FacultyProfile }>('/api/faculty/me', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    uploadAvatar: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      return request<{ success: boolean; profile_photo_url: string; message: string }>('/api/faculty/me/avatar', {
        method: 'POST',
        body: formData,
      });
    },
    changePassword: (payload: { currentPassword: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/api/faculty/me/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  admin: {
    getOverview: () =>
      request<{ stats: AdminStats; recentAuditLogs: AuditLog[] }>('/api/admin/overview'),
    getStudents: (params: { search?: string; branch?: string; section?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.search) query.set('search', params.search);
      if (params.branch) query.set('branch', params.branch);
      if (params.section) query.set('section', params.section);
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset) query.set('offset', String(params.offset));
      return request<{ students: StudentProfile[]; total: number; limit: number; offset: number }>(`/api/admin/students?${query.toString()}`);
    },
    getStudentApplications: (params: { status?: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'; search?: string; branch?: string; section?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.search) query.set('search', params.search);
      if (params.branch) query.set('branch', params.branch);
      if (params.section) query.set('section', params.section);
      return request<{ applications: StudentApplication[] }>(`/api/admin/student-applications?${query.toString()}`);
    },
    approveStudentApplication: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/admin/student-applications/${id}/approve`, {
        method: 'POST',
      }),
    rejectStudentApplication: (id: string, reason?: string) =>
      request<{ success: boolean; message: string }>(`/api/admin/student-applications/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    getApplications: (status: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'ALL') =>
      request<{ applications: FacultyApplication[] }>(`/api/admin/faculty-applications?status=${status}`),
    approveApplication: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/admin/faculty-applications/${id}/approve`, {
        method: 'POST',
      }),
    rejectApplication: (id: string, reason?: string) =>
      request<{ success: boolean; message: string }>(`/api/admin/faculty-applications/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    updateUserStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED') =>
      request<{ success: boolean; message: string }>(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    getAuditLogs: (params: { limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset) query.set('offset', String(params.offset));
      return request<{ logs: AuditLog[]; total: number; limit: number; offset: number }>(`/api/admin/audit-logs?${query.toString()}`);
    },
  },

  attendance: {
    getAcademicStructure: () =>
      request<{ branches: any[]; allowedSections: string[] }>('/api/attendance/academic-structure'),

    getGeofenceStatus: () =>
      request<{ geofence: any }>('/api/attendance/geofence-status'),

    // Founder-only Academic & Geofence Configuration
    getAdminAcademicConfig: () =>
      request<{ branches: any[]; legacyStudents: any[] }>('/api/attendance/admin/academic-config'),
    createBranch: (payload: { name: string; enabledSections?: string[] }) =>
      request<{ success: boolean; message: string }>('/api/attendance/admin/academic-branches', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateBranch: (id: string, payload: { name?: string; isActive?: boolean }) =>
      request<{ success: boolean; message: string }>(`/api/attendance/admin/academic-branches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    toggleBranchSection: (branchId: string, payload: { section: string; isEnabled: boolean }) =>
      request<{ success: boolean; message: string }>(`/api/attendance/admin/academic-branches/${branchId}/sections`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    updateStudentAcademic: (userId: string, payload: { branch: string; section: string }) =>
      request<{ success: boolean; message: string }>(`/api/attendance/admin/students/${userId}/academic`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    updateGeofence: (payload: {
      campusName?: string;
      latitude?: number | null;
      longitude?: number | null;
      radiusMeters?: number;
      accuracyToleranceMeters?: number;
      maxAllowedAccuracyMeters?: number;
      gpsEnforcementEnabled?: boolean;
      demoModeEnabled?: boolean;
    }) =>
      request<{ success: boolean; message: string; geofence: any }>('/api/attendance/admin/geofence', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    // Faculty & Founder Attendance Sessions
    getRosterPreview: (params: { branch: string; section: string; date?: string; startTime?: string; endTime?: string }) => {
      const q = new URLSearchParams();
      q.set('branch', params.branch);
      q.set('section', params.section);
      if (params.date) q.set('date', params.date);
      if (params.startTime) q.set('startTime', params.startTime);
      if (params.endTime) q.set('endTime', params.endTime);
      return request<{
        branch: string;
        branchId: string | null;
        section: string;
        totalStudents: number;
        hasAmbiguousShortRolls: boolean;
        students: any[];
        overlapWarnings: any[];
      }>(`/api/attendance/roster-preview?${q.toString()}`);
    },
    createSession: (payload: {
      branch: string;
      section: string;
      sessionDate: string;
      subjectName: string;
      periodNumber?: string;
      startTime: string;
      endTime: string;
      method: 'MANUAL' | 'QR';
      qrDurationMinutes?: number;
      qrRefreshIntervalSeconds?: number;
    }) =>
      request<{ success: boolean; resumed: boolean; sessionId: string; rosterCount?: number; message: string }>(
        '/api/attendance/sessions',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    getSession: (sessionId: string) =>
      request<{
        session: any;
        counts: { total: number; present: number; absent: number; unmarked: number };
        entries: any[];
        corrections: any[];
      }>(`/api/attendance/sessions/${sessionId}`),
    getQrToken: (sessionId: string) =>
      request<{
        active: boolean;
        status: string;
        windowIndex?: number;
        secondsUntilNextRefresh: number;
        secondsUntilSessionExpiry: number;
        qrToken: string | null;
        qrDataUrl: string | null;
        counts: { total: number; present: number; absent: number; unmarked: number };
        geofenceMode?: string;
      }>(`/api/attendance/sessions/${sessionId}/qr-token`),
    endQrSession: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/api/attendance/sessions/${sessionId}/end-qr`, {
        method: 'POST',
      }),
    updateSessionEntries: (
      sessionId: string,
      updates: Array<{ studentUserId: string; status: 'PRESENT' | 'ABSENT' | 'UNMARKED' }>,
      reason?: string
    ) =>
      request<{ success: boolean; updatedCount: number; message: string }>(
        `/api/attendance/sessions/${sessionId}/entries`,
        {
          method: 'PUT',
          body: JSON.stringify({ updates, reason }),
        }
      ),
    submitSession: (sessionId: string, confirmMarkUnmarkedAbsent: boolean = false) =>
      request<{ success: boolean; message: string }>(`/api/attendance/sessions/${sessionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ confirmMarkUnmarkedAbsent }),
      }),
    reopenSession: (sessionId: string) =>
      request<{ success: boolean; message: string }>(`/api/attendance/sessions/${sessionId}/reopen`, {
        method: 'POST',
      }),

    // Daily Reports & Direct Absentee Editing
    getDailyReport: (params: { branch: string; section: string; date: string }) => {
      const q = new URLSearchParams();
      q.set('branch', params.branch);
      q.set('section', params.section);
      q.set('date', params.date);
      return request<{
        institutionName: string;
        branch: string;
        section: string;
        date: string;
        totalReportedSessions: number;
        generatedAt: string;
        periods: any[];
      }>(`/api/attendance/daily-report?${q.toString()}`);
    },
    updateDailyReportAbsentees: (sessionId: string, absentRollNumbersInput: string, reason?: string) =>
      request<{
        success: boolean;
        changesCount: number;
        absentCount: number;
        presentCount: number;
        absentShortRolls: string[];
        absentShortRollsText: string;
        message: string;
      }>(`/api/attendance/daily-report/${sessionId}/absentees`, {
        method: 'PUT',
        body: JSON.stringify({ absentRollNumbersInput, reason }),
      }),

    // History
    getHistory: (params: {
      branch?: string;
      section?: string;
      date?: string;
      method?: string;
      status?: string;
      mineOnly?: boolean;
    } = {}) => {
      const q = new URLSearchParams();
      if (params.branch) q.set('branch', params.branch);
      if (params.section) q.set('section', params.section);
      if (params.date) q.set('date', params.date);
      if (params.method) q.set('method', params.method);
      if (params.status) q.set('status', params.status);
      if (params.mineOnly) q.set('mineOnly', 'true');
      return request<{ sessions: any[] }>(`/api/attendance/history?${q.toString()}`);
    },

    // Student Attendance & QR Scanning
    getStudentOverview: () =>
      request<{
        activeQrSessions: any[];
        summary: {
          totalSessions: number;
          presentCount: number;
          absentCount: number;
          attendancePercentage: number | null;
        };
        history: any[];
      }>('/api/attendance/student/overview'),
    scanQr: (payload: {
      qrToken: string;
      sessionId?: string;
      location?: {
        latitude: number | null;
        longitude: number | null;
        accuracy: number | null;
        timestamp: number | null;
      } | null;
    }) =>
      request<{
        success: boolean;
        alreadyRecorded: boolean;
        status: string;
        subjectName: string;
        verificationMode?: string;
        distanceMeters?: number | null;
        recordedAt: string;
        message: string;
      }>('/api/attendance/student/scan-qr', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
};


