import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Camera, Lock, CheckCircle2, AlertCircle, Shield, Hash, ArrowLeft } from 'lucide-react';

interface StudentProfilePageProps {
  onNavigate: (view: string) => void;
}

export const StudentProfilePage: React.FC<StudentProfilePageProps> = ({ onNavigate }) => {
  const { user, refreshUser } = useAuth();
  const profile = user?.student_profile;

  // Editable Profile fields
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [phone, setPhone] = useState(profile?.phone || '');

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Status indicators
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setBio(profile.bio || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim()) {
      setError('Full name cannot be empty.');
      return;
    }

    setProfileLoading(true);
    try {
      await api.students.updateProfile({
        fullName: fullName.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
      });
      await refreshUser();
      setSuccess('Profile details successfully updated.');
    } catch (err: any) {
      setError(err.message || 'Error updating profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Profile photograph must be less than 2MB.');
      return;
    }

    setAvatarLoading(true);
    try {
      const res = await api.students.uploadAvatar(file);
      await refreshUser();
      setSuccess(res.message || 'Profile photograph updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload photograph. Ensure file is JPEG, PNG, or WebP.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword) {
      setError('Please provide current and new password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.students.changePassword({ currentPassword, newPassword });
      setSuccess('Password successfully changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Error updating password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button
        onClick={() => onNavigate('student-dashboard')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Student Dashboard</span>
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Profile & Settings</h1>
        <p className="text-xs text-slate-500 mt-1">Manage personal contact details and account security</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Photograph Upload & Academic Badge */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center text-center">
          <div className="relative w-28 h-28 rounded-2xl bg-slate-900 text-white flex items-center justify-center overflow-hidden mb-4 border-2 border-slate-200">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt={profile.full_name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <GraduationCap className="w-12 h-12 text-white" />
            )}
            {avatarLoading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs">
                Uploading...
              </div>
            )}
          </div>

          <label className="cursor-pointer px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 mb-2">
            <Camera className="w-3.5 h-3.5" />
            <span>Upload Photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </label>
          <p className="text-[11px] text-slate-400">JPEG, PNG, or WebP up to 2MB</p>

          <div className="w-full border-t border-slate-100 my-4 pt-4 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Roll Number:</span>
              <span className="font-mono font-semibold text-slate-900">{profile?.roll_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Branch:</span>
              <span className="font-semibold text-slate-900">{profile?.branch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Section:</span>
              <span className="font-semibold text-slate-900">{profile?.section}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Email:</span>
              <span className="text-slate-700 truncate max-w-[140px]">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Editable Details & Security */}
        <div className="md:col-span-2 space-y-6">
          {/* Editable Personal Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">Personal Details</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>

              {/* Locked Roll Number Display */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Academic Roll Number</label>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Lock className="w-3 h-3 text-slate-400" /> Immutable
                  </span>
                </div>
                <input
                  type="text"
                  disabled
                  value={profile?.roll_number || ''}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Roll numbers cannot be altered after registration per college audit policy.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bio / Academic Interests</label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Distributed Systems, Algorithms, Web Development"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors cursor-pointer"
                >
                  {profileLoading ? 'Saving Changes...' : 'Save Profile Details'}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Security & Credentials</h2>
            <p className="text-xs text-slate-500 mb-4">Change your account password</p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  {passwordLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
