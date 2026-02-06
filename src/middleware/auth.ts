import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../lib/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;

  if (!token) {
    res.status(401).json({ success: false, message: '未登入' });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token 無效或已過期' });
  }
}

export function requireRole(...roles: Array<'admin' | 'consultant'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未登入' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: '權限不足' });
      return;
    }
    next();
  };
}
