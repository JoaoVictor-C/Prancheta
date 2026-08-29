# Typography

Hand-written. The generated companion is [PALETTE.generated.md](PALETTE.generated.md) for colour; this one is prose because the reasoning is the part worth reading.

## Two axes, not one

Colour has themes. Depth has style packs. Both key on `role` — what an element **means**: primary, accent, warning, muted, callout.

Type does not, and the reason is a poster.

On an ordinary event poster the date line is the largest type on the page and means nothing in particular. A safety notice may be the smallest type and mean the most. If typography keyed on `role`, the date would have to be declared `primary` to get display type — which would simultaneously hand it the style pack's shadow and the theme's primary fill, neither wanted — and the notice would have to accept caption-sized type to stay red.

So an element declares two things, and they are genuinely independent:

| axis | question it answers | what reads it |
| --- | --- | --- |
| `role` | what does this **mean**? | theme (colour), style pack (depth) |
| `level` | how **loud** is this? | type pack (family, size, weight, tracking) |

A warning caption is `{ "role": "warning", "level": "caption" }`, which is exactly what it is. There is a test asserting these never collapse into one vocabulary, because that collapse is the design going wrong.

## Levels

`display` · `title` · `subtitle` · `body` · `caption` · `eyebrow` · `mono`

The first five are a **size ladder**, and a test asserts it is monotone. `eyebrow` and `mono` sit outside it deliberately: an eyebrow is a small, widely-tracked line that sits *above* a title — a device, not a step — and `mono` is a claim about the content rather than about loudness.

That distinction was found by the test, not designed in. The first draft filed the poster eyebrow as a `subtitle`, which made the ladder non-monotone and would have made `subtitle` mean two different things depending on the pack.

An element that declares no `level` is set as `body`, so every spec written before packs existed renders identically.

## Packs

```json
{ "preset": "graph", "type": "editorial", "nodes": [ … ] }
```

`node src/cli.ts type` lists all four with every step and — the part you cannot see from the output — whether the pack is self-contained.

| pack | what it is |
| --- | --- |
| `grotesk` | One sans throughout, tightening as it grows. The neutral default: it never competes with the figure, which is what a diagram usually wants. |
| `editorial` | Serif display over a sans body — the magazine setting. For a figure with a real title and something to say under it. |
| `poster` | Wide-tracked capitals over quiet body text — the mathematical-poster setting, where an eyebrow is spaced across the page and the title carries the figure. |
| `technical` | Monospace headings over a sans body. For figures about code and systems, where a fixed pitch is a claim about the subject. |

## What is bundled, and what is a wish

This repository ships **one** face: Inter, in `assets/fonts`, under the OFL. Every other family named in a pack is a *preference inside a stack*, never a promise — `editorial` asks for Iowan Old Style and will take Palatino, then Georgia, then Times, then whatever the host calls `serif`.

So `selfContained` is **derived**, not asserted per pack: a pack is self-contained only when *every* level's first choice is bundled. The first draft hand-marked `grotesk` as self-contained because five of its six levels use Inter — its `mono` level does not, and a pack that is portable at five levels out of six is not portable. The `type` command names exactly which levels will fall back.

This matters because a substituted face has different metrics, and the figure was measured with the face this machine had. `fontEmbed: "outline"` converts every glyph to a path and removes the question entirely; `"embed"` inlines the bundled face. Neither is the default, because both cost bytes.

## Tracking is measured, not just drawn

`letterSpacing` is emitted into the **HTML mirror** as well as the SVG. Chromium measures the tracked run, and the measurement is read back from `getComputedStyle` rather than carried forward — so the width that was measured and the width that gets drawn cannot drift apart.

Emitting tracking only at draw time would have been half a line shorter and would have made every `text-fits-box` result a lie on any tracked label.

## The rules a pack keeps

**It fills only absences.** An element that sets its own `fontSize` keeps it and gets the rest of the step around it. This matters more for type than for effects: a chart's value labels and a poster's date line both set sizes deliberately, and a pack that overrode them would silently rescale figures that were already correct.

**It buys no exemption.** Tracked, resized text goes through the same measurement and the same checks as text sized by hand.

**A block with no label takes nothing.** A type pack has no business setting a family on a shape that will never draw a glyph.

## Deliberate non-goals

**There is no `select` for type packs.** Presets have one because choosing wrong *destroys information* — a scene drawn as a graph is a lie. Choosing the wrong type pack produces a figure that is merely less handsome. That is a preference, not a defect, and a rule table arbitrating taste would be this project claiming authority it does not have. Each pack states in one sentence what it is for; match intent to description.

**No new face will be bundled without reading its licence**, and no pack will name a face as though it were guaranteed.

**Contrast thresholds still do not know about size.** WCAG lets large text pass at 3:1 rather than 4.5:1, and `contrast-sufficient` currently applies 4.5:1 to everything — so display type can fail a check it should pass. Now that packs declare sizes and weights, the check *could* learn the right threshold. It has not, deliberately: that change makes the check more permissive, which is the direction this project is most careful about, and it deserves its own decision record rather than arriving as a side effect of typography.
