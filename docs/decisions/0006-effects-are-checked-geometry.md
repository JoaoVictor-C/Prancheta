# 0006 — Effects are checked geometry, not decoration

## Status

Accepted.

## Context

The repertoire draws correct figures that look flat. Depth cues — elevation,
focus, contact, lighting — are real information in a technical figure: they say
which layer sits over which, and which element is the subject. Adding them is
cheap in SVG and expensive in ways that do not announce themselves.

Two hazards, and they pull in opposite directions.

**The measurement hazard.** Decision 0001 makes the browser the layout oracle.
That holds only while the thing measured is the thing drawn. A CSS `filter` or
`box-shadow` in the HTML mirror changes what Chromium reports for an element's
box. Every downstream number would then be wrong, no check would fire, and the
manifest would still say `ok`. This is the worst failure shape this project
can produce: silently untrue output that passes its own verification.

**The reach hazard.** A shadow puts ink outside the shape that cast it. SVG's
default filter region is a percentage box, so any effect bigger than that slack
is clipped with a straight edge, and a halo near the canvas edge is cut by the
canvas. Neither is visible to a check that only examines shapes, and both read
to a viewer as low quality rather than as a defect.

The tempting resolution — treat effects as presentation, out of scope for
verification — resolves the second hazard by declaring it uninteresting. That
is the same move that makes a figure "look fine" while being wrong, which is
what this whole project exists to refuse.

## Decision

**Effects are resolved after layout and applied only at SVG emission, and
their reach is computed and checked like any other geometry.**

Concretely:

1. The HTML mirror never carries an effect. `effects/apply.ts` runs once
   layout has finished, so nothing it records can move anything. Geometry
   measured with effects off is exactly the geometry drawn with effects on.
2. Every effect declares its bleed — four outward margins, composed through a
   chain in order, since a blur after a shadow spreads from the shadow's edge.
   `bleedOf()` is exact, not an estimate.
3. Filters declare an explicit `userSpaceOnUse` region derived from that
   bleed. Never the default percentage box.
4. A new check, `effect-within-canvas`, fails when an effect's ink leaves the
   canvas, with the overflow numbers attached. It is kept separate from
   `content-within-canvas` because the two mean different things: one says an
   element is off the page (a layout failure), the other says an element is on
   the page and its halo is not (a framing failure).
5. The repair for it grows `canvas.padding` — the one edit in the engine that
   does not touch a node, because the element is exactly where it belongs. It
   is monotone like every other edit and converges in a single pass.
6. Effects desugar to SVG 1.1 primitives only. No `feDropShadow`, no CSS
   filter functions. And portability is *tested* by rendering each effect under
   resvg with and without its filter and failing if the two images match —
   asserting the markup contains a primitive proves only that a string was
   written.

Effects are named roles (`raised-2`, `recede`, `emphasis`), resolved by the
design system, for the reason theme.ts gives about colour. Literal effects
exist for what the vocabulary does not cover. Nothing carries an effect by
default: every existing figure renders byte-identically to before.

## Consequences

Good:

- A clipped halo is now a reported, repairable defect rather than something
  nobody could name.
- The layout oracle is untouched, provably: effects cannot reach the mirror.
- The exported SVG stays portable, and a regression in that portability fails a
  test rather than being discovered by a user opening the file in Inkscape.
- `node src/cli.ts effects` reports each effect's bleed, so an author can see
  what will and will not fit before rendering.

Costs and limits:

- A filter's region is element-specific, so filters dedupe only across elements
  with the same chain *and* the same box. Figures with many differently-sized
  decorated elements carry more `<defs>` than a bounding-box-relative scheme
  would. Correct clipping was judged worth the bytes.
- The surface/appearance split (see docs/effects/EFFECTS.md) is a judgement
  call forced by boxes and labels being separate SVG elements. Grouping them
  would let a card cast one shadow, but would put every label back on top of
  every connector.
- This moves toward a stated non-goal. Photorealism is still not the aim: the
  repertoire is a set of schematic cues at deliberately restrained strengths,
  in the same spirit as modules/crystal, which draws occlusion *order* without
  drawing shading.
