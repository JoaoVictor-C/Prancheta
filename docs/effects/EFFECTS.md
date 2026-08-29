# Effects

*Hand-written. The list of names is generated (`node src/cli.ts effects`); the reasoning here is not.*

## The trap this avoids

An effects layer is the easiest thing in this repository to add badly. Shadows
are three lines of SVG. The reason it took a directory and a check is that the
easy version breaks the one property the whole project is built on.

Prancheta measures text in Chromium and trusts what Chromium says. That works
because the thing being measured is the thing being drawn. Put a `box-shadow`
or a CSS `filter` on an element in the HTML mirror and Chromium answers a
different question — the measured box is no longer the drawn box, and every
number downstream is quietly wrong. Nothing fails. The manifest still says
`ok`. The figure is just slightly untrue, in a way no check can see.

So: **effects are applied after layout, and only at SVG emission.** They are
absent from the mirror. Geometry measured with effects off is exactly the
geometry drawn with effects on. This is not a performance choice or a
simplification; it is the reason the oracle is still an oracle.

## Ink is geometry

The second thing the easy version gets wrong is that it treats a shadow as
decoration. A shadow is ink, at a computable distance outside the shape that
cast it, and ink outside the canvas is not drawn.

Two failures follow, and both are invisible to a check that only looks at
shapes:

- **The clipped halo.** SVG's default filter region is a percentage box around
  the element. Any shadow larger than that slack is sliced off with a straight
  edge. The figure does not look broken; it looks cheap, and nobody can say
  why. Every filter here therefore declares an explicit `userSpaceOnUse`
  region computed from the effect's own reach.
- **The halo off the page.** The canvas is sized to the geometry, and a glow
  is not geometry. Against the canvas edge it is simply cut.

`bleedOf()` answers "how far does this chain reach" exactly, for every effect
and for every composition of them. That number is checked like any other:

```
FAIL effect-within-canvas [figure] — floating overflows left by 30px and top by 22px
                                     and right by 30px and bottom by 38px
```

and repaired like any other — by growing `canvas.padding`, since the element
is exactly where it belongs and only the frame was too tight. It converges in
one pass, because the required padding is computed from a bleed already known
exactly rather than searched for.

## Composition is a chain, not a set

Effects apply in order, each consuming the last one's output. This matters for
reach as much as for looks: a `blur` placed after a `shadow` blurs the shadow
too, so it spreads from the shadow's already-offset edge rather than from the
element's. `bleedOf` threads the running bleed through the chain exactly as the
filter primitives thread their results through each other.

It also means `["raised-2", "recede"]` and `["recede", "raised-2"]` are
different pictures. The first blurs a shadow that has already been cast; the
second casts a shadow from something already soft.

## Surface or appearance

A block is drawn as two SVG elements — the rect, then its label — because
connectors are layered *between* them. So a chain has to be split, and it is
split by what the effect means rather than by convenience:

| | belongs to | why |
| --- | --- | --- |
| `shadow`, `glow`, `occlusion`, `bevel`, `sheen` | the surface | A label with its own drop shadow is not a card, it is embossed lettering, and the two shadows fight at every glyph edge. |
| `blur`, `brightness`, `saturate`, `tint`, `grain` | the whole appearance | A `recede` that blurred the box and left the label sharp reads as a bug, not as depth. |

## Portability is not assumed, it is tested

`feDropShadow` would replace six primitives with one. It is SVG 2, and in a
renderer that does not implement it the element does not degrade — it
disappears. That is the same argument `render/svg.ts` makes for drawing
arrowheads as paths instead of `<marker>`, one layer up.

Everything here desugars to SVG 1.1 primitives. And because "the string
contains `feGaussianBlur`" proves only that the string was written,
`tests/effects-portability.test.ts` rasterises each effect twice under resvg —
a Rust engine with no browser — once with the filter and once without, and
fails if the two images are identical. An ignored filter raises nothing; byte
equality is the only thing that catches it.

## Choosing one

Reach for an effect when it carries information:

- **Layering.** Something genuinely sits over something else — a callout on a
  cross-section, a foreground over context. `raised-2`, `raised-3`.
- **Focus.** One element is the subject and the rest is context. `emphasis` on
  the subject, or `recede`/`ghost` on the context. Prefer dimming the context;
  it is quieter than haloing the subject.
- **Depth ordering** in a figure that has real depth — a stack, a cross-section.
  `seated`, `inset`.

Do not reach for one to make a flat figure look expensive. This project's
non-goals still say photorealism, and they still mean it: the repertoire above
is a set of *cues*, held to schematic strengths on purpose. A figure that needs
a bevel to be legible has a layout problem that a bevel will not fix.

## Canvas vignette

`canvas.vignette` (0 to 1) darkens the edges of the whole figure. It is the one
effect that can never clip and never needs bleed — it is bounded by the canvas
by construction — which is why it lives on the canvas rather than on a node.

## Style packs: a look named once, not applied N times

The effect repertoire above is per-element — `effect: "raised-2"` on a block. That is the right primitive and the wrong ergonomics for a figure with forty nodes, where the field has to be written forty times *and* the choices kept consistent by hand. Consistency maintained by hand is consistency that drifts the moment a node is added.

A **style pack** maps the `role` an element already declares to the effect it should carry:

```json
{ "preset": "graph", "style": "neon", "nodes": [ { "id": "a", "label": "Ingest", "role": "primary" } ] }
```

`node src/cli.ts styles` lists all four with the bleed each role costs, because that reach is the real difference between them:

| pack | what it is |
| --- | --- |
| `elevated` | Cards lifted off the page. Depth carries hierarchy — the more a part matters, the further it floats. |
| `neon` | Glow as emphasis. The loudest: primaries and accents burn, failures alarm, everything else recedes to outline. |
| `spotlight` | One thing in focus and the rest falling away — lit primaries against blurred, desaturated surroundings. |
| `etched` | Engraved rather than lit: bevels and grain, no cast shadows, nothing leaving its own bounds. Reach for it when a figure has to print. |

Roles already exist because a figure's parts *mean* different things. A pack is the statement of what that difference should look like, which is why it keys on roles rather than on ids: `role: "warning"` keeps meaning "this is the failure case", and the pack decides whether that reads as a glow, a bevel, or nothing.

### Three rules the layer keeps

**It fills only absences.** A block that declares its own `effect` is left exactly as authored. A pack is a default; the author is not overruled by one. The same holds for a connector's line and arrow styles, and for `canvas.vignette`.

**It buys no exemption.** Every effect a pack applies goes through the same `resolveEffects` and the same bleed arithmetic as a hand-written one, so `effect-within-canvas` still runs and the repair loop still grows `canvas.padding` when the ink would clip. A pack makes a look *reachable*; it does not make it *unchecked*. There is a test asserting a packed effect and a hand-written one resolve identically, because a decoration escape hatch is exactly what this project exists to refuse.

**It never touches `callout`.** A callout carries no fill and no border by design — it sits *on* the figure, and the leader line does the pointing. An effect there would turn it back into the floating sticky note the `annotated-figure` preset exists to avoid.

### What a pack does not do

It does not choose a **theme**: a pack is depth and emphasis, a theme is colour, and the two are set independently (`canvas.theme`, `canvas.style`). It does not choose **shapes** either. And it is not a way to make a figure louder than its content earns — `neon` on a diagram with six primaries is six things shouting, which is the same failure two accents per figure already warns about, arriving faster.
