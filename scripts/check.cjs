#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Small end-to-end contract checks: each verdict and root set comes from Fe.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { extract, failure } = require('./extract.cjs');
const root = path.resolve(__dirname, '..');
const binary = path.resolve(process.argv[2] || path.join(root, 'build/portproof'));
const load = name => JSON.parse(fs.readFileSync(path.join(root, 'fixtures/real', name + '.json'), 'utf8'));
const real = mode => [load(mode + '-parent'), load(mode + '-child')];
function native(wire) {
  const run = spawnSync(binary, [], { input: wire, encoding: 'utf8', timeout: 30000 });
  if (run.error) throw run.error;
  assert.equal(run.signal, null, run.stderr);
  return { exit: run.status, report: JSON.parse(run.stdout) };
}
let checks = 0;
function check(name, records, exit, inspect) {
  const result = native(extract(...records));
  assert.equal(result.exit, exit, `${name}: ${JSON.stringify(result.report)}`);
  assert.equal(result.report.status, ['consistent', 'mismatch', 'incomplete'][exit]);
  inspect?.(result.report);
  checks++; console.log(`PASS ${name}`);
}
check('original: equal business JSON, wrong recorded roots', real('original'), 1, report => {
  assert.deepEqual(report.findings.map(f => f.expected), [[3], [2]]);
  assert.deepEqual(report.findings.map(f => f.observed), [[0], [1]]);
  assert.equal(report.mismatches, 2);
});
check('repaired: complete bilateral boundary is consistent', real('repaired'), 0, report => {
  assert.deepEqual(report.findings.map(f => f.expected), [[3], [2]]);
  assert.deepEqual(report.findings.map(f => f.observed), [[3], [2]]);
});
let records = real('repaired');
delete records[1].workflowId;
delete records[0].data.resultData.runData.Call[0].metadata.subExecution.workflowId;
check('both child workflow IDs absent', records, 2, r => assert.equal(r.issue_code, 20));
records = real('repaired');
delete records[0].workflowId;
delete records[1].data.resultData.runData.Start[0].metadata.parentExecution.workflowId;
check('both parent workflow IDs absent', records, 2, r => assert.equal(r.issue_code, 20));
records = real('original');
delete records[1].data.resultData.runData.Return[0].data.main[0][1].pairedItem;
check('missing later evidence takes precedence over an earlier mismatch', records, 2, r => {
  assert.equal(r.checked_items, 1); assert.equal(r.mismatches, 1); assert.equal(r.graph_issue, 4);
});
records = real('original');
records[1].data.resultData.runData.Return[0].source[0].previousNode = 'Return';
check('cycle stops the native traversal', records, 2, r => assert.equal(r.graph_issue, 6));
records = real('repaired');
records[0].data.resultData.runData.Call[0].data.main[0][0].json.quantity = 9;
check('changed caller output payload needs complete boundary evidence', records, 2, r => assert.equal(r.issue_code, 30));
records = real('repaired');
records[1].data.resultData.runData.Select[0].data.main[0][0].pairedItem.input = 8;
check('consumer input 8 has no saved source', records, 2, r => assert.equal(r.graph_issue, 2));

function fanIn() {
  const source = (previousNode, previousNodeRun = 0, previousNodeOutput = 0) => ({ previousNode, previousNodeRun, previousNodeOutput });
  const task = (source, main, metadata) => ({ source, data: { main }, ...(metadata ? { metadata } : {}) });
  const inputs = Array.from({ length: 200 }, (_, id) => ({ json: { id } }));
  const roots = inputs.map((x, item) => ({ json: x.json, pairedItem: { item } }));
  const json = { value: 'merged' };
  const caller = task([source('Orders')], [[{ json, pairedItem: [{ item: 1 }, { item: 193 }] }]], { subExecution: { executionId: 'c', workflowId: 'wc' } });
  const parent = { id: 'p', workflowId: 'wp', status: 'success', workflowData: { nodes: [
    { name: 'Orders', type: 'source' },
    { name: 'Call', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, parameters: { mode: 'once', options: { waitForSubWorkflow: true } } }
  ] }, data: { resultData: { runData: { Orders: [task([], [inputs])], Call: [caller] } } } };
  const child = { id: 'c', workflowId: 'wc', status: 'success', workflowData: { nodes: [
    { name: 'Start', type: 'n8n-nodes-base.executeWorkflowTrigger', parameters: { inputSource: 'passthrough' } },
    { name: 'Fork', type: 'transform' }, { name: 'Join', type: 'transform' }
  ] }, data: { resultData: { lastNodeExecuted: 'Join', runData: {
    Start: [task([], [roots], { parentExecution: { executionId: 'p', workflowId: 'wp' } })],
    Fork: [task([source('Start')], [[{ json: {}, pairedItem: { item: 0 } }]]),
      task([source('Start')], [[], [{ json: {}, pairedItem: { item: 193 } }]])],
    Join: [task([source('Fork', 1, 1), source('Start')], [[{ json, pairedItem: [
      { item: 0, input: 0 }, { item: 0, input: 0 }, { item: 1, input: 1 }
    ] }]])]
  } } } };
  return [parent, child];
}
check('run 1 / output 1, fan-in, deduplication and fourth bitset word', fanIn(), 0, r => {
  assert.equal(r.caller_roots, 200); assert.deepEqual(r.findings[0].expected, [1, 193]);
});
records = fanIn();
const override = records[1].data.resultData.runData.Join[0].data.main[0][0].pairedItem[2];
override.input = 9; override.sourceOverwrite = { previousNode: 'Start' };
check('internal sourceOverwrite supplies its own producer coordinates', records, 0, r => assert.deepEqual(r.findings[0].expected, [1, 193]));
records = fanIn();
records[0].workflowData.nodes[0].name = 'Start';
records[0].data.resultData.runData.Start = records[0].data.resultData.runData.Orders;
delete records[0].data.resultData.runData.Orders;
records[0].data.resultData.runData.Call[0].source[0].previousNode = 'Start';
check('parent and child Start names retain separate execution scopes', records, 0, r => assert.deepEqual(r.findings[0].expected, [1, 193]));
for (const [name, wire] of [['extractor failure envelope', failure()], ['extra transport byte', Buffer.concat([extract(...real('repaired')), Buffer.from([0])])]]) {
  const result = native(wire); assert.equal(result.exit, 2); checks++; console.log(`PASS ${name}`);
}
console.log(`${checks} native contract checks passed`);
