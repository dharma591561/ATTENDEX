import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { StudentProfile } from '../../types';
import { Search, GraduationCap, CheckCircle2, XCircle, ArrowLeft, Eye, ShieldAlert, UserX, UserCheck } from 'lucide-react';

interface AdminStudentsPageProps {
  onNavigate: (view: string) => void;
}

export const AdminStudentsPage: React.FC<AdminStudentsPageProps> = ({ onNavigate }) => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected student for details modal
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadStudents();
  }, [branch, section]);

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadStudents();
  };

  const handleToggleStatus = async (student: StudentProfile) => {
    if (!student.user_id) return;
    const nextStatus = student.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!confirm(`Are you sure you want to change this student's account status to ${nextStatus}?`)) {
      return;
    }

    setActionLoading(true);
    try {
      await api.admin.updateUserStatus(student.user_id, nextStatus as any);
      await loadStudents();
      if (selectedStudent && selectedStudent.id === student.id) {
        setSelectedStudent({ ...selectedStudent, status: nextStatus as any });
      }
    } catch (err: any) {
      alert(err.message || 'Error updating student status');
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Registered students roster and roll number mappings ({total} registered)
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Search and Filters Bar */}
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
            <option value="CSE">CSE</option>
            <option value="ECE">ECE</option>
            <option value="MECH">MECH</option>
            <option value="CIVIL">CIVIL</option>
          </select>

          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          >
            <option value="">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
            <option value="D">Section D</option>
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
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedStudent(student)}
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

      {/* Student Details Modal */}
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
