import { createApp } from './app.js';
import { config } from './config/index.js';
import { authService } from './auth/authService.js';

if (!authService.isConfigured()) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD must be set (see .env.example).');
  process.exit(1);
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  for (const account of config.auth.accounts) {
    if (!account.teamId) {
      console.warn(`No FPL team ID for "${account.username}" (FPL_TEAM_ID) — /api/team will fail until it is set.`);
    }
  }
});
