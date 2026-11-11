import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { StudentProfile, StudentApplication } from '../../types';
import {
  Search,
  GraduationCap,
  CheckCircle2,
  ArrowLeft,
  Eye,
  UserX,
  UserCheck,
  Check,
  X,
} from 'lucide-react';

interface AdminStudentsPageProps {
  onNavigate: (view: string) => void;
}

export const AdminStudentsPage: React.FC<AdminStudentsPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'APPLICATIONS' | 'DIRECTORY'>('APPLICATIONS');

  // Applications Queue State
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [appFilter, setAppFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [appSearch, setAppSearch] = useState('');
  const [appBranch, setAppBranch] = useState('');
  const [appSection, setAppSection] = useState('');
  const [appLoading, setAppLoading] = useState(true);

  // Approval / Rejection Modal State
  const [actionTarget, setActionTarget] = useState<{ app: StudentApplication; type: 'APPROVE' | 'REJECT' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedAppDetails, setSelectedAppDetails] = useState<StudentApplication | null>(null);

  // Enrolled Directory State
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected student for details modal
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [editBranch, setEditBranch] = useState('CSE');
  const [editSection, setEditSection] = useState('1');
  const [academicSavedMsg, setAcademicSavedMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const officialBranches = [
    'CSE (AI & ML)',
    'CSE',
    'ECE',
    'MECH',
    'CSE (CS & DS)',
    'MECH-ROBOTICS',
    'EEE',
    'CIVIL',
    'CHEMICAL',
    'ECE-VLSI',
  ];

  useEffect(() => {
    if (activeTab === 'APPLICATIONS') {
      loadApplications();
    } else {
      loadStudents();
    }
  }, [activeTab, appFilter, appBranch, appSection, branch, section]);

  const loadApplications = async () => {
    setAppLoading(true);
    setError(null);
    try {
      const res = await api.admin.getStudentApplications({
        status: appFilter,
        search: appSearch.trim() || undefined,
        branch: appBranch || undefined,
        section: appSection || undefined,
      });
      setApplications(res.applications || []);
    } catch (err: any) {
      setError(err.message || 'Error loading student applications.');
    } finally {
      setAppLoading(false);
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getStudents({
        search: search.trim(),
        branch: branch || undefined,
        section: section || undefined,
        limit: 50,
      });
      setStudents(res.students);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Error loading student directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadApplications();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadStudents();
  };

  const handleConfirmAppAction = async () => {
    if (!actionTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      if (actionTarget.type === 'APPROVE') {
        await api.admin.approveStudentApplication(actionTarget.app.id);
      } else {
        await api.admin.rejectStudentApplication(actionTarget.app.id, rejectionReason.trim());
      }
      setActionTarget(null);
      setRejectionReason('');
      await loadApplications();
    } catch (err: any) {
      setError(err.message || 'Error processing student application decision.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatus = async (student: StudentProfile) => {
    if (!student.user_id) return;
    const nextStatus = student.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    setActionLoading(true);
    setError(null);
    try {
      await api.admin.updateUserStatus(student.user_id, nextStatus as any);
      await loadStudents();
      if (selectedStudent && selectedStudent.id === student.id) {
        setSelectedStudent({ ...selectedStudent, status: nextStatus as any });
      }
    } catch (err: any) {
      setError(err.message || 'Error updating student status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenStudentDetails = (student: StudentProfile) => {
    setSelectedStudent(student);
    setEditBranch(student.branch || 'CSE');
    setEditSection(['1', '2', '3'].includes(student.section) ? student.section : '1');
    setAcademicSavedMsg(null);
  };

  const handleSaveStudentAcademic = async () => {
    if (!selectedStudent || !selectedStudent.user_id) return;
    setActionLoading(true);
    setError(null);
    setAcademicSavedMsg(null);
    try {
      await api.attendance.updateStudentAcademic(selectedStudent.user_id, {
        branch: editBranch,
        section: editSection,
      });
      setSelectedStudent({ ...selectedStudent, branch: editBranch, section: editSection });
      setAcademicSavedMsg(`Updated to ${editBranch} — Section ${editSection}`);
      await loadStudents();
    } catch (err: any) {
      setError(err.message || 'Error updating student branch & section.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button
        onClick={() => onNavigate('admin-dashboard')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Admin Dashboard</span>
      </button>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {activeTab === 'APPLICATIONS' ? 'Student Applications' : 'Student Directory'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === 'APPLICATIONS'
              ? 'Review, approve, or reject student registration applications across all branches and sections'
              : `Registered students roster and roll number mappings (${total} registered)`}
          </p>
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('APPLICATIONS')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'APPLICATIONS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Student Applications
          </button>
          <button
            onClick={() => setActiveTab('DIRECTORY')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'DIRECTORY'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Student Roster Directory
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}

      {activeTab === 'APPLICATIONS' ? (
        <>
          {/* Status Filter & Search Bar for Student Applications */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAppFilter(tab)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      appFilter === tab
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-500 font-mono">
                Showing {applications.length} application{applications.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3 pt-2 border-t border-slate-100">
              <form onSubmit={handleAppSearchSubmit} className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Search by student name, roll number, email, branch, or section..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </form>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={appBranch}
                  onChange={(e) => setAppBranch(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="">All Branches</option>
                  {officialBranches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <select
                  value={appSection}
                  onChange={(e) => setAppSection(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="">All Sections</option>
                  <option value="1">Section 1</option>
                  <option value="2">Section 2</option>
                  <option value="3">Section 3</option>
                  <option value="A">Legacy Section A</option>
                </select>

                <button
                  onClick={loadApplications}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Search
                </button>
              </div>
            </div>
          </div>

          {/* Student Applications List */}
          <div className="space-y-4">
            {appLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                Loading student applications...
              </div>
            ) : applications.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                No {appFilter !== 'ALL' ? appFilter.toLowerCase() : ''} student applications match the current filters.
              </div>
            ) : (
              applications.map((app) => (
                <div
                  key={app.id}
                  className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                      {app.profile_photo_url ? (
                        <img
                          src={app.profile_photo_url}
                          alt={app.full_name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <GraduationCap className="w-6 h-6" />
                      )}
                    </div>

                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-base font-bold text-slate-900">{app.full_name}</h3>
                        <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-sm border border-slate-200">
                          {app.roll_number}
                        </span>
                        <span
                          className={`inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-sm ${
                            app.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : app.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Branch: {app.branch}</span>
                        <span>·</span>
                        <span className="font-semibold text-slate-800">Section: {app.section}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-500">{app.email}</span>
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono pt-1">
                        Submitted: {new Date(app.created_at).toLocaleString()}
                        {app.reviewed_at && (
                          <span> · Reviewed: {new Date(app.reviewed_at).toLocaleDateString()}</span>
                        )}
                      </div>

                      {app.status === 'REJECTED' && app.rejection_reason && (
                        <div className="mt-2 text-xs bg-rose-50 border border-rose-200 text-rose-900 p-2.5 rounded-md">
                          <span className="font-semibold block mb-0.5">Rejection Reason:</span>
                          <span>{app.rejection_reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedAppDetails(app)}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Review</span>
                    </button>

                    {app.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => setActionTarget({ app, type: 'APPROVE' })}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => setActionTarget({ app, type: 'REJECT' })}
                          className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}

                    {app.status === 'APPROVED' && (
                      <span className="text-xs font-mono text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Student Login Enabled
                      </span>
                    )}

                    {app.status === 'REJECTED' && (
                      <button
                        onClick={() => setActionTarget({ app, type: 'APPROVE' })}
                        className="px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Reconsider & Approve
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* Search and Filters Bar for Enrolled Directory */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex flex-col md:flex-row items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student name, roll number, or email..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </form>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="">All Branches</option>
                {officialBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="">All Sections</option>
                <option value="1">Section 1</option>
                <option value="2">Section 2</option>
                <option value="3">Section 3</option>
                <option value="A">Legacy Section A</option>
              </select>

              <button
                onClick={loadStudents}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                Apply Filter
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Roll Number</th>
                    <th className="px-5 py-3">Student Name</th>
                    <th className="px-5 py-3">Branch & Sec</th>
                    <th className="px-5 py-3">University Email</th>
                    <th className="px-5 py-3">Verification</th>
                    <th className="px-5 py-3">Account Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        Loading student directory...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        No students match the selected search criteria.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">
                          {student.roll_number}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-900">
                          {student.full_name}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {student.branch} · {student.section}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600">
                          {student.email}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-sm ${
                              student.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : student.status === 'PENDING'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {student.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleOpenStudentDetails(student)}
                            className="p-1 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                            title="View Full Profile"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(student)}
                            className={`p-1 transition-colors cursor-pointer ${
                              student.status === 'ACTIVE'
                                ? 'text-slate-400 hover:text-rose-600'
                                : 'text-slate-400 hover:text-emerald-600'
                            }`}
                            title={student.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate Account'}
                          >
                            {student.status === 'ACTIVE' ? (
                              <UserX className="w-4 h-4 inline" />
                            ) : (
                              <UserCheck className="w-4 h-4 inline" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Student Application Review Details Modal */}
      {selectedAppDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-slate-200 shadow-lg">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg overflow-hidden shrink-0">
                  {selectedAppDetails.profile_photo_url ? (
                    <img
                      src={selectedAppDetails.profile_photo_url}
                      alt={selectedAppDetails.full_name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <GraduationCap className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedAppDetails.full_name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedAppDetails.roll_number}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedAppDetails(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs border-y border-slate-100 py-4 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Application Status:</span>
                <span className="font-mono font-semibold text-slate-900">{selectedAppDetails.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">University Email:</span>
                <span className="font-mono text-slate-800">{selectedAppDetails.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email Verification:</span>
                <span className="font-mono text-emerald-700">Verified (OTP)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Branch & Section:</span>
                <span className="font-semibold text-slate-800">
                  {selectedAppDetails.branch} — Section {selectedAppDetails.section}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Submitted On:</span>
                <span className="font-mono text-slate-600">
                  {new Date(selectedAppDetails.created_at).toLocaleString()}
                </span>
              </div>
              {selectedAppDetails.reviewed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Reviewed On:</span>
                  <span className="font-mono text-slate-600">
                    {new Date(selectedAppDetails.reviewed_at).toLocaleString()}
                  </span>
                </div>
              )}
              {selectedAppDetails.rejection_reason && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block mb-1">Rejection Reason:</span>
                  <p className="text-rose-800 bg-rose-50 p-2 rounded border border-rose-200">
                    {selectedAppDetails.rejection_reason}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {selectedAppDetails.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => {
                      const app = selectedAppDetails;
                      setSelectedAppDetails(null);
                      setActionTarget({ app, type: 'APPROVE' });
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Approve Application
                  </button>
                  <button
                    onClick={() => {
                      const app = selectedAppDetails;
                      setSelectedAppDetails(null);
                      setActionTarget({ app, type: 'REJECT' });
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedAppDetails(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Confirmation Modal for Student Applications */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-lg">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {actionTarget.type === 'APPROVE' ? 'Approve Student Application' : 'Reject Student Application'}
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Applicant: <span className="font-semibold text-slate-900">{actionTarget.app.full_name}</span> (
              <span className="font-mono">{actionTarget.app.roll_number}</span> · {actionTarget.app.branch} Sec{' '}
              {actionTarget.app.section})
            </p>

            {actionTarget.type === 'APPROVE' ? (
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                Approving this application will immediately update the student's account status to{' '}
                <span className="font-semibold text-emerald-700">ACTIVE</span> and enable access to the Student Portal using their registered credentials.
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-slate-600">
                  Rejecting this application will set the student's account status to{' '}
                  <span className="font-semibold text-rose-700">REJECTED</span> and keep student portal login disabled. You may provide an optional reason:
                </p>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Roll number or section details could not be verified with departmental records..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmAppAction}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors cursor-pointer ${
                  actionTarget.type === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionLoading
                  ? 'Processing...'
                  : actionTarget.type === 'APPROVE'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrolled Student Details Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-slate-200 shadow-lg">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg overflow-hidden shrink-0">
                  {selectedStudent.profile_photo_url ? (
                    <img
                      src={selectedStudent.profile_photo_url}
                      alt={selectedStudent.full_name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <GraduationCap className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedStudent.full_name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedStudent.roll_number}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudent(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs border-y border-slate-100 py-4 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">University Email:</span>
                <span className="font-mono text-slate-800">{selectedStudent.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Branch & Section:</span>
                <span className="font-semibold text-slate-800">{selectedStudent.branch} — Section {selectedStudent.section}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Status:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedStudent.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="text-slate-800">{selectedStudent.phone || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bio:</span>
                <span className="text-slate-800 max-w-[240px] text-right">{selectedStudent.bio || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Registration Timestamp:</span>
                <span className="font-mono text-slate-600">{new Date(selectedStudent.created_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Founder Academic Assignment Update (Branch & Numeric Section) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg mb-4 space-y-3">
              <div className="text-xs font-bold text-slate-900">
                Update Student Branch & Numeric Section (1, 2, 3)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Official Branch</label>
                  <select
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                  >
                    {officialBranches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Numeric Section</label>
                  <select
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                  >
                    <option value="1">Section 1</option>
                    <option value="2">Section 2</option>
                    <option value="3">Section 3</option>
                  </select>
                </div>
              </div>
              {academicSavedMsg && (
                <p className="text-[11px] text-emerald-700 font-semibold">{academicSavedMsg}</p>
              )}
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleSaveStudentAcademic}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                {actionLoading ? 'Saving...' : 'Save Branch & Section'}
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

