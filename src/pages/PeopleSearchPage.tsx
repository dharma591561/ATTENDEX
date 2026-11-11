import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import {
  AcademicBranchConfig,
  PublicStudentDirectoryItem,
  PublicFacultyDirectoryItem,
  PublicProfileView,
} from '../types';
import { Search, ArrowLeft, Link as LinkIcon, Check } from 'lucide-react';
import { ProfileViewModal } from '../components/ProfileViewModal';

interface PeopleSearchPageProps {
  onNavigate: (view: string) => void;
  initialProfileUserId?: string | null;
}

export const PeopleSearchPage: React.FC<PeopleSearchPageProps> = ({
  onNavigate,
  initialProfileUserId = null,
}) => {
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'FACULTY'>('STUDENTS');

  // Academic structure for dynamic Branch & Section filters
  const [branches, setBranches] = useState<AcademicBranchConfig[]>([]);
  const [allowedSections, setAllowedSections] = useState<string[]>(['1', '2', '3']);

  // Student search state
  const [studentQuery, setStudentQuery] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [students, setStudents] = useState<PublicStudentDirectoryItem[]>([]);
  const [studentsTotal, setStudentsTotal] = useState<number>(0);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [studentError, setStudentError] = useState<string | null>(null);

  // Faculty search state
  const [facultyQuery, setFacultyQuery] = useState<string>('');
  const [facultyList, setFacultyList] = useState<PublicFacultyDirectoryItem[]>([]);
  const [facultyTotal, setFacultyTotal] = useState<number>(0);
  const [loadingFaculty, setLoadingFaculty] = useState<boolean>(false);
  const [facultyError, setFacultyError] = useState<string | null>(null);

  // Modal profile view state
  const [modalProfileUserId, setModalProfileUserId] = useState<string | null>(null);

  // Standalone profile page state (when opened via direct shareable link or Open Profile Page)
  const [standaloneUserId, setStandaloneUserId] = useState<string | null>(initialProfileUserId);
  const [standaloneProfile, setStandaloneProfile] = useState<PublicProfileView | null>(null);
  const [loadingStandalone, setLoadingStandalone] = useState<boolean>(false);
  const [standaloneError, setStandaloneError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    setStandaloneUserId(initialProfileUserId);
  }, [initialProfileUserId]);

  // Load academic branches and numeric sections dynamically
  useEffect(() => {
    api.attendance
      .getAcademicStructure()
      .then((res) => {
        if (Array.isArray(res.branches)) {
          setBranches(res.branches.filter((b: AcademicBranchConfig) => b.isActive !== false));
        }
        if (Array.isArray(res.allowedSections) && res.allowedSections.length > 0) {
          setAllowedSections(res.allowedSections);
        }
      })
      .catch(() => {});
  }, []);

  const fetchStudents = useCallback(
    async (q: string, branch: string, section: string) => {
      setLoadingStudents(true);
      setStudentError(null);
      try {
        const res = await api.people.searchStudents({
          q: q.trim() || undefined,
          branch: branch || undefined,
          section: section || undefined,
          limit: 50,
          offset: 0,
        });
        setStudents(res.students || []);
        setStudentsTotal(res.total || 0);
      } catch (err: any) {
        setStudentError(err.message || 'Failed to search students.');
      } finally {
        setLoadingStudents(false);
      }
    },
    []
  );

  const fetchFaculty = useCallback(async (q: string) => {
    setLoadingFaculty(true);
    setFacultyError(null);
    try {
      const res = await api.people.searchFaculty({
        q: q.trim() || undefined,
        limit: 50,
        offset: 0,
      });
      setFacultyList(res.faculty || []);
      setFacultyTotal(res.total || 0);
    } catch (err: any) {
      setFacultyError(err.message || 'Failed to search faculty.');
    } finally {
      setLoadingFaculty(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents('', '', '');
    fetchFaculty('');
  }, [fetchStudents, fetchFaculty]);

  // Load standalone profile when standaloneUserId is active
  useEffect(() => {
    if (!standaloneUserId) {
      setStandaloneProfile(null);
      setStandaloneError(null);
      return;
    }

    let cancelled = false;
    setLoadingStandalone(true);
    setStandaloneError(null);
    setStandaloneProfile(null);

    api.people
      .getProfile(standaloneUserId)
      .then((res) => {
        if (!cancelled) {
          setStandaloneProfile(res.profile);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setStandaloneError(err.message || 'Profile not found or not available.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStandalone(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [standaloneUserId]);

  const handleOpenStandaloneProfile = (targetId: string) => {
    const nextUrl = `${window.location.pathname}?profile=${encodeURIComponent(targetId)}`;
    window.history.pushState({}, '', nextUrl);
    setStandaloneUserId(targetId);
  };

  const handleCloseStandaloneProfile = () => {
    window.history.pushState({}, '', window.location.pathname);
    setStandaloneUserId(null);
    onNavigate('people-search');
  };

  const handleStudentSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudents(studentQuery, selectedBranch, selectedSection);
  };

  const handleFacultySearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFaculty(facultyQuery);
  };

  // Sections for currently selected branch (or global numeric sections 1, 2, 3)
  const availableSections = React.useMemo(() => {
    if (!selectedBranch) return allowedSections;
    const branchObj = branches.find((b) => b.name === selectedBranch || b.code === selectedBranch);
    if (branchObj && Array.isArray(branchObj.enabledSections) && branchObj.enabledSections.length > 0) {
      return branchObj.enabledSections;
    }
    return allowedSections;
  }, [selectedBranch, branches, allowedSections]);

  if (standaloneUserId) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(standaloneUserId)}`;
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <div className="mb-6">
          <button
            type="button"
            onClick={handleCloseStandaloneProfile}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to People Search</span>
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h1 className="text-base font-bold text-slate-900">
              {standaloneProfile?.role === 'FACULTY' ? 'Faculty Profile' : 'Student Profile'}
            </h1>
            {standaloneProfile && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                  } catch {}
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <LinkIcon className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Shareable Link'}</span>
              </button>
            )}
          </div>

          <div className="p-6">
            {loadingStandalone ? (
              <div className="py-10 text-center text-xs text-slate-500">Loading profile...</div>
            ) : standaloneError ? (
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {standaloneError}
              </div>
            ) : standaloneProfile ? (
              standaloneProfile.role === 'STUDENT' ? (
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Student Name</dt>
                    <dd className="font-bold text-slate-900 text-right">{standaloneProfile.fullName}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Official Roll Number</dt>
                    <dd className="font-mono font-semibold text-slate-900 text-right">{standaloneProfile.rollNumber}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Branch</dt>
                    <dd className="font-medium text-slate-800 text-right">{standaloneProfile.branch}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Section</dt>
                    <dd className="font-mono font-semibold text-slate-800 text-right">
                      Section {standaloneProfile.section}
                    </dd>
                  </div>
                </dl>
              ) : (
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Faculty Name</dt>
                    <dd className="font-bold text-slate-900 text-right">{standaloneProfile.fullName}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Department</dt>
                    <dd className="font-medium text-slate-800 text-right">{standaloneProfile.department}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Designation</dt>
                    <dd className="font-medium text-slate-800 text-right">{standaloneProfile.designation}</dd>
                  </div>
                </dl>
              )
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">People Search</h1>
          <p className="text-xs text-slate-500 mt-1">
            Search and view verified academic profiles of approved students and faculty members.
          </p>
        </div>

        {/* Two Simple Tabs: Students | Faculty */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('STUDENTS')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'STUDENTS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Students
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('FACULTY')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'FACULTY'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Faculty
          </button>
        </div>
      </div>

      {/* ============================================================================
          TAB 1: STUDENT SEARCH
         ============================================================================ */}
      {activeTab === 'STUDENTS' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <form onSubmit={handleStudentSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Student Name or Official Roll Number
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Search by student name or roll number (e.g. 26UECSE0243)..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch (Optional)</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    const nextBranch = e.target.value;
                    setSelectedBranch(nextBranch);
                    fetchStudents(studentQuery, nextBranch, selectedSection);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Section (Optional)</label>
                <select
                  value={selectedSection}
                  onChange={(e) => {
                    const nextSection = e.target.value;
                    setSelectedSection(nextSection);
                    fetchStudents(studentQuery, selectedBranch, nextSection);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">All Sections</option>
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={loadingStudents}
                  className="w-full px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  {loadingStudents ? 'Searching...' : 'Search'}
                </button>
              </div>
            </form>
          </div>

          {studentError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {studentError}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-bold text-slate-800">Approved Students</span>
              <span className="text-xs font-mono text-slate-500">
                Showing {students.length} of {studentsTotal} matching profile(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Student Name</th>
                    <th className="px-5 py-3">Official Roll Number</th>
                    <th className="px-5 py-3">Branch</th>
                    <th className="px-5 py-3">Section</th>
                    <th className="px-5 py-3 text-right">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingStudents ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                        Searching student profiles...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                        No approved student profiles match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    students.map((st) => (
                      <tr key={st.userId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setModalProfileUserId(st.userId)}
                            className="font-bold text-slate-900 hover:underline text-left cursor-pointer"
                          >
                            {st.fullName}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 font-mono font-semibold text-slate-800">
                          <button
                            type="button"
                            onClick={() => setModalProfileUserId(st.userId)}
                            className="hover:underline cursor-pointer"
                          >
                            {st.rollNumber}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">{st.branch}</td>
                        <td className="px-5 py-3.5 font-mono text-slate-700">Section {st.section}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setModalProfileUserId(st.userId)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            View Profile
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

      {/* ============================================================================
          TAB 2: FACULTY SEARCH
         ============================================================================ */}
      {activeTab === 'FACULTY' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <form onSubmit={handleFacultySearchSubmit} className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Faculty Name or Registered Email Address
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={facultyQuery}
                    onChange={(e) => setFacultyQuery(e.target.value)}
                    placeholder="Search by faculty name or registered faculty email..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingFaculty}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                {loadingFaculty ? 'Searching...' : 'Search Faculty'}
              </button>
            </form>
          </div>

          {facultyError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {facultyError}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-bold text-slate-800">Approved Faculty</span>
              <span className="text-xs font-mono text-slate-500">
                Showing {facultyList.length} of {facultyTotal} matching profile(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Faculty Name</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Designation</th>
                    <th className="px-5 py-3 text-right">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingFaculty ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                        Searching faculty profiles...
                      </td>
                    </tr>
                  ) : facultyList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                        No approved faculty profiles match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    facultyList.map((fac) => (
                      <tr key={fac.userId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setModalProfileUserId(fac.userId)}
                            className="font-bold text-slate-900 hover:underline text-left cursor-pointer"
                          >
                            {fac.fullName}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">{fac.department}</td>
                        <td className="px-5 py-3.5 text-slate-700">{fac.designation}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setModalProfileUserId(fac.userId)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            View Profile
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

      {/* Lightweight Profile Modal */}
      <ProfileViewModal
        userId={modalProfileUserId}
        onClose={() => setModalProfileUserId(null)}
        onOpenStandaloneProfile={handleOpenStandaloneProfile}
      />
    </div>
  );
};
