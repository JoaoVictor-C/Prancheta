# ADR 0012: Animation, M11 — two-state box tweening with an analytic transition check

**Status:** Accepted; three factual claims corrected by [ADR 0013](0013-animation-m11-1-check-what-renders.md)
**Date:** 2026-08-24
**Deciders:** Reasoning session (confidence 0.90, 4 iterations, 1 pass, 1 pivot)

## Context

[docs/PLAN-NEXT.md](../PLAN-NEXT.md) named animation as explicitly out of scope; [ROADMAP.md](../../ROADMAP.md)'s "Where this goes next" names it first, on the strength of decision 0001's anticipation and [src/anim/diff.ts](../../src/anim/diff.ts) (M4's second probe): given two `LaidOutFigure` states, it matches elements by stable id and classifies each as `appeared` / `disappeared` / `moved` / `resized` / `restyled` / `retexted` / `unchanged`. No timeline, no easing, no renderer exists yet.

The house rule — "every new degree of freedom ships with the check that constrains it" — applies. Nothing in this project's six geometric checks reasons about *time*; a figure that changes over time introduces a class of defect (correct at both authored endpoints, wrong somewhere in between) no existing check can see.

The project has one prior instance of this exact failure mode, differently shaped: `src/layout/routing.ts` (edge labels, self-loops, spline routing) was marked done on the strength of 23 passing unit tests, but no real code path called any of its exported functions. It shipped to nobody. The lesson recorded then: "a test that calls a function directly cannot tell you whether anything else does."

## Decision

**M11 ships position tweening for boxes, with one new analytic check, and a real CLI consumer. Connector motion is explicitly deferred to M12.**

### Scope

- Two authored `FigureSpec` states (`specA`, `specB`), diffed via the existing `diffFigures`.
- **Two validation guards**, run before any check:
  1. **Id-stability.** Every delta of kind `moved` / `resized` / `restyled` / `retexted` must have an author-declared id (present in the raw parsed JSON, not the `${type}-${counter}` fallback `normalise.ts` assigns) on *both* sides. Two independently-authored specs with even a minor structural difference (a reordered or inserted child) can silently misalign counter-derived ids, producing a `moved` delta between two logically unrelated elements. Refuse with `SpecError` rather than trust an unproven positional match.
  2. **Rotation-identity.** Every such delta must declare identical `rotation`/`rotateBox` on both sides. **Confirmed necessary as a disclosure, not as solver soundness** *(reason corrected by ADR 0013: once trajectories are derived from what actually renders, a box whose rotation changes is not tweened and is simply a constant at its second-state rotation, which the solver handles. The guard is kept because a rotation that silently hard-cuts should be refused rather than hidden, not because the solver would otherwise be misled.)*: `diffFigures`'s `boxOf()` reads only `x/y/width/height` and never inspects `PlacedBox.rotation` or `.bounds` — a box that changes *only* its rotation between two states compares as `unchanged`. Without this guard, a rotating box would be silently exempted from every check, or fed to the analytic solver below on a false affine-motion premise.
- **Tweening:** linear position lerp for `moved` boxes; opacity fade-in (0→1) for `appeared` elements. *(Corrected by ADR 0013: this said "opacity fade (0↔1) for `appeared`/`disappeared`". A **disappeared element is not faded — it is not drawn at all**, since the base render is the second state and `emit.ts` re-injects nothing. It is safe (occupying nothing, it can collide with nothing) but it was described as doing something it never did, and the CLI counted it as "faded".)* No resize/restyle/retext tweening, no easing beyond linear, no multi-keyframe timelines, no camera. Text is not separately tweened or checked — it is emitted rigidly with its owner box (existing `attachRotations` behaviour), and since `PlacedText.lines[].box` is always contained in the owner's content rect, any text-vs-box motion violation is implied by, and weaker than, a box-vs-box one.
- **Connectors are not smoothly interpolated in M11.** A connector whose route differs between the two states does not sweep continuously. *(Corrected by ADR 0013: this said "hard-cuts between its two authored paths", which is not what happens. The emitted SVG's base is the second state's render and no connector keyframes are written, so a connector is **pinned to its second-state route for the whole transition** while its endpoint boxes glide toward it. Still no claim about an intermediate connector position, so the reasoning below stands; the description of the behaviour did not.)*
- **One new check: `boxes-do-not-overlap-during-transition`.** Box motion under this scope is provably affine (position-only, no resize), so overlap over `t ∈ [0,1]` has a **closed-form** answer: solve the per-axis linear inequalities `intersects` already encodes, intersect the resulting t-intervals, subtract the corresponding `contains` t-interval (containment is excused, exactly as the static `boxes-do-not-overlap` excuses it), and test whether what remains meets `(0,1)`. No sampling, no tolerance parameter — this project already paid once for a check whose correctness depended on how finely it sampled (the pre-adaptive curve-flattening bug fixed 2026-08-23); an unproven fixed-k sampling loop here would reintroduce that exact failure mode on day one of a new check.
- **Real consumer:** CLI `prancheta animate <specA> <specB>`, following the existing `diff` command's pattern (`render()` each state independently, `repair: false`), running both guards, building the timeline, emitting a CSS-`@keyframes` SVG, and writing a manifest that reports frame-0 checks, frame-N checks, and the new transition check. An end-to-end test against this command — not a test that imports the tween math directly — is what proves the code path is reachable, per the routing.ts lesson.
- **Repair-debt boundary: untouched.** A failed transition check reports `"no repair strategy for this check"`, exactly as `constraints-satisfied` does today. Wiring `src/layout/repair.ts`'s translation repair into the main loop is an unrelated, ADR-0009-scale decision this milestone does not absorb.

### Explicitly deferred to M12 (own ADR)

- Connector motion-crossing, via adaptive-tolerance sampling reusing the `FLATTEN_TOLERANCE` discipline (a routed connector is not guaranteed reducible to one linear inequality the way box motion is).
- True connector-route interpolation (smooth, not hard-cut).
- Easing curves, multi-keyframe timelines, resize/restyle/retext tweening, camera/pan.

## Rationale

### Why in-browser CSS tween, not a manim module

A manim frame would be a foreign SVG with no `PlacedBox`/content data — module checks are detect-only (decision 0005), so no geometric check, static or motion, could ever run on it. Shipping that as M11 repeats the routing.ts mistake in a new form: a feature that looks shipped but is unverifiable by construction, which fails the house rule at the definition stage rather than the reachability stage.

### Why not ship *only* endpoint checks (no new check)

The strongest version of "treat animation as N static keyframes" was evaluated directly: fold in fades (opacity has no swept region, so it is provably safe under pure endpoint checks) but refuse *all* position tweening, deferring it entirely. This satisfies reachability and the house rule, but concretely fails the goal this ADR exists to answer: a milestone that ships zero new checks does not demonstrate that motion *can be checked*, only that opacity doesn't need to be. It also ships an "animation" milestone that cannot move anything.

### Why boxes only, connectors deferred, rather than both together

The full design (analytic box check + tolerance-sampled connector check + both guards) was fully specified and validated across three rounds of reasoning before being reconsidered. The connector predicate was the only piece that genuinely needed new machinery — adaptive-tolerance sampling with a proven error bound, the same complexity class as the curve-flattening fix, which itself got no dedicated ADR only because it was a *fix* to an existing feature, not a new one. Cutting the connector half — not the box half — is what keeps M11 small without also making it fail the goal's explicit ask for a falsifiable check: the box check was never the deep part of the design (O(1), exact, no tolerance parameter, true in every round that examined it).

### Why the closed-form solve over sampling, for the one check M11 ships

Established directly from this project's own history: the pre-adaptive curve-flattening bug shipped a check whose correctness depended on an unstated, unproven sampling density, and it was fixed by making the tolerance a stated, proven bound. Writing a *new* check the same unproven way — "sample at k instants" — would known-ly reintroduce that exact defect class on day one. Box motion under M11's own scope (no resize) is provably affine, so the safer and cheaper option is also the exact one: solve, don't sample.

## Consequences

### Positive

- A real, falsifiable, sampling-free check ships with the first animation milestone, satisfying the house rule without inventing new complexity budget.
- The rotation-identity guard closes a confirmed gap in `diffFigures` (rotation-only changes are invisible to it) that would otherwise have surfaced as a silent bug the first time an author paired `rotateBox` with animation.
- M12's design (connector motion-crossing, tolerance-sampled) is already fully specified from this reasoning session and only needs its own ADR, not fresh design work.

### Negative

- A figure with connectors between moving boxes will show a visually abrupt cut in M11, not a smooth reroute — a real, temporary UX gap, named rather than hidden.
- Two validation guards will refuse specs that many authors will initially write (implicit ids, mismatched rotation) — a deliberate "honest failure over silent success" tradeoff consistent with this project's established convention (see the constraints-satisfied fix, 2026-08-24).

## Alternatives considered

### Sample both predicates with a fixed k

Rejected: no stated tolerance, no proof a real violation cannot fall between samples — the exact defect class the curve-flattening fix already retired once.

### Ship the full box + connector design as one milestone

Rejected: the connector half is the one part that turned out to need ADR-level machinery (adaptive tolerance), and bundling it into "the first, smallest milestone" violates the sizing goal even though the design itself is sound. It becomes M12.

### Opacity-only, position tweening entirely deferred

Rejected: needs no new check, which sounds safe, but concretely fails to answer what M11 was asked to demonstrate — that a real degree of freedom (motion) can be verified, not merely that the degree of freedom the milestone chose to ship happens not to need it.

## References

- Reasoning session transcript (2026-08-24), 4 iterations, 1 pivot
- [src/anim/diff.ts](../../src/anim/diff.ts) — the identity/diff mechanism this design builds on
- [ROADMAP.md](../../ROADMAP.md), 2026-08-23 entry — the curve-flattening precedent for sampling-tolerance discipline
- [ROADMAP.md](../../ROADMAP.md), 2026-08-24 entries — the reachability audit and the `constraints-satisfied` fix this ADR's guard-refusal convention follows
- [ADR 0009: Termination for translation repair](0009-termination-for-translation-repair.md) — why M11 stays independent of the repair-debt boundary
