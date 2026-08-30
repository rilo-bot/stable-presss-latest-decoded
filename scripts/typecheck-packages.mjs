// ---------------------------------------------------------------------------
// Typecheck every packages/mb-* that has its own tsconfig.
//
// A loop rather than a hard-coded list, so a new package is covered the moment
// Lane 0 creates it — a list would be one more thing to remember and would fail
// silently by omission. Exits 0 when there are no packages yet, so Lane 0's gate
// works before the first one lands.
// ---------------------------------------------------------------------------

import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

if (!existsSync(packagesDir)) {
  console.log('typecheck:packages — no packages/ directory yet, nothing to check');
  process.exit(0);
}

const projects = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesDir, entry.name, 'tsconfig.json'))
  .filter((path) => existsSync(path));

if (projects.length === 0) {
  console.log('typecheck:packages — no package tsconfigs yet, nothing to check');
  process.exit(0);
}

let failed = 0;
for (const project of projects) {
  const relative = project.slice(root.length + 1);
  console.log(`typecheck:packages — ${relative}`);
  const result = spawnSync('npx', ['tsc', '-p', project, '--noEmit'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) failed += 1;
}

process.exit(failed === 0 ? 0 : 1);
