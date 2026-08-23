# Decision 0002 — Deliverable shape

**Status:** committed · 2026-08-18
**Decision:** One repository, one version. Three entry points in strict order: **typed TS library** (contract holder) → **CLI** (first binding) → **MCP adapter** (second binding). The Claude skill is a *generated view*, not the product.
**Method:** Terza reasoning session `99ba9b31` — 2 iterations, 1 pass, halt on signal, final confidence 0.86.
**Context:** used with Claude Code today; must port to other agent hosts later.

---

## Where the contract lives

What survives a port to a host that doesn't exist yet is not a protocol — it's a **stable input/output contract**: figure spec in, SVG + verification manifest out. MCP, skills and slash commands are all bindings to that contract, a few hundred lines each.

If the contract belongs to the MCP tool schema, a protocol revision or a host that speaks something else rewrites the public surface. If it belongs to the **library's typed API**, every binding is regenerable — and the library is still reachable from an in-browser or sandboxed JS agent runtime that can neither spawn a process nor speak stdio MCP. That last case is why the *library*, not the CLI, holds the contract.

## The three layers, by decreasing generality

| Layer | Reaches | Role |
|---|---|---|
| **Library** (typed TS API) | any host with a JS runtime | the contract; where logic lives |
| **CLI** | any host with a shell | agent interface · test harness · human inspection path |
| **MCP adapter** | any host speaking MCP | generated from the same command schema; **also serves the knowledge as MCP resources**, so a non-Claude host gets the authoring knowledge with no skill mechanism at all |

The CLI earns its place three times over, and preserves the CLI+MCP 1:1 mirroring already used by `blindspot-scan`, `env-seam`, `seam-check`, `tf-plan-explainer`.

## One artefact, not two

The engine and the authoring knowledge ship together, one version number.

- **Direct negative evidence from this repo's own history:** in `teaching-checker`, rules that lived only in a separate document never reached the packaged skill. Separation without a propagation mechanism produced silent drift — same maintainer, smaller surface than this.
- **The unit argument:** a preset is irreducibly code *plus* prose. Ship the prose without the code and the agent selects something that cannot render; ship the code without the prose and the agent never selects it — which is exactly the Mermaid-by-default failure. Independent versions split every preset across a compatibility boundary.
- **The cost argument:** two release processes and a compatibility matrix, maintained by one person alongside five other projects, is the first thing abandoned under load.
- The change-rate argument for splitting is answered without splitting: a docs-only change is still a patch release — one version number, nothing else.

## Structure of the repertoire

A **preset directory** holds its implementation, its doc, and its fixture figures together. A build step generates the Claude skill tree, an `AGENTS.md` digest, and the MCP resource list from those directories.

Tests fail if: a preset has no doc · a doc names a preset that doesn't exist · a generated view is stale relative to source. **Drift becomes a red build, not a discovery six months later.**

## The part that cannot be generated

Selection knowledge is **comparative** — *"this request has a spatial substrate, so a graph layout is disqualified even though it would render"* belongs to no single preset. Per-preset docs say what a preset is for; they cannot express ordering among alternatives, disqualifying conditions, or cross-cutting aesthetic discipline.

So the knowledge tree has two strata:

1. **Hand-written selection-and-discipline core** at the root — reviewed prose.
2. **Generated repertoire index** beneath it.

Every competitor ships an engine plus a genre; the failure they all share is *selection*. The hand-written core is therefore the actual differentiator, and needs the strongest test regime in the codebase: **real figure requests in, chosen preset out, judged against expectation** — in place from the first preset, not retrofitted once the repertoire is large.

## Unresolved risk

**Generation guarantees freshness, not usefulness.** A mechanically complete preset list that an agent skims and ignores passes every staleness check. The tests catch divergence; only reading the generated skill the way an agent would catches vacuity. There is no mechanical fix, and "generated" must not become an excuse for writing the selection prose badly.

## Rejected

- **MCP-primary.** Protocol churn would own the public surface, and the MCP instructions blob loads wholesale — no progressive disclosure of a large repertoire. (Salvaged from this branch: the MCP adapter *should* serve knowledge as resources.)
- **Library + MCP, no CLI.** Loses the test harness, the bug-repro path, and the human inspection path to save one artefact.
- **Hand-written per-host knowledge views** (what most competitor skills do). Two hand-maintained views diverge within a few edits and neither is testable against the engine — a preset can be renamed in code while both docs keep advertising the old name.
