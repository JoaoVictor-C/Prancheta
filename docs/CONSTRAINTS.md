# Constraints, and the three you may stand down

Hand-written. Decision 0010 is the record of *why* these three and not the
others; this is how to use them.

## The default is the constrained one, and that is the point

Prancheta refuses things. Boxes may nest or stand apart but never partially
overlap; a connector may touch only the two boxes it joins. Those refusals are
most of what makes a figure from this tool trustworthy — they are why a passing
manifest means something.

They also block three whole genres outright. A Venn diagram *is* partial
overlap. A callout into a dense field *is* a line crossing boxes it does not
join. A flowchart's edges are usually curved.

So three constraints, and only three, can be stood down per figure:

```json
{ "canvas": { "constraints": { "allowOverlap": true } } }
```

Every toggle defaults to `false`. A spec that says nothing about constraints is
checked exactly as it was before these existed, and that is deliberate: the
person reading a figure should not have to check the spec to know whether the
checks were on.

| toggle | stands down | reach for it when |
| --- | --- | --- |
| `allowOverlap` | `boxes-do-not-overlap` | Venn and Euler diagrams, circle packings, deliberately stacked annotations |
| `allowConnectorCrossing` | `connector-clear-of-boxes` | leader lines into a dense field, wiring that genuinely has to cross |
| `allowCurvedConnectors` | nothing — it *permits* `Connector.curve` | flowcharts, mind maps, org charts, anywhere a straight line reads as a corner |

## A relaxed check is not a passing check

This is the part worth being pedantic about. A stood-down check reports
`not-applicable` and names the toggle that excused it:

```
n/a  boxes-do-not-overlap [figure] — not applicable: canvas.constraints.allowOverlap
     is on, so this constraint was not enforced
```

It never reports `pass`. A pass claims the figure was examined and found sound.
If a relaxed check said `pass`, then two figures — one whose boxes genuinely do
not collide, and one that simply asked not to be looked at — would produce
identical manifests. The whole value of a manifest is that those two cases read
differently.

The same reasoning is why a misspelled toggle is an error rather than a shrug.
`allowOverlaps` (with the s) would leave the constraint on, the figure would
fail a check its author believed they had disabled, and nothing anywhere would
explain it.

## Curves

`allowCurvedConnectors` is the odd one out: it does not switch a check off, it
switches a feature on. Without it, a connector carrying a `curve` is refused at
parse time — not quietly straightened, because drawing a straight line where a
curve was asked for produces a figure nobody requested and reports no reason.

Three kinds:

```json
{ "from": "a", "to": "b", "curve": { "kind": "arc", "bulge": 0.25 } }
{ "from": "a", "to": "b", "curve": { "kind": "bezier", "control": [{ "x": 60, "y": 250 }] } }
{ "from": "a", "to": "b", "curve": { "kind": "spline", "radius": 16 } }
```

**`arc`** bows the route perpendicular to its own chord by `bulge`, a signed
fraction of the chord's length — `0.25` puts the apex a quarter of the chord's
length off it, and a negative value bows the other way. It is derived from the
endpoints, which is what makes it usable: routing decides where the endpoints
land, and the author does not know them in advance.

Not the radius/sweep pair SVG arcs take. A radius smaller than half the chord
describes no arc at all, and there is no good answer to give when routing later
moves the endpoints past it. A fraction of the chord cannot be over-specified
into an impossible curve.

**`bezier`** takes one or two explicit control points, **in scene
coordinates** — the same frame a block's `x`/`y` and a callout's `to` point are
written in, so a control point can be read off the same drawing the rest of the
scene was. For an absolute scene, where the author already owns every
coordinate.

**`spline`** rounds the corners of a multi-segment route and leaves its
straight runs straight. This is the one for graph scenes: ELK routes edges
orthogonally through lanes it reserved, and bending the runs would walk the
edge out of its lane and into whatever is beside it. Only the corners bend, and
each fillet is clamped to half of its adjacent runs so two corners on a short
segment cannot overrun each other.

`radius` sets how far back from a corner the turn starts, in px, defaulting to
16. In px rather than a fraction because it is a fillet, not a property of the
route: a dense graph wants the same small rounding on every corner whatever
the run lengths happen to be. It is a request, not a promise — the clamp above
still applies, so asking for more than a short segment can hold rounds that
corner as far as it goes rather than overrunning the next one.

### Curves are checked as drawn, not as their chord

A curve is flattened into a polyline at layout time, and that polyline is both
what `connector-clear-of-boxes` walks and what the renderer emits. The
coordinates that were checked are the coordinates that are drawn.

The alternative — emitting a real `C` command while checking the straight line
between its endpoints — would let a curve bow through a box that the check had
just cleared, and the manifest would say so in green. `fixtures/` carries a
test for exactly that case: an arc bowed hard enough to reach a box it does not
join is caught, and it is caught because the check sees the bow.

The cost is a longer `d` attribute in the SVG. That is the right trade for a
tool whose output is supposed to be verified.

### The sampling error is a stated bound, not a hoped-for one

Flattening only preserves that guarantee if the polyline is genuinely close to
the curve it stands for, so how close is a number: **0.05px**, a tenth of the
half-pixel EPSILON every check already tolerates. Under that, a curve cannot
pass or fail a check on the strength of how it was sampled rather than where it
actually goes.

Sampling is adaptive to meet it. A fixed number of segments per curve — what
this used to do — is wrong in both directions: it spends as many points on a
barely-bowed arc as on a hairpin, and on a large enough curve it silently stops
meeting the bound it claims. A quadratic bowed 0.3 of a 4000px chord came out
**2.08px** from its own true curve under 24 fixed segments, four times the
EPSILON, on geometry no bigger than a poster. Subdivision instead continues
until the flatness bound is under tolerance, so the error is a property of the
output rather than of how big the figure happened to be.

## Self-transitions

A connector whose `from` and `to` are the same block is a self-loop, and it is
routed rather than curved: out of the top edge, up, across, and back down.
`tests/` carries the case, and [fixtures/self-loop.json](../fixtures/self-loop.json)
draws it.

**Straight runs, deliberately.** A loop is inherently loop-shaped, and it would
be easy to draw it as a bow — but that would put curvature in a figure that
never turned `allowCurvedConnectors` on, which is exactly the gate that toggle
is. So the default route is orthogonal, and a `curve` on top of it bends it
like any other route. `spline` is the one that suits it: the corners are where
a loop wants rounding.

The alternative to routing it at all is what used to happen. Both ends clipped
against the same border from the same centre, the route collapsed to a single
point, and the connector was drawn as a zero-length stub — invisible, with no
direction for its arrowhead, and green in the manifest, because there was no
ink anywhere to be found wrong. A state machine losing a self-transition
silently is the defect class this tool exists to catch.

## What is not toggleable, and why

Three more constraints were considered and kept:

- **Axis-aligned blocks.** `rotation` turns a block's label, never its box.
  Arbitrary box rotation would make the layout solver dramatically harder and
  interact badly with nesting and overlap, to unlock cases the existing shape
  vocabulary mostly covers.
- **Flat fills.** No gradients. Complexity without structural value for
  technical figures.
- **One font family, no per-block weight.** Emphasis has colour, size, and the
  effects vocabulary already.

These are simplifying principles that pay for themselves. The three that are
toggleable are the three that only ever said no.

## Combining them

Toggles are independent and per-figure. Turning one on does not affect
another — a figure with `allowOverlap` on still has its connectors checked.

`fixtures/all-toggles-enabled.json` is the combined case: overlapping regions,
a leader line crossing them, and curved edges, all in one figure.
