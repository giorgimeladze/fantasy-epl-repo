#!/usr/bin/env node
// Scaffolds a new /api/<path> endpoint end to end (see SKILL.md). Usage, from the repo root:
//   node .claude/skills/new-endpoint/scaffold.mjs <feature> [url-path]
//   node .claude/skills/new-endpoint/scaffold.mjs fixtures
//   node .claude/skills/new-endpoint/scaffold.mjs priceHistory price-history
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [feature, urlPath = feature.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)] = process.argv.slice(2);
if (!feature || !/^[a-z][a-zA-Z]*$/.test(feature)) {
  console.error('Usage: scaffold.mjs <feature (camelCase)> [url-path (kebab-case)]');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const server = path.join(root, 'app/server');
const client = path.join(root, 'app/client/src');
const featureDir = path.join(server, 'src', feature);
if (existsSync(featureDir)) {
  console.error(`app/server/src/${feature}/ already exists`);
  process.exit(1);
}

const Pascal = feature[0].toUpperCase() + feature.slice(1);
const service = `${feature}Service`;
const routes = `${feature}Routes`;
const method = `get${Pascal}`;

function write(file, content) {
  writeFileSync(file, content);
  console.log(`created  ${path.relative(root, file)}`);
}

/** Inserts `text` before the last match of `anchor` in `file`. */
function insertBefore(file, anchor, text) {
  const source = readFileSync(file, 'utf8');
  const at = source.lastIndexOf(anchor);
  if (at === -1) throw new Error(`${path.relative(root, file)}: anchor not found: ${anchor}`);
  writeFileSync(file, source.slice(0, at) + text + source.slice(at));
  console.log(`updated  ${path.relative(root, file)}`);
}

mkdirSync(featureDir);

write(path.join(featureDir, 'models.ts'), `// Response contract for /api/${urlPath}.
// Re-exported by app/client/src/types.ts: types only.
import type { CacheInfo } from '../team/models.js';

export interface ${Pascal}Snapshot {
  gameweek: number; // TODO: the real response fields
}

export type ${Pascal}Response = ${Pascal}Snapshot & { cache: CacheInfo };
`);

write(path.join(featureDir, `${service}.ts`), `import { cachedEndpoint } from '../db/responseCache.js';
import { teamService } from '../team/teamService.js';
import type { ${Pascal}Snapshot } from './models.js';

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<${Pascal}Snapshot> {
  // TODO: fetch through fplClient / other features' services, compute in a pure module, map to the response.
  const team = await teamService.getMyTeam({ teamId, forceRefresh });
  return { gameweek: team.gameweek.id };
}

export const ${service} = {
  /** TODO: what it returns. Cached in SQLite for config.db.cacheTtlMs. */
  ${method}: cachedEndpoint<${Pascal}Snapshot>('${urlPath}', buildSnapshot),
};
`);

write(path.join(featureDir, 'routes.ts'), `// /api/${urlPath}
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { forceRefresh } from '../utils/http.js';
import { ${service} } from './${service}.js';

export const ${routes} = Router();

${routes}.use(requireAuth);

// TODO: what it returns. Cached for 30 minutes.
${routes}.get('/', async (req, res) => {
  res.json(await ${service}.${method}(forceRefresh(req)));
});
`);

write(path.join(featureDir, 'CLAUDE.md'), `# ${feature}/

\`/api/${urlPath}\`: TODO (what it returns), cached under \`${urlPath}:<id>\`.

- \`${service}.ts\` — assembles the response.
- \`models.ts\` — the response types (types only; the client imports them).
`);

const routesFile = path.join(server, 'src/routes.ts');
insertBefore(routesFile, '\nexport const router', `import { ${routes} } from './${feature}/routes.js';\n`);
insertBefore(routesFile, '\n// Unknown /api routes', `router.use('/${urlPath}', ${routes});\n`);

writeFileSync(
  path.join(client, 'types.ts'),
  `${readFileSync(path.join(client, 'types.ts'), 'utf8')}export type * from '../../server/src/${feature}/models.ts';\n`,
);
console.log('updated  app/client/src/types.ts');

const apiFile = path.join(client, 'api.ts');
const apiSource = readFileSync(apiFile, 'utf8');
writeFileSync(apiFile, apiSource.replace('import type {\n', `import type {\n  ${Pascal}Response,\n`));
insertBefore(
  apiFile,
  '};\n',
  `  ${method}: (forceRefresh = false) => get<${Pascal}Response>('/${urlPath}', forceRefresh),\n`,
);

insertBefore(
  path.join(server, 'test/helpers/namespace.ts'),
  '  };\n}',
  `    ${feature}: ({ refresh = false } = {}) => get('/${urlPath}', refresh),\n`,
);
insertBefore(path.join(server, 'test/app.test.ts'), '      ];', `        await client.${feature}(),\n`);

write(path.join(server, 'test', `${feature}.test.ts`), `import assert from 'node:assert/strict';
import type { ${Pascal}Response } from '../src/${feature}/models.js';
import { api } from './setup.js';

describe('GET /api/${urlPath}', () => {
  it('returns the next gameweek data', async () => {
    const res = await api.${feature}();
    assert.equal(res.status, 200);
    const body: ${Pascal}Response = res.body;
    assert.equal(body.gameweek, 2); // TODO: assert real, hand-calculated values from test/mockServer.ts
  });

  it('serves repeat requests from the SQLite cache, and rebuilds on ?refresh=true', async () => {
    assert.equal((await api.${feature}()).body.cache.fromCache, false);
    assert.equal((await api.${feature}()).body.cache.fromCache, true);
    assert.equal((await api.${feature}({ refresh: true })).body.cache.fromCache, false);
  });
});
`);

console.log('\nNext: fill in the TODOs, add the endpoint to the README tables and the active spec,');
console.log('then run `npm run check`.');
