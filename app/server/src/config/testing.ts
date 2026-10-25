// `npm test`. Fixed values, never read from .env, so tests run the same on every machine.
export function testing() {
  return {
    port: 0,
    databasePath: ':memory:', // a fresh, throwaway SQLite database per test run
    adminUsername: 'admin',
    adminPassword: 'Qwerty12!',
    fplTeamId: 123456, // the manager in test/mockServer.ts
    logImports: false, // keeps test output free of "Imported N fixture rows…"
  };
}
