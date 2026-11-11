import crypto from 'crypto';

export interface OfficialBranchSeed {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  defaultEnabledSections: string[];
}

export const ALLOWED_SECTION_VALUES = ['1', '2', '3'] as const;

export const OFFICIAL_BRANCHES_SEED: OfficialBranchSeed[] = [
  { id: 'branch-cse-aiml', code: 'CSE (AI & ML)', name: 'CSE (AI & ML)', displayOrder: 1, defaultEnabledSections: ['1', '2'] },
  { id: 'branch-cse', code: 'CSE', name: 'CSE', displayOrder: 2, defaultEnabledSections: ['1', '2'] },
  { id: 'branch-ece', code: 'ECE', name: 'ECE', displayOrder: 3, defaultEnabledSections: ['1', '2'] },
  { id: 'branch-mech', code: 'MECH', name: 'MECH', displayOrder: 4, defaultEnabledSections: [] },
  { id: 'branch-cse-csds', code: 'CSE (CS & DS)', name: 'CSE (CS & DS)', displayOrder: 5, defaultEnabledSections: [] },
  { id: 'branch-mech-robotics', code: 'MECH-ROBOTICS', name: 'MECH-ROBOTICS', displayOrder: 6, defaultEnabledSections: [] },
  { id: 'branch-eee', code: 'EEE', name: 'EEE', displayOrder: 7, defaultEnabledSections: [] },
  { id: 'branch-civil', code: 'CIVIL', name: 'CIVIL', displayOrder: 8, defaultEnabledSections: [] },
  { id: 'branch-chemical', code: 'CHEMICAL', name: 'CHEMICAL', displayOrder: 9, defaultEnabledSections: [] },
  { id: 'branch-ece-vlsi', code: 'ECE-VLSI', name: 'ECE-VLSI', displayOrder: 10, defaultEnabledSections: [] },
];

/**
 * Unambiguous branch name alias normalization.
 * Maps compact notations like "CSE(AI&ML)" -> "CSE (AI & ML)", "CSE(CS&DS)" -> "CSE (CS & DS)",
 * while keeping "CSE" and "CSE (AI & ML)" strictly distinct.
 */
