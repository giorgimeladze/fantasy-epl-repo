// The default: `npm run dev`, `npm start` and `npm run backtest`. Reads the repo-root .env; everything has a default
// except the admin credentials (the server refuses to start without them).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSecondAccount } from './accounts.js';

// app/server/ — the same relative location from src/config/ (tsx) and dist/config/ (compiled).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function development() {
  return {
    port: Number(process.env.PORT ?? 3001),
    databasePath: process.env.DATABASE_PATH ?? path.join(serverRoot, 'data', 'fpl.sqlite'),
    accounts: withSecondAccount({
      username: process.env.ADMIN_USERNAME ?? '',
      password: process.env.ADMIN_PASSWORD ?? '',
      teamId: Number(process.env.FPL_TEAM_ID ?? 0), // 0 = not set; /api/team explains how to set it
    }),
    logImports: true,
  };
}
