# Landscape: tools for programmatic figure generation

Research pass — 2026-08-18. Scope: what already exists for making an agent draw correct, complex figures (and later, animations).

---

## 0. The finding that organizes everything else

The literature converges on one point: **for anything that carries information, generate code that renders to vector output — do not generate pixels.**

DiagrammerGPT (COLM 2024) states the reason plainly: text-to-image models fail on diagrams because they lack fine-grained layout control when many objects are densely connected by arrows, and cannot render comprehensible text labels. The 2026 benchmark *Can AI Draw Science?* catalogues the failure modes of image models on scientific figures: garbled text, off-task decorative output, hallucinated entities, **relation inversion** (inhibition drawn as activation, arrows reversed), and convention violation. Wrong chromosome counts. Reversed pathways.

The distinction that matters: in a diagram, *conveying the fact* dominates *rendering the object*. Code can enforce exact text, exact adjacency, exact topology. Diffusion cannot.

The corollary, equally consistent across the recent work: code alone isn't enough either. AutomaTikZ's fine-tuned model failed to produce correct TikZ; the Feynman paper's diagnosis is that complex diagrams need *knowledge organization* separated from *visual production*. IntroSVG's answer is a closed generator–critic loop where the same VLM renders its own SVG and critiques the raster. That loop — draw, rasterize, look, repair — is the single most transferable idea in the whole survey, and it is already appearing in shipped agent skills (below), not just papers.

---

## 1. Diagram-as-code languages

The mature layer. All of these take text in, emit SVG/PNG.

| Tool | Language/runtime | Layout engine | Best at | Weakness |
|---|---|---|---|---|
| **Mermaid** | JS | dagre (ELK opt-in) | ubiquity — renders natively in GitHub/Markdown | dense graphs degrade; narrow repertoire; heavy visual sameness |
| **Graphviz** | C (`dot`, `neato`, `fdp`, `circo`) | its own, 30 yrs mature | hierarchical graphs >20 nodes; still the gold standard | ugly defaults; almost no control over non-graph content |
| **PlantUML** | Java, uses Graphviz | Graphviz `dot` | formal UML (structural + behavioral), C4 | Java toolchain; syntax sprawl |
| **D2** | Go (2022, Terrastruct) | dagre, ELK, TALA (TALA is paid) | modern-looking architecture diagrams | younger ecosystem; best engine is proprietary |
| **Excalidraw** | JS + `.excalidraw` JSON | none (explicit coordinates) | hand-drawn feel; agent-editable scene format | you own the layout |
| **draw.io / mxGraph** | XML | partial | 10k+ shape libraries, BPMN/SysML/network stencils | verbose XML |
| **tldraw** | JS `.tldr` | none | whiteboard aesthetic, CLI export | same as Excalidraw |
| Niche | **Pikchr** (Fossil), **SvgBob** (ASCII to SVG), **Nomnoml**, **Structurizr** (C4), **DBML** (ERD), **WaveDrom** (timing), **WireViz** (cable harnesses), **Bytefield**, **BPMN**, **Symbolator** (HDL) | varies | each nails one domain | each nails only one domain |

**Reading:** Mermaid is the floor, not the ceiling. The interesting question isn't "which one" but "how does an agent *choose*, and what does it do when none of them fit" — which is most of the cases the user actually cares about (schematics, cross-sections, annotated figures, maps).

## 2. Layout engines (the part that is genuinely hard)

- **dagre** — hierarchical, fast, deterministic; good for 5–30 nodes. Mermaid's default.
- **ELK (Eclipse Layout Kernel)** — fewer edge crossings, clean orthogonal routing, handles dense graphs; the serious open option.
- **Graphviz** — `dot` for DAGs, `neato`/`fdp` for force-directed, `circo` for circular.
- **TALA** — D2's proprietary engine, tuned for architecture aesthetics.
- **Constraint solvers** — Cassowary/Kiwi, used by Penrose-style systems and UI layout. The escape hatch when the figure is not a graph.

Anything an agent draws by hand-computing coordinates is competing with these, badly. A key design question for Prancheta is which of these it can borrow rather than reimplement.

## 3. Expressive / declarative graphics (beyond the graph)

This is where the ceiling actually is.

