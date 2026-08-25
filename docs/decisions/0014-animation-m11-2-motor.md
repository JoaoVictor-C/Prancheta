# ADR 0014: M11.2 — easing, exits, and the reader who asked for less motion

**Status:** Accepted; its "never in time" limit retired by [ADR 0015](0015-animation-m13-stagger.md)
**Date:** 2026-08-24

## Context

[ADR 0013](0013-animation-m11-1-check-what-renders.md) made the motion check
model what the renderer actually does. It deliberately changed no pixel. This
milestone is the other half: improving the animation itself, and it is the
first one where a *visual* improvement has to buy its way past the house rule
rather than being waved through as cosmetic.

Four things were wrong with the output, and two were latent defects rather
than missing features.

## Decision

### 1. Easing, and why it is free

`--easing` accepts `linear`, the four CSS named easings, and
`cubic-bezier(x1, y1, x2, y2)`. Linear motion reads as mechanical, and this is
the single biggest improvement to how the output looks.

The obvious objection is that easing destroys the closed-form check: position
stops being affine in `t`, and [interval.ts](../../src/anim/interval.ts)
assumes it is. **It does not, and the check needs no change at all.**

Every box shares one easing `e`, so position is `lerp(from, to, e(t))` for all
of them, and two boxes overlap at time `t` exactly when they overlap at
parameter `s = e(t)`. If `e` is continuous, non-decreasing, and maps 0→0 and
1→1, then for any `s` in `(0,1)` the intermediate value theorem supplies a `t`
with `e(t) = s`, and that `t` lies in `(0,1)` because `e(0)` and `e(1)` are 0
and 1. Conversely a `t` in `(0,1)` can only map to an endpoint if `e` is flat
there, which a cubic Bézier — a non-constant polynomial, so finitely many
roots — cannot be. So *"the boxes overlap somewhere strictly inside the
transition"* is *invariant* under the easing. The solver answers in `s`, and
that is already the answer in `t`.

The invariance needs three premises, and each becomes a refusal:

- **One shared easing.** Per-element easing and staggered `animation-delay`
  put boxes on different clocks; the substitution differs per box and the
  argument collapses. Neither is offered. They are M12 work with real new math
  behind them, not a flag someone can add later without noticing.
- **Non-decreasing.** An overshoot easing (`cubic-bezier(.68,-.55,.265,1.55)`)
  carries a box past its own endpoint, somewhere no trajectory describes.
  Refused. The guard is `0 ≤ y1 ≤ y2 ≤ 1`: the derivative of the Bézier's y
  component, in Bernstein form, has control values `y1`, `y2 - y1`, `1 - y2`,
  and a Bézier lies inside the convex hull of its control values, so all three
  non-negative is **sufficient** for a non-negative derivative. It is not
  necessary — `cubic-bezier(.5, 1, .5, 0)` is monotone and is rejected — and a
  stated conservative bound is the trade this project has made before. The
  alternative is sampling the derivative, which ADR 0012 ruled out by name.
- **Continuous.** `steps()` is monotone but skips whole ranges of `s`, so a
  real overlap can hide in a value the animation never takes. Surjectivity is
  the half of the argument it breaks. Refused.

This is the house rule satisfied by a proof rather than by new code: a real
degree of freedom ships, and the check that constrains it is the one already
there, with a guard derived from what makes it still apply.

### 2. Disappearing elements are drawn, and fade out

They were dropped at t=0 — the harshest artifact in the output, and the one
ADR 0012 claimed was already handled. The base SVG is now the second state
*plus* the departing elements, re-injected at their first-state position and
faded 1→0, painted underneath so what is leaving never obscures what arrives.

**They are therefore drawn, so they are participants.** ADR 0013's population
rule — *what the emitted SVG draws* — did not change; the drawn set did, and
the rule absorbed it. That is the point of having derived it rather than
picking it. Three consequences follow, and each is a real policy decision:

- **A crossfade is not an overlap.** One box ramps 1→0 exactly where another
  ramps 0→1, on one clock, so neither is at full strength while the other
  shows. Exempted, in the same spirit as the static check excusing full
  containment. Without this, the commonest transition anyone writes would fail.
- **A box gliding through one that is still fading out is reported.** It is a
  frame neither authored state contains, so nothing else can see it. This is
  genuinely new coverage, and it fired on an existing fixture the moment the
  feature landed.
