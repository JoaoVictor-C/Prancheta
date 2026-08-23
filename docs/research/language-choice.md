# Language choice: Python vs TypeScript

Research pass — 2026-08-18. Companion to [landscape.md](landscape.md).

---

## 0. First, separate two things that keep getting confused

The 3Blue1Brown look is **not a property of Python**. Decomposed, it is four things:

| Ingredient | What it actually is | Portable? |
|---|---|---|
| **Design system** | dark near-black background (`#000`–`#1C1C1C`), a small saturated palette (blue/yellow/red/green/teal), thick uniform strokes, generous negative space, no gradients, no shadows | Yes — it's ~30 lines of constants |
| **Math typesetting** | real LaTeX for every formula and label | Yes — KaTeX/MathJax in the browser, LaTeX in Python |
| **Positioning vocabulary** | `next_to`, `shift`, `align_to`, `arrange`, `get_center` — you never type absolute coordinates, you state *relations* | Yes — this is the actual intellectual content, and it's language-independent |
| **Motion** | smooth easing, `Transform` between shapes, camera moves, hold-then-reveal pacing | Yes, and there are TS ports |

Only the fourth is animation. The first three are exactly what makes his *still frames* readable, and they are what Prancheta needs for the image phase. **None of them requires Python.**

What genuinely is Python-only is the *engine* — the mature, battle-tested implementation of the fourth item. That matters a lot in the animation phase and almost not at all in the image phase.

## 1. The case for TypeScript

**a. The two systems that fill the biggest gap are already TypeScript.**
This is the strongest single fact in the survey. Penrose — the constraint-optimization diagramming system out of CMU — was **ported from Haskell to TypeScript**. `@penrose/core` ships the compilation pipeline *and* the SVG renderer as an npm package; `@penrose/bloom` adds an interactive, React-native API. Bluefish, the MIT relation-based diagramming framework from UIST 2024, is a **SolidJS** library (`@bluefish-js/solid`).

Gap #2 in the landscape doc — "declare relations and constraints, let a solver place things, no agent-facing implementation exists" — is a gap in *TypeScript territory*. Choosing Python means either reimplementing constrained layout optimization from scratch, or shelling out to Node anyway.

**b. The browser is a layout engine, and Prancheta's hardest bug is a layout bug.**
The text-metrics trap (§8 of landscape.md) is the mechanical cause of most agent-diagram defects: SVG has no text wrapping, no box growth, and computing a true bounding box requires a render engine. In the browser you call `getBBox()` / `measureText()` **in the same engine that will produce the final pixels**. In Python you either bundle font metrics and approximate, or drive a headless browser — at which point you're in Node's world with extra steps.

**c. The see-your-own-output loop is native.**
Playwright + Chromium is the loop. Render → screenshot → VLM inspects → repair. Every competitor skill that implements this (excalidraw-diagram-skill, drawio-skill, tldraw-skill) runs it through a browser.

**d. The delivery surface is already HTML.**
Artifacts are HTML pages. Inline SVG in a chat response is HTML. A self-contained interactive figure is HTML. A TS core emits its native format straight into the place the user actually sees it — and the same figure can be static SVG *or* interactive with no second implementation.

**e. Free access to the layout/geometry ecosystem.**
ELK (the serious open graph-layout engine), dagre, d3-shape/d3-geo/d3-force, Cytoscape.js, KaTeX, Kiwi.js (Cassowary constraints), tldraw/Excalidraw scene formats, Vega/Vega-Lite.

**f. The animation phase has real options.**
Motion Canvas (TS generator functions, scene graph, tweening), Revideo (its automation-focused fork), Remotion (React, largest ecosystem, but **paid commercial tiers**), and **manim-web** — a TypeScript port of manim running on WebGL/Three.js with KaTeX for math. There is also `mathlikeanim-rs` (Rust + WASM, manim-inspired, SVG/Canvas/Node video) and `Manim.js` (p5.js, partial).

## 2. The case for Python

**a. manim itself.** No TS port matches manim CE's maturity, plugin ecosystem, or documentation. If the eventual goal is genuinely "3b1b-quality explanatory animation," the honest answer is that the reference implementation is in Python and the ports are followers.