- **Penrose** (CMU) — three languages: *Domain* (what kinds of things exist), *Substance* (what's in this diagram), *Style* (how to draw it). Layout emerges from **constrained numerical optimization**, not a fixed shape library. Built for mathematical notation; the separation of content from visual encoding is exactly the separation the Feynman paper says LLMs need.
- **Bluefish** (MIT, UIST 2024) — declarative diagramming built on the **relation** as primitive, component-model style, with a `Ref` component so elements can be shared across relations. Local constraint propagation instead of global optimization. Colocates data and display logic; Penrose deliberately separates them. Two coherent, opposed answers to the same question.
- **TikZ/PGF** (LaTeX) — the academic standard, enormous expressive range, brutal syntax, heavy toolchain. Most of the "LLM generates figures" literature targets it (AutomaTikZ, TikZero lineage) precisely because that's what the training corpus of papers contains.
- **CeTZ** (Typst) — TikZ reimagined for Typst, with a Processing-like API plus TikZ anchors and relative coordinates. Far faster toolchain than LaTeX. Strong candidate.
- **Asymptote** — descriptive vector language with a real coordinate framework for technical drawing; also does 3D.
- **Raw SVG builders** — `drawsvg`, `svgwrite` (Python), `svg.js`. Full control, zero layout.
- **Manim** (3b1b original + Community Edition) — the user's reference point. Its static side is a scene graph of mathematical objects with a *relative positioning vocabulary* (`next_to`, `shift`, `align_to`) — the part worth stealing even for still images. CE has a plugin ecosystem.

## 4. Data-visualization grammars

Distinct from diagrams: the input is a dataset, the output is an encoding.

- **Vega / Vega-Lite** — declarative JSON grammar of interactive graphics; mappings from data fields to encoding channels (x, y, color, size), plus a composition algebra for layered/multi-view displays. Vega-Lite compiles down to Vega. JSON output means an agent can emit and *validate* a spec rather than free-form code.
- **Observable Plot**, **matplotlib**, **plotnine/ggplot2** — the imperative/statistical end.

For Prancheta these are a solved neighboring problem: don't rebuild charting, delegate to it, and keep the local `dataviz` skill in the loop for palette/design rules.

## 5. Maps

- **GeoPandas** + matplotlib (+ `contextily` basemaps) — static, publication-quality.
- **prettymaps** — stylized OSM extracts; the aesthetic option.
- **Folium / leafmap / kepler.gl / pydeck** — interactive; `leafmap` fronts several backends at once.
- **d3-geo** — projections done properly, in JS, when the map is an illustration and not a GIS product.
- **Mapnik / QGIS** — heavyweight cartographic rendering.

Distinguish **maps as data products** (GIS stack) from **maps as figures** (a schematic subway map, a hand-annotated region) — the second is closer to diagramming than to GIS, and is badly served today.

## 6. Mind maps and knowledge graphs

- **Markmap** — Markdown outline to interactive collapsible mind map, portable single HTML.
- **Mermaid `mindmap`** — indentation-based, trivial to emit, visually plain.
- **Cytoscape.js** — real graph exploration API for larger knowledge graphs.
- **Graphviz `twopi`/`circo`**, force-directed layouts — when the structure isn't a tree.

Low-hanging fruit: mind maps are structurally simple, so the whole difficulty is *content selection and hierarchy*, not rendering.

## 7. Animation (deferred, but shapes the design)

- **Manim CE / 3b1b manim** — unbeatable for mathematical animation; Python; scene graph + animation verbs.
- **Motion Canvas** — TypeScript generator functions, tweening, scene graph, real-time editor. Hand-tuned motion graphics. ~8K weekly downloads.
- **Revideo** — Motion Canvas fork for automated pipelines: render API, server-side rendering, templates, self-hosted. ~3K/wk.
- **Remotion** — React; most production-ready, biggest ecosystem (~60K/wk), Lambda parallelization; **commercial licensing applies** ($25/mo Creators, $100/mo Automators as of mid-2026).
- **Reanimate** (Haskell), **Rive** (runtime state machines for UI), **Lottie** (After Effects to JSON), **SMIL/CSS in SVG** (cheapest possible motion).

Implication for the image phase: if animation is the eventual target, prefer a still-image representation that already has a **scene graph and relative positioning**, since that's what animates. Raw flat SVG does not.

## 8. Rendering infrastructure and its traps

- **Kroki** — one HTTP API fronting **30+** diagram libraries (PlantUML, Graphviz, Mermaid, D2, Excalidraw, Vega/Vega-Lite, BPMN, WaveDrom, WireViz, DBML, Ditaa, Pikchr, Structurizr and more), returning SVG/PNG/PDF. Self-hostable via Docker. This is the pragmatic answer to "I don't want to install a Haskell, a Java, a Python and a Go toolchain to render four diagram types."
- **resvg / usvg** (Rust) — parsing and rendering split into separate libraries; no system dependencies, so **reproducible identical output across platforms**. The right default rasterizer.
- **CairoSVG** — weak text/font support; converts text into many small shapes, which blurs and bloats. Avoid where text matters — which is always.
- **Playwright / headless Chromium** — the fidelity ceiling for anything HTML/JS-based; also the natural place to run the see-your-own-output loop.
- **Inkscape / librsvg** — CLI conversion fallbacks.

**The text-metrics trap.** SVG has no layout for text: no wrapping, no automatic box growth. Correct sizing needs font ascent/descent/advance metrics, and computing a real bounding box means running a rendering engine. Browsers differ from each other and from Cairo-based renderers. This is the direct mechanical cause of the most common agent-diagram defect — text overflowing its box. Any serious solution must either measure text with the same engine that will render it, or avoid free-floating text boxes entirely.

## 9. Prior art: what agents already have

**MCP servers**
- `mcp_excalidraw` — 26 tools over stdio, live canvas sync, Mermaid conversion in a local browser canvas.
- Mermaid Chart's official MCP — validation + rendering.
- `diagram-bridge-mcp` — format selection + Kroki rendering + per-format syntax instructions.
- `mermaid-to-excalidraw-mcp`.

**Agent skills (the closest existing competitors)**
- `Agents365-ai/excalidraw-skill` — 5 patterns, 8-color semantic palette, Kroki or local CLI, and an explicit **verify-the-render loop**: export PNG, look at it, fix clipping/overlap/arrow-through-shape, re-export, 1–3 passes.
- `coleam00/excalidraw-diagram-skill` — Playwright render pipeline so the agent can see its output and repair layout before delivering.
- `Agents365-ai/drawio-skill` — 11 presets (UML, SysML/MBSE, BPMN, network, C4 and others), 36 tools, codebase/CI/infra to diagram, image to editable diagram, vision self-check, 10k+ shapes.
- `Agents365-ai/tldraw-skill` — 6 presets, vision-based self-check.
- `cathrynlavery/diagram-design` — 27 editorial diagram types, self-contained HTML+SVG, explicitly anti-"Mermaid-slop".
- Locally installed already: `artifact-diagramming`, `dataviz`.

**Read this honestly:** the render–verify loop is *not* a novel idea, and several of these skills implement it. What none of them do is (a) cover figure kinds beyond the whiteboard/architecture genre, (b) treat layout as a solvable constraint problem rather than a thing to nudge, or (c) verify *semantic* correctness — that the drawing says what it was supposed to say — as opposed to cosmetic overlap.

## 10. Academic work worth reading properly

Generation
- **DiagrammerGPT** (COLM 2024) — LLM *planning* stage produces an explicit layout plan before any drawing; open-domain, open-platform.
- **AutomaTikZ** (2023) / **TikZero** (2025) — text to TikZ synthesis; TikZero does zero-shot text-guided graphics program synthesis.
- **IntroSVG** (2026) — unified VLM as both generator and critic in a closed generate–review–refine loop over *rendered* SVGs; SFT to turn early failures into error-correction data, then DPO against a teacher VLM.
- **GeoSVG-RL** (2026) — geometry-aware RL for layout-constrained text-to-SVG.
- **PaperBanana** (2026) — automating academic illustration.
- **Feynman** (2026) — knowledge-infused diagramming agent; multi-stage retrieval + spec generation; argues explicitly for separating knowledge organization from visual production.
- Math-diagram SVG generation from textual hints (AIED 2025) — prompting pipeline, identifies which strategies actually move the needle.

Evaluation (this matters more than it looks — you cannot improve what you cannot score)
- **DiagramEval** (2025) — evaluates LLM-generated diagrams **as graphs**, structurally.
- **SVGenius** (ACM MM 2025) — SVG understanding / editing / generation, with complexity stratification.
- **SVGEditBench V2** (2025) — instruction-based SVG editing.
- **MermaidSeqBench** (2025) — NL to Mermaid sequence diagrams, public dataset.
- **Can AI Draw Science?** (2026) — scientific figure generation by T2I and multimodal models; the failure taxonomy quoted in §0.
- **GENFIG1** (2026) — visual summaries of scholarly work as a VLM challenge.
- Simon Willison's informal LLM SVG generation benchmark — useful vibe-check, not rigorous.

---

## 11. Where the gap actually is

Stacking the above, four gaps survive scrutiny:

1. **Repertoire.** Every existing agent skill is a *genre* skill: architecture diagrams, whiteboard sketches, UML. Nobody covers the long tail named in the brief — schematics, cross-sections, annotated physical figures, maps-as-figures, explanatory illustration with a real coordinate system.
2. **Representation.** The field is split between "emit a DSL and accept its layout" and "emit raw SVG and do layout yourself." The Penrose/Bluefish line — declare relations and constraints, let a solver place things — has no agent-facing implementation. This is also the only branch that scales to animation without a rewrite.
3. **Verification that checks meaning.** Existing loops check for overlap and clipping. None check that the arrow points the right way, that every entity in the request appears, that no invented entity appeared. Relation inversion and hallucinated entities are documented failure modes and are invisible to a cosmetic check.
4. **Selection.** Given a request, *which* representation? The choice between Mermaid, Graphviz, a constraint solver, a map stack, and hand-built SVG is currently made by whim. It is decidable from properties of the request: is the content a graph, does it have a coordinate system, is it data-driven, is there a spatial substrate.

## 12. Open questions to resolve before building

- **Language.** Python (matches ProjectHub, gets matplotlib/GeoPandas/manim for free) vs TypeScript (gets the browser as renderer, ELK, d3, Motion Canvas/Remotion for the animation phase, and Playwright natively). The animation roadmap argues for TS; the rest of ProjectHub argues for Python. Not yet decided.
- **Build vs delegate.** Kroki + resvg + Playwright covers rendering entirely. Is Prancheta a *layer* (selection + composition + verification over existing renderers) or a *new representation*? A layer ships far sooner; a representation is where gaps 2 and 3 live.
- **What is the verification oracle?** A VLM looking at a PNG, a structural graph comparison in the style of DiagramEval, a geometric checker (bounding-box overlap, edge-shape intersection, text-fits-box), or all three at different costs.
- **Is the deliverable a skill, an MCP server, a CLI, or a library?** The competitors are all skills. A CLI with a skill on top matches how the rest of ProjectHub is built — `blindspot-scan`, `env-seam`, `seam-check` all ship a CLI with MCP tools mirroring it 1:1.

## Sources

Diagram-as-code and layout: [text-to-diagram.com comparison](https://text-to-diagram.com/?example=text) · [D2 layouts](https://d2lang.com/tour/layouts/) · [Mermaid vs D2 vs Graphviz](https://diagrams.so/learn/diagram-as-code-comparison) · [Best diagram-as-code tools 2026](https://infrasketch.net/blog/best-diagram-as-code-tools-2026)

Declarative/constraint systems: [Bluefish (UIST 2024)](https://vis.csail.mit.edu/pubs/bluefish/) · [Bluefish arXiv](https://arxiv.org/html/2307.00146v3) · [Penrose](https://www.researchgate.net/publication/343608755_Penrose_from_mathematical_notation_to_beautiful_diagrams) · [CeTZ docs](https://cetz-package.github.io/docs/) · [Asymptote](https://en.wikipedia.org/wiki/Asymptote_(vector_graphics_language)) · [Manim CE](https://docs.manim.community/en/stable/) · [3b1b/manim](https://github.com/3b1b/manim)

Grammars, maps, mind maps: [Vega-Lite](https://vega.github.io/vega-lite/) · [leafmap](https://leafmap.org/) · [Python mapping libraries](https://hex.tech/templates/data-visualization/python-mapping-libraries/) · [Mermaid mindmap](https://mermaid.ai/open-source/syntax/mindmap.html)

Animation: [Remotion vs Motion Canvas vs Revideo](https://www.pkgpulse.com/guides/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026) · [Programmatic video tools 2026](https://rendercomp.com/blog/best-programmatic-video-tools-2026/)

Rendering: [Kroki](https://kroki.io/) · [Kroki docs](https://docs.kroki.io/kroki/) · [CairoSVG docs](https://cairosvg.org/documentation/) · [resvg-js](https://github.com/CherryRum/resvg-js) · [SVG text metrics](https://www.cyberangles.org/blog/calculating-vertical-height-of-a-svg-text/)

Agent prior art: [mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) · [diagram-bridge-mcp](https://glama.ai/mcp/servers/@tohachan/diagram-bridge-mcp) · [Mermaid Chart MCP](https://mermaid.ai/docs/ai/mcp-server) · [excalidraw-skill](https://github.com/Agents365-ai/excalidraw-skill) · [excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill) · [drawio-skill](https://github.com/Agents365-ai/drawio-skill) · [tldraw-skill](https://github.com/Agents365-ai/tldraw-skill) · [diagram-design](https://github.com/cathrynlavery/diagram-design)

Papers: [DiagrammerGPT](https://diagrammergpt.github.io/) · [AutomaTikZ](https://arxiv.org/pdf/2310.00367) · [TikZero](https://arxiv.org/pdf/2503.11509) · [IntroSVG](https://arxiv.org/pdf/2603.09312) · [GeoSVG-RL](https://arxiv.org/pdf/2605.25447) · [PaperBanana](https://arxiv.org/pdf/2601.23265) · [Feynman](https://arxiv.org/pdf/2603.12597) · [DiagramEval](https://arxiv.org/pdf/2510.25761) · [SVGenius](https://dl.acm.org/doi/10.1145/3746027.3758287) · [SVGEditBench V2](https://arxiv.org/pdf/2502.19453) · [MermaidSeqBench](https://arxiv.org/pdf/2511.14967) · [Can AI Draw Science?](https://arxiv.org/pdf/2606.28406) · [GENFIG1](https://arxiv.org/pdf/2604.04172) · [Math diagrams with vector graphics (AIED 2025)](https://people.umass.edu/~andrewlan/papers/25aied-svg.pdf)
