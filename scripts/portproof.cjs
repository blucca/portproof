#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// File I/O and process wiring; the Fe executable owns every verdict.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extract, failure } = require('./extract.cjs');
let input;
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 && !(args.length === 4 && args[2] === '--terminal')) throw new Error('Usage: node scripts/portproof.cjs PARENT.json CHILD.json [--terminal NAME]');
  input = extract(...args.slice(0, 2).map(file => JSON.parse(fs.readFileSync(file, 'utf8'))), args[3]);
} catch (error) {
  process.stderr.write(`PortProof extraction: ${error.message}\n`);
  input = failure();
}
const run = spawnSync(path.resolve(__dirname, '../build/portproof'), [], { input, stdio: ['pipe', 'inherit', 'inherit'] });
if (run.error) process.stderr.write(`PortProof: ${run.error.message}. Build with fe build . --backend native --out-dir build\n`);
process.exitCode = run.status ?? 2;
