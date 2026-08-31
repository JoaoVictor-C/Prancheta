# Decision 0003 — Repairs are edits, not mutations

**Status:** committed · 2026-08-19 (during M1)
**Decision:** The repair loop never mutates the caller's spec. It produces an ordered list of typed edits, applies them to a copy, and reports both the edits and the resulting geometry.
**Method:** decided directly. No reasoning session — the alternative loses on a straight superset argument, with no contested trade-off to resolve.

---

## The fork

When a check fails and the fix is "this box needs to be 53px taller", where does that fact live?

**A — mutate the spec.** The renderer edits the box and carries on. Simple, and the figure comes out right.

**B — emit an edit.** `{ pass: 2, target: "too-short", property: "height", from: 44, to: 97, reason: "label overflows bottom by 51.5px" }`. Applied to a copy; the caller's spec is untouched.

## Why B

B is a strict superset: applying the edits yields exactly what A would have produced, so nothing is lost. What B adds:

- **Provenance.** The caller can see that their 44px was wrong and by how much. An agent that drew the figure learns something it can fix upstream; under A it never finds out, and writes the same wrong height next time.
- **The spec stays theirs.** A tool that silently rewrites its input is hard to trust and harder to diff.
- **Auditability.** `manifest.repairs` is the log of everything the renderer decided on its own authority. That list is exactly what a reviewer should read first.
- **It makes the loop testable.** Planning and applying are separate pure functions, so convergence properties can be tested without a browser.

The cost is one extra concept — `effectiveSpec`, the input plus repairs — which the manifest names explicitly.

## What guarantees termination

Two structural properties, not hopes:

**Monotone.** Every edit strictly increases one bounded quantity (a width, a height) or flips `wrap` from `"none"` to `"normal"`, which can happen at most once per node. Nothing ever shrinks. A cycle would need some quantity to return to a previous value, so the loop cannot oscillate. `isMonotone` guards this, and any edit failing it is a planner bug rather than something to apply.

**Bounded.** Growth is capped at a multiple of each node's *original* measured size (default 3×). A node needing more is reported as `unrepaired`, with the budget arithmetic in the message. A box four times the size the author asked for is not a repair — it is a different figure, and the caller should be told rather than surprised.

## Consequences

- `render()` returns `effectiveSpec` alongside the figure.
- The manifest carries `repairs`, `passes`, and `unrepaired`.
- A clean figure produces an empty repair list and exactly one pass — verified against the M0 fixture, which still renders in one pass with zero edits.
- `--no-repair` renders exactly what was authored, defects and all, which is what makes the before/after comparison honest.
