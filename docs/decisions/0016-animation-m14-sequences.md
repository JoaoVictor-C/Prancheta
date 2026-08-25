# ADR 0016: M14 — N-state sequences, and a correction to two non-goals

**Status:** Accepted
**Date:** 2026-08-25

## Context

Asked directly whether `animate` was ready to produce narrated, polished
video "like 3Blue1Brown" — the answer was no, and not close. Three of that
genre's signature moves are refused on principle here, not pending effort:
shape morphing (an axis-aligned-box solver cannot reason about a shape
becoming another shape), a camera (there is no check for "is this legible at
this zoom", and inventing one is a research problem), and per-element easing
(breaks the invariance proof in [easing.ts](../../src/anim/easing.ts)
outright). There is also no video encoder anywhere in this project, and
encoding to mp4 would destroy the `prefers-reduced-motion` behaviour
[ADR 0014](0014-animation-m11-2-motor.md) deliberately shipped.

But `animate` taking exactly two states was also, separately, a **recorded
non-goal** — [ADR 0014](0014-animation-m11-2-motor.md) names "multi-keyframe
timelines" alongside a camera as something `animate` deliberately does not
do, on one stated ground: *"two authored states is the right primitive;
both would turn `animate` into a presentation tool rather than a figure
tool."* [ADR 0015](0015-animation-m13-stagger.md), which followed it, never
restates the claim but inherits it by not questioning it.

That non-goal turns out to have bundled two different questions under one
answer, and reasoning through it properly (a Terza session, 9 iterations)
gives them **different verdicts**.

## Decision

**A degree of freedom belongs in this project only if it passes two
independent tests: it must be checkable, and it must still be a figure.**
Checkability is necessary and not sufficient — a `slides` preset would pass
every existing check and still be the wrong thing to have built, since it
would make the tool about something else. Running the original non-goal's
two halves through both tests separately:

- **Camera fails checkability.** No amount of engineering produces a check
  for legibility under zoom. Refused, unconditionally, and the reasoning
  session's own critic caught the sloppier version of this argument — "admit
  whatever a check happens to exist for" is circular, since M13 having just
  shipped piecewise decomposition an hour earlier would retroactively bless
  anything it happened to enable. The real test is whether a check *can be
  stated*, not whether one already was.
- **A sequence of states passes checkability, and needed a second test for
  the "still a figure" half — which "more than two states" cannot supply
  alone.** A prelude counterexample makes this exact: forty states at 200ms
  each is a checked slideshow, fully compliant with any rule phrased in terms
  of state count, and indistinguishable from a presentation. State count is
  the wrong axis.

  The right bound is **identity continuity**, and it is not a new idea
  invented for this — it is [`diffFigures`](../../src/anim/diff.ts)'s own
  `persisted` count, already computed, already the load-bearing property
  guard 1 has trusted since ADR 0012. A figure evolving through many steps is
  mostly the same elements in different arrangements; a slideshow is a fresh
  cast every scene. **Every consecutive pair of states must share at least
  one persisting element, or the run is refused** — two states with nothing
  in common are not one figure evolving, they are two unrelated figures back
  to back, and building that silently would be answering "where does a
  figure stop being a figure" on the user's behalf rather than asking. It is
  heuristic at the edges (a slideshow with a persistent header would still
  pass), and that is stated rather than oversold: it discriminates the
  paradigm cases, not the adversarial ones.

### What generalises for free

Reused **verbatim**, called once per consecutive pair rather than once for
the whole command: `diffFigures`, both guards inside `validateAnimationSpecs`,
`buildTimeline`, `renderedTrajectories`, `requireLinearWhenStaggered`, and
`boxesDoNotOverlapDuringTransition`. None of that code changed. M13 already
proved that hold-ramp-hold motion is piecewise affine and that the existing
closed-form solver runs per segment with no new math; a sequence's segments
are exactly that shape again, just with more of them.

The two-state delegation rule — t=1 defers to the finished figure's own
static check, and (pairwise, at t=0) to the first state's — **generalises
into something cleaner than the original**, not merely into more of the
same: every scene boundary is an independently rendered, statically checked
frame, so every boundary delegates to its own frame, and the motion check
owns exactly what is interior to a transition. The two-state rule was already
this rule, with exactly two boundaries.

### What does not generalise for free

**Reappearing under the same id.** An element that disappears (drawn once,
injected at the position it left from — the same mechanism ADR 0014 built for
the two-state case) and later comes back would need a second DOM node sharing
that id. Not supported; refused with a named `SpecError` rather than drawn
wrong. This is the concrete edge the identity-continuity bound does not by
itself resolve — persistence between *consecutive* states says nothing about
an id vanishing for one boundary and returning at the next, which the guard
therefore checks separately.

### Emission: one shared clock, still

Multi-segment motion is still emitted as CSS keyframe stops on **one**
duration spanning the whole sequence — never `animation-delay` — for the
same reason M13 insisted on it: the easing-invariance proof needs one shared
monotone reparametrisation of time, and it is proved for a **piecewise**
affine trajectory, which a multi-segment run still is (breakpoints at scene
boundaries as well as at any stagger window inside a segment). Guard 3 is
unchanged and runs per segment.

`--durationMs` now means the length of **each** transition; total run time is
that times the segment count, stated explicitly in the command's own summary
line so it is never a silent multiplication the reader has to do.

### Two latent defects found by looking, not by assuming

Both were caught by sampling the *rendered* animation in a browser rather
than trusting the generated CSS — the same discipline
[anim-browser-playback.test.ts](../../tests/anim-browser-playback.test.ts)
established.

- **A departed element quietly reappeared.** When a track's last explicit
  keyframe stop lands before 100% of the whole run, CSS synthesises the
  missing tail from the property's *unanimated default* — opacity 1, no
  transform — not from the track's own last value. An element that faded out
  partway through a sequence would ramp silently back to fully visible after
  its own fade-out keyframes ended. The mirror bug is a newcomer visible from
  t=0 when its track starts partway through instead. Fixed by anchoring every
  track explicitly at both ends of the whole run
  (`padToFullRange` in [sequence.ts](../../src/anim/sequence.ts)), duplicating
  the boundary value rather than leaving it to browser default synthesis.
- **Segment boundaries at fractions like 1/3 lost precision.** The shared
  `pct()` helper rounded to 2 decimal places — plenty for a hand-authored
  stagger window, not for `k/3 * 100 = 33.333...%`. A sample taken at exactly
  that fraction of the duration read opacity 0.9999 instead of 1, because the
  rounded keyframe (33.33%) sat measurably before the sampled instant.
  `pct()` now rounds to 6 decimal places; every stagger window built by M13
  inherits the fix along with sequences, since it shares the one function.

## Consequences

### Positive

- Waves, ripples and multi-step narratives are now expressible, checked as
  exactly as a single transition always was.
- The two-state path is untouched — same functions, same output format, same
  793 tests passing unmodified — because the router in
  [commands.ts](../../src/commands.ts) keeps it as its own branch rather than
  forcing two states through the sequence machinery's (differently
  formatted) emission.
- The identity-continuity bound is stated as a number this project already
  computes, not as a feeling, which is what makes it defensible rather than
  arbitrary.

### Negative, stated rather than hidden

- The bound is heuristic, not exact, at the edges named above.
- A departing-then-reappearing id is refused outright rather than handled;
  genuinely wanting that effect needs a new id for the second appearance.
- Each `render()` launches and closes its own browser, so an N-state sequence
  costs roughly N times a single render, not shared across states. Not
  optimised here; stated as a real, measured cost rather than assumed away.

## What this ADR does not reopen

3Blue1Brown-style video is still not what this tool does. Morphing, camera
and video export remain refused for the reasons stated in the Context above,
unchanged by any of this. What changed is narrower: "more than two states"
was never the same question as "presentation tool", and only the first half
of the original bundled non-goal is retired.

## References

- Terza reasoning session transcript (2026-08-25), 9 G/C/S iterations
- [ADR 0013](0013-animation-m11-1-check-what-renders.md) — the population and delegation rules this generalises
- [ADR 0015](0015-animation-m13-stagger.md) — the piecewise-affine argument this reuses without change
- [src/anim/sequence.ts](../../src/anim/sequence.ts) — the orchestration layer
