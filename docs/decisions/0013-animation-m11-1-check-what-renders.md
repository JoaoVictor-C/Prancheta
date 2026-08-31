# ADR 0013: M11.1 — the motion check models what the renderer actually does

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Reasoning session (confidence 0.90, 4 iterations, 1 pass)

## Context

**This milestone changes no pixel of any animation.** A box that moves and
restyles still hard-cuts, connectors still sit pinned to their second-state
route, disappeared elements still vanish rather than fading. What changes is
that the check now models that behaviour instead of a nicer one, and the
output describes it instead of a nicer one. Saying "the animation is fixed"
would be a fourth false claim in a milestone whose subject is the first three.

[ADR 0012](0012-animation-m11-scope.md) shipped M11 with 25 passing tests and
a clean typecheck. Running the CLI on a two-box probe exposed a soundness gap
those tests could not see, because it lives between two modules that never
call each other:

- [src/anim/diff.ts](../../src/anim/diff.ts)'s `compare()` gives each
  persisting element exactly **one** delta kind, priority-ordered
  `retexted > restyled > resized > moved > unchanged`. A box that both moves
  and changes fill is `restyled`, never `moved`.
- [src/anim/timeline.ts](../../src/anim/timeline.ts)'s `buildTimeline` tweens
  only `moved` deltas. So that box gets no tween and hard-cuts.
- [src/anim/emit.ts](../../src/anim/emit.ts) renders the **second** state as
  its base and animates only `transform: translate(...)`. So an untweened box
  sits at its second-state position from t=0, at its second-state size.
- [src/anim/checks.ts](../../src/anim/checks.ts) took **every** box in both
  states, regardless of delta kind, and solved for overlap assuming it lerped
  from its first-state rect to its second-state rect, using **first**-state
  widths.

Reproduced live: a fixture where `a` moves and restyles while `b` moves
reported `1 tweened` (only `b`) and then **failed** the transition check
naming `a`. The check verified a motion the renderer never performs — a false
positive. Its mirror is a false negative, and it is the more dangerous one: a
hard-cutting box sitting exactly where a genuinely tweened box sweeps through
is excused, because the check believes it slid out of the way.

The house rule — "every new degree of freedom ships with the check that
constrains it" — is not satisfied by a check that constrains a *different*
animation from the one that ships.

## Decision

**The transition check models the same rectangles the static checks model,
over the interval the renderer actually animates.**

Not "the emitted SVG". Effects put ink past a box's own edges, so this check
reasons about rectangles, not pixels — an inherited limit it shares with every
static check in this project. The precise version matters: the overclaimed
version is the species of sentence that let the original defect survive M11.

Three mechanisms follow.

### 1. One shared derivation

[src/anim/trajectory.ts](../../src/anim/trajectory.ts) is new and owns the
answer to "what does this box do during the transition". Both `emit.ts` (for
its keyframe offsets) and `checks.ts` (for its affine endpoints) read it, so
they cannot drift again — the same one-source-two-consumers discipline
`scripts/gen-views.ts` applies to the generated docs. A fix that patched only
`checks.ts` would leave two independent derivations still free to disagree at
M12, when connector motion lands.

A tweened box lerps. Every other box is a **constant** at its second-state
rect, which is degenerately affine, so [interval.ts](../../src/anim/interval.ts)
needs no change, no sampling and no tolerance — ADR 0012's rejection of
sampling is honoured by construction rather than by argument.

Extent always comes from the second-state figure via `checkRect`, because that
is what renders. The previous use of first-state width/height was wrong even
for correctly-tweened boxes; it was merely almost-harmless there, because
`MOVE_EPSILON` (0.5) bounds how much a `moved` box's size can differ. Reading
the geometry from the figure that renders removes that coupling entirely:
`MOVE_EPSILON` no longer matters to the check at all.

### 2. The population is the second state's boxes

This is derived, not chosen: the emitted SVG's base is the second-state
render, so those are exactly the boxes drawn during the transition. Two
consequences fall out without a rule of their own.

**Appeared boxes are participants.** ADR 0012 argued that "opacity has no
swept region, so it is provably safe under pure endpoint checks". That holds
only against other static elements. An appearing box occupies its full rect
from t=0 while it fades in, and a sweeping box can pass straight through it —
a defect the first-state checks cannot see (the box is not there), the
second-state checks cannot see (the sweeper has moved on), and the old
both-states filter excluded by construction. A three-way blind spot, in a case
authors write constantly: an old node slides away, a new one appears where it
was.

