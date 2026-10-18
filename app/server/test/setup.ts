// Loaded by mocha (see .mocharc.json) before any spec, so src/config.ts picks these up.
process.env.DATABASE_PATH = ':memory:';
process.env.FPL_TEAM_ID = '123456';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'Qwerty12!';
process.env.NODE_ENV = 'test'; // keeps the history importer quiet