export function normalizeBranchLabel(rawBranch: string): string {
  const cleaned = (rawBranch || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const compact = cleaned.replace(/\s+/g, '');

  if (compact === 'CSE(AI&ML)' || compact === 'CSE-AIML' || compact === 'CSE(AIML)') {
    return 'CSE (AI & ML)';
  }
  if (compact === 'CSE(CS&DS)' || compact === 'CSE-CSDS' || compact === 'CSE(CSDS)') {
    return 'CSE (CS & DS)';
  }
  if (compact === 'MECH-ROBOTICS' || compact === 'MECH(ROBOTICS)') {
    return 'MECH-ROBOTICS';
  }
  if (compact === 'ECE-VLSI' || compact === 'ECE(VLSI)') {
    return 'ECE-VLSI';
  }
  return cleaned;
}

/**
 * Parses either a combined branch-section token (e.g. "CSE-2", "CSE(AI&ML)-1", "ECE-2")
 * or separate branch and section inputs.
 * Never invents a section if none is explicitly present.
 */
export function parseBranchSectionInput(
  rawBranch: string,
  rawSection?: string | null
): {
  branch: string;
  section: string;
  unambiguousNewStandard: boolean;
  needsFounderReview: boolean;
} {
  const trimmedBranch = (rawBranch || '').trim();
  const trimmedSection = (rawSection ?? '').trim().toUpperCase();

  // Check if rawBranch itself encodes a trailing numeric section like "CSE-2", "CSE(AI&ML)-1", "ECE-2"
  // Be careful not to split hyphenated branch names like "MECH-ROBOTICS" or "ECE-VLSI" unless followed by -1/-2/-3
  const combinedMatch = trimmedBranch.match(/^(.*?)\s*-\s*([123])$/);
  if (combinedMatch && (!trimmedSection || trimmedSection === combinedMatch[2])) {
    const normalizedBranch = normalizeBranchLabel(combinedMatch[1]);
    const extractedSection = combinedMatch[2];
    const isKnownOfficial = OFFICIAL_BRANCHES_SEED.some((b) => b.name.toUpperCase() === normalizedBranch.toUpperCase());
    return {
      branch: normalizedBranch,
      section: extractedSection,
      unambiguousNewStandard: isKnownOfficial,
      needsFounderReview: !isKnownOfficial,
    };
  }

  const normalizedBranch = normalizeBranchLabel(trimmedBranch);
  const normalizedSection = trimmedSection.replace(/^SEC(?:TION)?\s*/i, '').trim();

  const isStandardSection = (ALLOWED_SECTION_VALUES as readonly string[]).includes(normalizedSection);
  const isKnownOfficial = OFFICIAL_BRANCHES_SEED.some((b) => b.name.toUpperCase() === normalizedBranch.toUpperCase());

  return {
    branch: normalizedBranch,
    section: normalizedSection,
    unambiguousNewStandard: isKnownOfficial && isStandardSection,
    needsFounderReview: !isKnownOfficial || !isStandardSection,
  };
}

/**
 * Derives the shortened class roll number from the last 4 characters of the official roll number,
 * removing unnecessary leading zeros while preserving unexpected formats safely.
 * Examples:
 *  26UECSE0220 -> "220"
 *  26UECSE0123 -> "123"
 *  26UECSE1230 -> "1230"
 */
export function deriveShortRollNumber(officialRollNumber: string): string {
  const clean = (officialRollNumber || '').trim().toUpperCase();
  if (!clean) return '';
  if (clean.length <= 4) {
    if (/^\d+$/.test(clean)) {
      return String(parseInt(clean, 10));
    }
    return clean;
  }
  const last4 = clean.slice(-4);
  if (/^\d{4}$/.test(last4)) {
    return String(parseInt(last4, 10));
  }
  // Safe fallback for unexpected formats where last 4 chars contain letters/hyphens
  const trailingDigits = last4.match(/0*(\d+)$/);
  if (trailingDigits && trailingDigits[1] && /^[A-Z]+0*\d+$/.test(last4)) {
    return last4;
  }
  return last4;
}

export interface RosterStudentItem {
  studentUserId: string;
  fullName: string;
  rollNumber: string;
}

/**
 * Identifies which shortened roll numbers are ambiguous (shared by 2+ students) within a given roster.
 */
export function detectRosterShortRollAmbiguities(roster: RosterStudentItem[]): Set<string> {
  const counts = new Map<string, number>();
  for (const item of roster) {
    const shortRoll = deriveShortRollNumber(item.rollNumber);
    counts.set(shortRoll, (counts.get(shortRoll) || 0) + 1);
  }
  const ambiguous = new Set<string>();
  for (const [shortRoll, count] of counts.entries()) {
    if (count > 1) {
      ambiguous.add(shortRoll);
    }
  }
  return ambiguous;
}

/**
 * Parses and validates a teacher's direct absentee roll number list input (comma, space, or newline separated)
 * against the session's eligible student roster snapshot.
 */
export function parseAndValidateAbsenteeInput(
  rawInput: string,
  roster: RosterStudentItem[]
): {
  valid: boolean;
  errors: string[];
  absentStudentUserIds: string[];
  normalizedAbsentShortRolls: string[];
} {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      valid: true,
      errors: [],
      absentStudentUserIds: [],
      normalizedAbsentShortRolls: [],
    };
  }

  // Split by commas, semicolons, whitespace, or newlines
  const rawTokens = trimmed
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  // Build lookup structures for the session roster
  const byFullRoll = new Map<string, RosterStudentItem>();
  const byShortRoll = new Map<string, RosterStudentItem[]>();

  for (const student of roster) {
    const official = student.rollNumber.trim().toUpperCase();
    byFullRoll.set(official, student);

    const shortRoll = deriveShortRollNumber(official);
    const list = byShortRoll.get(shortRoll) || [];
    list.push(student);
    byShortRoll.set(shortRoll, list);
  }

  const errors: string[] = [];
  const absentUserIdsSet = new Set<string>();
  const normalizedShortRolls: string[] = [];

  for (const token of rawTokens) {
    // 1. Check exact full roll number match first
    const exactMatch = byFullRoll.get(token);
    if (exactMatch) {
      if (!absentUserIdsSet.has(exactMatch.studentUserId)) {
        absentUserIdsSet.add(exactMatch.studentUserId);
        normalizedShortRolls.push(deriveShortRollNumber(exactMatch.rollNumber));
      }
      continue;
    }

    // 2. Normalize numeric token (e.g. "0220" -> "220") for short roll lookup
    const normalizedToken = /^\d+$/.test(token) ? String(parseInt(token, 10)) : token;
    const matches = byShortRoll.get(normalizedToken) || [];

    if (matches.length === 0) {
      errors.push(`Roll number "${token}" is not in this session's eligible student roster.`);
    } else if (matches.length > 1) {
      const fullRolls = matches.map((m) => m.rollNumber).join(', ');
      errors.push(
        `Short roll number "${normalizedToken}" is ambiguous (${fullRolls}). Please enter the full official roll number.`
      );
    } else {
      const matchedStudent = matches[0];
      if (!absentUserIdsSet.has(matchedStudent.studentUserId)) {
        absentUserIdsSet.add(matchedStudent.studentUserId);
        normalizedShortRolls.push(deriveShortRollNumber(matchedStudent.rollNumber));
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    absentStudentUserIds: Array.from(absentUserIdsSet),
    normalizedAbsentShortRolls: normalizedShortRolls,
  };
}

/**
 * Validates flexible session start and end times (HH:MM 24-hour format).
 */
export function validateSessionTimes(startTime: string, endTime: string): { valid: boolean; error?: string; durationMinutes?: number } {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const startMatch = (startTime || '').trim().match(timeRegex);
  const endMatch = (endTime || '').trim().match(timeRegex);

  if (!startMatch || !endMatch) {
    return { valid: false, error: 'Start time and end time must be valid 24-hour times (HH:MM).' };
  }

  const startMinutes = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10);
  const endMinutes = parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2], 10);

  if (endMinutes <= startMinutes) {
    return { valid: false, error: 'End time must be chronologically after start time.' };
  }

  return {
    valid: true,
    durationMinutes: endMinutes - startMinutes,
  };
}

