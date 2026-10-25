# config/

`index.ts` exports `config`: shared settings plus the per-environment values from `development.ts` (default, also `npm start`), `testing.ts` (`npm test`, fixed values) or `production.ts` (`NODE_ENV=production`, future deployment). Rules: [../docs/config-variables.md](../docs/config-variables.md).
