// SPDX-License-Identifier: MIT
// Fixture transcription only: copy raw sources and pairs, never compute roots.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = path.join(__dirname, '..', 'fixtures', 'real');
const load = name => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const child = load('original-child.json');
const runs = child.data.resultData.runData;
const symbols = new Map(Object.keys(runs).map((name, i) => [name, i + 1]));
const producer = source => `ProducerRef::new(${symbols.get(source?.previousNode) ?? 0}, ${source?.previousNodeRun ?? 0}, ${source?.previousNodeOutput ?? 0})`;
const entries = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const lines = ['// Generated from original-child.json raw sources/pairedItem. No ancestry computation.',
  'use ingot::{Graph, ProducerRef, Coordinate, RootSet}',
  ...[...symbols].map(([name, id]) => `// child node ${id}: ${name}`),
  'pub fn recorded_graph() -> Graph {',
  `    var graph = Graph::new(${runs.Start[0].data.main[0].length}, ProducerRef::new(${symbols.get('Start')}, 0, 0))`];
let cursor = 0;
for (const [name, tasks] of Object.entries(runs)) {
  for (const [run, task] of tasks.entries()) {
    task.source.forEach((source, inlet) => lines.push(`    graph.add_source(${symbols.get(name)}, ${run}, ${inlet}, ${producer(source)}, true)`));
    task.data.main.forEach((items, output) => items.forEach((item, index) => {
      const pairs = entries(item.pairedItem);
      const begin = cursor;
      for (let pair of pairs) {
        if (typeof pair === 'number') pair = { item: pair };
        const valid = !!pair && Number.isInteger(pair.item) && pair.item >= 0 && Number.isInteger(pair.input ?? 0) && (pair.input ?? 0) >= 0;
        const overwrite = Object.hasOwn(pair ?? {}, 'sourceOverwrite');
        lines.push(`    graph.add_pair(${pair?.item ?? 0}, ${pair?.input ?? 0}, ${overwrite}, ${producer(pair?.sourceOverwrite)}, ${valid})`);
        cursor++;
      }
      lines.push(`    graph.add_vertex(Coordinate::new(${symbols.get(name)}, ${run}, ${output}, ${index}), ${begin}, ${pairs.length}, ${pairs.length > 0})`);
    }));
  }
}
lines.push('    graph', '}');
for (const variant of ['original', 'repaired']) {
  const output = load(`${variant}-parent.json`).data.resultData.runData.Call[0].data.main[0];
  output.forEach((item, index) => {
    lines.push(`pub fn ${variant}_${index}() -> RootSet<256> {`, '    var roots = RootSet<256>::EMPTY');
    for (let pair of entries(item.pairedItem)) {
      if (typeof pair === 'number') pair = { item: pair };
      assert.equal(pair.input ?? 0, 0);
      lines.push(`    roots.put(${pair.item})`);
    }
    lines.push('    roots', '}');
  });
}
lines.push(`pub const TERMINAL_NODE: u16 = ${symbols.get(child.data.resultData.lastNodeExecuted)}`);
// A transport check for the real crossed axes; these are raw values, not roots.
assert.equal(runs.Select[0].data.main[0][0].pairedItem.input, 1);
assert.equal(runs.Select[0].source[1].previousNodeOutput, 0);
process.stdout.write(lines.join('\n') + '\n');
