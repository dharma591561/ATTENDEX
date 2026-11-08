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
  totalFacultyApplications: number;
  pendingFacultyApplications: number;
  approvedFaculty: number;
  rejectedFaculty: number;
}