**b. The scientific stack is not portable.** GeoPandas, Shapely, pyproj, matplotlib, contextily, prettymaps, NumPy, SciPy's optimizers. Maps in particular — the projection and geometry work — has no serious JS equivalent outside d3-geo (which does projections beautifully but is not a GIS).

**c. ProjectHub consistency.** `blindspot-scan`, `env-seam`, `seam-check`, `tf-plan-explainer`, `teaching-checker` are all Python, all CLI + MCP mirroring 1:1. One toolchain, one packaging story, one set of habits.

**d. Numeric constraint solving is more natural.** SciPy gives you the optimizers Penrose-style layout needs, without hand-rolling gradient descent in JS.

## 3. What each choice costs

| | Python | TypeScript |
|---|---|---|
| Text measurement | approximate, or drive a browser anyway | exact, native |
| Constraint layout | build on SciPy, from scratch | Penrose/Bluefish exist |
| Graph layout | shell out to Graphviz binary | ELK/dagre in-process |
| Maps | best in class | d3-geo only |
| Charts | matplotlib | Vega-Lite / Observable Plot |
| Render loop | subprocess to Playwright/resvg | native |
| Output → artifact/chat | needs a serialization step | native |
| Animation later | manim (best) | Motion Canvas / manim-web (good) |
| Fits ProjectHub | yes | no |

## 4. Maturity warnings

- **Bluefish** is research-grade: latest published version `0.0.27`, roughly a year since the last release. Read it for its ideas (the relation primitive, `Ref` for shared children); do not build a product on it.
- **Penrose** is healthier and actively packaged (`@penrose/core`, `@penrose/roger` CLI, `@penrose/bloom`), but its Domain/Substance/Style trilogy is a real language to learn, and its sweet spot is mathematical notation, not schematics or maps.
- **manim's OpenGL renderer** needs a display; headless means `xvfb`. Cairo and OpenGL mobjects don't mix cleanly. Static export exists (`-s / --save_last_frame`, `--format png`), so manim *can* serve the image phase — but it's an animation engine doing a still-image job, dragging LaTeX + ffmpeg + cairo along with it.

## 5. Recommendation

**TypeScript core, Python as a delegated renderer.**

The reasoning, in order of weight:

1. The image phase is dominated by *layout and text measurement*, and the browser wins that outright. This is the phase being built now.
2. The differentiating gap (constraint/relation-based layout, §11.2) has existing TS foundations and no Python ones.
3. The verification loop and the delivery surface are both browser-shaped.
4. The 3b1b *look* costs nothing to port — it's a palette, LaTeX, and a relative-positioning vocabulary, all of which exist in TS.

Python does not disappear: it becomes a **renderer that Prancheta calls** for the things it genuinely owns — maps (GeoPandas/prettymaps), statistical figures (matplotlib), and later manim for mathematical animation. A subprocess boundary, not a rewrite.

**The one condition that flips this:** if the real priority turns out to be 3b1b-style *animated explainers* rather than static complex figures, then Python + manim CE is the correct core and the browser becomes the delegated surface. The image-first sequencing in the brief is what makes TS the right call — worth re-checking before committing.

## Sources

[Penrose repo](https://github.com/penrose/penrose) · [@penrose/core](https://www.npmjs.com/package/@penrose/core) · [Penrose Bloom tutorial](https://penrose.cs.cmu.edu/docs/bloom/tutorial/getting_started) · [Bluefish](https://bluefishjs.org/) · [@bluefish-js/solid](https://www.npmjs.com/package/@bluefish-js/solid) · [manim-web (TS port)](https://github.com/maloyan/manim-web) · [Manim.js (p5)](https://github.com/JazonJiao/Manim.js/) · [mathlikeanim-rs](https://github.com/MathItYT/mathlikeanim-rs) · [Manim configuration / static frames](https://docs.manim.community/en/stable/guides/configuration.html) · [Manim deep dive (renderers)](https://docs.manim.community/en/stable/guides/deep_dive.html) · [Manim OpenGL renderer guide](https://nkugwamarkwilliam.medium.com/mastering-manims-opengl-renderer-a-comprehensive-guide-for-2025-dd31df7460ac)
