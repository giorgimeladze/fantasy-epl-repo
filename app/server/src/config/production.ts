// NODE_ENV=production, for a future deployment (`npm start` uses development for now). Same .env
// variables as development, but account 1's credentials and team ID are required: a missing one
// stops the server at startup instead of failing per request. Account 2 (ACCOUNT2_*) stays optional.
import { withSecondAccount } from './accounts.js';
import { development } from './development.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in production (see .env.example).`);
  return value;
}

export function production() {
  return {
    ...development(),
    accounts: withSecondAccount({
      username: required('ADMIN_USERNAME'),
      password: required('ADMIN_PASSWORD'),
      teamId: Number(required('FPL_TEAM_ID')),
    }),
  };
}