export interface RotatingQrPayload {
  sid: string;
  w: number;
  iat: number;
  exp: number;
  v: 1;
}

/**
 * Generates a server-authoritative HMAC-SHA256 rotating QR token for an active QR attendance session.
 * Never exposes secrets or student PII.
 */
export function generateRotatingQrToken(
  sessionId: string,
  nowMs: number,
  sessionStartMs: number,
  sessionExpiresMs: number,
  refreshIntervalSec: number,
  secret: string
): {
  token: string;
  windowIndex: number;
  windowExpiresAtMs: number;
  secondsUntilNextRefresh: number;
  secondsUntilSessionExpiry: number;
} {
  const intervalMs = Math.max(1, refreshIntervalSec) * 1000;
  const elapsedMs = Math.max(0, nowMs - sessionStartMs);
  const windowIndex = Math.floor(elapsedMs / intervalMs);
  const windowStartMs = sessionStartMs + windowIndex * intervalMs;
  const windowExpiresAtMs = Math.min(sessionExpiresMs, windowStartMs + intervalMs);

  const payload: RotatingQrPayload = {
    sid: sessionId,
    w: windowIndex,
    iat: windowStartMs,
    exp: windowExpiresAtMs,
    v: 1,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  const secondsUntilNextRefresh = Math.max(1, Math.ceil((windowExpiresAtMs - nowMs) / 1000));
  const secondsUntilSessionExpiry = Math.max(0, Math.ceil((sessionExpiresMs - nowMs) / 1000));

  return {
    token: `${encodedPayload}.${signature}`,
    windowIndex,
    windowExpiresAtMs,
    secondsUntilNextRefresh,
    secondsUntilSessionExpiry,
  };
}

/**
 * Verifies a rotating QR token against server time, session expiry, and HMAC-SHA256 signature.
 */
export function verifyRotatingQrToken(
  token: string,
  expectedSessionId: string | undefined,
  nowMs: number,
  sessionStartMs: number,
  sessionExpiresMs: number,
  refreshIntervalSec: number,
  secret: string,
  graceWindowMs: number = 1200
): {
  valid: boolean;
  sessionId?: string;
  windowIndex?: number;
  error?: string;
} {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, error: 'Invalid QR code format.' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed QR verification token.' };
  }

  const [encodedPayload, providedSig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  const sigBufA = Buffer.from(providedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return { valid: false, error: 'Invalid or forged QR token signature.' };
  }

  let payload: RotatingQrPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'Corrupted QR token payload.' };
  }

  if (!payload || payload.v !== 1 || !payload.sid || typeof payload.w !== 'number' || typeof payload.exp !== 'number') {
    return { valid: false, error: 'Invalid QR token structure.' };
  }

  if (expectedSessionId && payload.sid !== expectedSessionId) {
    return { valid: false, error: 'QR code belongs to a different attendance session.' };
  }

  if (nowMs > sessionExpiresMs) {
    return { valid: false, sessionId: payload.sid, error: 'Attendance session has expired.' };
  }

  if (nowMs < sessionStartMs - 2000) {
    return { valid: false, sessionId: payload.sid, error: 'Attendance session has not started yet.' };
  }

  // Enforce rotating window expiry
  const intervalMs = Math.max(1, refreshIntervalSec) * 1000;
  const currentWindowIndex = Math.floor(Math.max(0, nowMs - sessionStartMs) / intervalMs);

  if (payload.w > currentWindowIndex) {
    return { valid: false, sessionId: payload.sid, error: 'QR token timestamp is in the future.' };
  }

  if (nowMs > payload.exp + graceWindowMs) {
    return {
      valid: false,
      sessionId: payload.sid,
      error: 'This rotating QR code has expired. Please scan the current QR code displayed on the faculty screen.',
    };
  }

  return {
    valid: true,
    sessionId: payload.sid,
    windowIndex: payload.w,
  };
}

