import type { NextFunction, Request, Response } from 'express';

/** Throw for expected failures; errorHandler turns it into `{ "error": message }` with `status`. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

/** A route param or body field as a positive integer; anything else is a 400 with `message`. */
export function positiveInt(value: unknown, message: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw new HttpError(400, message);
  return n;
}

/** `?refresh=true` skips the response cache. */
export function forceRefresh(req: Request): { forceRefresh: boolean } {
  return { forceRefresh: req.query.refresh === 'true' };
}
