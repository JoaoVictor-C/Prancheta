# unit-circle

The *ciclo trigonométrico* used before trig derivatives: a circle of radius 1 on axes, with one or more angles marked on it. Written once, as text — `"π/6"`, `"5π/4"`, `"150°"`, `"-π/3"` — every point, arc, projection and tangent is computed from that.

**Choose it when** the content is an angle placed on the unit circle: reading off cos θ and sin θ, comparing an angle with its symmetric partners (π − θ, π + θ, 2π − θ), or reading tan θ off the tangent axis. A function of a continuous variable (y = sin x, drawn over a range) is `function-graph`, not this.

## Input

```json
{
  "preset": "unit-circle",
  "angles": [
    { "angle": "π/6", "arc": true, "projection": true, "symmetric": ["pi-minus-theta"] },
    "π/2"
  ],
  "quadrantLabels": true
}
```

- **`angles`** — one entry per marked point, each a bare string (shorthand for `{"angle": <string>}`) or an object:
  - **`angle`** (required) — text, in one of three forms: a multiple of π (`"π/6"`, `"5π/4"`, `"-π/3"`, `"π"`), degrees (`"150°"`, `"-60°"`), or a plain number of radians (`"1.2"`).
  - **`label`** — overrides the default point label, which is the angle itself formatted: a π-fraction when it is one (denominator ≤ 12), otherwise a whole number of degrees, otherwise the radian value.
  - **`arc`** — draws the angle arc from the positive x axis to the point, with its degree value printed on it, and draws the radius OP itself (the angle's terminal side) so the arc visibly sits *between* the x axis and OP rather than hanging disconnected near the origin. Refused for |θ| ≥ 180°: a two-endpoint sweep connector always draws the *shorter* arc between its arms (`sweptDegrees`, bounded 0–180°), so a reflex angle cannot be drawn as itself.
  - **`projection`** — dashed guides from the point to both axes, with cos θ and sin θ printed at their feet, each label naming that exact foot (`Block.annotatesPlace`, ADR 0028) rather than floating free.
  - **`tangent`** — the tangent segment on the line x = 1 (the *eixo das tangentes*), from (1, 0) to (1, tan θ), with tan θ printed; also draws OP (if `arc` did not already) and a dashed extension of it from P out to (1, tan θ), so a reader sees *why* that segment's height is tan θ rather than taking it on faith. Refused where cos θ = 0 (tangent undefined) or |tan θ| > 2 (too steep to draw legibly).
  - **`symmetric`** — also mark π − θ, π + θ and/or 2π − θ, each its own point computed from its own value (never reflected by hand): `true` for all three, or an array of `"pi-minus-theta"`, `"pi-plus-theta"`, `"two-pi-minus-theta"`. A symmetric point gets a point and a label only — no arc, projection or tangent of its own.
- **`radius`** — circle radius in px. Default 150.
- **`quadrantLabels`** — print I, II, III, IV. Default false.
- **`locale`**, **`title`** — as elsewhere.

## What is computed, never typed

- **The point.** (cos θ, sin θ) is computed from the parsed angle; nothing about a point's position is written by hand.
- **cos θ and sin θ**, when `projection` is on, are printed as the exact notable value — `0`, `1/2`, `√2/2`, `√3/2`, `1`, and their negatives — when the computed float is one of them (within float noise), and through the ordinary pt-BR/en formatter otherwise. The same discipline `sign-chart` uses for roots (ADR 0027).
- **tan θ**, when `tangent` is on, is the same value the segment's own endpoint is drawn at — never a separately typed number.
- **The symmetric angles** are each their own `Math.cos`/`Math.sin` of their own computed radian value (π − θ, π + θ, 2π − θ), not a mirrored copy of θ's point.

## What is checked

The angle arc's geometry (its sweep) is derived from the same two points the circle uses, via a `curve: {kind: "sweep"}` connector (ADR 0019) — so the drawn arc cannot disagree with where the point actually is. What it *can* disagree with is its own printed degree label, typed as a separate number on the annotation block, and that is exactly what `sweep-matches-its-label` checks. The label is printed in plain digits and a bare `°` — a preset convention now, not a technical necessity: `checks.ts`'s `statedDegrees` reads a pt-BR comma and the typographic minus too (see ADR 0031), but this preset only ever prints a whole number of degrees, so the two formatters would look identical here.

The tangent segment is checked the same way, for length rather than angle. It is stated at both ends in a second frame (`"radius"`, 1 unit = the circle's own radius in px) purely so frame resolution records the scale it was drawn at; `length-matches-its-label` (ADR 0028) then reads the segment's length back in that frame's units — which IS tan θ — and compares it against the number printed in `"tg θ = …"`.

`projection`'s cos and sin labels each carry `annotatesPlace` naming the exact foot of that projection on its own axis (ADR 0028) — the point where the dashed guide meets the x axis or the y axis — so `label-nearest-its-place` holds each one to sitting beside its own foot, not merely somewhere unclaimed on the canvas. Before this, neither label named anything at all: see "What was refused" in ADR 0031 for why that let one drift onto a *symmetric* point's territory with every check still green.

Every point's own label names its point the same way (`annotatesPlace`, ADR 0035): the dot drawn there is the place made visible, so it no longer competes with the label, and `label-nearest-its-place` holds the label within its own size of the point. The axis names and the quadrant letters are declared free-standing — they name an axis the grid draws later and a region nothing draws — and the quadrant letters are placed last, so they yield to a point's label instead of pushing it away. The axes are recorded as ink for the label search (`Board.addFrame`): exempt from some checks is not free room, and no label is printed across one.

## What is not covered

- `arc` is refused for angles at or past 180° in magnitude (see above).
- `tangent` is refused where cos θ = 0 or |tan θ| > 2.
- A symmetric point never carries its own arc, projection or tangent — request those on a primary angle entry instead.
- OP (and the tangent's dashed extension of it) is drawn only for a primary angle with `arc` or `tangent`. A plain `projection`-only point draws no OP: there is no arc or tangent construction for it to connect to, and drawing one anyway crowds the sin label of a *symmetric pair* sharing that same sin value (30°/150°, 45°/135°, ...) — their sin labels sit on the axis side opposite their own point by design (continuing the direction their own guide already travels), which is exactly where the other point's OP would run.
- The circle is always the unit circle (radius 1 in math terms, `radius` px on the canvas); there is no scaled or off-centre circle here.

## answers: false

`"answers": false` draws the exercise's question ("determine sen, cos and tg of π/4"). Kept: the circle, the axes, every given angle with its name, OP, the angle arc with its degree value, the dashed projection guides (the construction, not a value), quadrant letters. Hidden: the printed cos and sin at the feet of a projection, the tangent segment with its dashed extension and `tg θ = …`, and every symmetric point (π − θ, π + θ, 2π − θ are what such an exercise asks the reader to find). The canvas keeps the size the answered figure has, so question and solution line up.