/**
 * Calculates great-circle distance in meters between two WGS84 coordinates using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface GeofenceConfigState {
  campusName: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  accuracyToleranceMeters: number;
  maxAllowedAccuracyMeters: number;
  gpsEnforcementEnabled: boolean;
  demoModeEnabled: boolean;
}

export interface StudentLocationReading {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  timestamp?: number | null;
}

/**
 * Server-side Campus GPS Verification.
 * - If Founder Demo Mode is explicitly enabled, allows attendance and tags verification mode as DEMO_MODE.
 * - If GPS enforcement is enabled, requires valid configured campus coordinates and verifies student location.
 * - Never silently bypasses GPS when campus coordinates are missing.
 */
export function validateCampusGps(
  config: GeofenceConfigState,
  reading: StudentLocationReading | undefined | null,
  nowMs: number = Date.now()
): {
  allowed: boolean;
  verificationMode: 'GPS_VERIFIED' | 'DEMO_MODE' | 'GPS_DISABLED_BY_FOUNDER';
  distanceMeters?: number | null;
  error?: string;
} {
  // 1. Explicit Founder-controlled Demo Mode
  if (config.demoModeEnabled) {
    return {
      allowed: true,
      verificationMode: 'DEMO_MODE',
      distanceMeters: null,
    };
  }

  // 2. If Founder explicitly turned off GPS enforcement (separate from incomplete setup)
  if (!config.gpsEnforcementEnabled) {
    return {
      allowed: true,
      verificationMode: 'GPS_DISABLED_BY_FOUNDER',
      distanceMeters: null,
    };
  }

  // 3. GPS enforcement is ON: verify that campus boundary is actually configured
  if (
    config.latitude === null ||
    config.longitude === null ||
    !Number.isFinite(config.latitude) ||
    !Number.isFinite(config.longitude) ||
    !Number.isFinite(config.radiusMeters) ||
    config.radiusMeters <= 0
  ) {
    return {
      allowed: false,
      verificationMode: 'GPS_VERIFIED',
      error:
        'Campus GPS boundary is not yet configured by the Founder Administrator. Please ask the Founder to configure verified campus coordinates or enable temporary Demo Mode.',
    };
  }

  // 4. Verify student supplied a valid geolocation reading
  if (
    !reading ||
    reading.latitude === null ||
    reading.latitude === undefined ||
    reading.longitude === null ||
    reading.longitude === undefined ||
    !Number.isFinite(reading.latitude) ||
    !Number.isFinite(reading.longitude)
  ) {
    return {
      allowed: false,
      verificationMode: 'GPS_VERIFIED',
      error:
        'Location permission and a valid GPS reading are required to verify campus presence. If your device GPS is unavailable, ask your faculty member to mark your attendance manually.',
    };
  }

  if (reading.latitude < -90 || reading.latitude > 90 || reading.longitude < -180 || reading.longitude > 180) {
    return {
      allowed: false,
      verificationMode: 'GPS_VERIFIED',
      error: 'Invalid GPS coordinates received.',
    };
  }

  // 5. Check reading freshness (reject stale readings older than 3 minutes)
  if (reading.timestamp && Number.isFinite(reading.timestamp)) {
    const ageMs = nowMs - reading.timestamp;
    if (ageMs > 3 * 60 * 1000) {
      return {
        allowed: false,
        verificationMode: 'GPS_VERIFIED',
        error: 'Your GPS location reading is stale. Please refresh your location and scan again.',
      };
    }
  }

  // 6. Check reported GPS accuracy
  const reportedAccuracy =
    reading.accuracy !== null && reading.accuracy !== undefined && Number.isFinite(reading.accuracy) && reading.accuracy >= 0
      ? reading.accuracy
      : 0;

  const maxAccuracy = config.maxAllowedAccuracyMeters || 500;
  if (reportedAccuracy > maxAccuracy) {
    return {
      allowed: false,
      verificationMode: 'GPS_VERIFIED',
      error: `GPS signal accuracy is too low (±${Math.round(reportedAccuracy)}m; maximum allowed ±${maxAccuracy}m). Please move near a window or open area, or ask your faculty to mark attendance manually.`,
    };
  }

  // 7. Compute distance to campus center and apply bounded accuracy tolerance
  const distanceMeters = calculateHaversineDistanceMeters(
    reading.latitude,
    reading.longitude,
    config.latitude,
    config.longitude
  );

  const tolerance = Math.min(reportedAccuracy, config.accuracyToleranceMeters || 100);
  const effectiveDistance = Math.max(0, distanceMeters - tolerance);

  if (effectiveDistance > config.radiusMeters) {
    return {
      allowed: false,
      verificationMode: 'GPS_VERIFIED',
      distanceMeters: Math.round(distanceMeters),
      error: `Location verification failed: You are approximately ${Math.round(distanceMeters)}m from ${config.campusName} (allowed radius: ${config.radiusMeters}m).`,
    };
  }

  return {
    allowed: true,
    verificationMode: 'GPS_VERIFIED',
    distanceMeters: Math.round(distanceMeters),
  };
}
