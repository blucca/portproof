# PortProof

**Correct JSON. Wrong customer. A Fe-native provenance kernel makes the difference visible.**

PortProof recomputes item ancestry across a recorded n8n sub-workflow call. Its
bounded, typed Fe core resolves the consumer **input**, then the producer
**node / run / output / item**, and unions the complete caller-root set.

The first native milestone, built with **Fe 26.5.0**, replays a synthetic lab
execution in which both workflows succeeded and the business JSON matched:

```json
{"fe_computed_expected":[[3],[2]],"original_observed":[[0],[1]],"original":"mismatch","repaired_observed":[[3],[2]],"repaired":"consistent"}
```

The source graph contains a consumer `pairedItem.input = 1` leading to producer
`previousNodeOutput = 0`. PortProof preserves these distinct axes through two
resolvers rather than reusing one port number for both.

## Run this milestone

Install the official [Fe 26.5.0 release](https://github.com/fe-lang/fe/releases/tag/v26.5.0),
then from this repository:

```sh
node scripts/fixture-core.cjs > src/recorded.fe
fe build . --backend native --out-dir build
./build/portproof
```

The process computes the roots in Fe, checks all four bitset words against the
fixture's independent expectations and original/repaired observations, and exits
0 on success. Node transcribes raw coordinates and recorded parent pairs;
`src/provenance.fe` resolves every producer reference and computes the roots.

## The Fe-specific core

- Separate `NodeId`, `RunId`, `InputPort`, `OutputPort`, and `ItemId` types.
- `RootSet<const R: usize> where R > 0 && R <= 256`: dependent array length,
  four `u64` words at the current 256-root capacity, union and deduplication.
- Explicit three-colour traversal with a retained parent cursor. Each producer
  completes before its roots merge into the waiting consumer; cycles stop with
  incomplete evidence.
- Fixed-capacity native arrays and independent `source_for` / `item_at` resolvers.

The evidence scope is one successful, waiting, once-mode Execute Workflow 1.2
boundary with a passthrough child trigger and complete saved records. The next
milestone integrates the full [PPF1 raw-record transport](docs/wire.md), bilateral
execution identity, shape/payload checks, and native CLI exit codes 0 (consistent),
1 (mismatch), 2 (incomplete).

## Sources and authorship

The new Fe kernel and transport design were started on **2026-11-03** for the
[Fe Builders Challenge](https://fe-lang.org/contest), project **PortProof**.
The four synthetic lab API exports in `fixtures/real/` and the original
JavaScript ancestry/domain investigation predate this implementation and come
from [blucca/n8n-check](https://github.com/blucca/n8n-check/tree/main/experiments/lineage-boundary).
They contain fictional customer IDs and a local test endpoint.

Design, implementation, testing, and technical explanations are AI-led by Codex;
Blucca is the responsible human contact for accounts and prize receipt. This
working arrangement was accepted by the organizers. License: MIT.
