#!/usr/bin/env node
// PostToolUse hook — lints only the file that was just edited.
//
// Fires right after Edit/Write, so a lint error surfaces while the agent still
// has the change in context, instead of at PR time. Exit code 2 feeds stderr
// back to the agent as a blocking error; every other path exits 0 so that an
// unrelated edit never interrupts the session.
//
// Also drops a marker file when a src/ file changes, which stop-verify.mjs
// uses to decide whether the test suite needs to run at all.

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
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

const root = payload.cwd || process.cwd();
const filePath = payload?.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = path.relative(root, filePath);
// Outside the repo, generated, or not a source file we lint.
if (rel.startsWith('..') || path.isAbsolute(rel)) process.exit(0);
if (!/\.(js|jsx|mjs|cjs)$/.test(rel)) process.exit(0);
if (/(^|[\\/])(node_modules|dist|coverage|\.wrangler)[\\/]/.test(rel)) process.exit(0);
if (!existsSync(filePath)) process.exit(0);

if (rel.startsWith('src/')) {
  writeFileSync(path.join(root, '.claude', '.needs-test'), `${rel}\n`, { flag: 'a' });
}

// Call the local binary directly — npx adds ~1s of startup to every edit.
const eslintBin = path.join(root, 'node_modules', '.bin', 'eslint');
if (!existsSync(eslintBin)) process.exit(0);

const result = spawnSync(eslintBin, ['--no-warn-ignored', rel], {
  cwd: root,
  encoding: 'utf8',
});

// status null means the binary failed to spawn — stay out of the way.
if (result.status === null || result.status === 0) process.exit(0);

process.stderr.write(
  `ESLint failed on ${rel}. Fix these before moving on:\n\n` +
    `${result.stdout || ''}${result.stderr || ''}`
);
process.exit(2);
