# Generators

A generator is a small program that computes a figure and writes the spec. It is not a preset and not a module: nothing invokes it at runtime, there is no repertoire table, and there is no `generators` command — you run one by hand, once, and render what it wrote.

```bash
node experiments/generators/collatz.mjs   # writes out/collatz.json
node src/cli.ts render out/collatz.json --out out
```

Generators live in `experiments/` deliberately (ADR 0011) and are not maintained as features. **`lib.mjs` is the exception**: fourteen experiments share it, so it has a real contract and this document is it.

## The one constraint that shapes everything

`boxes-do-not-overlap` lets blocks nest or stand apart, and never partially overlap. Every consequence below follows from that single rule, and none of it is stylistic:

- **Figures are built from discrete, separated marks.** A stroked curve is not available; a curve is a row of discs.
- **A self-crossing curve must be quantised first.** Two marks at one point is a real check failure, so points are snapped onto a lattice and one is kept per cell — that is `Lattice`, and `panel({ pitch })` does it for you.
- **A rule cannot be drawn through a label.** It must stop short and resume on the far side — that is `carve`, and it is why axis labels are *reserved* before any grid is drawn.
- **Gridlines under a dense field are refused, not styled away.** `carve` routes a rule around reserved labels; it cannot route around a thousand data points. `panel().ticks()` therefore defaults to `grid: false`. The `chart` preset states the same restraint for the same reason: two end labels say what a ruled line would.

This constraint is not an obstacle the series works around. It is why the series looks the way it does.

## Start here

```js
import { page, makeRamp } from "./lib.mjs";

const p = page({ theme: "midnight" });          // closes over its own kids and ink
p.disc(440, 300, 6, "#F2E2BC");                 // a mark
p.text(150, 664, 280, "A label", 13.5, "body"); // a role name, or a literal colour
p.poster({ name: "mine", eyebrow: "…", title: "…", caption: "…", footnote: "…" });
```

`page()` gives you `text`, `disc`, `rect`, `reserve`, `carve`, `panel`, `poster`, plus `fade` and `ramp` bound to this page's background. Colour arguments accept a **role name** (`"title"`, `"eyebrow"`, `"body"`, `"faint"`, `"rule"`, `"furniture"`, `"furnitureFaint"`) or a literal `#rrggbb`.

### Two idioms, and which to use

The free functions — `text(kids, …)`, `disc(kids, …)`, `poster({ kids, … })` — take the accumulator array as their first argument. They still work, unchanged, and six generators use them.

**Prefer `page()` for new work.** The kids-threading idiom is the one being retired, and for a measured reason: a generator that wanted a single local helper wrote its own closure-based `text` rather than passing the array at every call, and having dropped the import it then re-derived `nid`, `hex`, `pad` and `ramp` too. That cascade — not a missing feature — produced most of the duplication in this directory. `phyllotaxis.mjs` is the clearest case: it re-implements `poster()` inline with lib's *exact* magic numbers, on lib's *exact* canvas.

## Themes

A theme is a plain record of named roles, not a DSL. Three ship: `midnight` (the original series palette), `bone` (warm paper, for print), `blueprint` (cyanotype). Pass one to `page({ theme })`, or pass your own record with the same keys.

Every poster prints what it can prove about its own palette:

```
text roles: worst faint 6.29:1 (all pass AA)  ·  ramp floor 2.41:1 at t=0.00 (a mark, not text — no AA verdict)
```

Those ratios come from `contrastRatio` in `src/colour/contrast.ts` — the same function `contrast-sufficient` uses on every render.

**What is and is not checked**, stated plainly because it would be easy to overclaim:

- **Text roles** (`title`, `eyebrow`, `body`, `faint`) get a ratio *and* a WCAG AA verdict. They are text; AA is the right threshold.
- **Mark roles** (`rule`, `furniture`, `furnitureFaint`) get a ratio and **no verdict**. A 1px divider is not text, and failing it against a reading threshold would report something that means nothing.
- **Ramps** get a worst-sample floor and **no verdict**. A continuum of data-driven mark colour has no single ratio; the floor is a weaker claim than the role ratios, and is labelled as one.

## Panels

A panel is a sub-region with its own data-space-to-page-space map. It earns its place when the data space is **not** already normalised — a complex plane, a base-pair axis, a log scale — and when furniture has to be labelled in data units.

It is not always needed. `chladni.mjs` lays four plates out in a 2×2 grid with two lines of arithmetic, because its domain is the unit square and the map is one multiply. Reach for a panel when you would otherwise be writing `wx()` and `wy()` by hand.

