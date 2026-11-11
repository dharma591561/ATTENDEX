export type UserRole = 'STUDENT' | 'FACULTY' | 'FOUNDER';
export type AccountStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED';

export interface StudentProfile {
  id: string;
  user_id: string;
  full_name: string;
  roll_number: string;
  branch: string;
  section: string;
  profile_photo_url: string | null;
  bio: string | null;
  phone: string | null;
  created_at: string;
  updated_at?: string;
  email?: string;
  status?: AccountStatus;
  is_email_verified?: number;
}

export interface FacultyProfile {
  id: string;
  user_id: string;
  full_name: string;
  department: string;
  designation: string;
  profile_photo_url: string | null;
  bio: string | null;
  phone: string | null;
  created_at: string;
  updated_at?: string;
  email?: string;
  status?: AccountStatus;
  is_email_verified?: number;
}

export interface FacultyApplication {
  id: string;
  user_id: string;
  full_name: string;
  department: string;
  designation: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason: string | null;
  reviewed_by_user_id: string | null;
  reviewer_email?: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  email?: string;
  is_email_verified?: number;
}

export interface StudentApplication {
  id: string;
  user_id: string;
  full_name: string;
  roll_number: string;
  branch: string;
  section: string;
  profile_photo_url: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason: string | null;
  reviewed_by_user_id: string | null;
  reviewer_email?: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  email?: string;
  is_email_verified?: number;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  is_email_verified: number;
  created_at: string;
  student_profile?: StudentProfile | null;
  faculty_profile?: FacultyProfile | null;
  faculty_application?: FacultyApplication | null;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  actor_email?: string | null;
  action: string;
  target_user_id: string | null;
  target_email?: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AdminStats {
  totalStudents: number;
  totalStudentApplications?: number;
  pendingStudentApplications?: number;
  approvedStudents?: number;
  rejectedStudents?: number;
  totalFacultyApplications: number;
  pendingFacultyApplications: number;
  approvedFaculty: number;
  rejectedFaculty: number;
}

export interface AcademicBranchSectionConfig {
  id: string;
  section: string;
  isEnabled: boolean;
  studentCount: number;
}

export interface AcademicBranchConfig {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  sections: AcademicBranchSectionConfig[];
  enabledSections?: string[];
  totalStudents: number;
}

export interface GeofenceConfig {
  campusName: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  accuracyToleranceMeters: number;
  maxAllowedAccuracyMeters: number;
  gpsEnforcementEnabled: boolean;
  demoModeEnabled: boolean;
  isBoundaryConfigured: boolean;
  updatedAt?: string;
}

export interface AttendanceSessionInfo {
  id: string;
  facultyUserId: string;
  facultyName: string;
  facultyEmail?: string;
  branchId?: string;
  branch: string;
  section: string;
  sessionDate: string;
  subjectName: string;
  periodNumber: string | null;
  startTime: string;
  endTime: string;
  method: 'MANUAL' | 'QR';
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'SUBMITTED';
  qrDurationMinutes?: number | null;
  qrRefreshIntervalSeconds?: number | null;
  qrStartedAtMs?: number | null;
  qrExpiresAtMs?: number | null;
  remainingSeconds?: number;
  gpsVerificationMode?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  canEdit: boolean;
  totalStudents?: number;
  presentCount?: number;
  absentCount?: number;
  unmarkedCount?: number;
  absentStudentsDetailed?: Array<{
    studentUserId: string;
    fullName: string;
    rollNumber: string;
    shortRollNumber: string;
  }>;
}

export interface AttendanceRosterEntry {
  id: string;
  serialNumber: number;
  studentUserId: string;
  studentProfileId: string;
  rollNumber: string;
  shortRollNumber: string;
  isShortRollAmbiguous: boolean;
  fullName: string;
  status: 'PRESENT' | 'ABSENT' | 'UNMARKED';
  source: 'ROSTER_INIT' | 'MANUAL' | 'QR' | 'CORRECTION';
  verificationMode?: string | null;
  distanceMeters?: number | null;
  recordedAt: string;
  updatedAt: string;
}

export interface DailyReportPeriod {
  sessionId: string;
  serialNumber: number;
  startTime: string;
  endTime: string;
  timeRange: string;
  subjectName: string;
  periodNumber: string | null;
  method: 'MANUAL' | 'QR';
  facultyUserId: string;
  facultyName: string;
  canEdit: boolean;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  absentShortRolls: string[];
  absentShortRollsText: string;
  absentStudentsDetailed: Array<{
    studentUserId: string;
    fullName: string;
    rollNumber: string;
    shortRollNumber: string;
  }>;
  hasAmbiguousShortRolls: boolean;
}

export interface ActiveStudentQrSession {
  sessionId: string;
  branch: string;
  section: string;
  sessionDate: string;
  subjectName: string;
  periodNumber: string | null;
  startTime: string;
  endTime: string;
  facultyName: string;
  expiresAtMs: number;
  remainingSeconds: number;
  myStatus: 'PRESENT' | 'ABSENT' | 'UNMARKED';
  myRecordedAt: string | null;
  gpsEnforcementEnabled: boolean;
  demoModeEnabled: boolean;
  campusName: string;
}

export interface StudentAttendanceHistoryItem {
  sessionId: string;
  sessionDate: string;
  subjectName: string;
  periodNumber: string | null;
  startTime: string;
  endTime: string;
  method: 'MANUAL' | 'QR';
  facultyName: string;
  status: 'PRESENT' | 'ABSENT' | 'UNMARKED';
  source: string;
  verificationMode: string | null;
  updatedAt: string;
}

export interface PublicStudentDirectoryItem {
  userId: string;
  fullName: string;
  rollNumber: string;
  branch: string;
  section: string;
}

export interface PublicFacultyDirectoryItem {
  userId: string;
  fullName: string;
  department: string;
  designation: string;
}

export type PublicProfileView =
  | {
      userId: string;
      role: 'STUDENT';
      fullName: string;
      rollNumber: string;
      branch: string;
      section: string;
    }
  | {
      userId: string;
      role: 'FACULTY';
      fullName: string;
      department: string;
      designation: string;
    };
