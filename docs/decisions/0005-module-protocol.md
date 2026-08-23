# Decision 0005 — The module declares semantics, the core measures geometry

**Status:** committed · 2026-08-19 (during M4)
**Decision:** A figure module returns SVG with stable ids plus a *semantic* manifest. The core measures every coordinate itself, normalised into one canvas space, and answers containment with the browser's own hit-testing. Declared geometry is a checkable claim, never input.
**Method:** Terza session `c00c7923` — 3 iterations, 2 passes, halt on signal, final confidence 0.88.

---

## The question

Decision 0001 conceded that maps are different: label placement needs Shapely and pyproj *inside* a layout loop, which is Python-native work. So maps become a separate process. But the core's verification has always rested on the core owning the geometry — it lays figures out in a browser and measures every box itself. What can it check when it didn't compute the geometry?

## The organising principle

**Nobody certifies their own work.** M0 didn't trust Chromium's rasterisation to prove the SVG was portable; it re-rendered the file in resvg, an engine with no stake in the result. Asking the module that *produced* a figure to also attest that the figure is *correct* is the same mistake in a new place.

So the split is not a compromise between "module reports" and "core re-measures". It assigns each side only what it can honestly know:

- **Semantics are not recoverable from rendered output.** No measurement tells you that a given text is the label *for* a given region rather than a title sitting nearby — and ownership is what the interesting checks need.
- **Geometry is knowable by measurement,** and the core has the better instrument: the browser it already trusts.

## What the module returns

```json
{ "svg": "...",
  "elements": [
    { "id": "harbour", "kind": "feature", "claim": "the area of Harbour District" },
    { "id": "harbour-label", "kind": "label", "owner": "harbour", "claim": "names it" }
  ],
  "notes": [] }
```

`declaredBox` is optional. When present it is a **claim to be checked**, not input — which catches a bug neither pure alternative can see: a module whose internal model has drifted from what it actually drew.

## What the core does

Loads the SVG in its own browser, resolves every declared id, measures with `getBoundingClientRect`, and normalises **once** into canvas space through the root's `getScreenCTM` inverse. For containment it converts back into the target element's user space and calls `isPointInFill` — the browser hit-tests a concave coastline with holes using the same rasteriser that draws it.

**No path parsing.** That would mean a bezier flattener and a second geometry engine that can disagree with the one that renders — the exact divergence this protocol prevents.

**One coordinate space, converted at the boundary.** `getBBox` and `isPointInFill` both work in an element's *own* user space, and a projected map is exactly where transforms are everywhere. Compare boxes from different spaces and the answer isn't an error, it's a confident wrong boolean.

## Which checks run

| check | method |
|---|---|
| `module-ids-resolve` | a declared id with no element is a failure — the module claimed something it didn't draw |
| `module-geometry-agrees` | declared vs measured, tolerance `max(1px, 2% of the larger dimension)` |
| `module-label-within-feature` | browser hit-test; centre-inside passes, corners-outside is reported as an overhang |
| `module-labels-do-not-collide` | measured boxes, pairwise |
| `content-within-canvas` | **keeps its name** — same method, same meaning, both worlds |

**Which do not run, and why:** `text-fits-box`, `boxes-do-not-overlap`, `connector-clear-of-boxes`. Each is defined over content boxes, wrapped line boxes or connector endpoints, and a bare SVG has none of those — there is no CSS box model in it. A weakened version under the same name would be worse than nothing, because two manifests would both say "pass" while meaning different things. **A distinct name where the method differs; the same name where it doesn't.**

## Applicability is never self-declared

A module cannot say "that check doesn't apply to me" — that's the producing party excusing itself from inspection, indistinguishable from a bug. Applicability falls out of the declared semantics: no connectors declared, nothing for the connector check to examine.

What makes that safe rather than vacuous: **every check reports how many elements it examined, and zero reports `not-applicable`, never `pass`.** That required adding a third status to `Check`. The first implementation mapped both to `"pass"` because the type had nowhere else to put it — which would have made this decision's central promise a lie in its own code.

## On disagreement

The core's measurement wins, always, and the divergence is reported as a failed check naming the module. Not because the module is worse at geometry — for a map it's plainly better — but because **the SVG is the artefact the reader receives.** What the file draws *is* the figure; what the module believes it drew is a claim about the file.

## Stated limits, not to be softened

**Module figures are checked for MALFORMATION, not for MISREPRESENTATION.**

- A choropleth whose colour scale runs backwards passes every check and is completely wrong.
- So does a projection that makes areas incomparable.
- So does a label rendered at half its intended size inside a scaled group: its box is right, its containment is right, its type is illegible.

These are not oversights to close with a sixth check. They are the boundary of what measuring a rendered artefact can reveal, and naming them is the same line the selection core draws about a model's reading of a request.

## Five things the critical passes changed

None came from the original proposal: the content-box capability gap; the over-applied renaming rule (`content-within-canvas` should keep its name); the coordinate-space trap that would have produced confidently wrong booleans on exactly the transformed figures this targets; the relative-epsilon policy; and the text-scale limit.

## What building it added

**A module should declare only geometry it actually computes.** The first map module guessed label boxes from character counts and was wrong by up to 16px — `module-geometry-agrees` caught it immediately. It computes polygons, so it declares polygon boxes; it cannot measure text, because that needs a font engine. Guessing and calling it a declaration is how a module ends up certifying its own fiction.
