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

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  let sessionId = req.cookies?.attendx_session;

  if (!sessionId && req.headers.authorization?.startsWith('Bearer ')) {
    sessionId = req.headers.authorization.slice(7).trim();
  }

  if (sessionId) {
    const user = getSessionUser(sessionId);
    if (user) {
      req.user = user;
      req.sessionId = sessionId;
    }
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
 * Basic CSRF / Origin validation for state-changing browser requests
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Check header or origin
  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;

  // In local or API proxy environments, ensure origin matches host if origin is present
  if (origin && host) {
    try {
      const url = new URL(origin);
      if (url.host !== host && !origin.includes(host)) {
        return res.status(403).json({ error: 'Cross-site request blocked.' });
      }
    } catch {
      // Invalid URL in origin
    }
  }

  next();
}
