import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { AcademicBranchConfig, GeofenceConfig } from '../../types';
import {
  ArrowLeft,
  Building,
  Layers,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Edit3,
  Save,
  RefreshCw,
  Navigation,
  Users,
} from 'lucide-react';

interface AdminAcademicConfigPageProps {
  onNavigate: (view: string) => void;
}

export const AdminAcademicConfigPage: React.FC<AdminAcademicConfigPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'ACADEMIC' | 'GEOFENCE'>('ACADEMIC');

  // Academic Config State
  const [branches, setBranches] = useState<AcademicBranchConfig[]>([]);
  const [legacyStudents, setLegacyStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Branch Form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchSections, setNewBranchSections] = useState<string[]>(['1', '2']);
  const [addingBranch, setAddingBranch] = useState(false);

  // Rename Branch State
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editingBranchName, setEditingBranchName] = useState('');

  // Legacy Student Update State
  const [studentEdits, setStudentEdits] = useState<Record<string, { branch: string; section: string }>>({});
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  // Geofence State
  const [geofence, setGeofence] = useState<GeofenceConfig | null>(null);
  const [campusName, setCampusName] = useState('');
  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');
  const [radiusMeters, setRadiusMeters] = useState(300);
  const [accuracyToleranceMeters, setAccuracyToleranceMeters] = useState(75);
  const [maxAllowedAccuracyMeters, setMaxAllowedAccuracyMeters] = useState(350);
  const [gpsEnforcementEnabled, setGpsEnforcementEnabled] = useState(true);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [savingGeofence, setSavingGeofence] = useState(false);

  useEffect(() => {
    loadAllConfig();
  }, []);

  const loadAllConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const [acadRes, geoRes] = await Promise.all([
        api.attendance.getAdminAcademicConfig(),
        api.attendance.getGeofenceStatus(),
      ]);
      setBranches(acadRes.branches || []);
      setLegacyStudents(acadRes.legacyStudents || []);

      const initialEdits: Record<string, { branch: string; section: string }> = {};
      for (const st of acadRes.legacyStudents || []) {
        const matchedBranch =
          (acadRes.branches || []).find((b: any) => b.name.toUpperCase() === (st.branch || '').toUpperCase())?.name ||
          'CSE';
        const validSec = ['1', '2', '3'].includes(String(st.section)) ? String(st.section) : '1';
        initialEdits[st.user_id] = { branch: matchedBranch, section: validSec };
      }
      setStudentEdits(initialEdits);

      if (geoRes.geofence) {
        const g: GeofenceConfig = geoRes.geofence;
        setGeofence(g);
        setCampusName(g.campusName || '');
        setLatitudeInput(g.latitude !== null && g.latitude !== undefined ? String(g.latitude) : '');
        setLongitudeInput(g.longitude !== null && g.longitude !== undefined ? String(g.longitude) : '');
        setRadiusMeters(g.radiusMeters || 300);
        setAccuracyToleranceMeters(g.accuracyToleranceMeters ?? 75);
        setMaxAllowedAccuracyMeters(g.maxAllowedAccuracyMeters ?? 350);
        setGpsEnforcementEnabled(Boolean(g.gpsEnforcementEnabled));
        setDemoModeEnabled(Boolean(g.demoModeEnabled));
      }
    } catch (err: any) {
      setError(err.message || 'Error loading academic and geofence configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSection = async (branchId: string, section: string, currentEnabled: boolean) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.attendance.toggleBranchSection(branchId, {
        section,
        isEnabled: !currentEnabled,
      });
      setSuccessMsg(res.message);
      await loadAllConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to update section status.');
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setAddingBranch(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.attendance.createBranch({
        name: newBranchName.trim(),
        enabledSections: newBranchSections,
      });
      setSuccessMsg(res.message);
      setNewBranchName('');
      await loadAllConfig();
    } catch (err: any) {
      setError(err.message || 'Error adding branch.');
    } finally {
      setAddingBranch(false);
    }
  };

  const handleSaveBranchRename = async (branchId: string) => {
    if (!editingBranchName.trim()) return;
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.attendance.updateBranch(branchId, { name: editingBranchName.trim() });
      setSuccessMsg(res.message);
      setEditingBranchId(null);
      await loadAllConfig();
    } catch (err: any) {
      setError(err.message || 'Error renaming branch.');
    }
  };

  const handleUpdateStudentAcademic = async (userId: string) => {
    const edit = studentEdits[userId];
    if (!edit) return;
    setSavingStudentId(userId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.attendance.updateStudentAcademic(userId, {
        branch: edit.branch,
        section: edit.section,
      });
      setSuccessMsg(res.message);
      await loadAllConfig();
    } catch (err: any) {
      setError(err.message || 'Error updating student academic assignment.');
    } finally {
      setSavingStudentId(null);
    }
  };

  const handleCaptureBrowserLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitudeInput(pos.coords.latitude.toFixed(6));
        setLongitudeInput(pos.coords.longitude.toFixed(6));
        setSuccessMsg('Captured current device coordinates. Click Save Geofence Settings to persist.');
      },
      (geoErr) => {
        setError(`Could not read browser location: ${geoErr.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveGeofence = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGeofence(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const lat = latitudeInput.trim() === '' ? null : Number(latitudeInput.trim());
      const lng = longitudeInput.trim() === '' ? null : Number(longitudeInput.trim());

      const res = await api.attendance.updateGeofence({
        campusName: campusName.trim(),
        latitude: lat,
        longitude: lng,
        radiusMeters: Number(radiusMeters) || 300,
        accuracyToleranceMeters: Number(accuracyToleranceMeters) || 75,
        maxAllowedAccuracyMeters: Number(maxAllowedAccuracyMeters) || 350,
        gpsEnforcementEnabled,
        demoModeEnabled,
      });
      setGeofence(res.geofence);
      setSuccessMsg(res.message || 'Geofence settings saved.');
    } catch (err: any) {
      setError(err.message || 'Failed to save geofence settings.');
    } finally {
      setSavingGeofence(false);
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4 text-slate-800" />
            <span>Founder Governance</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Academic Structure & Campus Geofence
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure official college branches, numeric sections (1, 2, 3), legacy student mappings, and campus GPS verification
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('ACADEMIC')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ACADEMIC' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Branches & Sections</span>
          </button>
          <button
            onClick={() => setActiveTab('GEOFENCE')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'GEOFENCE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Campus GPS & Demo Mode</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-xs text-slate-500">
          Loading Founder configuration...
        </div>
      ) : activeTab === 'ACADEMIC' ? (
        <div className="space-y-8">
          {/* Official Branches & Numeric Sections Matrix */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Official College Branches & Section Matrix</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any section button (1, 2, or 3) to enable or disable that branch-section combination across student registration, faculty attendance, and daily reports.
                </p>
              </div>
              <button
                onClick={loadAllConfig}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Branch Name</th>
                    <th className="px-5 py-3">Internal ID</th>
                    <th className="px-5 py-3">Configured Numeric Sections (1, 2, 3)</th>
                    <th className="px-5 py-3">Active Students</th>
                    <th className="px-5 py-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branches.map((branch) => (
                    <tr key={branch.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {editingBranchId === branch.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingBranchName}
                              onChange={(e) => setEditingBranchName(e.target.value)}
                              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                            />
                            <button
                              onClick={() => handleSaveBranchRename(branch.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 rounded-md cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingBranchId(null)}
                              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span>{branch.name}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400">{branch.id}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {branch.sections.map((sec) => (
                            <button
                              key={sec.section}
                              onClick={() => handleToggleSection(branch.id, sec.section, sec.isEnabled)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                                sec.isEnabled
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}
                              title={
                                sec.isEnabled
                                  ? `Click to disable Section ${sec.section} for ${branch.name}`
                                  : `Click to enable Section ${sec.section} for ${branch.name}`
                              }
                            >
                              <span>Section {sec.section}</span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-sm ${
                                  sec.isEnabled ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {sec.studentCount}
                              </span>
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold text-slate-800">
                        {branch.totalStudents} student{branch.totalStudents === 1 ? '' : 's'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => {
                            setEditingBranchId(branch.id);
                            setEditingBranchName(branch.name);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Rename</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add New Branch Footer */}
            <form onSubmit={handleAddBranch} className="p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Add New Academic Branch</label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. CSE (CYBER SECURITY)"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Enabled Sections</label>
                <div className="flex items-center gap-2">
                  {(['1', '2', '3'] as const).map((sec) => {
                    const active = newBranchSections.includes(sec);
                    return (
                      <button
                        type="button"
                        key={sec}
                        onClick={() =>
                          setNewBranchSections((prev) =>
                            prev.includes(sec) ? prev.filter((x) => x !== sec) : [...prev, sec]
                          )
                        }
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        Sec {sec}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="submit"
                disabled={addingBranch || !newBranchName.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addingBranch ? 'Adding...' : 'Add Branch'}</span>
              </button>
            </form>
          </div>

          {/* Existing / Legacy Student Compatibility Review */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-700" />
                  <span>Existing Student Compatibility & Legacy Section Review</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Students registered with older section labels (such as Section A) or disabled sections are preserved untouched and listed below so you can assign their verified numeric section (1, 2, or 3) without altering their roll number or account credentials.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                {legacyStudents.length} Flagged for Review
              </span>
            </div>

            {legacyStudents.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-center text-xs text-slate-600">
                All registered students are mapped to active official branches and enabled numeric sections (1, 2, or 3).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Roll Number</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Current Stored Value</th>
                      <th className="px-4 py-3">Review Flag</th>
                      <th className="px-4 py-3">Assign Official Branch & Section</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {legacyStudents.map((st) => {
                      const edit = studentEdits[st.user_id] || { branch: 'CSE', section: '1' };
                      return (
                        <tr key={st.user_id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">{st.roll_number}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div>{st.full_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{st.email}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700">
                            {st.branch} · Sec {st.section}
                          </td>
                          <td className="px-4 py-3 text-amber-800">{st.reason}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={edit.branch}
                                onChange={(e) =>
                                  setStudentEdits((prev) => ({
                                    ...prev,
                                    [st.user_id]: { ...edit, branch: e.target.value },
                                  }))
                                }
                                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                              >
                                {branches.map((b) => (
                                  <option key={b.id} value={b.name}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={edit.section}
                                onChange={(e) =>
                                  setStudentEdits((prev) => ({
                                    ...prev,
                                    [st.user_id]: { ...edit, section: e.target.value },
                                  }))
                                }
                                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                              >
                                <option value="1">Section 1</option>
                                <option value="2">Section 2</option>
                                <option value="3">Section 3</option>
                              </select>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleUpdateStudentAcademic(st.user_id)}
                              disabled={savingStudentId === st.user_id}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                            >
                              {savingStudentId === st.user_id ? 'Saving...' : 'Update Assignment'}
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
      ) : (
        /* Campus Geofence & Demo Mode Configuration Tab */
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-3xl">
          <div className="flex items-start justify-between gap-4 pb-6 mb-6 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Campus GPS Geofence & Demo Mode</h2>
              <p className="text-xs text-slate-500 mt-1">
                Configure campus-level geolocation verification for Dynamic QR Attendance.
              </p>
            </div>
            <div className="shrink-0">
              {demoModeEnabled ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>DEMO MODE ACTIVE (GPS OFF)</span>
                </span>
              ) : geofence?.isBoundaryConfigured && gpsEnforcementEnabled ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>GPS BOUNDARY ACTIVE</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>COORDINATES NOT CONFIGURED</span>
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSaveGeofence} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Institution / Campus Name</label>
              <input
                type="text"
                required
                value={campusName}
                onChange={(e) => setCampusName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Verified Campus Center Coordinates
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Enter verified WGS84 latitude and longitude for Gayatri Vidya Parishad North Campus, Kommadi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCaptureBrowserLocation}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Use My Current Location</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Verified Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={latitudeInput}
                    onChange={(e) => setLatitudeInput(e.target.value)}
                    placeholder="e.g. 17.820500"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Verified Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={longitudeInput}
                    onChange={(e) => setLongitudeInput(e.target.value)}
                    placeholder="e.g. 83.342200"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Allowed Radius (Meters)</label>
                  <input
                    type="number"
                    min={25}
                    max={10000}
                    value={radiusMeters}
                    onChange={(e) => setRadiusMeters(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GPS Accuracy Tolerance (Meters)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={accuracyToleranceMeters}
                    onChange={(e) => setAccuracyToleranceMeters(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Accounts for indoor/mobile GPS drift near campus buildings.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Allowed GPS Uncertainty (Meters)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    value={maxAllowedAccuracyMeters}
                    onChange={(e) => setMaxAllowedAccuracyMeters(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Rejects extremely coarse IP-based location readings above this threshold.
                  </p>
                </div>
              </div>
            </div>

            {/* Enforcement & Demo Mode Controls */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-900">Campus GPS Enforcement</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    When enabled, students scanning a QR code must be within the configured campus boundary. If coordinates are not yet entered, QR scans will be blocked until configured or Demo Mode is turned on.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={gpsEnforcementEnabled}
                  onChange={(e) => setGpsEnforcementEnabled(e.target.checked)}
                  className="w-4 h-4 accent-slate-900 cursor-pointer shrink-0"
                />
              </div>

              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/60 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>Temporary Founder Demo Mode (Controlled Testing Bypass)</span>
                  </div>
                  <div className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                    Explicitly disables GPS coordinate enforcement for off-campus testing while preserving student authentication, branch/section verification, rotating QR token expiry, and duplicate scan prevention. All scans in this mode are visibly tagged as <span className="font-mono font-semibold">DEMO_MODE</span>.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={demoModeEnabled}
                  onChange={(e) => setDemoModeEnabled(e.target.checked)}
                  className="w-4 h-4 accent-amber-700 cursor-pointer shrink-0"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingGeofence}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>{savingGeofence ? 'Saving Geofence Settings...' : 'Save Geofence Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
