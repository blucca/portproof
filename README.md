# PortProof

**Correct JSON. Wrong customer. Fe makes the provenance difference visible.**

PortProof is a **Fe 26.5 native provenance kernel and CLI** for a recorded n8n
sub-workflow call. It recomputes complete caller-root sets from saved source and
`pairedItem` relationships, then checks the caller's recorded associations.

In the included lab capture, both workflows succeeded and their business JSON
matched. The original call associated the returned items with caller inputs **0 / 1**;
Fe follows the raw child ancestry to **3 / 2**. The repaired capture agrees.

| Capture | Fe-computed roots | Caller-recorded roots | Native result |
|---|---|---|---|
| Original | `[3]`, `[2]` | `[0]`, `[1]` | `mismatch`, exit **1** |
| Repaired | `[3]`, `[2]` | `[3]`, `[2]` | `consistent`, exit **0** |

This gives n8n builders a reproducible identity check and Fe developers a concrete
application of typed coordinates, dependent arrays, native I/O and bounded graph
traversal. [The real native transcript](docs/demo.txt) is the reproducible demo.

## Build and run

Install the official [Fe 26.5.0 release](https://github.com/argotorg/fe/releases/tag/v26.5.0)
and **Node.js 22**. The supporting scripts use Node's standard library.

```sh
fe --version                              # fe 26.5.0
fe check .
fe test . --backend native --jobs 1
fe build . --backend native --out-dir build
node scripts/check.cjs                    # 13 native contract checks

node scripts/portproof.cjs fixtures/real/original-parent.json fixtures/real/original-child.json
# expected exit 1: mismatch; roots [3]/[2], observed [0]/[1]

node scripts/portproof.cjs fixtures/real/repaired-parent.json fixtures/real/repaired-child.json
# expected exit 0: consistent; roots [3]/[2], observed [3]/[2]
```

For your own complete API exports:

```sh
node scripts/portproof.cjs parent.json child.json
```

Fe selects the unique recorded call matching the child execution ID, checks the
passthrough trigger's reverse metadata, and uses the child's `lastNodeExecuted`
and latest saved run as the terminal. `--terminal NAME` selects an explicit
recorded terminal. Every finding identifies an output port and item index;
root indices refer to the caller input array at this call boundary.

The native executable also accepts a raw transport stream:

```sh
node scripts/extract.cjs parent.json child.json | ./build/portproof
```

## The problem: two different port axes

The recorded path includes:

```text
Return item 0
  → Select item 0
      pairedItem.input = 1        selects the CONSUMER inlet
      source[1].previousNode = "Right Project"
      source[1].previousNodeOutput = 0   addresses the PRODUCER output
  → Right Project → Right Limit → Right Sort → Start item 3
```

An input-1 relationship can point to producer output 0. Each item also has its
own node, run, output and item coordinates. Treating those axes independently
preserves branching, repeated runs, and legitimate many-to-one ancestry.

## Fe highlight

The root set's storage depends on its compile-time domain size:

```fe
pub const fn word_count(_ roots: usize) -> usize { (roots + 63) / 64 }
pub struct RootSet<const R: usize> where R > 0 && R <= 256 {
    words: [u64; word_count(R)]
}
```

`RootSet<65>` has two words; `RootSet<256>` has four. A native Fe test exercises
both sizes. The full CLI fan-in fixture unions roots **1 and 193**, crossing into
the fourth word, deduplicates a repeated parent, and selects **run 1 / output 1**.

Separate `NodeId`, `RunId`, `InputPort`, `OutputPort`, and `ItemId` types keep the
source lookup and item lookup distinct at the critical traversal boundary:

```fe
fn source_for(mut self, _ node: NodeId, _ run: RunId,
              _ inlet: InputPort) -> ProducerRef
fn item_at(mut self, _ producer: ProducerRef, _ item: ItemId) -> usize
```

The [actual kernel](src/provenance.fe) uses an explicit three-colour frame stack.
A waiting consumer retains its pair cursor while its producer completes; only
then does the producer's memoized root set merge into the consumer. This
preserves every fan-in edge and stops a cycle with incomplete evidence.

## Architecture

```text
parent.json + child.json
       │
       ▼
extract.cjs — raw fields, scoped symbols, canonical JSON bytes
       │ PPF1 stream (original captures: 3,414 bytes each)
       ▼
transport.fe — native little-endian parser, bounds, byte pool, EOF
       ▼
audit.fe — call/trigger/terminal selection; bilateral IDs;
           caller/trigger order and payload; returned shape and payload
       ▼
provenance.fe — typed source resolution, graph traversal, root-set union
       ▼
lib.fe — per-item JSON findings and aggregate native exit code
```

Node preserves the raw relationships and shape. **Fe resolves every producer
reference, computes every expected root set, and chooses every verdict.**
The optional Node CLI passes the Fe output and process status through unchanged.

## Evidence contract and scope

The first edition covers one completed, successful, waiting **once-mode Execute
Workflow 1.2** call with a single caller input edge, a unique passthrough child
trigger, matching bilateral execution/workflow IDs, and complete saved JSON data.
Caller and trigger input counts, order, JSON and identity pairings must agree;
terminal and caller outputs must agree in their complete port/item shape and JSON.

- **0 — consistent:** every required item has complete evidence and matching roots.
- **1 — mismatch:** evidence is complete and at least one recorded root set differs.
- **2 — incomplete:** required evidence is missing, malformed, cyclic, unsupported,
  or above capacity. This status takes precedence over an earlier mismatch.

The checks exercise both captures, jointly absent workflow IDs, incomplete
priority, a cycle, changed JSON, a missing inlet, run/output selection, many-to-one
union, duplicate roots, internal `sourceOverwrite`, homonymous parent/child node
names, and transport failure/EOF. [Issue codes and wire layout](docs/wire.md)
make incomplete findings actionable.

Capacities: **256 caller roots / 256 child vertices including trigger items /
1,024 child paired references / 128 KiB canonical JSON pool**. Transport tables
also bound definitions, tasks, sources, outputs, and total items/pairs. Linear
lookups keep this edition small and inspectable; larger graphs can replace the
two resolvers with indices. The byte pool uses Fe's native `ByteBuffer` with
explicit release; graph storage uses fixed arrays.

This report describes ancestry in the supplied records. Original-record
authenticity and your application's recipient/business rules require their own
evidence. Payload checks cover JSON; binary content needs a separate audit.
Internal `sourceOverwrite` is supported; overwrite at a call or trigger boundary
uses the incomplete path. Empty returned calls also use that path.

## Declaration and team

- **New contest work:** the Fe kernel, raw transport/parser, native boundary
  audit/CLI, supporting extractor, tests and documentation were implemented
  during the build window starting **2026-11-03 00:00 UTC**. This repository's
  [first implementation commit](https://github.com/blucca/portproof/commit/ce59c14)
  is within that window.
- **Pre-existing work:** the four synthetic lab API exports in `fixtures/real/`
  and the original JavaScript investigation predate the window. The starting
  reference is [n8n-check @ 619a0d9a36a27398a6572e9ff7a923a23e1a419a](https://github.com/blucca/n8n-check/tree/619a0d9a36a27398a6572e9ff7a923a23e1a419a/experiments/lineage-boundary),
  licensed MIT. Customer identifiers and endpoints in the captures are fictional.
- **Dependencies:** compiler-provided Fe `core`/`std` from
  [argotorg/fe v26.5.0](https://github.com/argotorg/fe/tree/v26.5.0), and Node's
  standard library. The [manifest](fe.toml) names PortProof **0.1.0**.
- **AI-led team:** Codex (OpenAI) performed design, implementation, tests, review
  and technical explanations. [Blucca](https://github.com/blucca) is the
  responsible human contact for accounts and prize receipt.
- **License:** [MIT](LICENSE).
