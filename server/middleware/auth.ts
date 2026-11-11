import { Request, Response, NextFunction } from 'express';
import { getSessionUser, AuthenticatedUser } from '../services/authService';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}

export function setSessionCookie(res: Response, req: Request, sessionId: string) {
  const isHttps = process.env.NODE_ENV === 'production' || 
                  req.secure || 
                  req.headers['x-forwarded-proto'] === 'https' ||
                  Boolean(process.env.APP_URL?.startsWith('https://'));

  res.cookie('attendx_session', sessionId, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('attendx_session', {
    httpOnly: true,
    path: '/',
  });
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  let sessionId = req.cookies?.attendx_session;
  let user = sessionId ? getSessionUser(sessionId) : null;

  // Fallback to Bearer token in Authorization header (essential for cross-origin or third-party iframe cookie restrictions)
  if (!user && req.headers.authorization?.startsWith('Bearer ')) {
    const bearerToken = req.headers.authorization.slice(7).trim();
    if (bearerToken) {
      const bearerUser = getSessionUser(bearerToken);
      if (bearerUser) {
        user = bearerUser;
        sessionId = bearerToken;
      }
    }
  }

  if (user && sessionId) {
    req.user = user;
    req.sessionId = sessionId;
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.',
    });
  }
  next();
}

export function requireRole(allowedRoles: Array<'STUDENT' | 'FACULTY' | 'FOUNDER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of [${allowedRoles.join(', ')}] roles.`,
      });
    }

    // Check account status
    if (req.user.status === 'PENDING') {
      return res.status(403).json({
        error: 'Your account application is pending administrative approval.',
        status: 'PENDING',
      });
    }

    if (req.user.status === 'REJECTED') {
      return res.status(403).json({
        error: 'Your account application has been rejected.',
        status: 'REJECTED',
      });
    }

    if (req.user.status === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact the administrator.',
        status: 'SUSPENDED',
      });
    }

    if (req.user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Account is not in active state.',
        status: req.user.status,
      });
    }

    next();
  };
}

/**
 * Robust CSRF / Origin validation for state-changing browser requests.
 * Uses defense-in-depth: custom header validation (OWASP recommended)
 * plus origin/host verification supporting reverse proxies (X-Forwarded-Host).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 1. Check for custom client header (browsers block cross-site forms from attaching custom headers)
  const customHeader = req.headers['x-attendx-client'] || req.headers['x-requested-with'];
  if (customHeader === 'web' || customHeader === 'XMLHttpRequest') {
    return next();
  }

  // 2. Validate Origin / Referer header against authorized hosts
  const origin = (req.headers.origin || req.headers.referer) as string | undefined;
  if (!origin) {
    return res.status(403).json({ error: 'Cross-site request blocked: missing client or origin verification.' });
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();

    // Compile list of permitted hosts
    const allowedHosts = new Set<string>();

    if (req.headers.host) {
      allowedHosts.add(req.headers.host.toLowerCase());
    }
    const forwardedHost = req.headers['x-forwarded-host'] as string | undefined;
    if (forwardedHost) {
      allowedHosts.add(forwardedHost.toLowerCase());
    }
    if (process.env.APP_URL) {
      try {
        allowedHosts.add(new URL(process.env.APP_URL).host.toLowerCase());
      } catch {}
    }

    // Local development addresses
    allowedHosts.add('localhost:3000');
    allowedHosts.add('127.0.0.1:3000');
    allowedHosts.add('localhost');
    allowedHosts.add('127.0.0.1');

    // Cloud Run and Google AI Studio preview domains
    const isCloudRunOrigin = originHost.endsWith('.run.app') || originHost.endsWith('.aistudio.google.com');

    if (!allowedHosts.has(originHost) && !isCloudRunOrigin) {
      return res.status(403).json({ error: 'Cross-site request blocked.' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid request origin header.' });
  }

  next();
}
