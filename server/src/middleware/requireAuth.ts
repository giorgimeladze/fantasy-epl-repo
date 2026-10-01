import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/authService.js';

export function getBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  const session = token ? authService.getSession(token) : null;
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.locals.session = session;
  res.locals.token = token;
  next();
}
