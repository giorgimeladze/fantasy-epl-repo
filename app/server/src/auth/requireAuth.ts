import type { NextFunction, Request, Response } from 'express';
import { forceRefresh } from '../utils/http.js';
import { authService } from './authService.js';
import type { Session } from './models.js';

function getBearerToken(req: Request): string | null {
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

/** The logged-in account's FPL team (use after `requireAuth`). */
export function sessionTeamId(res: Response): number {
  return (res.locals.session as Session).teamId;
}

/** What a team endpoint's service takes: the logged-in account's team and `?refresh=true`. */
export function teamOptions(req: Request, res: Response): { teamId: number; forceRefresh: boolean } {
  return { teamId: sessionTeamId(res), ...forceRefresh(req) };
}
