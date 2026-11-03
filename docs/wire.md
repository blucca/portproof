# PPF1: raw-record transport

All integers are unsigned, little-endian; `u16` except the two payload slice fields
and pool length (`u32`). Every array retains original order. Node symbols are
scoped by `(parent|child, name)`; execution/workflow IDs share a distinct table.
The Fe executable resolves call/trigger/terminal, source ports and item references.
The extractor sends no expected roots or verdict.

Atom symbols: 0 absent; 1 `"success"`; 2 `"n8n-nodes-base.executeWorkflow"`;
3 `"n8n-nodes-base.executeWorkflowTrigger"`; 4 `1.2`; 5 `"once"`; 6 `true`;
7 `false`; 8 `"passthrough"`. Other canonical JSON values are interned from 9.
An ID has `(symbol,kind)`: 0 absent; 1 nonempty string; 2 nonnegative integer;
3 invalid raw type/value. Symbols for valid IDs use `String(value)` equivalence.
For an invalid ID preserve an auxiliary symbol for its canonical raw value.
Missing and invalid both remain explicit, and Fe checks kind before comparison.

Header: ASCII `PPF1`; format_errors, definition_count, task_count, source_count,
output_count, item_count, pair_count, terminal_node, terminal_present (all u16);
pool_length (u32); parent(id,kind,workflow,kind,status), child(same) (u16 each).

Definitions (7 u16): node, role (0 parent / 1 child), type_atom, version_atom,
mode_atom, wait_atom, input_source_atom. Absent fields have atom 0.

Tasks (17 u16): node, role, run, source_start, source_count, source_present,
output_start, output_count, main_present, sub_execution_id, sub_id_kind,
sub_workflow_id, sub_workflow_kind, parent_execution_id, parent_id_kind,
parent_workflow_id, parent_workflow_kind.

Sources (8 u16): consumer_node, role, consumer_run, inlet, producer_node,
producer_run, producer_output, valid. Missing input/run/output defaults are
normalized to zero; malformed required fields set valid=0. Keep source holes.

Outputs (6 u16): node, role, run, output, item_start, item_count. This preserves
empty output arrays and complete output shape.

Items (9 u16 + 2 u32): node, role, run, output, item, pair_start, pair_count,
pair_present, json_present, json_offset, json_length. Canonical JSON recursively
sorts object keys, preserving array order and JSON types. No binary payload claim.

Pairs (7 u16): item, input, overwrite_present, producer_node, producer_run,
producer_output, valid. A present malformed sourceOverwrite sets valid=0. Other
validity is integer/nonnegative/u16 range, raw pair number/object/array shape.

Then exactly pool_length canonical JSON bytes; require EOF.

First edition capacities: 256 definitions, 256 tasks, 1024 sources, 1024 outputs,
768 raw items (at most 256 child vertices), 2048 total pairs (at most 1024 child
pairs), 128 KiB payload pool, 256 caller roots. A structural extraction failure
uses format_errors > 0 and a zero-count envelope; Fe returns incomplete/exit 2.
Fe reads the whole valid transport before deciding: any required missing or
unsupported evidence takes precedence over a discovered root mismatch.

## Native incomplete issue codes

| Code | Evidence to supply or repair |
|---|---|
| 10 | Complete transport: a read ended early |
| 11 | PPF1 magic |
| 12 | Extractable saved records, accepted counts and header flags |
| 13 | EOF immediately after the canonical pool |
| 14 | Native byte-pool allocation |
| 15 | Coherent task/source/output/item table intervals and coordinates |
| 20 | Present valid execution/workflow IDs and successful executions |
| 21 | Exactly one parent call matching this child execution ID |
| 22 | Execute Workflow 1.2, waiting once mode, matching child workflow ID |
| 23 | Exactly one saved child input boundary at run 0 |
| 24 | Passthrough trigger and matching parent execution/workflow metadata |
| 25 | One saved caller source edge and one trigger output |
| 26 | 1–256 matching caller/trigger inputs, JSON and identity pairings |
| 27 | Saved terminal node/run |
| 28 | Matching complete caller/terminal output and item shape |
| 29 | Child graph capacity |
| 30 | Matching returned JSON and valid caller boundary pairings |
| 31 | Complete child ancestry: inspect `graph_issue` below |
| 32 | At least one returned item to inspect |

Graph issues: **1** capacity, **2** missing/invalid consumer source, **3**
missing/ambiguous producer item, **4** missing/invalid paired evidence, **5**
invalid trigger identity pairing, **6** cycle. Completed findings can remain in
an incomplete report; the aggregate status and exit code describe the whole call.

The canonical pool uses Fe's native heap `ByteBuffer`, bounded to 128 KiB and
explicitly released after the audit. Root sets and graph frames remain fixed-size.
