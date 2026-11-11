import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PublicProfileView } from '../types';
import { X, Link as LinkIcon, Check } from 'lucide-react';

interface ProfileViewModalProps {
  userId: string | null;
  onClose: () => void;
  onOpenStandaloneProfile?: (userId: string) => void;
}

export const ProfileViewModal: React.FC<ProfileViewModalProps> = ({
  userId,
  onClose,
  onOpenStandaloneProfile,
}) => {
  const [profile, setProfile] = useState<PublicProfileView | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
    setCopied(false);

    api.people
      .getProfile(userId)
      .then((res) => {
        if (!cancelled) {
          setProfile(res.profile);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err.message || 'Profile not found or not available.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;

  const shareableUrl = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(userId)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-md w-full border border-slate-200 shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900">
            {profile?.role === 'FACULTY' ? 'Faculty Profile' : 'Student Profile'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile modal"
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">Loading profile details...</div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          ) : profile ? (
            <div className="space-y-4">
              {profile.role === 'STUDENT' ? (
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Student Name</dt>
                    <dd className="font-bold text-slate-900 text-right">{profile.fullName}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Official Roll Number</dt>
                    <dd className="font-mono font-semibold text-slate-900 text-right">{profile.rollNumber}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Branch</dt>
                    <dd className="font-medium text-slate-800 text-right">{profile.branch}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Section</dt>
                    <dd className="font-mono font-semibold text-slate-800 text-right">Section {profile.section}</dd>
                  </div>
                </dl>
              ) : (
                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Faculty Name</dt>
                    <dd className="font-bold text-slate-900 text-right">{profile.fullName}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Department</dt>
                    <dd className="font-medium text-slate-800 text-right">{profile.department}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="font-semibold text-slate-500">Designation</dt>
                    <dd className="font-medium text-slate-800 text-right">{profile.designation}</dd>
                  </div>
                </dl>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Profile Link Copied' : 'Copy Profile Link'}</span>
                </button>

                <div className="flex items-center gap-2">
                  {onOpenStandaloneProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenStandaloneProfile(profile.userId);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 underline cursor-pointer"
                    >
                      Open Profile Page
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
