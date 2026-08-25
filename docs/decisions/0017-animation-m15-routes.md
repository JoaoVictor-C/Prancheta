# ADR 0017: M15 — animated connector routes, and the quadratic that comes with them

**Status:** Accepted
**Date:** 2026-08-25

## Context

Shown the finished derivative animation from
[ADR 0016](0016-animation-m14-sequences.md), the response was: *"not bad,
but using points instead of lines isn't good."*

That is a fair reading of a real defect, and the defect was not in the
figure. The figure drew its parabola as 18 dots and its secant as 8 more,
and the build script's own header called that a design decision. It was
not one. Connectors were pinned to their second-state route for the whole
run — the M12 debt — so a line joining two moving endpoints would have sat
perfectly still while the endpoints slid out from under it. Boxes were the
only thing that moved, so anything that had to move had to be built out of
boxes. The dots were a workaround wearing the costume of a choice, and the
right response to the critique was to retire the debt rather than restyle
the workaround.

## Decision

**A connector's route is animated by animating its own `d`, and the new
degree of freedom ships with `connector-clear-of-boxes-during-transition`.**

### Why `d` in CSS, and not SMIL

SMIL is the obvious way to animate SVG geometry and it was rejected.
`document.getAnimations()` does not see SMIL animations, SMIL runs on its
own clock with its own easing syntax, and adopting it would have put the
two halves of one emitted figure under two different timebases. That is
exactly the drift [ADR 0013](0013-animation-m11-1-check-what-renders.md) was
written about, re-introduced deliberately.

`d` is an animatable CSS property in SVG2, so a route tween is an ordinary
`@keyframes` block alongside every other track. Two consequences matter:

1. **One clock, one easing.** The easing-invariance argument in
   [easing.ts](../../src/anim/easing.ts) requires that every animated thing
   share one monotone reparametrisation of time. Measured rather than
   assumed: with a path and a box animated over the same duration and
   easing, at global fraction 0.25 the path's interpolated coordinate and
   the box's translate were both at progress 0.1292. The proof carries over
   untouched.

2. **Vertices travel affinely.** CSS interpolates `path()` coordinate-wise
   when the command structures match, which is the same premise the box
   solver already rests on.

Same-structure is a **precondition, not a hope**. Given mismatched command
sequences CSS falls back to a discrete swap at the midpoint, so
`requireSameStructure` refuses a route whose two states have different
vertex counts. This has real work to do: curved connectors are flattened at
layout time, and moving a curve's endpoints can change how many segments it
flattens to.

### The check, and the axis that turns

The box solver gets to be linear algebra: two axis-aligned rectangles
overlap exactly when four affine inequalities hold at once. A segment
against a rectangle is not that, because the separating-axis theorem needs
a third axis — the segment's own normal — and **that axis turns as the
segment moves**. With `A(t)`, `B(t)` and the box's edges all affine, the
corner cross products `(B-A) x (C_i - A)` are products of two affine
functions, hence quadratic in `t`.

So the exactness argument had to be re-earned rather than inherited, and
the method is a **sign-invariant partition**. Between two consecutive real
roots of a polynomial that polynomial cannot change sign — the intermediate
value theorem, not an assumption about how finely we looked. Take the
twelve polynomials the predicate is built from, find every real root
exactly (affine by division, quadratic by discriminant), cut `[0,1]` at all
of them, and one evaluation inside each open subinterval settles that
subinterval entirely. A sampling scheme is wrong when the sample rate
misses a feature; here there is provably no feature between the cuts to
miss. The cost is a partition of at most fifteen pieces, not a tolerance —
so [ADR 0012](0012-animation-m11-scope.md)'s refusal of sampling still stands.

Validated against the static predicate it must agree with: 16M comparisons
on random geometry and 60M on the adversarial case (a line pivoting past a
9px box, where the x and y slabs never separate and only the quadratic axis
decides). Zero mismatches. A reduced version of both runs is pinned in
[tests/anim-route.test.ts](../../tests/anim-route.test.ts).

### Where this deliberately diverges from the box check

`allowOverlap` does **not** stand `boxes-do-not-overlap-during-transition`
down, and should not: a designed overlap and a transient collision during a
swap are two different phenomena, so a mid-transition crossing is news even
in a figure that permits static overlap.

`allowConnectorCrossing` is not like that, and this ADR records the
asymmetry as intentional. A line crossing a box is one phenomenon whether
the line is moving or not, and the transition check asks exactly the
question the toggle just excused, over an interval instead of an instant.
Enforcing it anyway would fail every figure that marks a point **on** a
plotted curve — which is the case the toggle exists for — and a check that
always fires is a check that gets switched off. It therefore stands down
**with the toggle named**, never silently, per
[decision 0010](0010-constraint-toggles.md).

## Consequences

The derivative figure is now one real bezier and one real line. Its build
script's header no longer has to explain why a curve is made of dots; it
explains instead which parts of the design the checker still forces, which
is what that comment was always supposed to be.

Three things did not change, and are worth naming because they were
re-examined and survived:

- **Q still does not slide.** The old reason was that a sliding Q grazed
  the curve dots it passed. There are no curve dots now, but the engine
  still tweens in straight lines, and the chord of `y = x^2` is not the
  curve — a sliding Q would visibly leave the parabola. Each step still
  gets its own Q, and consecutive Qs still crossfade.
- **Connector-versus-connector is still unchecked**, statically and now
  over time. The secant crossing the curve is not examined by anything.
  That gap predates this milestone and is not widened by it, but it is
  larger in practice now that figures can contain real curves.
- **Arrowheads cannot travel, so a moving route with one is refused.** The
  route track animates `#id > path`, and an arrowhead is a sibling
  `<polygon>`: `points` is not a CSS-animatable property, and driving the
  head by `transform` would mean a rotation — the transcendental term this
  whole file exists to avoid. A tweened route carrying an arrow would draw
  its line travelling and its head standing still, which is a figure
  disagreeing with itself on screen. `requireNoArrowhead` refuses it, on the
  grounds that a limitation of that shape is indistinguishable from a
  rendering bug to whoever hits it.
