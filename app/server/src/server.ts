import { createApp } from './app.js';
import { config } from './config.js';
import { authService } from './services/authService.js';

if (!authService.isConfigured()) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD must be set (see .env.example).');
  process.exit(1);
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  if (!config.fpl.teamId) {
    console.warn('FPL_TEAM_ID is not set — /api/team will fail until it is configured.');
  }
});