```js
const main = p.panel({
  x: 150, y: 132, width: 660, height: 430,
  xDomain: [0, 1500], yDomain: [0, 190],
  pitch: 4.4,                     // dots are snapped onto this lattice
});
main.ticks({ x: [0, 300, 600], y: [0, 50, 100], format: String });
main.dot(27, 111, 3.4, "#E8674F");
main.caption("what the axes mean");
```

`ticks()` places labels **and reserves them**, in that order, so a later `carve` routes around them. `pitch` should be at least the diameter you draw: marks are snapped *onto* the lattice, not merely deduplicated by it, so the minimum separation is the pitch by construction.

## Placement helpers

Packs decide what things look like; these decide **where things go**, which is where a generator's length actually accumulates. Every one was re-derived by hand in at least two generators before it was extracted.

| helper | what it gives you |
| --- | --- |
| `spiral(n, {cx, cy, scale})` | Vogel phyllotaxis on the golden angle. Each point carries `n`, `r` and `t` (0..1), so a ramp samples straight off it. |
| `ring(n, {cx, cy, radius, from, sweep})` | `n` points on a circle or arc. |
| `serpentine(n, {x, y, columns, cellWidth, cellHeight})` | Boustrophedon grid — reverses each row, so consecutive items stay adjacent across the wrap. |
| `tracked(text, {x, y, advance})` | Glyph positions for hand-tracked type. For tracking so wide the glyphs are separate marks; ordinary tracking is a type pack's job. |
| `rng(seed)` | Deterministic PRNG. `Math.random` would draw a different figure every run, and a figure whose checks pass once and fail next time is worse than one that never passed. |
| `scatter(n, {x, y, width, height, spacing, seed})` | Dart-thrown points at least `spacing` apart. Returns **fewer** than `n` when the rect is full, rather than packing them in and failing `boxes-do-not-overlap` later. |

They all return positions and draw nothing. A helper that also drew would have to know about roles, themes and effects — and then it would be a preset wearing a false moustache.

## Writing one

1. Compute the data first, in plain JavaScript. The picture is the model; nothing here should be decorative arithmetic.
2. `page({ theme })`, then a panel per coordinate frame.
3. Marks. Give any dense field a `pitch`.
4. `poster({ … })` last — it writes `out/<name>.json` and prints the contrast report.
5. **Render it and read the checks.** This is not optional and it is not a formality: the worked example below was written clean, and the first render still found label collisions at the axis origin, gridlines running through the data, and marks touching across lattice cells. Every one was a real defect.

## The corpus, and what to copy from it

Not everything here is exemplary. Read accordingly:

| | generators | what they show |
| --- | --- | --- |
| **Exemplary** | [`collatz.mjs`](collatz.mjs) | The current idiom: `page`, two panels with real axes, lattice-snapped marks, a theme. **88 lines.** |
| **Sound, older idiom** | `chladni`, `harmonograph`, `bifurcation`, `ulam`, `pascal`, `delaunay` | Correct and short (63–149 lines), but kids-threading. Good for mark maths, not for structure. |
| **Legacy — do not copy the scaffolding** | `argument` (708), `apollonian` (405), `zeta` (370), `conjugacy` (341), `zeta-conformal` (340), `phyllotaxis` (111) | Predate the page builder and hand-roll everything, including their own `W`/`H`/`BG`/`nid`/`ramp`/`text`. Their **mathematics** is worth reading; their plumbing is what this library replaced. `zeta-conformal`'s `carvedLine` is where `carve` came from. |
| **Not a poster** | `navguide` (258) | A node-and-connector diagram that happens to live here. It is not a mark-field figure and this library does not serve it; a core preset would. |

## Stated limits

- **The library was derived from this corpus.** Panels, carving and the lattice are what fourteen programs actually needed, generalised. A genuinely different kind of figure may find a new ceiling, and the honest response is to widen the library rather than to fork it again.
- **Nothing has been migrated.** The six sound generators still use the old idiom and the six legacy ones still hand-roll everything, so no claim is made about how much of the existing 3,199 lines this makes unnecessary. The measured claim is forward-looking only: a two-panel poster with real axes cost 88 lines here, against 340 for the comparable hand-rolled ones.
- **A checked poster is not a good poster.** The checks catch malformation — overlap, contrast, text that does not fit. They cannot catch a figure that is legible, passing, and says nothing.