- **Delegation became pairwise.** t=1 is the finished figure, so a pair both
  present there is one `boxes-do-not-overlap` already reports — the existing
  rule. But two boxes both sitting where the first state put them (movers at
  t=0, and departing boxes throughout) have exactly their first-state
  geometry, so that pair is one `manifest.before` reports. Both delegations go
  void when `canvas.constraints.allowOverlap` (decision 0010) stood the
  delegate down, on that state's own figure.

Stated limit: a departing element outside the second state's canvas is clipped
while it leaves. The canvas is the deliverable's, and growing it to
accommodate something on its way out would change the artefact's dimensions.
Disclosed per-run rather than silently cropped.

### Correction: "never in time" was a claim about `animation-delay`, not about stagger

*(Added by ADR 0015.)* This ADR concluded that waves, ripples and cascades were
impossible because they need per-element timing, and per-element timing breaks
the easing proof. That is true of `animation-delay` and false of stagger in
general: encoding an element's window as **keyframe stops** inside one shared
duration leaves every element on one clock, so the premise survives — and the
resulting hold-ramp-hold motion is piecewise affine, which the existing solver
handles per segment. The limit was real; it was drawn around the wrong thing.

### 3. `prefers-reduced-motion`

This project runs WCAG AA contrast checks on every label. Shipping motion with
no reduced-motion guard is inconsistent with that standard of care. The
emitted CSS now carries a `@media (prefers-reduced-motion: reduce)` block that
switches every animation off — which for movers and newcomers is already their
resting state, since the base is the second state — and explicitly sets
`opacity: 0` on departing elements, whose natural state is still *visible*.

### 4. `--loop` and `--delay`

`animation: … forwards` fired once on document load and froze, so a shared
figure could not be re-watched without a reload. `--loop` and `--delayMs` are
pure CSS and cost nothing. Real scrubbing needs a host page and is not worth
it yet.

Fill-mode moved from `forwards` to `both`. With a delay, `forwards` leaves
each element in its *natural* resting state during the hold — which for a
mover is where it **ends** — so the transition would have begun by snapping
backwards. Caught by looking at the emitted CSS rather than by a test, which
is worth noting: it is the same class of defect as the three ADR 0013
corrected, a hold that did not hold.

## Two latent defects fixed in passing

- **Keyframe name collision.** The `@keyframes` name came from a slug that
  maps every non-alphanumeric to `_`, so ids `a.b` and `a_b` both produced
  `pr-move-a_b`; the second block silently won and animated the first box from
  the wrong place. Reachable precisely because ADR 0012's first guard
  *requires* author-declared ids for moved boxes. Names now carry a sequence
  suffix.
- **Unvalidated duration.** `--durationMs` went from argv into the CSS
  unchecked. Zero, negative or `NaN` produces a declaration the browser drops,
  so the manifest would report a transition over an SVG that never moves —
  again the same defect class. Both it and `--delayMs` are now refused up
  front, before anything renders.

## Consequences

- Output looks materially better: eased motion, exits that fade, a hold and a
  loop when wanted.
- One new refusal surface (easing), justified by a proof rather than by
  caution, with the rejected cases each carrying the reason in the message.
- The motion check gained coverage without gaining math.
- The animation is now honest under reduced motion, which it was not before.

## Still deferred to M12

Connector motion — a connector is still pinned to its second-state route while
its endpoints glide toward it, which remains the most visibly wrong thing in
the output — and multi-label diff, so a box that slides *and* recolours
actually slides. Per-element easing and stagger join them, promoted from "not
implemented" to "named, with the reason they are not free".

Deliberately **not** done: multi-keyframe timelines and a camera. Two authored
states is the right primitive; both of those turn `animate` into a
presentation tool rather than a figure tool. *(Corrected by
[ADR 0016](0016-animation-m14-sequences.md): this bundled two different
questions under one answer. A camera fails checkability outright and stays
refused. "More than two states" passes checkability and needed a SEPARATE
bound — not state count, which a 40-scene checked slideshow shows is the
wrong axis, but identity continuity between consecutive states — and is
admitted under that bound in M14.)*

## References

- [ADR 0012](0012-animation-m11-scope.md) — the original scope
- [ADR 0013](0013-animation-m11-1-check-what-renders.md) — the population rule this relies on
- [src/anim/easing.ts](../../src/anim/easing.ts) — the invariance argument and its guard
