#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Raw-field transport only: Fe chooses the boundary and computes its ancestry.
'use strict';
const fs = require('node:fs');
const own = (o, k) => o != null && Object.hasOwn(o, k);
const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
const caps = [256, 256, 1024, 1024, 768, 2048];
function extract(parent, child, terminalOverride) {
  const atoms = new Map([['"success"', 1], ['"n8n-nodes-base.executeWorkflow"', 2],
    ['"n8n-nodes-base.executeWorkflowTrigger"', 3], ['1.2', 4], ['"once"', 5],
    ['true', 6], ['false', 7], ['"passthrough"', 8]]);
  const nodes = new Map(), ids = new Map();
  const definitions = [], tasks = [], sources = [], outputs = [], items = [], pairs = [], pool = [];
  let poolLength = 0;
  const short = n => Number.isInteger(n) && n >= 0 && n <= 65535;
  function symbol(map, key, start = 1) {
    if (!map.has(key)) map.set(key, map.size + start);
    const value = map.get(key);
    if (!short(value)) throw new Error('Symbol capacity');
    return value;
  }
  const node = (role, name) => typeof name === 'string' && name.length > 0 ? symbol(nodes, JSON.stringify([role, name])) : 0;
  const atom = value => value === undefined ? 0 : symbol(atoms, canonical(value));
  function id(value, present = value !== undefined) {
    if (!present) return [0, 0];
    const valid = (typeof value === 'string' && value.length > 0) || (Number.isInteger(value) && value >= 0);
    const kind = valid ? (typeof value === 'string' ? 1 : 2) : 3;
    return [symbol(ids, (valid ? 'id:' + String(value) : 'raw:' + canonical(value))), kind];
  }
  function producer(role, value) {
    const name = node(role, value?.previousNode);
    const run = value?.previousNodeRun ?? 0, output = value?.previousNodeOutput ?? 0;
    const valid = object(value) && name > 0 && short(run) && short(output);
    return [name, short(run) ? run : 0, short(output) ? output : 0, valid ? 1 : 0];
  }
  for (const [role, execution] of [parent, child].entries()) {
    if (!object(execution) || !Array.isArray(execution.workflowData?.nodes) || !object(execution.data?.resultData?.runData)) throw new Error('Saved execution structure');
    for (const definition of execution.workflowData.nodes) {
      if (!object(definition)) throw new Error('Node definition structure');
      definitions.push([node(role, definition.name), role, atom(definition.type), atom(definition.typeVersion),
        atom(definition.parameters?.mode), atom(definition.parameters?.options?.waitForSubWorkflow), atom(definition.parameters?.inputSource)]);
    }
    for (const [name, runs] of Object.entries(execution.data.resultData.runData)) {
      if (!Array.isArray(runs)) throw new Error('runData array');
      runs.forEach((task, run) => {
        if (!object(task) || !short(run)) throw new Error('Task structure');
        const symbol = node(role, name), sourceStart = sources.length, outputStart = outputs.length;
        const sourcePresent = Array.isArray(task.source) ? 1 : 0;
        if (own(task, 'source') && !sourcePresent) throw new Error('source array');
        if (sourcePresent) task.source.forEach((value, inlet) => {
          if (!short(inlet)) throw new Error('Input index');
          const [previousNode, previousRun, previousOutput, valid] = producer(role, value);
          sources.push([symbol, role, run, inlet, previousNode, previousRun, previousOutput, valid]);
        });
        const main = task.data?.main, mainPresent = Array.isArray(main) ? 1 : 0;
        if (main !== undefined && !mainPresent) throw new Error('main array');
        if (mainPresent) main.forEach((outputItems, output) => {
          if (!Array.isArray(outputItems) || !short(output)) throw new Error('Output array');
          const itemStart = items.length;
          outputItems.forEach((item, index) => {
            if (!object(item) || !short(index)) throw new Error('Item structure');
            const pairStart = pairs.length, pairPresent = own(item, 'pairedItem') ? 1 : 0;
            const entries = pairPresent ? (Array.isArray(item.pairedItem) ? item.pairedItem : [item.pairedItem]) : [];
            for (const entry of entries) {
              const pair = typeof entry === 'number' ? { item: entry } : entry;
              const itemIndex = pair?.item, input = pair?.input ?? 0;
              const overwritten = object(pair) && own(pair, 'sourceOverwrite');
              const [previousNode, previousRun, previousOutput, sourceValid] = overwritten ? producer(role, pair.sourceOverwrite) : [0, 0, 0, 1];
              const valid = object(pair) && short(itemIndex) && short(input) && sourceValid === 1;
              pairs.push([short(itemIndex) ? itemIndex : 0, short(input) ? input : 0, overwritten ? 1 : 0,
                previousNode, previousRun, previousOutput, valid ? 1 : 0]);
            }
            const jsonPresent = own(item, 'json') ? 1 : 0;
            const bytes = jsonPresent ? Buffer.from(canonical(item.json), 'utf8') : Buffer.alloc(0);
            items.push([symbol, role, run, output, index, pairStart, pairs.length - pairStart, pairPresent, jsonPresent, poolLength, bytes.length]);
            pool.push(bytes); poolLength += bytes.length;
          });
          outputs.push([symbol, role, run, output, itemStart, items.length - itemStart]);
        });
        const sub = task.metadata?.subExecution, reverse = task.metadata?.parentExecution;
        tasks.push([symbol, role, run, sourceStart, sources.length - sourceStart, sourcePresent,
          outputStart, outputs.length - outputStart, mainPresent,
          ...id(sub?.executionId, own(sub, 'executionId')), ...id(sub?.workflowId, own(sub, 'workflowId')),
          ...id(reverse?.executionId, own(reverse, 'executionId')), ...id(reverse?.workflowId, own(reverse, 'workflowId'))]);
      });
    }
  }
  const tables = [definitions, tasks, sources, outputs, items, pairs];
  if (tables.some((t, i) => t.length > caps[i]) || poolLength > 131072 || tables.some(t => t.some(row => row.slice(0, t === items ? 9 : row.length).some(v => !short(v))))) throw new Error('First-edition capacity');
  const terminal = terminalOverride ?? child.data?.resultData?.lastNodeExecuted;
  const terminalPresent = typeof terminal === 'string' && terminal.length > 0;
  const header = [0, ...tables.map(t => t.length), node(1, terminal), terminalPresent ? 1 : 0];
  const metadata = [parent, child].flatMap(execution => [...id(execution.id, own(execution, 'id')), ...id(execution.workflowId, own(execution, 'workflowId')), atom(execution.status)]);
  const size = 46 + definitions.length * 14 + tasks.length * 34 + sources.length * 16 + outputs.length * 12 + items.length * 26 + pairs.length * 14 + poolLength;
  const wire = Buffer.alloc(size); wire.write('PPF1'); let position = 4;
  const u16 = value => { wire.writeUInt16LE(value, position); position += 2; };
  const u32 = value => { wire.writeUInt32LE(value, position); position += 4; };
  header.forEach(u16); u32(poolLength); metadata.forEach(u16);
  for (const table of tables) for (const row of table) row.forEach((value, index) => (table === items && index >= 9 ? u32 : u16)(value));
  Buffer.concat(pool).copy(wire, position); position += poolLength;
  if (position !== size) throw new Error('Wire length');
  return wire;
}
function failure() {
  const wire = Buffer.alloc(46); wire.write('PPF1'); wire.writeUInt16LE(1, 4); return wire;
}
module.exports = { extract, canonical, failure };
if (require.main === module) {
  let wire;
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 && !(args.length === 4 && args[2] === '--terminal')) throw new Error('Usage: node scripts/extract.cjs PARENT.json CHILD.json [--terminal NAME]');
    wire = extract(...args.slice(0, 2).map(path => JSON.parse(fs.readFileSync(path, 'utf8'))), args[3]);
  } catch (error) {
    process.stderr.write(`PortProof extraction: ${error.message}\n`);
    wire = failure();
  }
  process.stdout.write(wire);
}
