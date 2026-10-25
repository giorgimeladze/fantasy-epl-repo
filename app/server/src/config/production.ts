// NODE_ENV=production, for a future deployment (`npm start` uses development for now). Same .env
// variables as development, but the admin credentials and team ID are required: a missing one
// stops the server at startup instead of failing per request.
import { development } from './development.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in production (see .env.example).`);
  return value;
}

export function production() {
  return {
    ...development(),
    adminUsername: required('ADMIN_USERNAME'),
    adminPassword: required('ADMIN_PASSWORD'),
    fplTeamId: Number(required('FPL_TEAM_ID')),
  };
}
