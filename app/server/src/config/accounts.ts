// Login accounts, each tied to one FPL team (docs/tasks/second-account.md). Account 1 comes from
// ADMIN_USERNAME / ADMIN_PASSWORD / FPL_TEAM_ID (read in development.ts / production.ts); account 2 is
// optional and read here, the same way in every environment that uses .env.

export interface Account {
  username: string;
  password: string;
  teamId: number; // FPL entry ID; 0 = not set
}

const SECOND = ['ACCOUNT2_USERNAME', 'ACCOUNT2_PASSWORD', 'ACCOUNT2_FPL_TEAM_ID'] as const;

/** Account 2 from ACCOUNT2_*: all three variables or none. Throws on a half-set or invalid account. */
export function secondAccount(first: Account): Account | null {
  const [username, password, teamIdText] = SECOND.map((name) => process.env[name] ?? '');
  const given = [username, password, teamIdText].filter((value) => value !== '').length;
  if (given === 0) return null;
  if (given < SECOND.length) {
    throw new Error(`Set all of ${SECOND.join(', ')} or none of them (see .env.example).`);
  }

  const teamId = Number(teamIdText);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    throw new Error('ACCOUNT2_FPL_TEAM_ID must be a positive whole number.');
  }
  if (username === first.username) throw new Error('ACCOUNT2_USERNAME must differ from ADMIN_USERNAME.');
  return { username: username!, password: password!, teamId };
}

/** Account 1 plus account 2 when it is set. */
export function withSecondAccount(first: Account): Account[] {
  const second = secondAccount(first);
  return second ? [first, second] : [first];
}
