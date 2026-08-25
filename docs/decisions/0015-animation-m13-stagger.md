# ADR 0015: M13 — stagger, without giving up an exact check

**Status:** Accepted
**Date:** 2026-08-24

## Context

[ADR 0014](0014-animation-m11-2-motor.md) closed with a limit stated as though
it were permanent: *"one coherent gesture, rich in space, never in time"*. No
waves, no ripples, no cascades, because those need per-element timing and
per-element timing breaks the proof that easing costs the motion check nothing.

That reasoning was correct about `animation-delay` and wrong about stagger.

The proof in [src/anim/easing.ts](../../src/anim/easing.ts) needs every element
to share **one monotone reparametrisation of time**. An `animation-delay` gives
each element its own clock, so the argument collapses — which is why it was
refused. But a delay is not the only way to make an element move during part of
a transition. Keeping one duration and one clock, and encoding the window as
**keyframe stops**, produces the same visible result and leaves the premise
untouched.

## Decision

**An element may declare when, within the transition, it travels.** A
`motion: { start, end }` window on a `Block`, both ends fractions of the whole
transition. Absent means the whole of it, which is what every element did
before.

### The renderer: keyframe stops, never a delay

An element moving over `[0.2, 0.7]` emits:

```css
@keyframes pr-move-x { 0%, 20% { transform: translate(dx, dy); } 70%, 100% { transform: translate(0, 0); } }
#x { animation: pr-move-x 500ms linear 0ms 1 both; }
```

Same duration, same clock, one animation per element — the stagger lives
entirely in where the stops sit. Verified in a browser rather than assumed:
the element holds at its first-state position until its window opens, travels,
and holds at its second-state position afterwards, exactly linearly inside.

### The check: piecewise, with the old solver as its kernel

Hold → linear ramp → hold is **piecewise affine** in global time. So for any
pair, cut the timeline at their (at most four) window edges; on each
sub-interval both boxes are affine again and `overlapRangesDuringTransition` —
completely unchanged — solves it. Clip each segment's answer to its own domain
before mapping back to global time, because the affine model that produced it
is only valid inside that segment.

Still exact. Still no sampling and no tolerance. Still O(1) per pair: the cut
count is bounded by four however many elements the figure has.

**The degenerate case is not merely close, it is identical.** With both windows
full the decomposition is one call to the kernel. A test asserts agreement over
ten thousand random pairs, because M13 must not quietly change the verdict on
any figure already drawn.

### Why the check had to change too, not just the renderer

Stagger does not only *remove* collisions. It creates a defect class that does
not exist on a shared clock, and both directions ship as fixtures:

- **Removed.** The diagonal swap — clean at both endpoints, crossing at the
  middle — becomes clean when one box clears out before the other sets off.
  Something the engine previously could not express at all.
- **Created.** A convoy of two boxes 140 apart, both sliding the same distance
  right, has a constant gap on one clock and never touches. Let the *follower*
  set off first and it drives straight through where the leader is still
  parked. Nothing about either authored state changed.

A renderer shipped without the matching check would have shipped that second
case as a blind spot. Which is the house rule, and also precisely the shape of
the M11 defect [ADR 0013](0013-animation-m11-1-check-what-renders.md) exists to
correct.

### Guard 3: stagger and easing are mutually exclusive

CSS applies `animation-timing-function` between each **pair of keyframes**, not
across the whole animation. So easing a staggered element eases its own ramp —
per-element easing — and every element is again on a different reparametrisation
of time. Refused with `SpecError`, naming the elements that declared a window.

This is the honest refusal: the alternative is emitting an animation the motion
check cannot speak about, which is worse than not offering it.

## Consequences

### Positive

- Waves, ripples, cascades and sequenced reveals are all expressible, and all
  checked as exactly as a single gesture was.
- The stagger *profile* is a generator's job, exactly as the twist profile
  already is — the core invents no ordering policy.
- `motion` is not a visual property, so a block whose window differs between
  states is still `moved`, never `restyled`. It still tweens. It is attached
  after layout by [src/anim/apply.ts](../../src/anim/apply.ts), the same shape
  as `categoryGroup` and `shape`, so no static check has to learn about it.

### Negative, stated rather than hidden

- **A staggered figure is linear.** Real, and the most likely thing to be
  wanted back.
- **Windows are per-element and hand-declared.** Fine for a generator, tedious
  by hand for a large figure. No stagger-profile flag is offered, because any
  such flag has to invent an ordering rule and the core is the wrong place for
  one.
- The window is read from the state being animated *to*. For an element that
  disappears there is no such state, so its window comes from the state it
  leaves.

## Deferred

**Easing a staggered figure**, which is possible and not built. Ease the
*global* clock rather than each element, and give each element's ramp the
corresponding sub-arc of that same Bézier — a sub-arc of a cubic Bézier is
itself a cubic Bézier, by De Casteljau subdivision, so per-keyframe
`animation-timing-function` reproduces it exactly. Then there is one shared
reparametrisation again and the original proof applies verbatim. Designed here,
unverified, deliberately not claimed as working.

Also still open from M12: connector motion, and multi-label diff.

## References

- [ADR 0014](0014-animation-m11-2-motor.md) — whose closing limit this retires
- [src/anim/easing.ts](../../src/anim/easing.ts) — the proof whose premise this preserves
- [src/anim/checks.ts](../../src/anim/checks.ts) — `pairOverlapRanges`, the decomposition
