#!/usr/bin/env node
// Stop hook — runs the test suite before the agent is allowed to finish a turn.
//
// Only runs when post-edit-lint.mjs left a marker, i.e. a src/ file was
// actually edited this session. Question-answering turns cost nothing.
//
// Build stays in CI: `vite build` is a clean-room concern and the test suite
// already imports every module that matters. Tests take ~5s, a build does not.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const raw = await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (chunk) => (data += chunk));
  process.stdin.on('end', () => resolve(data));
});

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

// Set when a previous Stop hook already forced a continuation. Bailing here is
// what keeps a persistently failing suite from looping forever.
if (payload.stop_hook_active) process.exit(0);

const root = payload.cwd || process.cwd();
const marker = path.join(root, '.claude', '.needs-test');
if (!existsSync(marker)) process.exit(0);

const result = spawnSync('npm', ['test', '--silent'], { cwd: root, encoding: 'utf8' });

if (result.status === 0) {
  rmSync(marker, { force: true });
  process.exit(0);
}

// Marker is deliberately left in place on failure, so the next turn re-checks.
if (result.status === null) process.exit(0);

const output = `${result.stdout || ''}${result.stderr || ''}`;
process.stderr.write(
  `Tests are failing after this session's edits. Fix them before finishing:\n\n` +
    `${output.slice(-4000)}`
);
process.exit(2);
