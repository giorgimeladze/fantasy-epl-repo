// `npm test`. Fixed values, never read from .env, so tests run the same on every machine.
export function testing() {
  return {
    port: 0,
    databasePath: ':memory:', // a fresh, throwaway SQLite database per test run
    accounts: [
      { username: 'admin', password: 'Qwerty12!', teamId: 123456 }, // the manager in test/mockServer.ts
      { username: 'friend', password: 'Asdfgh34!', teamId: 654321 }, // the second manager there
    ],
    logImports: false, // keeps test output free of "Imported N fixture rows…"
  };
}