**Disappeared boxes are not participants**, because `emit.ts` never re-injects
them. They occupy nothing, so they collide with nothing. The exclusion is now
a fact about the renderer rather than a clause in the check.

### 3. An overlap the finished figure also has is delegated, not double-reported

Admitting constants puts pairs in this check's domain whose overlap
`boxes-do-not-overlap` already reports on the second-state frame. The check
therefore reports only violations whose solved t-range **excludes t=1**,
tested on the containment-subtracted remainder pieces.

t=1 is the only instant of the animation another check examines. The rendered
t=0 frame is *not* the first-state figure — it is the second-state figure with
only the tweened boxes offset back — and nothing checks that hybrid. So
overlaps present at t=0 and resolved before t=1 are genuinely new information
and are reported.

The delegation is **conditional**. `LaidOutFigure` carries `constraints`, and
`src/checks.ts` already reads `toggles.allowOverlap` from it (decision 0010).
When that toggle stands `boxes-do-not-overlap` down, the silence has nothing
to rest on, so the violation is reported here and the detail says why. Without
this, an author enabling a supported toggle would get an overlap that **no**
check names.

### Disclosure, not refusal

Refusing every box that both moves and restyles would reject the most ordinary
animation anyone writes — a box that slides and changes colour to signal
state. This project's honest-failure convention is for cases where the tool
*cannot* know the right answer; here the renderer's behaviour is fully
determined, so refusal would be pretending an unknown where there is none.
The proportionate response is to say what happens. The `animate` command and
its manifest now name every box that moved but hard-cuts, every element
counted as faded that is in fact never drawn, and the fact that
`manifest.before` reports on the authored input rather than on any rendered
frame.

## Consequences

### Positive

- The check and the renderer cannot describe different animations.
- A previously unnamed defect class — a mid-fade newcomer struck by a sweeping
  box — is now caught.
- Three false disclosures in shipped M11 are deleted (see below).
- Each real overlap is named exactly once, under both toggle positions.

### Negative, stated rather than hidden

- **Mid-fade newcomers are checked at full strength**, though nearly
  transparent early in the fade. A mover clipping one at t=0.05 fails. This is
  conservative in the direction the project already chose everywhere (the
  static check has no perceptual threshold either), and an opacity threshold
  would be exactly the unproven-tolerance move the curve-flattening fix
  retired: there is no principled opacity at which an overlap stops being one.
- **An authored-invisible box is likewise a full-strength occupier.**
  `Block.fill` is a `Paint` and gradient stops carry a validated `opacity`, so
  a fully transparent box is authorable. The population rule is named "the
  boxes present in the second state" rather than "the boxes that are drawn",
  because that phrasing is true either way.
- **Ink outside the rect is not modelled**, for effects — inherited from every
  static check, not introduced here.

### The three corrections to ADR 0012

All three had one cause, and it is the same error the check itself was making:
each sentence was written about the design that was intended rather than about
the SVG that is emitted.

1. A connector does not "hard-cut between its two authored paths" — it is
   pinned to its second-state route for the whole transition.
2. A disappeared element is not faded out — it is not drawn at all. The CLI's
   `faded` count included it.
3. The check's own detail said "clear of it at both authored endpoints", which
   was already false under M11 the moment any box hard-cut, because the
   rendered t=0 frame is not the first-state figure. It now reads "clear of it
   in the finished figure".

## Deferred to M12

- **Multi-label diff** — the root-cause fix for motion masked by a restyle, so
  such a box tweens instead of hard-cutting. It changes `FigureDiff`'s public
  shape and the `diff` command's output, which this defect never required
  touching; and it needed this shared derivation as a prerequisite anyway,
  since without it `checks.ts` would still derive its own trajectory.
- **Connector motion** — true route interpolation, and the motion-crossing
  check ADR 0012 already specified.

## References

- Reasoning session transcript (2026-08-24), 4 iterations
- [ADR 0012](0012-animation-m11-scope.md) — the milestone this corrects
- [ADR 0010](0010-constraint-toggles.md) — the toggle the delegation respects
- [src/anim/trajectory.ts](../../src/anim/trajectory.ts) — the shared derivation
