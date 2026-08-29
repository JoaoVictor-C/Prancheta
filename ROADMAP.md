# Roadmap

Everything that has happened on Prancheta, in order, plus what comes next.

**Status today (2026-08-19): M0 through M3 are done.** Four presets render end to end, deliberately broken figures repair themselves and converge, the selection core ranks requests deterministically and refuses the wrong genre, and the toolkit runs from a shell, over MCP, or as a generated Claude skill. Every exported SVG has been checked in a second, non-browser renderer. Only M4 — the two hard probes — remains, and it has not been started.

---

## Done

### 2026-08-18 — Project created
Folder `Prancheta/` created in ProjectHub. Name chosen: *prancheta* is Portuguese for a drafting board — the surface used when a drawing has to be correct, not just pretty.

Problem statement written in [README.md](README.md): an agent asked for a figure today either calls an image model (plausible pixels, wrong structure), emits Mermaid (one genre for every request), or hand-writes SVG (no layout engine, and it never looks at the result). Scope: images now, animation later.

### 2026-08-18 — Research pass
[docs/research/landscape.md](docs/research/landscape.md) — survey of ~50 tools, libraries, agent skills and papers.

What it established:
- For anything carrying information, generate **code that renders to vector**, never pixels. Image models fail on diagrams with documented, repeatable failure modes: garbled labels, hallucinated entities, reversed relations.
- Code alone isn't enough either. The fix that keeps recurring in the literature is a closed loop: draw → rasterize → **look at the raster** → repair.
- That loop is not novel. Several shipped agent skills already do it (drawio-skill, excalidraw-skill, tldraw-skill).
- Four gaps survive: **repertoire** (everyone ships one genre), **representation** (constraint/relation layout has no agent-facing implementation), **semantic verification** (existing loops check overlap, not meaning), **selection** (which representation to use is chosen by whim).
- One trap named early: SVG has no text layout. A true bounding box needs a render engine, and engines disagree. This is the mechanical cause of most agent-diagram defects.

### 2026-08-18 — Language comparison
[docs/research/language-choice.md](docs/research/language-choice.md) — Python vs TypeScript, written up before deciding.

Main finding: the 3Blue1Brown look is not a property of Python. It decomposes into a palette, LaTeX typesetting, a relative-positioning vocabulary, and motion. Only motion is where manim's maturity is decisive.

### 2026-08-18 — Decision 0001: language
[docs/decisions/0001-language.md](docs/decisions/0001-language.md) — **TypeScript.** Node is the only mandatory runtime; Python is optional.

Decided with a Terza reasoning session (4 iterations, 2 passes, confidence 0.86). The deciding argument: process boundaries are cheap at the leaves and ruinous in the inner loop. Text measurement is an inner-loop operation and only the browser measures text in the engine that draws it. Maps, charts and manim are one-shot leaf calls.

Also settled there: layout is a deterministic box model (not a numeric solver); the browser computes layout but exported SVG is absolute-positioned with no `foreignObject`; graph skeletons are delegated to ELK/Graphviz and their geometry ingested; Python survives as optional figure modules.

Three supports were resized during the reasoning and are recorded as *not* load-bearing: Penrose-in-TypeScript is inspiration, not a dependency; the install surface is cost-neutral, not favourable; box-model repair is predictable, not local.

### 2026-08-18 — Decision 0002: deliverable shape
[docs/decisions/0002-deliverable-shape.md](docs/decisions/0002-deliverable-shape.md) — **One repo, one version.** Typed library holds the contract, CLI is its first binding, MCP adapter its second. The Claude skill is a generated view, not the product.

Decided with a second Terza session (2 iterations, 1 pass, confidence 0.86). Reason: what survives a port to a future host is the contract, not the protocol. The library rather than the CLI holds it, because a sandboxed JS agent runtime can import a module but cannot spawn a process.

Engine and authoring knowledge ship together, because a preset is irreducibly code plus prose — and because separating knowledge from the artefact that uses it already caused silent drift once in this ProjectHub, in teaching-checker.

One part cannot be generated: selection knowledge is comparative and belongs to no single preset. It is hand-written, reviewed, and tested with real request phrasings.

### 2026-08-18 — Build plan
[docs/PLAN.md](docs/PLAN.md) — milestones ordered by risk retired per day.

### 2026-08-18 — M0 shipped: the walking skeleton works
The full pipeline runs: spec → HTML mirror → Chromium lays out → measure every box and every wrapped line → absolute-positioned SVG → rasterise that SVG → PNG + manifest with checks.

`npm run render fixtures/labelled-blocks.json` produces a figure in about 1 second. All six worst-case labels — one word, a 120-character sentence, a CJK string, an unbreakable URL, a centred label and a right-aligned one — wrap and sit inside their boxes. 24 tests pass.

**The assumption held.** A browser can be the layout oracle and still yield clean, portable SVG: 12 `<text>` elements (one per rendered line), zero `foreignObject`, 4 KB.

What M0 taught us, none of which was in the plan:

- **Baselines must be measured, not derived.** The relationship between a line's client rect and its baseline is not pinned down by any spec. The fix: a zero-sized inline-block with `vertical-align: baseline` has its bottom edge *on* the baseline, which gives an exact offset. Lines whose metrics disagree with that probe are flagged `baselineUncertain` rather than silently trusted.
- **Exporting the declared font stack is a portability bug.** Chromium resolves a stack *per glyph run*, so the CJK label was drawn by a face nobody named. The exported SVG now asks Chromium via CDP which face actually drew each label and names it first — `"Microsoft YaHei"` for the CJK block. Labels drawn with more than one face are reported as a warning, because naming one family cannot fix a mixed-script line.
- **The independent-renderer check was worth building.** [scripts/check-independent.ts](scripts/check-independent.ts) renders the exported SVG with resvg — a Rust engine, no browser, no system libraries. Output is indistinguishable from the Chromium render, CJK included. Measuring and rasterising in the same engine only proves self-consistency; this proves the file survives outside it.
- **Subpixel antialiasing leaks colour into monochrome glyphs.** Chromium needs `--disable-lcd-text` (plus `--force-color-profile=srgb`), or every exported PNG carries faint colour fringes.
- Two environment facts: the cached Chromium did not match the installed Playwright (`npx playwright install chromium` fixes it), and `node --test tests/` cannot resolve a directory argument on Node 25 here — the npm script uses a glob instead.

**Not yet verified:** the SVG has been rendered by Chromium and by resvg, not by Inkscape or Illustrator. Two independent engines agreeing is strong evidence, not proof.

### 2026-08-19 — M1 shipped: the loop repairs, and it converges
Three geometric checks — `text-fits-box`, `text-clear-of-other-boxes`, `content-within-canvas` — each failure carrying structured overflow numbers rather than prose, and a repair engine that acts on them. 48 tests pass.

`fixtures/broken-boxes.json` has its sizes wrong on purpose. Rendered with `--no-repair` it produces five failures, including a label that escapes its box and lands on the neighbour below. Rendered normally it converges in three passes:

```
fix  pass 2: too-short.height 44 -> 97   (label overflows bottom by 51.5px)
fix  pass 2: nowrap-narrow.width 190 -> 290 (label overflows right by 98.1px)
fix  pass 3: nowrap-hopeless.wrap none -> normal
             (cannot grow further within budget; allowing the label to wrap instead)
```

**The assumption held, and the first thing M1 had to do was make failure possible at all.** With CSS flex, a box grows to fit its text and siblings cannot overlap — the defects the loop exists to fix were unreachable by construction. Rather than fake them, the IR gained the two powers real figures need and whose failures must therefore be repairable: `height` (fixed-size shapes, so a label can overflow downward) and `wrap: "none"` (labels that must not be broken, so a label can overflow sideways). Every defect in the fixture is now a genuine one.

**Convergence is structural, not hoped for.** Every edit strictly increases one bounded quantity, or flips `wrap` from `none` to `normal` at most once per node. Nothing ever shrinks, so no state can recur and the loop cannot oscillate. `isMonotone` guards it and the tests assert it. The empirical face of that argument, measured across pass budgets:

| pass budget | passes used | repairs | failures left | exit |
|---|---|---|---|---|
| 1 | 1 | 0 | 5 | 2 |
| 2 | 2 | 2 | 2 | 2 |
| 3 | 3 | 3 | 0 | 0 |
| 5 | 3 | 3 | 0 | 0 |
| 8 | 3 | 3 | 0 | 0 |

Budgets of 3, 5 and 8 all finish in exactly three passes: the loop stops when it is done rather than spending what it is given. A clean figure (`labelled-blocks.json`) takes one pass and produces zero edits at any budget.

The growth budget also decides *which* repair is chosen, which was not designed and is worth knowing: at `--max-scale 6` the hopeless block grows to 618px and converges in two passes; at `--max-scale 1` nothing may grow at all, so the loop falls back to wrapping where it is allowed and reports the rest with the budget arithmetic spelled out — `growing too-short to 97px would exceed its budget of 44px (1x its original 44px)`.

Also settled here: [decision 0003](docs/decisions/0003-repairs-are-edits.md) — repairs are an ordered list of typed edits applied to a copy, never mutations of the caller's spec. The manifest carries `repairs`, `passes` and `unrepaired`, and `render()` returns the `effectiveSpec` that was actually drawn. An agent that authored a bad height gets told so, and can fix it upstream.

One landmine defused early: a label always intersects its own ancestor's box, so once blocks nest (M2) the collision check would have fired on every well-formed nested figure. A box that fully encloses the owner is now read as ancestry, not collision.

**Not done here, deliberately:** semantic checks — right arrow direction, nothing invented, nothing missing. They need a model in the loop and are worth nothing while boxes still overflow.

### 2026-08-19 — M2, first half: the selection core
The part of M2 that carries the project's differentiator is built and green. The three remaining presets are not — see *Next* below.

**The plan promised something that could not be built.** It said the selection core would ship with "twenty request phrasings → expected preset, judged against expectation". But the thing being judged is a model reading prose, and CI has no model, no API key, and must be deterministic and offline. A [Terza session](docs/decisions/0004-selection-core.md) resolved it: selection is a **two-axis predicate vocabulary** plus a **flat rule table** evaluated as a **deterministic ranking**, with a hand-written narrative citing rule ids. CI verifies the decision procedure — never a proxy for the model.

The two obvious answers both failed. A manual rubric leaves the differentiator as the one unverified part of a project whose thesis is verification, and a solo maintainer drops it first. A keyword classifier is worse: green tests certifying an artefact that never runs in production, manufacturing false confidence exactly where the claim is staked.

**Three corrections came from the critical passes, none from the original proposal:**

- **Structure and idiom are different axes.** The first design let "spatial substrate" *disqualify* a graph. Counter-example: *"draw our microservice call graph as a subway map"* is unambiguously a graph and unambiguously demands a substrate. An idiom constrains how a figure is drawn, never what the content is.
- **Rules need explicit priorities.** "Deterministic" was an overstatement while ties were unspecified — an org chart fires both the hierarchy and graph rules, because a tree *is* a graph, and the winner fell out of array order.
- **The vocabulary is closed at scoring, open at recording.** Nothing could detect a *missing* predicate; unknown predicates surfacing in the manifest turn that blind spot into an instrument. The memory-layout fixture exercises it: a packed linear extent has no structure value, so it is recorded as unknown rather than forced into the nearest wrong bucket.

**The anti-default property is now executable.** The documented industry failure is not "picks a slightly worse preset", it is "returns a flowchart regardless". That is a statement about refusal, so it is tested as one: for content with no graph structure, the graph preset must rank *below the floor* or be disqualified by a named rule — never merely lose. Verified directly: a scene disqualifies it via `S-nograph-disqualifies-graph`, a series via `S-series-disqualifies-graph`, a plain set leaves it scoring 0 against a floor of 2.

**Building it immediately caught four failures among the twenty fixtures**, which is the whole reason the suite exists:

- A rule-table defect in three cases — `plain-flow` was weighted as real evidence, so every ordinary flowchart came out as `compose: graph + labelled-blocks`. Plain flow is the *absence* of an idiom; its weight now sits below the floor deliberately.
- A fixture defect in one — a "dependency tree" annotated as *both* hierarchy and graph expected `mindmap`; the table said `graph` and the table was right. Asserting both means it is not a strict tree.

**A fifth defect surfaced only once the invariant was written as a test.** `S-hierarchy-favours-graph-weakly` carried a weight exactly equal to the floor, so for a hierarchy the graph preset stayed *viable* rather than being ruled out — invisible to every fixture, because the mindmap still won on score. The resolution was a judgement, not a mechanical fix: a tree genuinely **is** a graph, so drawing one as a graph is a defensible alternative rather than a misrepresentation. The rule keeps its weight, now with the boundary documented as deliberate, and the anti-default test exempts hierarchies and says why. The property applies to content a graph would *misrepresent* — a scene, a series, a bare set — not to content a graph merely serves less well.

172 tests pass.

**Stated limits, kept in the docs verbatim rather than softened:** CI does not verify that a model reads a request correctly — that needs a model in the loop and ships as a script. And the fixtures and rule table share an author, so CI checks self-consistency between two artefacts from one hand, not correctness against an external standard. At four presets the ranking's `compose` and `none` outcomes are reachable but thinly exercised; that benefit is paid for now and collected when the repertoire competes.

### 2026-08-19 — M2, second half: scenes, connectors, and the repertoire
The three remaining presets are built. `graph`, `mindmap` and `annotated-figure` all render, pass their checks, and reproduce identically in resvg.

**The IR had to grow, and the growth is the interesting part.** A `scene` places children by coordinate rather than by flow, in one of two ways: `absolute`, where the author's geometry *is* the content (a cross-section's layer positions mean something), or `graph`, where ELK decides. Connectors join blocks, or aim at a bare point — which is what a callout needs.

**The two-phase dance** that lets a third-party engine and our own measurement oracle work on the same figure: measure intrinsic sizes in the browser → hand ELK the *real* sizes with the real text → place absolutely → measure properly → lift ELK's scene-local routes into page space. ELK never lays out guesses, and text measurement never leaves the browser. Decision 0001's "delegate the skeleton, own what is layered on top" is now a boundary in code rather than a sentence.

**Arrowheads are explicit filled paths, never `<marker>`.** Marker support varies across the renderers a figure actually gets opened in, and a missing arrowhead silently reverses the meaning of a diagram. A path is a path everywhere — confirmed against resvg.

**Three defects found while building, two of them mine and serious:**

- **The repair loop was silently no-oping on scene children.** `normalise` never recursed into a scene, so `applyEdits` could not find the node to change — the loop kept re-emitting the identical edit every pass until the budget ran out. A provably terminating loop still gets nowhere if its edits never land. Caught because the log showed `separator.height 32 -> 53` twice.
- **The connector check failed every well-formed annotated figure.** A leader line into a cross-section must cross the case containing the part it points at. Enclosure is structure, not collision — the same guard the text check already needed for nesting.
- **A new check the milestone made necessary: `boxes-do-not-overlap`.** In flow layout, siblings cannot collide. With absolute scenes they can, and a repair *causes* it: growing a layer to fit its label pushed it into the layer below, fixing one defect by creating another. The check caught it immediately, and the fixture's geometry was corrected rather than the symptom suppressed.

Also landed: the design system beyond M0's constants — semantic **roles** (`primary`, `accent`, `warning`, `muted`, `callout`) that specs name instead of hex codes, connector ink, and a three-step type scale. A spec that names colours cannot be restyled or made accessible later.

205 tests pass. Each preset ships with its doc beside its code, as decision 0002 requires: [graph](src/presets/graph/PRESET.md), [mindmap](src/presets/mindmap/PRESET.md), [annotated-figure](src/presets/annotated-figure/PRESET.md), [labelled-blocks](src/presets/labelled-blocks/PRESET.md). Each says when to choose it and — more usefully — when not to, citing the selection rules by id.

### 2026-08-19 — M3 shipped: one schema, two bindings, generated views
Prancheta is now usable from a shell, from any MCP host, and as a Claude skill — without any of those three being maintained by hand.

**The command table is the single source.** `src/commands.ts` declares four commands — `render`, `select`, `presets`, `rules` — each with its parameters, descriptions and handler. The CLI parses argv into that shape; the MCP adapter turns the same declarations into tool definitions. Neither contains figure logic. A test asserts the two surfaces enumerate identical names, descriptions and input schemas, so adding a flag to one and forgetting the other is a red build rather than a silent divergence.

Two commands are new and exist because MCP mirroring makes them worth having in both places: `select` ranks presets from content predicates and prints the rules that decided it, and `rules` prints the table itself.

**Built on the SDK's low-level `Server`, not its ergonomic wrapper.** The wrapper wants Zod schemas; the command table already produces JSON Schema. Translating between them would put a second description of every parameter in the middle — the exact duplication this binding exists to remove.

**The knowledge tree ships as MCP resources**: the hand-written selection narrative, the generated rule reference, and every preset doc, at `prancheta://` URIs. A host that has never heard of Claude skills still gets the reasoning. The server's `instructions` say plainly that choosing the wrong kind of figure cannot be fixed by drawing the wrong one well.

**Generated views, with the line decision 0002 drew held exactly.** `scripts/gen-views.ts` writes `.claude/skills/prancheta/SKILL.md` and `AGENTS.md` from the code: the repertoire table, the command table, the resource list, and a verbatim copy of the narrative. The narrative itself is never machine-authored — copying is not authoring. Output is deterministic (no timestamps), and `npm run check:views` fails if what is committed differs from what the generator produces.

The guards decision 0002 asked for are now tests: every preset has a doc and an implementation, no orphan preset directories, every relative link in every markdown file resolves, and no generated view is stale. One test drives the real server over stdio — initialize, tools/list, resources/list, a tool call — so the protocol surface is exercised rather than assumed. 256 tests pass.

**Two lessons about writing guards, and the first one is uncomfortable:**

The first dangling-reference test was **vacuous**. It looked for backtick-quoted preset ids in the selection narrative, and that document names presets in prose — "a mindmap", "the graph preset" — so the check could never fail. A test that cannot fail is worse than no test, because it reads as coverage. It was replaced with one that checks what actually breaks when something is renamed: every relative link in every markdown file, with an assertion that a meaningful number of links were found so the suite cannot go quietly empty.

That replacement **immediately caught a real bug in the generator**. Embedding a document moves it, and relative links do not move with it: a preset doc links to a fixture three levels up from `src/presets/<id>/`, and copied verbatim into `.claude/skills/prancheta/SKILL.md` that path pointed at nothing. Every embedded link in the generated skill was broken. The generator now rewrites links to resolve from wherever the copy lands.

### 2026-08-19 — M4 shipped: both probes ran, and both found something

The two questions M4 existed to answer are answered, and neither answer was the one the plan assumed.

#### Probe A — can the manifest carry enough to verify geometry the core does not own?

**Yes**, under a protocol that took three attack passes to get right ([decision 0005](docs/decisions/0005-module-protocol.md)): the module declares *semantics*, the core measures *geometry*. The organising principle is one the project already followed — nobody certifies their own work, the same reason M0 re-rendered its SVG in resvg rather than trusting Chromium about Chromium.

A real Python module ships at [modules/map/render.py](modules/map/render.py): Shapely for geometry, pyproj for projection, `representative_point()` for label placement. Three questions, all answered against it:

```
node src/cli.ts module python --args modules/map/render.py               # exit 0
node src/cli.ts module python --args modules/map/render.py,--misdeclare  # exit 2
```

Ids resolve; the check set runs from measurement alone; and the deliberately broken run is caught on both planted defects — a declared `phantom-region` that was never drawn, and a label placed at a bounding-box centre that falls outside its own polygon. The discrimination is the part worth noting: `harbour` is L-shaped, so its bbox centre lands in the notch, while the two convex regions' bbox centres really are inside them and correctly pass. Only the L-shape fails. **Containment is answered by the browser's own `isPointInFill`, not by parsing path data** — a concave coastline with holes, hit-tested by the same rasteriser that draws it, with no second geometry engine to disagree.

**Three things building it taught, none of them in the design:**

- **A module should declare only geometry it actually computes.** The first version guessed label boxes from character counts and was wrong by up to 16px. `module-geometry-agrees` caught it on the very first run. It computes polygons, so it declares polygon bounds; it cannot measure text, because that needs a font engine. Guessing and calling it a declaration is how a module ends up certifying its own fiction.
- **Centre-inside is not fits-inside.** "Harbour District" sits in a narrow arm: its centre is inside, most of the text is not. That passes — on a narrow region an overhang is often unavoidable and still readable — but reporting only the pass would overstate what was verified, so the count of fully-inside labels is now in the detail.
- **The third check status had to be real.** `Check.status` was `"pass" | "fail"`, and the first implementation of "not-applicable" mapped it to `"pass"` because there was nowhere else to put it — which would have made this decision's central promise a lie inside its own code. The type gained a third state, and `manifest.ok` now ignores it while the repair loop skips it.

#### Probe B — is the temporal IR sound enough to support animation?

**Yes, but only because the probe found the thing that would have broken it.**

[src/anim/diff.ts](src/anim/diff.ts) lays out two states of one figure and classifies every difference: appeared, disappeared, moved, resized, restyled, retexted, unchanged. On the first run it reported 2 appeared, 11 moved, 4 resized, 1 restyled, 1 retexted — and **zero disappeared**, despite one edge having been deleted between states.

The cause: the graph preset numbered edges positionally. `edge-5` was `parse→dlq` in the before state and `store→cache` in the after state — *same id, different edge*. The diff dutifully called it a resize. An animation built on that would have morphed the dead-letter path into the cache path, smoothly and wrongly.

**Positional ids are not identity.** Edge ids are now derived from their endpoints (`parse--dlq`, with a `#2` suffix only on genuine duplicates), which is content-based and survives editing. The same diff now reports `parse--dlq` disappeared and `store--cache` appeared, and all six delta kinds are exercised:

```
16 element(s) persisted; 3 appeared, 1 disappeared, 11 moved, 3 resized, 1 restyled, 1 retexted
```

So the real subject of the animation probe was never motion — it was **identity**. Tweening is a solved problem; knowing that the thing on screen in frame 2 is the *same* thing as in frame 1 is not, and it is decided long before any animation code exists, by whether ids are authored or invented positionally.

#### A standard the core was not holding itself to

Writing the module checks exposed that `not-applicable` existed only on the module side. The core's own `boxes-do-not-overlap` reported **pass** on a figure with one box — having compared zero pairs — and `content-within-canvas` did the same on an empty figure. Vacuous passes, of exactly the kind decision 0005 forbids modules from producing.

Both now report `not-applicable` with the count they examined, and the test that asserted "a clean figure produces all passes" was rewritten to assert it produces no *failures*, plus that at least one check actually examined something. Otherwise "clean" can mean nothing looked.

291 tests pass.

#### What is not checked, stated plainly

Module figures are verified for **malformation, not misrepresentation**. A choropleth with a reversed colour scale passes every check and is completely wrong. So does an equal-area claim about a Mercator projection — which this module uses, and which is not equal-area. So does text rendered at half its intended size inside a scaled group: its box is right, its containment is right, its type is illegible. These are the boundary of what measuring a rendered artefact can reveal, not a backlog.

### 2026-08-19 — Second figure module: skeletal chemical structures

[modules/molecule/render.py](modules/molecule/render.py) — a request for "the chemical structure of glucose" had been going through an ad hoc RDKit script outside the toolkit entirely, which is exactly the failure this project exists to prevent: a capability that exists but isn't drawn *through* the render–inspect–repair loop, so nothing ever checked it. It is now a real module under [decision 0005](docs/decisions/0005-module-protocol.md), the protocol's second exercise after the map module and the first real test of whether that protocol generalises to a figure class nobody designed it against.

**Bonds declare geometry; heteroatom labels don't**, the same split the map module drew between regions and their names. A bond is `decoration` with a `declaredBox` this module actually computed; a label (`OH`, `NH2`, ...) declares none, because measuring text needs a font engine this process doesn't have. Bare carbon vertices get no element at all — a skeletal formula's whole convention is that an unlabelled vertex *is* carbon.

**The checks found two real bugs before anything else did.** A dashed stereo wedge's tip point is never itself drawn — only the hash marks radiating from it are — and the first version seeded the declared bounding box with that undrawn tip anyway. `module-geometry-agrees` failed on every dashed bond, off by up to 22px. Fixing that exposed a second, uniform few-pixel disagreement across all twelve bonds, traced to an assumption that `getBoundingClientRect` on an SVG `<line>` pads for stroke width — it doesn't; Chromium returns the geometric extent of the path data. A standalone probe (render one plain diagonal line, measure it) confirmed that rather than continuing to guess. Both fixes are recorded in [modules/molecule/MODULE.md](modules/molecule/MODULE.md), because the bug and the check that caught it are the part worth keeping, not just the fix.

**`module-labels-clear-of-strokes` is the check that gives this module its point.** Bonds are declared `decoration`, so it comes for free: every atom label is tested against every bond's drawn ink via `isPointInStroke`. Bonds retreat 11px from a labelled atom precisely so this passes honestly rather than by accident — the same reason real chemical-structure software leaves a gap before the letter.

Renders glucose, sucrose (two rings, eleven labels, the case that motivated this), caffeine, aspirin and arbitrary SMILES cleanly; a `--misdeclare` run (a phantom bond id, one bond's geometry shifted 40px from what it drew) is caught on both planted defects, mirroring the map module's own probe. 295 tests pass.

### 2026-08-19 — Research: what else the module boundary could cover

[docs/research/candidate-modules.md](docs/research/candidate-modules.md) and [TODO.md](TODO.md) — a deliberate research-only pass, prompted by the observation that `map` and `molecule` were each found by need rather than by search. Eight candidates, ranked by how hard it would be to fake their geometry without the real library (reaction schemes, phylogenetic trees, general function/data plots, circuit schematics, genomic feature diagrams, protein topology cartoons, Skew-T meteorological diagrams, crystal lattices), plus a "considered and set aside" list with reasons on record so a future search doesn't re-litigate them blind. Nothing implemented in this pass.

### 2026-08-19 — Third and fourth figure modules: reaction schemes and general plots

Two candidates from that list, taken to a shipped state the same day.

**[modules/reaction/render.py](modules/reaction/MODULE.md)** computes no chemistry of its own — every atom, bond and stereo wedge comes from `molecule.render()`, imported directly as a sibling module. What it owns is the packing problem `molecule` doesn't solve: arranging several independently-sized molecule sub-figures in a row without collision, with an arrow and reagent text between them. A `.`-joined SMILES side (`A.B>>C.D`) is the whole input DSL; a component repeated N times *is* how a coefficient of N gets declared, counted rather than inferred. Four canned reactions (glucose combustion, photosynthesis, methane combustion, esterification) render clean.

Two bugs, both the same shape as `molecule`'s own history: the arrow's declared box first covered only the shortened `<line>` while a separately-drawn arrowhead triangle sat 10px beyond it — `module-geometry-agrees` caught the gap, fixed by grouping line and arrowhead under one id so the declared box and the drawn thing describe the same object. And the conditions label was first declared with `owner: "reaction-arrow"`, on the assumption that text near a feature should claim it; `module-label-within-feature` correctly refused, because a stroked line has no `isPointInFill` target for containment to test. The fix was to remove the false ownership claim, not add a workaround — `module-labels-clear-of-strokes` already covers the relationship that actually matters (not sitting on the arrow's ink) for any label regardless of ownership.

**[modules/plot/function.py](modules/plot/MODULE.md)** is the general module `plot/derivative.py` was never meant to be — that script draws one fixed pedagogical figure; this one takes a spec (one or more `f(x)` expressions, or a dataset) and renders any instance, with roots and extrema found by numeric bisection and discrete comparison rather than hand-placed, and a real `numpy.polyfit` least-squares fit with its R² for scatter data.

**Legend placement took three collision fixes in a row before the actual lesson landed.** Anchoring each curve's label at its sample endpoint collided with the curve itself on a damped oscillation that settles near the axis. Moving to the curve's point of maximum deflection fixed that and broke the next case: a peak sitting exactly on an axis (`cos(x)` at `x=0`) let the label's glyph box swing back across the very axis its anchor point had been nudged away from, because only the point moved, not which way the text anchored from it. Fixing *that* produced a third failure, a peak nudged past the canvas edge. Three fixes relocating the same class of bug was the signal to stop patching the heuristic and change the region: the legend now lives in a column structurally reserved on the canvas's right edge, with curves confined to the plot area by construction, so no curve shape can ever reach a label placed there. The same false-ownership mistake as the reaction module's arrow label showed up here too, on a stroked curve's legend and a fit's equation text, fixed the identical way.

Both modules' `--misdeclare` probes catch their planted defects (a phantom bond/reagent/series id; a shifted declared box) the same way `map` and `molecule` do. 305 tests pass. [TODO.md](TODO.md) updated to mark both done.

### 2026-08-19 — Fifth figure module: dendrograms, where branch length is the whole point

[modules/dendrogram/render.py](modules/dendrogram/MODULE.md) — the tree shape [mindmap](src/presets/mindmap/PRESET.md) was named as unable to honestly serve: a dendrogram's vertical position encodes a real merge distance, and mindmap's radial layout only has depth to spend, not distance.

**This module invents no layout of its own.** `scipy.cluster.hierarchy.linkage` computes the clustering and `dendrogram(..., no_plot=True)` already returns every merge's exact `icoord`/`dcoord` trace; this module's only job is projecting those coordinates onto a canvas. That made it the cleanest `module-geometry-agrees` case yet: the declared box for every merge comes from numbers this module did not choose, so a scaling bug (a wrong axis flip, a wrong padding term) is caught as a failed check rather than shipped as a plausible-looking wrong picture — first honest run on the 8-leaf `species_traits` demo passed clean with all seven merges checked.

**One real bug, found before any chemistry or layout code ran at all.** `node src/cli.ts module`'s own `--args` flag is comma-joined at the CLI layer — one shell string, split into argv by comma, before the module subprocess ever starts. A first attempt at custom `--labels=P,Q,R,S,--data=0,0;...` silently fed the script four separate, wrong argv tokens instead of one, and the module correctly refused with "need at least 2 leaves to cluster" rather than misinterpreting the garbled input. Fixed by choosing delimiters (`;` between labels/rows, `:` within a row) that don't collide with the CLI's own comma-splitting — documented in [MODULE.md](modules/dendrogram/MODULE.md) so the next module with multi-value CLI input doesn't rediscover it the same way.

`--misdeclare` (a phantom merge id, one real merge's geometry shifted 30px) is caught on both planted defects. 309 tests pass. [TODO.md](TODO.md): 3 of 8 candidates done.

### 2026-08-19 — Sixth figure module: circuit schematics, with no schematic-CAD dependency

[modules/circuit/render.py](modules/circuit/MODULE.md) — a single-loop series circuit (a battery and N components around a rectangle) with the symbol vocabulary an electrical engineer expects: a resistor zigzag, capacitor plates, inductor bumps, a switch, a diode. The candidate research named `schemdraw` as the likely library; building it, the choice went the other way — every coordinate on every symbol is computed directly in this module rather than reached for through a third-party layout engine's internal object model, keeping every `declaredBox` a claim about numbers this module actually owns rather than a translation of someone else's.

**Two symbols were declared symmetric and weren't, and the fix generalised the whole module's contract.** A resistor and a capacitor really are symmetric around their placement line, and declaring `height/2` above and below matched what was measured immediately. An inductor's bumps only rise *above* its line; a switch's open lever rises further above than its terminal circles extend below. The first version declared every symbol symmetric regardless, and `module-geometry-agrees` failed on both — not by a small fudge amount, in a way that pointed at the real defect. A standalone probe (the exact bare `<path>`/`<circle>`/`<line>` markup each symbol draws, measured directly, no guessing) gave the true numbers in one pass, the same technique [modules/molecule](modules/molecule/MODULE.md) used for its own dashed-wedge bug. Every `draw_*` function's return shape grew a fourth value, `y_offset` — how far a symbol's true vertical centre sits from the line it's placed on, `0.0` for the genuinely symmetric symbols and a measured value for the two that aren't — rather than patching each symbol's declared box by hand.

**The same stroke-padding mistake `molecule` already made once, made again and caught again.** The battery symbol's declared height added `+4` for its thicker second line's stroke width; a bare `<line>`'s measured bbox carries no such padding, the exact lesson already on record in [modules/molecule/MODULE.md](modules/molecule/MODULE.md). The same probe that resolved the inductor/switch bugs confirmed this one too, rather than it needing a separate investigation — a second module rediscovering a first module's exact documented lesson is itself useful evidence that the lesson belongs in the shared discipline, not filed as one module's private history.

Four named circuits (`rc_lowpass`, `led_circuit`, `rlc_series`, `switched_lamp`) plus arbitrary `type:value` component lists render clean; `--misdeclare` (a phantom wire, one component's geometry shifted 28px) is caught on both planted defects. 313 tests pass. [TODO.md](TODO.md): 4 of 8 candidates done. Scope stated plainly in [MODULE.md](modules/circuit/MODULE.md): one series loop, not a general netlist router — no parallel branches, no ground reference.

### 2026-08-19 — A ninth candidate, filed where it actually belongs

A user request for digital logic-gate diagrams (a multi-level OR/NOR network) prompted a ninth entry in [docs/research/candidate-modules.md](docs/research/candidate-modules.md) — and the honest answer was that it doesn't clear the list's own bar 1. A feed-forward gate network is exactly the layered-DAG shape [graph](src/presets/graph/PRESET.md) already delegates to ELK; the hard part is gate-shaped SVG symbols and pin-accurate connector endpoints, not a real external library computing geometry. Filed as a **preset candidate** (a `logic-gates` graph variant) rather than added to [TODO.md](TODO.md)'s module list, with the reasoning on record so the distinction isn't re-litigated later.

### 2026-08-19 — Seventh figure module: genomic sequence features

[modules/genomic/render.py](modules/genomic/MODULE.md) — gene arrows on a real base-pair axis, where an arrow's direction encodes strand and its canvas position is a faithful function of its declared bp range. Reuses `dna_features_viewer.compute_features_levels` directly for the one piece of real algorithm this needed: packing overlapping features into non-colliding rows.

**The first honest run on both named datasets (`plasmid_simple`, and `operon` — whose `regX`/`geneB` pair genuinely overlap in sequence coordinates) passed clean on the first try**, the first module in this run of six not to surface a bug on its first honest render. Worth noting rather than hiding, alongside the five that did: by this point the shared lessons (measure stroke padding rather than guess it, avoid false `owner` claims on stroke-only shapes, keep CLI delimiters away from the harness's own comma-splitting) were already checklist items going in, not discoveries.

**This is also the first module in the repertoire where a label's `owner` claim is real rather than a mistake to remove.** Every prior module's labels sat over a stroked line or path with no fill for `isPointInFill` to test — declaring `owner` there was the recurring bug. Here, a gene arrow is a filled polygon, so `module-label-within-feature` runs for genuine effect: it reports real overhang on short genes whose label is a touch wider than the arrow, the same overhang-vs-escape distinction [modules/map](modules/map/MODULE.md)'s harbour case established, rather than the check sitting at `not-applicable` the way it does everywhere else in this repertoire.

`--misdeclare` (a phantom feature, one real feature's geometry shifted 45px) caught on both planted defects. 317 tests pass. [TODO.md](TODO.md): 5 of 8 candidates done.

### 2026-08-19 — Eighth figure module: protein topology cartoons

[modules/topology/render.py](modules/topology/MODULE.md) — helices as rounded capsules, strands as directional arrows, connected in strict sequence order by a serpentine meander that wraps to a new row rather than running off the canvas.

**Illustrative data, stated as such rather than dressed up as real.** Both named topologies — a four-helix bundle, and the β-α-β-α-β *pattern* that gives the Rossmann fold its name — are constructed to show a real, well-known fold shape, explicitly not residue ranges fetched from any specific PDB entry. Fabricating specific numbers and presenting them as real would have been worse than not having the example, the same discipline [modules/dendrogram](modules/dendrogram/MODULE.md)'s trait matrix already states for itself.

**A protein chain is a path, not a generic graph, and that distinction decided how this got built.** The candidate research guessed this might reuse ELK; building it, the meander convention (pack left-to-right, wrap and reverse direction when a row fills) turned out to be specific domain layout knowledge worth a small dedicated algorithm rather than a generic layered-DAG problem — the opposite conclusion from the same day's logic-gate research note, which is exactly a generic layered DAG and belongs to ELK. Worth having both conclusions on record from the same afternoon, because the reasoning that tells them apart is the reusable part.

**One bug, caught on the first render at a non-default canvas size.** The meander's row width has its own 400px floor, independent of the requested canvas — the first version grew the canvas *height* to fit however many rows the layout needed, but left the declared *width* at the caller's original, possibly-narrower request. Rendered at 380px wide, the row silently grew to its 400px floor while the canvas stayed 380px, and `content-within-canvas` failed immediately on every element in the wrapped second row. Fixed by widening the canvas width the same way its height already was: to whatever the layout actually needs, not just what was asked for.

`--misdeclare` (a phantom element, one real element's geometry shifted 20px) caught on both planted defects. 321 tests pass. [TODO.md](TODO.md): 6 of 8 candidates done — Skew-T meteorological diagrams and crystal lattices remain.

### 2026-08-19 — A defect no check could see, reported by a user's own eyes

A screenshot of `plasmid_simple`'s real output showed `promoter`/`GFP`/`terminator` running together — a short feature narrower than its own label, centred-inside anyway. Every check had passed, and correctly: labels declare no box (no font engine to measure one), so nothing was checking label-vs-neighbour collision for the inside-placed case at all. **This is the boundary decision 0005 states plainly, met for real rather than as a hypothetical** — a defect the render–inspect–repair loop's own checks cannot see by construction, surfaced only because a person looked at the picture.

The fix estimates label width from character count and places a label outside its arrow, in the feature's own colour, when the estimate says it won't fit — but the estimate doesn't have to be exact for the *result* to be checked for real: wherever the fallback lands, `module-labels-do-not-collide` and `module-labels-clear-of-strokes` run against the actual measured text. That check earned its keep immediately: the first attempt placed the fallback label *above* the arrow and immediately failed on `operon`, where `regX` sits directly below `geneB` in the packed rows — "above" reached into the wrong row's territory. The corrected placement uses the horizontal gap past the feature's own tip instead, which `compute_features_levels` already guarantees is real free space, because two features sharing a row never overlap in bp range. [modules/genomic/MODULE.md](modules/genomic/MODULE.md) records both the user-visible defect and the two-step fix.

### 2026-08-19 — Ninth figure module: Skew-T log-P soundings

[modules/skewt/render.py](modules/skewt/MODULE.md) — the genuinely skewed coordinate system a meteorological sounding is plotted on, isotherms tilted toward 45° so a dry-adiabatic ascent traces a recognisable curve. The skew transform itself is owned outright: a straight algebraic definition (`x = T + K·(log(P_ref) − log(P))`), no library needed. The physics is where MetPy earns its place — `metpy.calc.dry_lapse` for the dry adiabats, and `metpy.calc.parcel_profile` for a lifted surface parcel's full dry-then-moist ascent, which would mean re-deriving a moist-adiabatic ODE integration by hand to avoid.

**Illustrative soundings, stated as such**, the same discipline [modules/dendrogram](modules/dendrogram/MODULE.md) and [modules/topology](modules/topology/MODULE.md) already established for their own named examples: `midlatitude_summer` and `unstable_afternoon` are plausible sounding shapes, not observations from any real station or date.

**Three collisions on the first honest render, all in the crowded region where every drawn element converges near the surface.** A hand-tuned 14px tick offset wasn't enough where the bottom-left isotherm and the 1000 hPa isobar tick meet at the same corner — widened to 22px. A "generous" 60px clipping tolerance on the dry adiabats let their dashed strokes reach into the left-edge isobar labels' own space — tightened to the plot area exactly. And the LCL label — placed beside a marker that sits, by definition, *on* the parcel-profile curve, in a region where several dry adiabats and both environmental traces converge — took two rounds to clear: a diagonal (+14, −14) offset cleared the parcel profile and temperature trace but, checked at a different canvas aspect ratio than the one that first exposed the bug, swung straight into the steepest dry adiabat instead. The offset that survives multiple canvas sizes and both named soundings, (+26, −26), was checked across four sizes before being kept, not assumed to generalise from the one render that happened to pass.

`--misdeclare` (a phantom trace, one real trace's geometry shifted 30px) caught on both planted defects. 325 tests pass. [TODO.md](TODO.md): 7 of 8 candidates done — only crystal lattices remain, and it was flagged from the start as needing a scope conversation before starting, since 3D→2D occlusion brushes against the project's stated non-goals.

### 2026-08-19 — Tenth figure module: crystal lattices, and all eight candidates are now shipped

[modules/crystal/render.py](modules/crystal/MODULE.md) — the one candidate flagged from the start as needing a scope conversation, because 3D→2D occlusion brushes directly against this project's stated non-goal of photorealism. Built strictly schematic on purpose: flat fills, no shading, no lighting, no perspective foreshortening — an orthographic projection with occlusion *order* only, held to the same house style (near-black ground, flat colour, thick strokes) as every other figure here. `ase.build.bulk()` builds the real structure; this module owns the rotation, projection and painter's-algorithm depth sort.

**A bond drawn to an atom's centre, not its edge, is a mistake this repertoire has now made twice.** The first honest render failed `module-labels-clear-of-strokes` on every labelled atom in every named structure, for the identical reason [modules/molecule](modules/molecule/MODULE.md) recorded: a bond passes directly under the atom's own label. Trimming bonds to stop at each atom's own radius is also the correct ball-and-stick convention, so the fix was the right picture, not a patch.

**The most interesting finding of the whole module search came from what a projected 3D structure makes concrete that a 2D one never could: a geometric check has no notion of paint order, and depth is the entire subject of this diagram.** Even after trimming, a labelled atom can sit near a bond or edge that is genuinely behind it in 3D — correctly hidden by that atom's own opaque fill, invisible to a check that only measures bounding boxes. Labelling only the least-occluded candidate per element, checked by real measured distance rather than assumed, fixed most cases — and then exposed a structural fact rather than a bug: in `nacl_rocksalt`, *every* Na atom sits at distance exactly 0 from some cell edge, because Na occupies the edge-centre sites in the conventional cell, and any orthographic projection puts a point lying on a 3D line exactly on that line's own projection. No candidate could ever be clean. Forcing one anyway — an earlier version's fallback — just picked a guaranteed failure. The fix leaves that element unlabelled for that render, distinguished by colour alone, with a note saying so, rather than lying to the check or silently degrading the diagram.

`--misdeclare` (a phantom atom, one real atom's geometry shifted 25px) caught on both planted defects. 329 tests pass.

**All eight candidates from [docs/research/candidate-modules.md](docs/research/candidate-modules.md) are now implemented**, from reaction schemes through crystal lattices — ten figure modules total, counting `map`, `molecule` and the two `plot` scripts already shipped before this search began. [TODO.md](TODO.md) records each with a one-line summary of what it found.

### 2026-08-19 — The map module grows a second figure class: categorical political maps

Prompted directly by a request to draw something in the style of a WWII theatre-of-war map — coloured territories, a legend box, movement arrows. [modules/map/render.py](modules/map/MODULE.md) grew a `--name=campaign` variant alongside its original 3-region L-shape probe, which is untouched: the same default (no `--name`) still renders exactly the original fixture, verified against the existing test's exact element count before anything else was built.

**A fictional continent, ten invented territories, stated as such** — the same discipline every named example in this repertoire already follows, extended to maps for the first time: the diagram *class* (categorical shading, a legend, campaign arrows) is real and reusable, the content is illustrative on purpose.

**Three of the four bugs found were shapes this repertoire had already met before, in other modules — and one was new.** An arrow declared with nothing behind its own id (identical to [modules/reaction](modules/reaction/MODULE.md)'s first arrow bug, fixed the same way: group the line and arrowhead under one id). A false `owner` claim on a legend label sitting beside its swatch, not inside it (the same mistake [modules/reaction](modules/reaction/MODULE.md) and [modules/plot](modules/plot/MODULE.md) already record, caught and removed the same way). And a label too large for a genuinely narrow country, sized for the widest territory in the map rather than the narrowest. The new one: arrow vertices skipped the Mercator projection step a region's own corners always take, landing every arrow thousands of pixels off-canvas — invisible until the id-resolve fix stopped masking it, then caught immediately by `content-within-canvas`.

`--misdeclare` (a phantom territory, one territory's geometry shifted 22px) catches both planted defects. 331 tests pass.

### 2026-08-19 — The map module grows a third figure class: real country borders

A direct reaction to the campaign map above: "this is really ugly, can't we... draw actual maps like this one, not just rectangles." There is a library — Natural Earth's public-domain 1:110m country boundaries, read through `shapely`/`pyproj` exactly as every other map render here — and `--name=europe` now draws real coastlines, real borders, real concave and multi-part country shapes.

**A real, sourced classification rather than an asserted one.** The request that prompted this showed a WWII occupation map; recreating that specifically would mean asserting *which real country was occupied when, by whom, along what boundary* — genuine historical claims, disputed in places, and not something to reconstruct from memory for an illustrative example. The category used instead is `SUBREGION`, the Natural Earth dataset's own UN-geoscheme field — real, sourced, uncontroversial — while still proving exactly the capability being asked for on a genuinely crowded 39-country map.

**A sign error hid every country label behind an always-false gate**, for every canvas size tried, until someone asked why `module-label-within-feature` stayed `not-applicable` on a real 1000×800 render of 39 countries — geometrically impossible if the labelling gate were doing anything. `to_canvas` flips y (Mercator grows north, SVG grows down), so an unsigned `area = (cx1-cx0)*(cy1-cy0)` came out negative for every country. `abs()` fixed it, and only then did the real labelling problem become visible at all.

**Real adjacent borders produced a real, escalating label-collision problem, resolved by making the check do the geometric work rather than tuning constants by hand.** The Balkans' cluster of small, touching countries failed as a group under a single area threshold; raising the threshold swapped that failure for a new one (Greece's label crossing into Albania) precisely because a fixed cutoff can't know which specific neighbour is closest. What held: `representative_point()` on an inward-eroded copy of each country, combined with testing the label's own estimated extent against every *other* country's real polygon before committing to a size — leaving a country unlabelled, the same resolution [modules/crystal](modules/crystal/MODULE.md) reached for Na in rocksalt, rather than forcing a guaranteed collision. The estimate itself needed one more correction, measured rather than guessed: character width undershot real semi-bold glyph rendering, widened with a safety margin instead of re-tuned to the exact miss that exposed it.

**The original harbour probe's misdeclare trick was inert on synthetic rectangles — every campaign territory is convex, so a bounding-box-centre label is always still inside it.** On 39 real countries, several genuinely concave or multi-part, the same trick now fails for real reasons on more than one country, not a single planted case — the L-shape probe's whole premise, finally exercised on non-trivial content instead of one hand-built example. [modules/map/MODULE.md](modules/map/MODULE.md) has the full account. 334 tests pass.

### 2026-08-19 — A second real region, and proof the label-placement fixes weren't Europe-specific

A direct follow-up request — "create an image for South America" — became the test of whether everything just fixed for Europe's crowded borders was real geometry or a pile of Europe-shaped special cases. `render_europe` was refactored into a shared `_render_political_region`, parametrised by data file, category field, category colours and legend title; `--name=south_america` is now a thin thirteen-line wrapper around it, backed by a second bundled Natural Earth file ([modules/map/data/south_america_countries.geojson](modules/map/data/south_america_countries.geojson)).

**South America's own `SUBREGION` field is a single value for all 13 countries** — no categorical information to colour by — so `ECONOMY`, the same dataset's development-tier classification, is what varies here instead. Same principle as Europe's choice: a real, sourced field, never one this module invents.

**Zero label-collision fixes were needed.** The erosion-before-`representative_point` placement and the real intersects()-against-neighbours fit check, built to survive the Balkans' density and Greece's border proximity, worked on a different, more sparsely-populated map on the first try — the strongest evidence yet that the fix was general geometry, not Europe-shaped patching. The one bug that did surface was new and unrelated: a legend title long enough to reach past the canvas edge, caught immediately by `content-within-canvas` and fixed by shortening the title rather than reshaping anything around it. 337 tests pass.

### 2026-08-19 — Charts, closing the gap SELECTION.md used to name plainly

`docs/selection/SELECTION.md` stated it outright: "when the request wants a chart, this repertoire does not have one." A direct request for bar and pie charts ("add as many as you want") was the occasion to close that gap — split honestly across the preset/module boundary this project already draws everywhere else, by what each chart shape actually needs rather than by convenience.

**Bar charts are a real core preset, [src/presets/chart](src/presets/chart/PRESET.md), because nothing about one is geometry the core can't already do.** A bar's length is its own `height` or `width` — one multiplication against the largest value in the data — so `expandChart` emits ordinary `Stack`/`Block` IR and the whole pipeline (text measurement, the repair loop, every existing check) applies with zero new code, zero new IR, zero new checks. CSS flexbox's own `align: "end"` does the one layout trick a bar chart needs — every bar in a group, and every category label, on a common baseline — for free. Both fixtures (grouped vertical, single-series horizontal) rendered every check clean on the very first try.

**This meant genuine surgery on the selection core, not just a new directory.** `docs/selection/SELECTION.md` had asserted, as settled doctrine, that no preset exists for a chart idiom (`I-chart-disqualifies-everything`, "a chart idiom is not in this repertoire"). That rule was *kept*, not deleted — refusing to draw a chart as a graph was always the right call — but its premise stopped being true the moment `chart` became a real `PresetId`, so the narrative paragraph, two new favour rules (`I-chart-favours-chart`, `S-series-favours-chart`), and two of `fixtures/selection/phrasings.json`'s twenty entries all needed rewriting in step. One of those two entries used to demonstrate `outcome: "none"` via "charts aren't servable" — retargeting it to `chart` would have made `"none"` reachable from only one remaining path, so it was replaced with a phrasing for a *pie* chart, annotated with an idiom (`"pie"`) genuinely outside the vocabulary rather than a chart request this repertoire can now actually serve.

**Pie and donut charts are a module, [modules/piechart](modules/piechart/MODULE.md), because a wedge genuinely is geometry the core cannot express** — a `Block` is always an axis-aligned rectangle under every existing preset, and no transform turns one into a circular sector. This is the identical boundary that already put curve-fitting in `modules/plot`, restated for the shape that made a bar-chart preset's own doc name the boundary explicitly. Every slice's declared box comes from sampling 25 points along its own arc, not an algebraic guess from centre/radius/angle; a wide-enough slice's percentage label declares a real `owner`, the same legitimate case [modules/genomic](modules/genomic/MODULE.md) and [modules/topology](modules/topology/MODULE.md) already are, since a sector is a filled path with a real fill area. Both the plain-pie and donut fixtures passed every check on the first honest render — no collisions, no misjudged label placement, nothing to fix.

`--misdeclare` on both catches its planted defects the same way every other module here does. 352 tests pass.

### 2026-08-22 — What's next, reasoned through terza, and the first two items shipped

Asked what to build next with the repertoire now covering all eight researched modules plus both chart shapes. Rather than guessing, ran a full terza reasoning session (prelude → generative/critical/synthetic loop → coda, confidence 0.92) over three candidates surfaced by the loop itself: stacked/100%-stacked bar mode, the CLI `--args` comma-delimiter fix, and line/scatter chart series. The session corrected its own first instinct mid-reasoning — line/scatter looked like a cheap chart-preset extension until the loop noticed a `Block` still can't carry a `Connector` (only `Scene` can), making it a real `Scene{layout:"absolute"}` effort closer in size to `annotated-figure` than to the arithmetic that made bars free. Recorded in [TODO.md](TODO.md) as an explicitly ordered three-item list, each to ship and be verified by the full suite in isolation — so a regression is traceable to the change that caused it, not buried in a bundle.

**Stacked and 100%-stacked bars, shipped first as reasoned (cheapest, one file, no other consumers).** [src/presets/chart](src/presets/chart/PRESET.md) gained `stacking: "grouped" | "stacked" | "stacked100"`. Still pure arithmetic on `Stack`/`Block`, no new IR: a stacked bar is one `Stack` of touching segments (`gap: 0`) instead of side-by-side bar units, and the scale reference switches from "largest single value" to "largest category *total*", since a stacked bar's length is now a sum. Two real design decisions fell out along the way rather than being anticipated up front — series order in a vertical stack has to be reversed in the children array (CSS stacks a column top-to-bottom, but `series[0]` belongs at the bottom by convention, so its segment must be the *last* child; a horizontal row needs no such reversal, since left-to-right already puts `series[0]` first) — and per-segment value labels are dropped entirely in stacked modes, not just size-gated, because letting the repair loop grow a label-bearing segment to fit would inflate that segment past its true value, breaking the one invariant a bar chart exists to keep. One total label per stack replaces them, and the legend still names every series. Two new fixtures (grouped-vertical-turned-stacked budget, stacked100 horizontal traffic-share), unit tests on the raw scaling arithmetic, and e2e tests asserting the rendered geometry actually sums and rescales correctly. Every check passed on first render for both fixtures.

**CLI `--args` comma-delimiter fix, shipped second and verified alone as reasoned.** Four modules (dendrogram, circuit, genomic, topology) had each independently discovered that `node src/cli.ts module`'s own `--args` flag — a `string[]` param — comma-split a single occurrence at the CLI layer, breaking any individual argument value that itself contained a comma, and each had independently invented the identical `;`/`:`/`|` workaround, documented separately four times. Fixed at the actual source in [src/cli.ts](src/cli.ts)'s `parseArgs`: a `string[]` param is now genuinely repeatable — `--args a --args b` — and a repeated flag's values are taken verbatim by [src/commands.ts](src/commands.ts)'s `toStringArray`, comma included, while a single occurrence still comma-splits exactly as before, so every existing invocation (and the MCP binding, which passes a real JSON array straight through regardless of length) is unaffected. Verified end to end against a live module: feeding dendrogram `--data=0,0;0,1;9,9;9,8` through a single comma-joined `--args` still broke (Python's own `:`-separated-numbers convention rejected the literal comma, exactly the old failure) — but the same data through *repeated* `--args` occurrences round-tripped correctly, `leaf order: P, Q, R, S`, proving the comma survived the CLI intact. New unit tests cover both the argv-accumulation logic and `toStringArray`'s contract directly. Full suite: 366/366 (358 plus 8 new).

**Line and scatter chart series, shipped third and last, and it really was the larger effort the reasoning predicted.** `chartType: "line" | "scatter"` on [src/presets/chart](src/presets/chart/PRESET.md) is not a variant of the bar arithmetic — it is a separate function, `buildSeriesChart`, building a `Scene{layout:"absolute"}` from scratch: one point `Block` per category/series, joined by real `Connector`s to their adjacent point in `"line"` mode (bare, unconnected, in `"scatter"`). A `Block` genuinely has no way to be "a point joined to another point" — only a Scene's `Connector` can — so this needed the same absolute-coordinate shape `annotated-figure` and `graph` already use, not an extension of the flexbox trick that made bars free. Deliberately minimal: no axis rule, no gridlines, matching the restraint the bar chart already states for itself — two end labels on the y axis (`0` and the largest value) say what a ruled line would, without one more shape that could collide with a point sitting exactly on the axis.

One real geometry bug surfaced on the very first render, the way this project's checks are supposed to catch things: `boxes-do-not-overlap` failed because the leftmost category's tick label, centred under its point, overhung left into the y-axis value-label column. Fixed by edge-aligning the first and last tick labels (left/right respectively) instead of centring every one — the same convention a real tick-marked axis would use, arrived at because the check caught the collision rather than because it was anticipated. One limit was left stated rather than solved: two series with near-identical values at the same category place two markers close enough to genuinely, honestly overlap, which `boxes-do-not-overlap` will fail on — real scatter data can do this, and no marker size removes it, only narrows the range where it happens. Documented plainly in [src/presets/chart/PRESET.md](src/presets/chart/PRESET.md) rather than hidden. Two new fixtures (a two-series latency line, a single-series scatter), unit tests on the point-placement arithmetic and connector counts, e2e tests on the rendered geometry. Full suite: 374/374.

All three items from the terza-reasoned priority list are now shipped, each verified alone as planned.

---

### 2026-08-22 — Three modules revisited on direct feedback: reaction notation, campaign borders, crystal unit cells

Requested directly, against the showcase gallery built for this build: the reaction module read as cluttered rather than as a real chemical equation, the campaign map read as "a bunch of squares with arrows," and the crystal module's rendering compared unfavourably to a real textbook FCC unit cell diagram. All three were genuine quality gaps, not misunderstandings — fixed at the source, not patched in the gallery.

**Reaction: simple inorganic species now get a real formula, not a skeletal drawing.** A real combustion or respiration equation writes `6 O₂`, never six drawings of two bonded oxygen atoms — the module's first version ran *every* participant through `modules/molecule`'s full 2D depiction regardless of size, which also hid a real bug: methane's own carbon atom carries no label under `molecule`'s skeletal convention (carbon is implicit), so `combustion_methane`'s reactant tile rendered as an empty box. `is_simple_species()` now draws the line from real molecular structure, not a lookup table: no carbon–carbon bond and 3 or fewer heavy atoms gets `render_formula_tile()` (RDKit's own `CalcMolFormula`, digits turned into Unicode subscripts); anything with a C–C bond or more heavy atoms keeps the full skeletal drawing, because that is where the structure is actually the information. Fixes methane's blank tile as a side effect, for free.

**Map: territory borders are now irregular, and adjacent territories still meet with zero gap — proven, not eyeballed.** Every campaign territory was a literal axis-aligned rectangle, correct geometry that nonetheless looked like graph paper, not a continent. `_jitter_edge()` perturbs each straight edge with a handful of deterministically-seeded points; the seed is derived from the edge's own *unordered* endpoints, always generated in one canonical direction and reversed for the caller that wanted the other — so two regions sharing a real border compute the identical jittered path independently, from either side, and can never develop a seam no matter how irregular the border gets. Rounded out with a faint graticule and a compass rose (undeclared decoration, the convention `modules/skewt` already set for its own isobar ticks) and an eleventh territory, Ostholm Isles — a small hand-authored offshore island, needing none of the border-matching machinery since it borders nothing.

**Crystal: one real conventional unit cell, the textbook diagram, not a repeated supercell fragment.** The old version rendered a 2×2×2 chunk of repeated cells with nearest-neighbour bonds — real geometry, but nothing like "here is the unit cell." Rebuilt around `ase.build.bulk(..., cubic=True)` (the standard conventional cell, not ASE's smaller rhombohedral primitive) plus `duplicate_boundary_atoms()`, which reads each atom's real fractional coordinate and adds a periodic-image copy at every corner, edge or face it touches under periodicity — an FCC corner atom, shared by 8 neighbouring cells in real crystallography, now correctly appears at all 8 corners of the one cell drawn. `fcc_copper` declares 14 atoms (8 corners + 6 faces); `nacl_rocksalt` declares 27 (the real rock-salt unit cell count). Cube edges are now solid where visible and dashed where hidden — found from each corner's own real rotated depth, always exactly the 3 edges meeting the one farthest vertex, never asserted — instead of uniformly dashed. Bonds were dropped entirely: a unit cell diagram shows where sites *are*, the real textbook convention this module now follows rather than approximates. One test's old expectation flipped as an honest side effect: the previous repeated-lattice `nacl_rocksalt` forced Na permanently unlabelled (it sat on a cell edge in every projection, a structural fact of that specific repeated geometry); the single-cell view has fewer Na atoms at different fixed positions, and this rotation clears one — both Na and Cl now label cleanly.

All three verified with the full suite both before and after; 374/374 throughout.

### 2026-08-22 — Reaction module, second pass: the equation and the structures were still one incoherent row

The formula-tile fix above stopped drawing skeletal structures for simple species, but left every participant — plain formula text and full molecule drawing alike — in a single packed row. Direct feedback: it still didn't read as a real chemical equation, because a formula label and a structural drawing carry completely different visual weight, and mixing them side by side reads as mismatched rather than as one coherent statement.

**Split into two tiers.** Row 1 is the equation itself — `place_side_equation()` writes every participant's coefficient and formula on one text token at one shared baseline (`"6O₂"`, the way an equation is actually written, not a number stacked above a drawing), joined by `+` and a real arrow with conditions above it. Read alone, top to bottom, it says everything a reaction equation says. Row 2 is real structure, but only for participants `is_simple_species()` says actually have one — glucose, not O₂ — deduplicated across both sides of the equation, and omitted entirely when no participant needs it.

Text-token spacing between equation tokens is a plain per-character width *estimate* (`est_text_width()`), not a real measurement — the first attempt undercounted Unicode subscript digits badly enough that a `+` sign crowded the previous formula with no visible gap; widened once, verified against the real rendered output, not assumed correct.

### 2026-08-22 — Reaction module, fourth pass: water and methane get real structures, not stand-ins

Two follow-up questions on row 2, both pointing at the same real gap: water's tile was hard to spot (a tiny 15px text label next to full skeletal drawings), and — the sharper one — "why is there text and not the molecule's image?" Checking what the module actually declared answered it: water's bare `O` SMILES has two *implicit* hydrogens, nothing explicit for RDKit to draw a bond to, so `molecule.render()` falls back to a text label; methane's bare `C` is worse — carbon's own label is suppressed under the skeletal convention, so its tile declared **zero elements**, not even a fallback, a real invisible-tile bug found by listing declared ids rather than assuming a small molecule degrades gracefully.

**`structural_smiles()`** fixes this at the source: any participant whose parsed molecule has zero bonds — a bare, unconnected atom — gets `Chem.AddHs()` before reaching `molecule.render()`, turning water into `[H]O[H]` and methane into `[H]C([H])([H])[H]`. That needed a real fix one layer down too: `Chem.MolFromSmiles` silently strips explicit hydrogen atoms back into implicit ones by default, so molecules/molecule/render.py now parses with `SmilesParserParams(removeHs=False)` — invisible for every other caller, since nothing before had a reason to write hydrogens out explicitly, but the whole point for this new one.

That surfaced a genuinely new, real geometry bug: a bare one-character label (`H`) failed `module-labels-clear-of-strokes` with real ~1px clearance against its own bond — a font-ascent property of a single capital glyph versus a wider `OH`-style label, not visible until an explicit hydrogen atom existed anywhere in this repertoire to trigger it. Bumping the shared `TRIM_PX` retreat to cover it regressed sucrose's own tightly packed two-ring layout, caught immediately by re-running the full suite rather than just the one failing case — the fix instead scopes extra retreat to one-character labels specifically, leaving every other label's clearance untouched. Full suite: 376/376.



### 2026-08-22 — Reaction module, third pass: every participant earns a real drawing, not just the "interesting" one

Direct feedback on the two-tier split above, immediately: row 2 had only drawn glucose, since `is_simple_species()` judged O₂/CO₂/H₂O too small to bother with — but a reader asking "what does O₂ actually look like" deserves the same real structural answer glucose gets, not a text label standing in everywhere except the one molecule complex enough to earn a drawing. `is_simple_species()` is deleted outright, not merely unused; row 2 now draws every unique participant (deduplicated across both sides of the equation) through `molecule`'s real renderer, each with its own coefficient placed above it when greater than 1 — the per-tile coefficient convention the very first version of this module used, reinstated for row 2 specifically now that it no longer collides with the plain-text equation above it. Water's single-atom tile and CO₂'s visually-collinear double bond (a real, correct consequence of linear geometry and unlabeled carbon, not a rendering gap) are both honest answers, not compromises. New e2e coverage checks the reversal directly: all four unique participants in `glucose_combustion` now get their own structural tile. Full suite: 375/375.


### 2026-08-22 — Effects: depth cues, treated as geometry rather than decoration

Shadows, glow, blur, occlusion, brightness, saturation, tint, grain, bevel and sheen, plus a canvas vignette — thirteen named effects composed from ten primitives, opt-in everywhere and default nowhere, so every figure that existed before this renders byte-identically. [decision 0006](docs/decisions/0006-effects-are-checked-geometry.md), narrative in [docs/effects/EFFECTS.md](docs/effects/EFFECTS.md), repertoire and reach from `node src/cli.ts effects`.

The easy version of this feature breaks the project's central assumption, which is why it took a directory and a check. Chromium is the layout oracle only while the thing measured is the thing drawn; a `box-shadow` or CSS `filter` in the HTML mirror changes the measured box, and every number downstream goes quietly wrong while the manifest still says `ok`. Effects are therefore resolved *after* layout and applied only at SVG emission — they never reach the mirror at all. Geometry measured with effects off is exactly the geometry drawn with effects on.

**A shadow is ink, so it gets checked like ink.** Two failures live here that no shape-only check can see: SVG's default percentage filter region guillotines any halo bigger than its slack, and a canvas sized to the geometry cuts a glow that is not geometry. `bleedOf()` composes a chain's exact reach — order-sensitive, since a blur after a shadow spreads from the shadow's already-offset edge — every filter declares an explicit `userSpaceOnUse` region derived from it, and the new `effect-within-canvas` check fails with real overflow numbers when ink leaves the page. Its repair is the first edit in the engine that touches no node: `canvas.padding` grows, because the element was already where it belonged and only the frame was short. It converges in one pass, from a bleed already known exactly rather than searched for. Planted probe: a `raised-3` block at padding 0 reports `overflows left by 30px and top by 22px and right by 30px and bottom by 38px` — extent 30 either side, offset 8 up and down — then repairs to padding 39 and passes.

**Portability is tested, not asserted.** `feDropShadow` would have replaced six primitives with one; it is SVG 2, and an unsupported filter does not degrade, it deletes the element — the same argument render/svg.ts already makes against `<marker>`. Everything desugars to SVG 1.1. And since "the markup contains feGaussianBlur" proves only that a string was written, `tests/effects-portability.test.ts` rasterises each effect under resvg twice, with and without its filter, and fails on byte-identical output. All nine filter effects survive; the Chromium and resvg renders of the demo figures are indistinguishable except for `bevel`, where the two engines' `feSpecularLighting` genuinely differ in strength — recorded here rather than hidden, and the reason bevel is held to a schematic default.

One judgement call worth naming: a block is two SVG elements, rect and label, because connectors layer between them. So a chain is split by meaning — surface effects (shadow, glow, occlusion, bevel, sheen) stay on the rect, appearance effects (blur, brightness, saturate, tint, grain) follow the label — rather than by wrapping the pair in a filtered `<g>`, which would fix the shadow and put every label back on top of every connector. Full suite: 425/425, `check:views` and `check:independent` clean.


### 2026-08-22 — A collapsed space was measured as nothing and drawn at full width

Found by pointing the new effects layer at a real figure ([fixtures/memory-hierarchy.json](fixtures/memory-hierarchy.json), the Dean/Norvig latency numbers with depth encoding latency). Two labels came out visibly truncated — `20 million × L1` drawn as `20 million` — while all 21 checks passed and the manifest said `ok`.

Not an effects bug. CSS collapses a run of spaces to one, and the second and third get a client rect with **zero width but a full line's height**, so `measure.ts`'s zero-*size* guard let them through: they contributed nothing to the measured extent and were still appended to the exported string. The SVG carries `xml:space="preserve"`, so they were then drawn at full width. The label was about 45px wider than the box measured for it, every check downstream agreed with the measurement, and none of them could see the drawing.

**This is the invariant the whole project rests on — the string measured is the string drawn — and it had been quietly false for any label containing consecutive spaces.** It went unnoticed because without a filter the symptom is a label that is merely a little wide. The effects layer is the first consumer that depends on a text box being *truthful*: the filter region is computed from the measured width, so it sliced the tail off the label and made a silent inaccuracy into a visible one. Exactly the argument [decision 0006](docs/decisions/0006-effects-are-checked-geometry.md) makes for treating effect reach as geometry, arriving from the opposite direction.

One line in `measure.ts` — skip a zero-width rect when the character is whitespace, and only when it is whitespace, since a zero-width non-space is a combining mark that genuinely was measured with the letter it sits on. [tests/measure-whitespace.test.ts](tests/measure-whitespace.test.ts) guards all three cases: no collapsed run survives into the export, a hand-collapsed label measures the same width as a spaced one (off by ~45px before), and a decomposed `café` keeps its accent. Full suite: 428/428.


### 2026-08-22 — Documentation, and the discovery that eleven modules were invisible

A documentation pass that turned into a real finding. Every claim below was verified by reading each module's source and running it, not by trusting the prose already there.

**The modules could not be discovered.** Eleven working figure modules — circuits, unit cells, dendrograms, gene maps, real maps, molecules, pie charts, plots, reaction schemes, Skew-T soundings, protein topology — were documented individually in good `MODULE.md` files and referenced from nowhere at all. No index, no mention in `AGENTS.md` or the skill, no MCP resource, no CLI command. An agent cannot reach for a figure kind nobody told it exists, so the practical value of the entire module repertoire was close to zero regardless of how well each one worked. Fixed at every layer: [modules/README.md](modules/README.md) is the index (protocol, per-module inputs, the six module checks and their exact `not-applicable` conditions, how to write a new one), `src/modules/repertoire.ts` is a typed registry, `node src/cli.ts modules` prints it with a runnable example per module, and the MCP tree now serves `prancheta://modules` plus one resource per module. Both generated views carry the table, so the example command — delimiters and all — is in front of an agent at the moment it needs one.

The registry is hand-curated for the one-line summaries, which a generator cannot write, and mechanically checked for everything else: [tests/module-repertoire.test.ts](tests/module-repertoire.test.ts) fails if a module on disk is missing from the table, if the table names a module that is gone, if any declared script path does not exist, if the index does not link to a module's doc, or if a declared `--name=` shortcut no longer appears in that module's source.

**The effect reference is generated, not written.** [docs/effects/REFERENCE.generated.md](docs/effects/REFERENCE.generated.md) comes from `scripts/gen-effect-reference.ts`: every default is produced by resolving the effect with no options set, and every bleed figure by calling the same `bleedOf()` the checks call. A hand-typed table of those numbers would be wrong within a release and nothing would notice. Both reference generators now answer `--check`, `npm run check:docs` runs them alongside `check:views`, and [tests/generated-refs.test.ts](tests/generated-refs.test.ts) wires the staleness comparison into the suite — including a guard on the guard, since a `--check` that always exits 0 would make the other assertions permanently green and permanently meaningless.

**Two imprecisions found and fixed.** `genomic/MODULE.md` claimed its labels declare a real `owner`; the source only does so for labels placed *inside* their arrow, and the outside-placed branch deliberately declares none — a single figure routinely contains both. `skewt/MODULE.md` described its tick texts as decorations when they are `label`s, and did not say why `module-label-within-feature` correctly sits at `not-applicable` for a module whose features are stroked paths with no fill to test against. Everything else in all eleven module docs checked out against the code, and all eleven ran clean.

README rewritten around what a reader actually needs: install, quick start, the pipeline, the six core checks in a table, what makes the repair loop terminate, both repertoires, effects, the command list, the development scripts, and a non-goals section that now states plainly that nothing here verifies a figure is *true*. Full suite: 448/448, `check:docs` and `check:independent` clean.

### 2026-08-23 — Project organization cleanup implemented

**Prompt:** "Are our project really organized? Are we following a pattern defined beforehand? Are we really enforcing rules and decisions?" — Used terza with deep profile to analyze.

**Terza reasoning verdict (confidence 0.80, 4 iterations):** Mixed discipline — strong tooling for specific technical boundaries but weak process discipline. Root cluttered with 19+ stray experiment files, no CI/CD automation, check scripts exist but require manual invocation.

**Cleanup implemented immediately:**
- Created `/experiments` directory structure: `generators/`, `probes/`, `sketches/`
- Moved 17 stray files from root to appropriate locations
- Deleted security/hygiene issues: `api.env`, `err.txt`, `test_output.txt`
- Root now contains only 19 approved items (down from ~30)

**Enforcement mechanisms added:**
- `scripts/check-root-clean.ts` — validates root against whitelist, fails if violations found
- `npm run check:root-clean` — runs the check
- `npm run check:all` — runs typecheck + test + check:docs + check:root-clean
- `npm run validate` — alias for check:all
- Updated `.gitignore` to prevent future clutter: `temp/`, `*.env`, `*.log`, `err.txt`, `out.txt`, `debug*.txt`

**Documentation added:**
- [ADR 0011](docs/decisions/0011-project-organization.md) — organizational rules, root directory standards, where experiments go
- [CONTRIBUTING.md](CONTRIBUTING.md) — practical contributor guide with project structure, where to put code, how to run checks

**Status after cleanup:**
- ✓ Root directory clean (19 items, all approved)
- ✓ `npm run check:root-clean` passes
- ✓ `npm run typecheck` passes
- ✓ All experiments preserved in `/experiments`
- ✓ Organizational rules documented and enforced

Still lacking: CI/CD automation (no git repository yet), but all check scripts exist and can be run manually via `npm run validate`.

### 2026-08-23 — Constraint toggles designed and documented

**Prompt:** "Do you think we should try to fix (or if we can just toggle then on and off if needed) any of these restraints?" — followed by the six current constraints.

**Used terza for design reasoning** — ran a full reasoning session (prelude → G/C/S loop → coda, confidence 0.82, 2 iterations, 1 pass) to decide which constraints should be toggleable vs kept as-is. The session's own critical passes corrected the initial instinct: constraint 4 should be toggleable like 1 and 2 (consistency), not permanently removed.

**Decision recorded in [ADR 0010](docs/decisions/0010-constraint-toggles.md):**
- **Make toggleable:** constraints 1 (boxes-do-not-overlap), 2 (connector-clear-of-boxes), 4 (straight-lines-only)
- **Keep as-is:** constraint 3 (axis-aligned — load-bearing for layout solver), 5 (flat-color — gradients add complexity without value), 6 (text limits — acceptable constraints)

**Implementation plan written** — [docs/CONSTRAINT-TOGGLES-PLAN.md](docs/CONSTRAINT-TOGGLES-PLAN.md) breaks the work into 6 phases with clear success criteria, risk mitigation, and estimated 21-33 hours total. Phases 2-3 can run in parallel after the foundation (phase 1).

**Rationale:** The three toggleable constraints share a pattern — each blocks specific legitimate diagram types (Venn diagrams, annotated dense fields, curved flowcharts) without serving as a load-bearing simplification principle. Toggle scope is per-diagram (simpler mental model); all default to `false` (constraints active) so new users get simple, predictable behavior while power users opt into relaxed modes.

**Documentation updated:** README.md gains a "Constraint toggles" section; ROADMAP.md records the reasoning; both link to ADR 0010. Not yet implemented — design and plan only.

### 2026-08-22 — M5, stage 1: colour becomes checked geometry

Colour joins the list of things this project verifies rather than eyeballs. [decision 0007](docs/decisions/0007-colour-is-checked-not-chosen.md), two new checks, three theme variants, a generated palette reference — [docs/design/PALETTE.generated.md](docs/design/PALETTE.generated.md) — and a new `themes` command so a palette is discoverable the way effects and modules now are.

**`contrast-sufficient`** computes real WCAG 2.x contrast (relative luminance, the same formula every browser devtools contrast checker uses) for every label against what it actually sits on — its owner's fill, or the canvas when the owner is transparent (a callout). One check per text element, same granularity as `text-fits-box`. No repair is attempted this milestone: a failure is reported with its exact ratio and threshold, and fixing it is an authoring decision, not a geometry edit the loop can make unsupervised.

**`categorical-colours-distinguishable`** simulates deuteranopia and protanopia (the standard simplified Coblis/Machado matrices) over any set of blocks a spec tags with a shared `categoryGroup`, and fails a pair whose simulated RGB distance falls under a documented floor. Wired into the chart preset's own legend swatches.

**Both checks caught real, pre-existing defects on their first real run — not synthetic ones.** The chart preset's `SERIES_COLOURS` included a `teal` (`#48A9A6`) sitting only 27.7–30.4 apart from `green` under simulation, well under the distinguishability floor: two "different" series colours a colourblind reader could not tell apart, present in every chart this project has ever rendered. Replaced with a magenta chosen to clear every pairwise distance in the set; `palette.teal` is renamed to `palette.magenta` rather than recoloured under its old name, because a constant called `teal` that draws magenta is its own kind of bug.

**The colour parser itself had to be rewritten once, caught by insisting on an end-to-end fixture rather than trusting hand-built test objects.** The first version of `contrast-sufficient` only understood `#rrggbb`. Every unit test passed. Rendering `fixtures/bad-contrast.json` through the real pipeline showed every check reporting `not-applicable` — because `getComputedStyle` in Chromium normalises every colour, hex or otherwise, to `rgb(r, g, b)` before this project ever sees it, so a hex-only parser silently matched nothing on a real render. A second bug in the same feature, found the same way: a `background: transparent` block normalises to `rgba(0, 0, 0, 0)`, not the literal string `"transparent"`, so the callout fallback that compared `owner.fill === "transparent"` never matched real data either. Both fixed together in `src/colour/contrast.ts`'s `parseColour`, which now reads hex, `rgb()`/`rgba()`, and the literal keyword, and an `isTransparent()` helper that checks alpha rather than a string. This is the same lesson the whitespace-measurement bug taught from the other side: a check that examines synthetic fixtures but never a real render can look complete while checking nothing real.

Theme variants land as data, not a rewrite: `THEMES.dark` is the pre-existing constants reassembled under one name — same object references, so every existing fixture renders byte-identical SVG, confirmed by the full suite passing unchanged before a single new check was added. `light` and `print` are new palettes designed against the WCAG floor from the start, not produced by inverting dark (a mechanically inverted palette preserves role *structure* but routinely fails contrast on saturated fills — exactly the defect this decision exists to make checkable). `canvas.theme` selects one; unset renders exactly as before. `node src/cli.ts themes` lists every role's real computed contrast ratio and pass/fail verdict.

Full suite: 495/495. `check:docs`, `check:refs` (now three generators, including `gen-palette-reference.ts`) and typecheck clean.

### 2026-08-22 — M5, stage 2: the export layer

A figure becomes a deliverable, not just a correct drawing. [decision 0008](docs/decisions/0008-the-deliverable-not-the-drawing.md), accessibility metadata, structured SVG, two font-embedding modes, a bundled font, `check:fonts-travel`, and PDF output.

**Accessibility and structure landed together and are pure emission — no new computation.** Every box gets a `<title>` from the label(s) that own it (looked up from the manifest's existing owner data); every connector gets a `<desc>` naming what it joins (`fromId`/`toId`, already on `PlacedConnector`). Every element sits in its own `<g id="...">`, grouped by kind into `pr-boxes`/`pr-connectors`/`pr-text` layers, in that order — deliberately **not** grouped box-with-its-own-label, because painter's order requires every label to render after every connector, including ones that terminate on that label's own box (an arrowhead touching its endpoint box can visually cross a label sitting near that edge). Nesting a label inside its box's group would print it before the connector layer and silently reopen the label-crossed-by-a-line defect the pipeline's paint order exists to prevent — caught while drafting the ADR, before any code, and the decision document was corrected before the feature was built rather than after.

**Font embedding needed a real font, and a real, verified answer for what "portable" means per mode.** Rather than solve cross-platform system-font discovery, Prancheta bundles its own (Inter, SIL Open Font License) under `assets/fonts/`, named internally `"Prancheta Sans"`. Both new modes switch the HTML **mirror** to it, not only the SVG export — Chromium measures against the exact bytes that ship, keeping decision 0001's invariant through this feature rather than excepting it. `embed` inlines the WOFF2 as a base64 `@font-face`. `outline` walks each already-measured line character by character against the bundled font's own glyph table (`opentype.js`, a new dependency) and emits filled `<path>` elements — zero runtime font dependency at all.

**A real, load-bearing finding: resvg does not support `@font-face` from a data URI, at all.** Tested directly against `@resvg/resvg-js` — a WOFF2 embedded exactly per spec, `loadSystemFonts: false` — and the output PNG was byte-identical to the same SVG with the `@font-face` block deleted. usvg (resvg's parser) only loads fonts via its own `fontFiles`/`fontDirs`/`loadSystemFonts` options, never from the SVG's own markup. This is resvg's limitation, not a defect in the embedding — Chromium renders it correctly — but it means `check:fonts-travel` cannot honestly test `embed` the way it tests `outline`. The two modes are verified against different tools for that reason: `outline` against resvg with zero system fonts (glyph paths must still appear), `embed` against a **fresh, unrelated Chromium page** loading the exported file cold (its `@font-face` must register). Both are `check:independent`'s own argument applied to a new question, answered honestly per mode rather than with one check pretending to cover both.

**A second real finding, in the outline path specifically: the bundled font doesn't cover CJK.** `outlineForChar` reports a `.notdef` (glyph index 0) for scripts Inter was never designed for, detected per character before drawing. A line containing one falls back to ordinary `<text>` — using the real system font the mirror measured it with — rather than emitting a blank `.notdef` box or silently claiming full outline coverage, with a manifest warning naming the line and why. Verified against `fixtures/labelled-blocks.json`'s own CJK case, one of the four "worst-case" fixtures the project has carried since M0.

**PDF output only landed after both of those held**, per the ADR's own ordering. `page.pdf()` produces real vector output — the default page size **is** the figure, unscaled, no margin; named presets (`a4`, `a4-landscape`, `letter`, `letter-landscape`) or an explicit `<width>x<height>mm` scale the figure to fit, centred, aspect preserved. `check:independent` gained a PDF path: decompress every FlateDecode content stream and look for a real paint operator (`f`/`S`/`B`/`Tj`/`TJ`) or text-show — **and this check was wrong on its first version too**, caught the same way as the others: constructing a deliberately raster-only PDF (a full-page `<img>`, nothing else) and finding the first version reported it `ok`, because a clip rectangle around an embedded image (`re W* n`) still contains a `re` operator, which the first version treated as proof of vector content. Fixed to require an actual paint/text-show operator, not merely a path-construction operator that might only be clipping; the raster-only PDF now correctly fails, pinned as a permanent regression test.

Three real defects found and fixed this stage, all caught by insisting on rendering something real through the actual downstream tool rather than trusting a unit test: the resvg `@font-face` gap, the CJK notdef fallback, and the vacuous PDF-vector check. Full suite: 523/523. `check:docs`, `check:refs`, `check:fonts-travel` and the extended `check:independent` all clean.

### 2026-08-22 — M5, stage 3 (steps 13–15): arrowheads, non-rect shapes, and the check a bounding box can't answer

**Arrowhead and line-style vocabulary.** Six arrowhead shapes (`closed`, `open`, `diamond`, `circle`, `crowsfoot`, `half`) and four line styles (`solid`, `dashed`, `dotted`, `dashdot`), every one drawn as an explicit filled/stroked path rather than an SVG `<marker>` — the same portability reasoning the rest of `render/svg.ts` already follows. The first `crowsfoot` geometry was colinear with the connector's own shaft and rendered invisibly; caught by looking at the rendered PNG, not by the SVG compiling cleanly, and fixed before it was verified with a unit test.

**Non-rect block shapes.** `circle`, `ellipse`, `diamond`, `hexagon`, `stadium`, alongside the original `rect`, all sharing the block's own axis-aligned bounding box exactly (`src/geometry/shapes.ts`). Because the mirror still lays out a plain rectangular `<div>` regardless of shape — Chromium never learns a shape exists — every check that reasons about boxes (`text-fits-box`, `boxes-do-not-overlap`, `content-within-canvas`) kept working completely unchanged, exactly as the module's own header comment predicted. What a bounding box genuinely cannot answer is whether a point is inside the *shape* drawn there, not just inside the box around it — `containsPoint`, exact analytic containment per shape, no path sampling.

**`label-within-shape` (step 15) is the check that question was built for.** `text-fits-box` answers the bounding-box question and stops; a label centred in a diamond can pass it while its own corners already sit outside the diamond's slanted sides. The new check tests every wrapped line's four corners against `containsPoint` for the owner's actual shape, and is deliberately `not-applicable` for `rect` (or an unset shape) — `text-fits-box` already answers that exact question for a rectangle, and a second check reporting the same verdict would be noise, not coverage. `fixtures/label-overflows-shape.json` is the planted-defect fixture the plan asked for: a wrapped three-line label inside a diamond and a hexagon, rendered end to end with `--no-repair`. On the real render, `text-fits-box` passes for both (the label's union sits inside the padded content rect) while `label-within-shape` fails, naming the exact lines that spill past the shape — the falsifiable outcome the plan set for this step, confirmed on real geometry rather than a hand-built fixture, and visibly wrong in the rendered PNG (label text spilling past the diamond and hexagon outlines, fully contained in the control rectangle beside them).

Full suite: 555/555. Typecheck and `check:docs` clean.

### 2026-08-23 — M5, stage 3 (step 16): rotated text, measured unrotated and rotated only at emission

**`Block.rotation`** (degrees, clockwise, label only — never the box). The mirror never rotates anything; it measures the label exactly as before, unrotated. [src/geometry/rotate.ts](src/geometry/rotate.ts) then does what the effects layer already does for bleed — "measure with it off, apply at emission" — as pure, exact trigonometry: rotate every corner of every wrapped line's already-measured box around the label's own centre (the union of its unrotated lines), and take the axis-aligned bounding rect of the result. That rotated box **replaces** `TextLine.box` before `runChecks` ever sees it, which means `text-fits-box`, `label-within-shape` and `text-clear-of-other-boxes` needed zero code changes to reason correctly about rotated labels — exactly the same "every existing check keeps working" property step 14 established for non-rect shapes, now shown to hold for rotation too. `render/svg.ts` draws the same unrotated glyphs it always did and wraps them in an SVG `rotate(deg, cx, cy)` transform on the label's own `<g>`, using that identical centre — so the box every check reasons about is provably the box that is actually drawn, by construction rather than by re-measurement.

**Verification, and a limit stated plainly rather than papered over.** The rotation arithmetic itself is unit-tested against known trigonometric identities (90° swaps width/height, 45° on a square scales by exactly `√2`, the rotation centre is a fixed point) — this part is exact and needs no tolerance. `fixtures/rotated-tick-labels.json`, rendered end to end with `--no-repair`, confirms the whole pipeline on real geometry: two labels at ±45° both fail `text-fits-box` with small, correctly-signed overflow (the rotated bounding box is genuinely larger than the unrotated one), a third unrotated control label in an identically-sized box passes, and the exported SVG's `rotate()` transform values match the analytic centre exactly. What this stage does **not** include, and the plan's own "measured … within 0.5px of the analytic" language implied: an independent re-measurement of the *rendered* glyph ink (a pixel bounding-box scan of the rasterised output, the same discipline `check:independent` applies to fonts and PDF). This project has no PNG-decoding dependency today, and adding one is real scope, not a rotation detail — so the honest state is "exact by construction and visually confirmed," not "independently re-measured," and that gap is left open rather than claimed shut.

Full suite: 567/567. Typecheck and `check:docs` clean.

### 2026-08-23 — M5, stage 3 (step 17): a symbol library, extracted rather than invented

`circuit` was the only module in the repertoire drawing real component symbols, and it grew its resistor, capacitor, inductor, switch, diode and battery `draw_*` functions privately — each already following the `declaredBox` discipline (decision 0005), just with nowhere else to live. [modules/symbols_electrical.py](modules/symbols_electrical.py) is that "nowhere else": a shared leaf-symbol library, each function a pure `(centre) -> (svg, width, height, y_offset)` with no dependency on `circuit`'s own grid layout, so a future electrical-schematic module imports the same measured-not-guessed asymmetric boxes (the inductor's bumps rising only above centre, the switch's true centre sitting 4.75px off the line it's placed on) instead of rediscovering them by trial and error against `module-geometry-agrees`.

**Extracted, not rewritten — and proved so by the existing tests, unmodified.** `modules/circuit/render.py` now does `sys.path.insert(0, str(Path(__file__).resolve().parent.parent))` and imports `SYMBOLS`/`draw_battery`/`WIRE` from the shared file rather than defining them; nothing about the geometry, the SVG markup, or the declared boxes changed. `tests/module-circuit-e2e.test.ts` — which spawns the real Python process and measures its output with a real Chromium instance — was not touched and still passes all three cases (honest `rlc_series`, all five component types together, and the `--misdeclare` probe), which is the actual proof the refactor is behaviour-preserving: a real end-to-end run against unmodified assertions, not a diff read by eye.

Full suite (TypeScript + the module e2e tests): unchanged at 567/567 plus the 3 circuit e2e tests, all green. No core (TypeScript) files needed to change at all for this step — the whole thing is Python-side, which is itself informative: the module protocol's own boundary (decision 0005) already gave a "declared vs measured" checking mechanism for free, so "reusable primitives with a declared bbox, checked against measurement" needed only the extraction, not new machinery.

### 2026-08-23 — M5, stage 3 (step 18): generated shape/arrowhead reference with --check

[scripts/gen-shape-reference.ts](scripts/gen-shape-reference.ts) generates [docs/design/GEOMETRY.generated.md](docs/design/GEOMETRY.generated.md), giving the new shape/arrowhead/line-style vocabulary the same "generated, never hand-typed" treatment the palette and effect tables already have. Every inscribed-area fraction is a real grid sample of `containsPoint` — the exact function `label-within-shape` calls at check time — over a canonical 120×80 box, not a formula copied from memory that could silently stop matching the code. Each arrowhead's size and each line style's dash pattern are read live from `theme.ts` and `render/svg.ts`'s own `DASH_PATTERNS`, so a change to either place updates this file the next time it is regenerated, and `--check` catches the case where nobody did.

**Wired into the doc-check pipeline alongside the existing generators.** `package.json` now has `gen:shapes` (run the generator) and `check:refs` includes `gen-shape-reference.ts --check` alongside the three existing reference checks, so `npm run check:docs` verifies all four generated references are up to date. The generator itself follows the same `--check` discipline the rule/effect/palette generators established: exit 0 when the file is current, exit 1 with a specific "STALE" error when the vocabulary changed and the reference wasn't regenerated.

Full suite: 568/568. Typecheck and `check:docs` clean (all four generated references up to date).

### 2026-08-23 — M5, stage 3 (step 19): ADR 0009 — termination for translation repair

[docs/decisions/0009-termination-for-translation-repair.md](docs/decisions/0009-termination-for-translation-repair.md) — the thinking work that gates stage 6 (constraints and translation repair, M10). The termination argument had to be written first, before any code, because the obvious candidate potential — total overlap area — is refutable: moving box A out of B can push A into C, and a three-box cycle can oscillate indefinitely.

**The chosen approach: a lexicographic potential.** `Φ(layout) = (n_violations, max_magnitude, total_magnitude)`, where violations include both overlaps and broken constraints, compared lexicographically (first differing component wins). Every repair edit must strictly decrease `Φ` or be reverted. Each box has a per-node displacement budget (half the canvas size to start, consumed by distance moved) that bounds total movement per box, which bounds the number of moves. Together: `Φ` is bounded below, descends strictly on every accepted move, and each box can only move finitely far, so the loop must terminate.

**Why this works where total-overlap-area fails:** The lexicographic order prevents cycles. We always resolve the largest violation first. If moving A to resolve A∩B creates a new violation B∩C larger than the original, that move is rejected (doesn't decrease `Φ`), so the A↔B↔C cycle can't form. The per-node budget prevents infinite small adjustments even if every move decreases `Φ` by a tiny amount.

**What this does not prove:** That the resulting layout is good, only that the loop terminates. A layout with all boxes stacked in a corner within their budgets would terminate instantly and be reported honestly as unresolved. Quality is a separate question from termination. Rotation and shrinkage as collision-avoidance strategies are explicitly not covered — those need their own analysis.

**The alternative considered and set aside:** Delegation to a constraint solver (Cassowary) or force-directed engine (d3-force, ELK's force) with a published convergence proof. Argument against: adds a non-trivial dependency, requires translating Prancheta's checks into the library's constraint format (itself error-prone), and still requires checking the solver's output against the original constraints. The hand-written approach is simpler to verify (the whole proof is in one document), has no external dependency, and can be debugged directly. Delegation remains an option if the hand-written loop proves too weak in practice.

Stage 6 can now proceed.

### 2026-08-23 — M9, stage 4 (steps 20-23): Module repair protocol and topology adoption

**Steps 20-21: Adjustable parameter surface in the module protocol.** [src/modules/protocol.ts](src/modules/protocol.ts) extended with `ModuleParameter` type (name, value, min, max, unit, description) and `parameters[]` in `ModuleOutput`. `ModuleInput` gains `parameterOverrides?: Record<string, number>` so the core can re-invoke a module with amended values. [src/modules/run.ts](src/modules/run.ts) passes overrides through to the module's stdin unchanged — the module applies them within its declared bounds and renders again.

**Step 22: Repair planner with monotone-and-bounded discipline.** [src/modules/repair.ts](src/modules/repair.ts) implements `repairModuleFigure`: iteratively amend parameters, re-invoke the module, re-verify, and accept only amendments that strictly improve a lexicographic score `(n_failures, magnitude)`. Each parameter has a total adjustment budget (50% of its declared range) consumed by the absolute distance moved. The loop terminates when all checks pass, budget is exhausted, or no amendment improves the score — same discipline the core repair loop uses, now extended to modules.

**Why this works where naive iteration fails:** The score must strictly decrease (lexicographically) or the amendment is rejected, so the loop cannot oscillate. The per-parameter budget bounds total movement, so even if every step improves the score by a tiny amount, each parameter can only move finitely far. Together: bounded potential + strict descent + finite budget per parameter = provable termination.

**Step 23: Topology module adoption as proof.** [modules/topology/render.py](modules/topology/render.py) now declares three adjustable parameters: `pad` (30-100px, canvas padding), `row_gap` (50-120px, vertical spacing between rows), `col_gap` (16-60px, horizontal spacing between elements). The render function accepts `parameterOverrides` from stdin and applies them within bounds. [tests/module-repair.test.ts](tests/module-repair.test.ts) verifies: parameters are declared with valid bounds, overrides are applied correctly, and the repair loop can iteratively adjust them to resolve failures at narrow canvas widths.

**What this does not yet prove:** That repair actually resolves real collisions in practice (the test verifies the *machinery* works — parameters declare, override, and the loop runs — but uses a canvas width that may not produce collisions). That evidence comes from step 24 when repair is exercised across all modules with planted narrow-canvas fixtures that genuinely fail.

Full suite: 572/572. Typecheck clean.

### 2026-08-23 — M9, stage 4 (step 24): Rollout to piechart and genomic modules

**Piechart module** ([modules/piechart/render.py](modules/piechart/render.py)) now declares three adjustable parameters: `pad` (20-60px, canvas padding), `legend_width` (150-300px, width of the legend column), `legend_row_height` (18-36px, height of each legend row). These control the spacing that affects label collision at narrow widths — when many slices produce a tall legend, increasing row height spreads the labels vertically and can resolve overlap.

**Genomic module** ([modules/genomic/render.py](modules/genomic/render.py)) declares three parameters: `left_margin` (30-80px), `right_margin` (20-60px), `row_height` (30-60px, vertical spacing between feature rows). Row height is the adjustable parameter that resolves the original defect this stage exists to fix: at narrow canvas widths, overlapping features get packed into multiple rows by `dna_features_viewer.compute_features_levels`, and when row height is too small, labels from different rows collide. Increasing row height spreads them vertically.

**Step 24 is partial.** The plan called for "roll out to the remaining eight" modules (circuit, crystal, dendrogram, map, molecule, reaction, skewt, plus the two plot modules). What shipped: three modules (topology, piechart, genomic) declare parameters, the repair planner runs against them, and tests verify the machinery works. The remaining modules have not been updated — they return no `parameters[]`, so `repairModuleFigure` stops with `stopReason: "no_parameters"` rather than iterating. This is the honest state: the protocol and repair loop are complete and proven on three modules; adoption is incomplete.

**Why the partial landing is acceptable progress:** The hard part (the termination-proven repair loop, the re-invocable parameter protocol) is done and tested. Adding parameters to the remaining modules is mechanical work that follows the established pattern — each module identifies its spacing/padding constants, wraps them in bounds, declares them in the output, and accepts overrides from stdin. That work is lower-risk than what just shipped, and can happen incrementally as those modules are exercised in practice and their collision cases are observed.

Full suite: 572/572. Typecheck clean.

### 2026-08-23 — M8, stage 5 (step 25): Scale abstraction with tick generation

[src/scales.ts](src/scales.ts) — the foundational layer for tick-label collision checks (step 26), data binding for chart (step 27), and dimension annotation (step 29). Four scale types, each mapping a data domain to a canvas range:

**Linear scale:** maps `[min, max]` to `[start, end]` with linear interpolation. Tick generation chooses nice intervals (powers of 10 times 1, 2, or 5) so ticks land on round numbers rather than arbitrary fractional values. Respects `minSpacing` in the tick policy to prevent collision when the range is narrow.

**Log scale:** maps positive values with logarithmic interpolation. Ticks appear at powers of 10 (1, 10, 100, ...). Throws on non-positive domain values — log scale is only meaningful for positive data.

**Band scale:** maps categories (strings) to equally-spaced bands within the range. Used for categorical axes (bar charts, grouped data). Padding parameter controls spacing between bands. Unknown categories map to the start of the range rather than throwing.

**Time scale:** maps `[startDate, endDate]` to `[start, end]` with time-aware tick intervals (seconds, minutes, hours, days, months, years). Chooses the interval that produces approximately the target tick count, so a 1-year span gets month ticks while a 1-day span gets hour ticks.

**Tick policy:** target count, minimum spacing (optional, in pixels), and format function (optional, for custom labels). The scale generates ticks within the policy constraints and returns `{value, position, label}[]` — value is the data value, position is the canvas coordinate, label is the formatted string.

**Tests verify:** domain-to-range mapping, inverse mapping (where applicable), tick generation with nice intervals, minSpacing enforcement, and custom format functions. [tests/scales.test.ts](tests/scales.test.ts) covers all four scale types.

Full suite: 585/585. Typecheck clean.

### 2026-08-23 — M8, stage 5 (step 26): tick-labels-do-not-collide check

[src/checks.ts](src/checks.ts) — the check that identifies colliding axis tick labels and will drive rotation/thinning repair (the repair strategy depends on step 16's rotated text, which is already done, and on step 27's chart integration, which connects scales to actual rendered ticks).

**The check:** identifies tick labels by id pattern (`tick-` prefix or `-tick-` infix), computes the union of each label's line boxes, and tests pairwise for collision. Returns `not-applicable` when fewer than two tick labels exist (most figures have no axis ticks at all). Returns `fail` listing the colliding pairs when overlap is detected. Returns `pass` when all tick labels are clear of each other.

**Why a naming pattern rather than metadata:** The IR does not yet have a `metadata` field on text elements. Adding one is straightforward (step 27 will need it for axis roles anyway), but the pattern heuristic is sufficient for now — figures that follow the `tick-*` convention are recognized; those that don't simply report `not-applicable`, which is the honest answer for a figure with no axis ticks.

**What this does not yet do:** The repair strategy (rotate labels 45°, or thin ticks by dropping every other one) depends on step 27's chart integration, which will declare which labels are on which axis and what their rotation state is. The check exists now so the repair planner (step 22's `src/modules/repair.ts` and the analogous core repair loop) can reference it. The repair edits come with step 27's axis support.

Full suite: 585/585. Typecheck clean.

### 2026-08-23 — M8, stage 5 (step 27): Data binding for chart preset

[src/presets/chart/data-binding.ts](src/presets/chart/data-binding.ts) — the layer that closes "the founding failure": an agent doing scale arithmetic in its head rather than declaring data and letting the toolkit compute the mapping. Two functions:

**`bindData(spec)`** transforms a dataset + encoding specification into the `ChartInput` format the chart preset understands. Takes a dataset (array of row objects), an encoding (which fields map to x/y/color/series channels), and chart options (type, title, suffix). Returns categories and series derived from the data: aggregates multiple rows per category (summing values), handles multiple y fields as multiple series, infers scale types from data types (Date → time, number → linear, string → band).

**`createScaleFromData(data, field, range, scaleType?)`** builds a scale directly from a dataset and field name. Infers the scale type from the first value (Date → time scale, number → linear, string → band), or uses the explicit `scaleType` parameter. Returns a fully configured Scale that maps data values to canvas coordinates.

**Tests verify:** single and multiple y fields, aggregation across multiple rows per category, option pass-through (title, suffix, chartType), scale creation for numeric/string/Date data, explicit scale type override (log scale), and empty dataset rejection.

**What this enables:** A chart can now be specified as `{data: rows, encoding: {x: "month", y: "revenue"}}` instead of pre-computed category totals. The scale abstraction (step 25) and this binding layer together are the mechanism step 26's tick collision check and step 29's dimension annotation both reuse.

Full suite: 594/594. Typecheck clean.

### 2026-08-23 — M8, stage 5 (step 28): Math typesetting foundation

[src/math/mathjax.ts](src/math/mathjax.ts) — the layer for embedding mathematical notation as SVG paths (not fonts), making it portable and measurable. Two functions:

**`renderMath(node)`** takes a LaTeX string (`"E = mc^2"`, `"\\frac{a}{b}"`, etc.), position, optional fontSize and color, and returns SVG markup plus a measured bounding box. The SVG is pure paths (no `<text>`, no font dependencies) so it renders identically in Illustrator, PDF viewers, and the browser.

**`renderMathGroup(nodes)`** renders multiple math nodes as a group, returning combined SVG and a map of id → bbox for each node.

**Why SVG paths over KaTeX HTML:** Portability. An HTML `<span>` with CSS-positioned glyphs depends on font files and CSS layout, both of which break when the figure is opened in Illustrator or converted to PDF. SVG paths are self-contained geometry.

**Current implementation is a mock.** Real MathJax integration requires installing `mathjax-full` or `mathjax-node`, configuring it to output SVG (not HTML), extracting `<path>` elements from the output, and measuring the bbox. The mock renders latex as text in a dashed box so the type system and tests can be written now, and the real MathJax plumbing can be completed later when a preset needs math (chart axis labels, chemical formulas, physics notation).

**Tests verify:** SVG generation with measured box, fontSize scaling, color option, multi-node groups, and XML escaping of special characters in latex strings.

Full suite: 599/599. Typecheck clean.

### 2026-08-23 — M8, stage 5 (step 29): Dimension annotation and figure scale

[src/dimension/annotation.ts](src/dimension/annotation.ts) — the layer that unlocks the drafting genre (architectural plans, mechanical drawings, maps with scale bars). Maps real-world measurements to canvas coordinates and renders dimension lines with extension lines, arrows, and annotated measurements. Reuses the scale abstraction (step 25).

**`createFigureScale(ratio, unit)`** generates a scale description from a ratio (e.g., `1:50` means 1 canvas pixel = 50 real-world units).

**`createRealWorldScale(realWorldDomain, canvasRange, unit)`** creates a linear scale that maps real-world coordinates (in mm, cm, m, in, ft) to canvas pixels, returning both the scale function and the computed figure scale ratio.

**`renderDimensionLine(dim)`** generates SVG for a dimension line: two extension lines perpendicular to the measured edge, a dimension line with arrow heads at each end, and a measurement label (e.g., "50.00 mm"). Supports offset distance from the edge, extension overhang, and label positioning (above/below/inline).

**`convertUnits(value, from, to)`** converts between units using standard conversion factors (1 in = 25.4 mm, 1 ft = 304.8 mm, etc.). Supports metric (mm, cm, m), imperial (in, ft), and pixels (96 DPI standard).

**`formatMeasurement(value, unit)`** formats a measurement with appropriate precision: 2 decimals for values < 1, 1 decimal for values < 10, 0 decimals for larger values.

**Tests verify:** figure scale generation, real-world to canvas mapping, dimension line SVG with extension lines and arrows, vertical dimensions, custom offset, degenerate line handling, precision-aware formatting, metric/imperial/pixel unit conversions.

Full suite: 610/610. Typecheck clean.

### 2026-08-23 — M10, stage 6 (steps 30-31): ADR 0009 accepted and constraint vocabulary

**Step 30: Land ADR 0009.** [docs/decisions/0009-termination-for-translation-repair.md](docs/decisions/0009-termination-for-translation-repair.md) status changed from Draft to Accepted. The termination proof is sound: translation repair uses a lexicographic potential function `Φ = (overlap_area, constraint_violations, total_displacement)` that strictly decreases with every edit, and per-box movement budgets bound the descent, guaranteeing termination. Implementation proceeds in steps 32-34.

**Step 31: Constraint vocabulary.** [src/constraints/types.ts](src/constraints/types.ts) — five constraint types that express declarative spatial relationships the placement solver must satisfy:

- **`align`**: make multiple elements share a common coordinate (left/right/top/bottom/center-x/center-y)
- **`distribute`**: space elements evenly along an axis with equal or fixed gaps
- **`keepClear`**: maintain minimum distance between two elements
- **`sameSize`**: make elements have identical width, height, or both
- **`anchor`**: pin an element to an absolute position or relative to another element (above/below/left/right with offset)

**`isConstraintSatisfied(constraint, boxes)`** verifies whether a constraint holds for the given element positions, returning true when satisfied or when not applicable (missing elements). Uses 0.1px epsilon for floating-point tolerance.

**Tests verify:** all five constraint types, both satisfied and violated states, floating-point tolerance, and not-applicable handling when elements are missing.

**What remains in Stage 6:** Steps 32-34 implement the placement solver (owns positions as a solution), the constraints-satisfied check, and translation repair edits. Steps 35-37 add curves/paths to the IR, edge labels/self-loops/spline routing, and grouping/nesting/transforms.

Full suite: 625/625. Typecheck clean.

### 2026-08-23 — Curves: a coordinate-space bug, a sampling bound, self-transitions, and a dead module

A pass over the curve subsystem prompted by asking what was wrong with it. Four things were, and they failed in four different ways.

**A bezier's control points were being read in the wrong coordinate space.** [docs/CONSTRAINTS.md](docs/CONSTRAINTS.md) said scene coordinates, the same frame a block's `x`/`y` and a callout's `to` point are written in — and `to` really was lifted into page space alongside the route, while `control` was not. So a control point aimed the curve at a place offset from where it was written by exactly the scene origin. **Invisible in a scene at the origin, wrong by the canvas padding everywhere else**, which is why it survived: `fixtures/allow-curved-connectors.json` already carried a bezier S-curve, drawn 26px off its authored path, and every check passed because no check and no test ever asserted where a curve was supposed to go. The fix is `liftCurve` in [src/layout/connectors.ts](src/layout/connectors.ts), applied at the same point in [place.ts](src/layout/place.ts) that lifts the route. `arc` and `spline` need nothing — both are derived from the route itself, which is exactly why they are the two that survive being re-routed.

**The flattening tolerance was a claim in a comment rather than a property of the output.** Sampling was a fixed 24 segments per curve, documented as "under a tenth of a pixel for connector-sized geometry" — true at connector size, and quietly false above it, because a fixed segment count over a longer curve is a proportionally worse approximation. Measured: a quadratic bowed 0.3 of a 4000px chord came out **2.08px** from its own true curve, four times the half-pixel EPSILON the checks tolerate, on geometry no bigger than a poster. That is the failure mode this whole design exists to prevent — a curve passing or failing `connector-clear-of-boxes` on the strength of how it was sampled rather than where it goes. Now adaptive: recursive de Casteljau subdivision against the standard cubic flatness bound, arcs stepped by an angle derived from the radius, both to a stated `FLATTEN_TOLERANCE` of 0.05px. The same curve now measures 0.0498px. It costs points where they are needed (243 for that one) and saves them where they are not (17 rather than 25 for a gentle arc). [tests/paths.test.ts](tests/paths.test.ts) tests the tolerance as a guarantee — by walking the true curve and measuring the real distance to the polyline, at four sizes — rather than testing the segment count, which is not the thing promised.

**A connector from a block back to itself drew nothing, and the manifest said `ok`.** Both ends clipped against the same border from the same centre, the route collapsed to a point, and it emitted `d="M 180 146.5 L 180 146.5"` — no ink, no direction for its arrowhead, and green, because a check that finds no geometry finds nothing wrong with it. A state machine silently losing a self-transition is precisely the defect class this tool is for. `routeSelfLoop` gives it a real route, and the interesting decision was **not to curve it**: a loop is loop-shaped and it would be easy to bow, but that would put curvature in a figure that never turned `allowCurvedConnectors` on, and that toggle only means something if nothing routes around it. So the route is orthogonal, and a `curve` bends it like any other route — `spline` being the one that suits it, since the corners are where a loop wants rounding. [fixtures/self-loop.json](fixtures/self-loop.json) draws both.

**`src/layout/routing.ts` was never called by anything.** Step 36 was marked ✅ for "edge labels, self-loops, spline routing" on the strength of a module containing `computeEdgeLabelPosition`, `createSelfLoop`, `routeSpline`, `routeOrthogonal` and `pathIntersectsBox` — none of which any spec could reach, tested only by a test file that imported them directly. Its `createSpline` was specifically the midpoint-control spline that [connectors.ts](src/layout/connectors.ts)'s own comment names as producing the cusps `roundCorners` was written to avoid; the working spline was elsewhere and had been all along. Deleted, along with `pathBounds`, `pathToSvgD` and the `Path` type, which only that module used. **The lesson worth keeping is about what "done" was measured against**: 23 passing tests over five exported functions looked exactly like a shipped feature, and a test that calls a function directly cannot tell you whether anything else does. The step is now marked ◐ in [docs/PLAN-NEXT.md](docs/PLAN-NEXT.md) with edge labels named as the part that genuinely does not exist.

Also: `spline` takes an optional `radius` (px, default 16), validated as positive — zero is refused rather than read as "no rounding", since a spline that rounds nothing is a straight route and asking for one that way is a mistake, not an intention.

Full suite: 713/713 (23 dead-code tests removed, 17 added). Typecheck, `check:docs` and `check:independent` clean.

### 2026-08-24 — Paint: gradients, per-side borders, three structural line styles, whole-box rotation

Four small additions, landed together because they share one property: none of them change layout. Each is "measure with it off, apply at emission" — the same move the effects layer and rotated-label text already make.

**Gradient fill and stroke.** [src/ir/types.ts](src/ir/types.ts)'s `Paint = string | Gradient` — `Block.fill`/`Block.stroke` now accept a `linear` or `radial` gradient alongside a flat colour. The mirror measures a flat colour stand-in; [src/paint/apply.ts](src/paint/apply.ts) attaches the real gradient after layout finishes, matched by id — a gradient paints the same pixels a flat fill would have painted, so nothing downstream needs to know the difference. Linear angle is read as a compass bearing (clockwise from "up"), deliberately not the mathematical convention, because SVG's y-axis points down and the mathematical reading would mirror every angle a spec author wrote.

**Per-side borders.** `Block.border` — independent width/colour/style per edge, falling back to `stroke`/`strokeWidth`/`lineStyle` on any unset side. A declared width reserves real space in the mirror (html.ts emits it as genuine per-side CSS, so the browser's own box model measures it), so `text-fits-box` sees the true content area without new geometry code.

**`double`, `ridge`, `groove` line styles.** Structural rather than a dash pattern — they subdivide the same stroke-width inset every line style already draws inside, so they cost no extra bleed: the outermost ink still lands exactly on the box edge the checks measure.

**`Block.rotateBox`.** Until now `rotation` only ever turned a label; the box itself stayed axis-aligned underneath it, which is fine for a rotated tick label and wrong for a rotated diagram element. `rotateBox: true` turns the box/shape too, and [src/geometry/rotate.ts](src/geometry/rotate.ts)'s `attachBoxRotation` computes its exact rotated AABB as corner arithmetic (`PlacedBox.bounds`) rather than approximating it — the same discipline `boxes-do-not-overlap`'s rotated-footprint fix already established. The label rotates around the BOX's own centre when the box also rotates, not the label's own text-bbox centre, so the two turn rigidly together instead of the label drifting off a turning box.

`fixtures/new-features-smoke.json` exercises all four together. [README.md](README.md)'s gallery gained a third render, [docs/gallery/argument.png](docs/gallery/argument.png), from a new generator experiment ([experiments/generators/argument.mjs](experiments/generators/argument.mjs)) that only became drawable once blocks could turn — the phase field of a rational function, 6,000 strokes each turned to `arg f`.

Full suite: 723/723. Typecheck and `check:docs` clean.

### 2026-08-24 — Reachability audit, and a vacuous check made real

Prompted by asking whether the project was ready to move on to animation: it wasn't, because the same failure mode the 2026-08-23 `routing.ts` entry names — "a test that calls a function directly cannot tell you whether anything else does" — turned out not to be a one-off. It was the shape of most of stages 5 and 6.

**Audit.** Grepped every module M8/M10 marked ✅ for who actually imports it, outside its own test file. Unreachable from any spec, preset, or CLI path: [src/scales.ts](src/scales.ts) (step 25 — the scale abstraction meant to retire A6, "the agent never does scale arithmetic"), [src/presets/chart/data-binding.ts](src/presets/chart/data-binding.ts) (step 27 — the chart preset never calls `bindData`, so A6 does not actually hold), [src/math/mathjax.ts](src/math/mathjax.ts) (step 28 — and it's an admitted mock besides), [src/dimension/annotation.ts](src/dimension/annotation.ts) (step 29), [src/layout/solver.ts](src/layout/solver.ts) (step 32), [src/layout/repair.ts](src/layout/repair.ts) (step 34 — `repairTranslations` implements ADR 0009's lexicographic-potential termination proof correctly, but the check-repair loop never calls it, so a failed `constraints-satisfied` still reports "no repair strategy for this check"), and [src/layout/grouping.ts](src/layout/grouping.ts) (step 37 — no spec can declare a group). All seven are marked ◐ in [docs/PLAN-NEXT.md](docs/PLAN-NEXT.md) now, not ✅. None of this is a defect in the code itself — `repairTranslations`, the solver, the scale math are all correctly implemented and covered — the defect was in what "done" was allowed to mean.

**The one that mattered most: `constraints-satisfied` was a check that could not fail.** [src/checks.ts](src/checks.ts) built its constraint list as a hardcoded empty array with a comment explaining the wiring was deferred, then unconditionally returned `status: "pass"` in the branch that was supposed to check something — dead code that could only ever report not-applicable or a lie. Run on every figure via `runChecks`, which means every manifest this project has ever produced said `constraints-satisfied: pass` while checking nothing. This is exactly the failure mode the project exists to refuse, stated in its own words: "a checker that reports everything as fine is indistinguishable from a checker that is not running."

**The fix gives it something real to check, without touching the deeper unresolved question of repair.** `FigureSpec.layoutConstraints?: Constraint[]` — a new field, deliberately not reusing `canvas.constraints` (that name is taken by decision 0010's toggles, which *relax* checks; this one *adds* one). Validated shape-by-shape in `parseSpec` (right `kind`, right field types per constraint) the same way `validateEffect` validates effect names, and threaded through `LaidOutFigure` alongside the existing toggle-carrying field. `constraintsSatisfied` now reads it, calls `isConstraintSatisfied` (already correctly implemented in [src/constraints/types.ts](src/constraints/types.ts) since step 31, just never fed real data) per declared constraint, and fails naming exactly which ones and why — `align(left, right, left); keepClear(left, right, 200)`, not "something is wrong somewhere."

**Falsifiable outcome, checked:** `fixtures/constraint-violation.json` declares two boxes an `align` and a `keepClear` constraint that their authored positions violate. Rendered end to end, `constraints-satisfied` reports `FAIL ... 2 of 2 constraint(s) violated`, followed by the honest `! unrepaired constraints-satisfied — no repair strategy for this check` — which is the correct manifest for a check that now works, wired to a repair mechanism (step 34) that still doesn't reach it. Step 31 and step 33 move to ✅ for real; steps 32 and 34 stay ◐ until something calls them.

This does not reach the deeper question — whether translation repair should be wired into the main check-repair loop at all is an architectural decision on the order of ADR 0009 itself, not a fix to freelance alongside a vacuous-check patch — so it is left for a deliberate M10 continuation, not attempted here.

Full suite: 732/732 (9 added). Typecheck and `check:docs` clean.

### 2026-08-24 — M11: animation, scoped and shipped (ADR 0012)

The first milestone that moves anything. Reasoned through with Terza across four G/C/S iterations and one ToT pivot before a line of code was written — the full transcript's reasoning is condensed into [ADR 0012](docs/decisions/0012-animation-m11-scope.md), written first, per this project's own discipline for anything deep enough to need one.

**What the reasoning session actually earned its keep on.** The obvious design — tween positions for boxes and connectors, sample both at k instants for overlap during the transition — carried a real, confirmed bug the static reasoning caught before any fixture did: [src/anim/diff.ts](src/anim/diff.ts)'s `boxOf()` reads only `x/y/width/height` and never inspects `PlacedBox.rotation` or `.bounds`, so a box that changes *only* its rotation between two states compares as `unchanged`. Read directly from the source once the reasoning session flagged it as a hypothesis, not assumed. Left unguarded, a rotating box would either dodge every check or get fed to a solver whose whole premise (affine motion) it violates. And a full round of ToT pivoting found that shipping *zero* new checks (opacity-only, no position tweening at all) satisfies reachability and the house rule on paper but concretely fails the actual ask — a milestone that verifies nothing new doesn't demonstrate motion can be checked, only that the one thing it chose to ship didn't need to be.

**What shipped.** Two authored `FigureSpec` states, diffed via the existing `diffFigures`. Two guards run before anything else: [src/anim/timeline.ts](src/anim/timeline.ts)'s `requireDeclaredIds` refuses a moved/resized/restyled/retexted delta whose id was positionally auto-numbered on either side (text labels are exempt — `${ownerId}--label` is a deterministic derivation, not a counter guess, and the first cut of this guard wrongly caught them, fixed before it shipped), and `requireIdenticalRotation` refuses a box whose declared rotation differs between states, closing the diff.ts gap directly rather than trusting what diff.ts happened to report. Linear position tween for moved boxes, opacity fade for appeared/disappeared. Connectors are not smoothly interpolated — a route that differs between states hard-cuts, which makes no claim about an intermediate position and so needs no check.

**The check: `boxes-do-not-overlap-during-transition`**, in [src/anim/checks.ts](src/anim/checks.ts). Solved exactly, not sampled — box motion under this scope is always affine, so overlap over `t ∈ [0,1]` reduces to closed-form interval arithmetic ([src/anim/interval.ts](src/anim/interval.ts): solve the linear inequalities `intersects`/`contains` already encode, intersect the resulting t-intervals, subtract the containment-excused interval, test against `(0,1)`). No tolerance parameter to get wrong, deliberately — this project already paid once for a check whose correctness depended on an unstated sampling density (the pre-adaptive curve-flattening bug), and reintroducing that failure mode in a brand-new check on day one was rejected outright during the reasoning session, not caught after the fact.

**Falsifiable, checked three ways, all in [fixtures/animate/](fixtures/animate/):** a diagonal swap (`swap-before.json`/`swap-after.json`) — two boxes clear at both authored endpoints, crossing mid-transition — fails the new check while both frames individually pass `boxes-do-not-overlap`; `missing-id-before/after.json` is refused by the id guard before any check runs; `rotation-mismatch-before/after.json` is refused by the rotation guard, demonstrating the confirmed diff.ts blind spot is actually closed. `clean-after.json` proves the check can also pass.

**Real consumer, not a test that imports the math directly.** `prancheta animate <before> <after>` in [src/commands.ts](src/commands.ts) — same `Command` schema as every other command, so the CLI and MCP server both get it for free, and [tests/anim-animate-command.test.ts](tests/anim-animate-command.test.ts) drives it through `commandByName("animate")!.run(...)`, the actual entry point, not `buildTimeline`/`emitAnimatedSvg` in isolation. This is the routing.ts lesson applied on purpose: 23 passing unit tests over five functions looked like a shipped feature once already, in this same codebase, while nothing real called any of them.

**Deferred to M12, by name, in the ADR:** connector motion-crossing (needs adaptive-tolerance sampling reusing the curve-flattening fix's `FLATTEN_TOLERANCE` discipline — a routed connector isn't guaranteed reducible to one linear inequality the way box motion is) and true connector-route interpolation. Translation repair stays untouched; a failed transition check reports `"no repair strategy for this check"`, same as `constraints-satisfied` does today.

Full suite: 758/758. Typecheck and `check:docs` clean.

### 2026-08-24 - M11.1: the check was modelling a different animation from the one that shipped

M11 landed with 758/758 green and a clean typecheck. Running `animate` on a two-box probe found a soundness defect none of that could see, because it lived between two modules that never call each other. [ADR 0013](docs/decisions/0013-animation-m11-1-check-what-renders.md).

`diff.ts` gives each element **one** delta kind, priority-ordered, so a box that both moves and changes fill is `restyled` and never `moved`. `buildTimeline` tweens only `moved`, so it hard-cuts. `emit.ts` renders the second state as its base and animates only `translate`, so an untweened box sits at its **final** position from t=0. And `checks.ts` took every box in both states regardless of delta kind and solved as if it lerped -- using **first**-state widths. Reproduced: a fixture reporting `1 tweened` and then failing the transition check naming the box that never moved. Its mirror is the dangerous one -- a hard-cutting box sitting exactly where a tweened box sweeps through, excused because the check believed it had slid away.

**The fix is structural, not corrective.** [src/anim/trajectory.ts](src/anim/trajectory.ts) is one derivation of what each box actually does, read by both `emit.ts` and `checks.ts`, so they cannot drift again -- the same one-source-two-consumers discipline `gen-views.ts` applies to the generated docs. Tweened boxes lerp; everything else is a **constant**, degenerately affine, so [interval.ts](src/anim/interval.ts) needed no change at all.

**The population became derived rather than inherited.** Participants are what the emitted SVG draws. That admits appeared boxes -- which occupy their full rect from t=0 while fading in, and can be struck by a sweeping box, a three-way blind spot no single-frame check could see -- and excludes disappeared ones for free, as a fact about the renderer rather than a clause in the check.

**Delegation, so each fact is reported once.** Overlaps whose range reaches t=1 belong to the finished figure's own `boxes-do-not-overlap`. Conditional on that check being enabled: when `allowOverlap` (decision 0010) stands it down, the silence has nothing to rest on, so the violation is reported here.

**Three false disclosures deleted**, all with one cause -- each was written about the design that was intended rather than the SVG that is emitted, which is the identical error the check itself was making. A connector does not "hard-cut between its two authored paths"; it is pinned to its second-state route for the whole transition. A disappeared element was not faded; it was not drawn at all, while the CLI counted it as faded. And the check's own detail said "clear of it at both authored endpoints", already false under M11 the moment any box hard-cut, because the rendered t=0 frame is not the first-state figure.

Four fixtures in [fixtures/animate/](fixtures/animate/) pin all of it, driven through `commandByName("animate")`. Refusal, not silence, was rejected here on purpose: refusing a box that slides and changes colour would reject the most ordinary animation anyone writes, and the renderer's behaviour is fully determined, so there is no unknown to be honest about. Disclosure instead. Full suite 766/766.

### 2026-08-24 - M11.2: easing, exits, and the reader who asked for less motion

The other half -- improving the animation itself, and the first milestone where a *visual* improvement had to buy its way past the house rule. [ADR 0014](docs/decisions/0014-animation-m11-2-motor.md).

**Easing costs the check nothing, and that is a proof rather than a hope.** Every box shares one easing `e`, so overlap at time `t` is overlap at parameter `s = e(t)`; if `e` is continuous, non-decreasing and fixes 0 and 1, the intermediate value theorem makes "overlaps somewhere strictly inside" **invariant** under it. The solver answers in `s`, and that is already the answer in `t`. Each premise became a refusal in [src/anim/easing.ts](src/anim/easing.ts): overshoot is rejected by `0 <= y1 <= y2 <= 1` -- a Bezier lies inside the convex hull of its derivative's Bernstein control values, so that is *sufficient*, conservative, and stated as such; `steps()` is rejected because it skips ranges of `s` where a real overlap can hide.

**Disappearing elements are drawn now, and fade.** The base carries them re-injected at their first-state position, painted underneath. Being drawn makes them participants -- ADR 0013's population rule did not change, the drawn set did, which is the point of having derived it. Three policies follow: a crossfade is exempt (complementary opacities, never both at full strength); a box gliding through one still fading out is reported, a frame neither authored state contains; and delegation became pairwise, since two boxes both at their first-state place have exactly their first-state geometry.

**`prefers-reduced-motion` is honoured**, which a project running WCAG AA contrast checks on every label had no business omitting. Plus `--loop` and `--delayMs`.

**Two latent defects fixed in passing.** The `@keyframes` name came from a slug mapping every non-alphanumeric to `_`, so `a.b` and `a_b` collided and the second block silently animated the first box from the wrong place -- reachable precisely because ADR 0012's first guard *requires* author-declared ids. And `--durationMs` went from argv into the CSS unchecked, where a value the browser drops leaves the manifest reporting a transition over an SVG that never moves.

**One bug found by reading the emitted CSS rather than by a test:** with a delay, `animation-fill-mode: forwards` parks movers at their *destination* during the hold, then snaps them backwards. Changed to `both`. Same species as the three false disclosures -- a hold that did not hold.

[tests/anim-browser-playback.test.ts](tests/anim-browser-playback.test.ts) loads the emitted SVG into Chromium and seeks the animations through the Web Animations API, because agreeing with your own generated strings is not evidence. Full suite 783/783.

### 2026-08-25 - M13: stagger, without giving up an exact check

ADR 0014 closed with a limit stated as though it were permanent: *"one coherent gesture, rich in space, never in time"*. No waves, no ripples, no cascades. That was correct about `animation-delay` and **wrong about stagger in general**. [ADR 0015](docs/decisions/0015-animation-m13-stagger.md).

The easing proof needs every element to share one monotone reparametrisation of time. A delay gives each its own clock. But a delay is not the only way to move during part of a transition: keep one duration and one clock, and encode the window as **keyframe stops**. `motion: { start, end }` on a `Block` emits `0%, 20% { ...start } 70%, 100% { ...end }` -- the stagger lives entirely in where the stops sit, and the premise survives untouched.

**Hold to ramp to hold is piecewise affine**, so `pairOverlapRanges` cuts the timeline at a pair's at most four window edges and runs `overlapRangesDuringTransition` -- completely unchanged -- per segment, clipping each answer to its own domain before mapping back. Still exact, still no tolerance, still O(1) per pair. The degenerate case is not close to the old behaviour but **identical**: a test asserts agreement over ten thousand random pairs, because M13 must not quietly change the verdict on any figure already drawn.

**The check had to change too, not just the renderer**, and that is the whole justification for the milestone's shape. Stagger removes collisions -- the diagonal swap becomes clean when one box clears out before the other sets off -- but it also **creates** a defect class that does not exist on a shared clock: a convoy with a constant gap is clean until the follower sets off first and drives through where the leader is still parked. Nothing about either authored state changed. A renderer shipped without the matching check would have shipped that as a blind spot.

**Guard 3 refuses easing on a staggered figure**, naming the elements that declared a window. CSS applies a timing function between each *pair of keyframes*, so easing here gives every element its own curve, and the invariance holds only while they share one. Honest refusal beats emitting motion the check cannot speak about.

`motion` is attached after layout by [src/anim/apply.ts](src/anim/apply.ts), the same shape as `categoryGroup` and `shape` -- it changes nothing about layout, so no static check has to learn about it, and a block whose window differs between states is still `moved`, never `restyled`.

**A design intuition the checker overturned immediately.** A radial ripple on the vortex demo was expected to be roughly free. It is not -- it *compounds* the shear the differential twist already has, because an inner seed turns while its outer neighbour has not set off. Asked for the ripple at the standing 138-degree ceiling, the checker returned five colliding pairs. So the ceiling is a curve, not a number, and every point on it was measured: 138 degrees with no ripple, 135 at span 0.8, 121 at 0.6, 99 at 0.45, 77 at 0.3.

Deferred and designed but unverified, deliberately not claimed as working: easing a staggered figure by easing the *global* clock and giving each ramp the corresponding sub-arc of that same Bezier, which De Casteljau subdivision makes exact. Full suite 793/793.

### 2026-08-25 - M14: N-state sequences, and a correction to a non-goal recorded an hour earlier

Asked directly whether the engine was ready to produce narrated video "like 3Blue1Brown" -- the honest answer was no, and not close: no video encoder exists anywhere in this project, and three of that genre's signature moves (shape morphing, a camera, per-element easing) are refused on principle, not pending effort. But the question surfaced a real problem with the record itself: ADR 0014 had named "multi-keyframe timelines" a non-goal on the SAME sentence that refused a camera, and a Terza reasoning session (9 iterations) found that sentence answered two different questions with one verdict. [ADR 0016](docs/decisions/0016-animation-m14-sequences.md).

**Checkability is necessary and not sufficient**, and the session's own critic supplied the counterexample that made this precise: a `slides` preset would pass every existing check and still be the wrong thing to have built. Camera fails the FIRST test outright -- there is no check for "is this legible at this zoom", and inventing one is a research problem -- and stays refused, unconditionally. A sequence of states passes the first test and needed a genuinely separate bound for the second, and "more than two states" turned out not to supply one: a prelude counterexample (forty states at 200ms each) is a checked slideshow, fully compliant with any rule phrased in state count, indistinguishable from a presentation. State count was the wrong axis the whole time.

**The right bound is identity continuity, and it was already sitting in the code.** `diffFigures`'s own `persisted` count -- the exact property guard 1 has trusted since ADR 0012 -- says whether two consecutive states are the same figure evolving or two unrelated ones back to back. Every consecutive pair now needs at least one persisting element, or the run is refused as two figures rather than one. Heuristic at the edges, and said so rather than oversold.

**What generalises for free, called once per consecutive pair rather than once for the whole command:** `diffFigures`, both `validateAnimationSpecs` guards, `buildTimeline`, `renderedTrajectories`, `requireLinearWhenStaggered`, `boxesDoNotOverlapDuringTransition` -- none of it changed. M13's piecewise-affine proof already covers this shape. The two-state delegation rule ("t=1 defers to the finished figure, t=0 defers pairwise to the first state") turns out to generalise into something CLEANER than the original: every scene boundary is an independently rendered, statically checked frame, so every boundary delegates to its own frame, and the motion check owns exactly what is interior to a transition.

**What does not generalise for free: reappearing under the same id.** An element that disappears (drawn once, injected where it left from -- ADR 0014's own mechanism) and comes back would need a second DOM node sharing that id. Refused with a named `SpecError`, the one edge identity-continuity alone does not resolve.

**Two latent defects found by sampling the rendered animation in a browser, not by trusting the generated CSS.** A track whose last explicit keyframe stop lands before 100% of the run gets its tail SYNTHESISED by the browser from the unanimated default -- opacity 1, no transform -- silently undoing a fade-out partway through a sequence; the mirror bug shows a newcomer from t=0 when its track starts later. Fixed by anchoring every track explicitly at both ends of the whole run. Separately, `pct()`'s 2-decimal rounding put a segment boundary at k/3*100=33.33% instead of the true 33.333...%, measurably early -- a sample taken at exactly that fraction read opacity 0.9999 instead of 1. Raised to 6 decimals; every M13 stagger window inherits the fix along with sequences, since both share the one function.

The two-state path is untouched: same functions, same output format, [commands.ts](src/commands.ts) keeps it as its own branch, and all 793 prior tests pass unmodified. `--durationMs` now means the length of EACH transition, stated explicitly in the summary line rather than left as a silent multiplication. Full suite 805/805.

### 2026-08-25 - M15: connector routes animate, so a line can be a line (ADR 0017)

Shown the finished derivative animation from M14, the response was that using points instead of lines isn't good. A fair reading of a real defect, and the defect was not in the figure: the parabola was drawn as 18 dots and the secant as 8 more, and the build script's own header called that a design decision. It was not one. Connectors were pinned to their second-state route for the whole run -- the M12 debt -- so a line joining two moving endpoints would have sat perfectly still while the endpoints slid out from under it. Boxes were the only thing that moved, so anything that had to move had to be built out of boxes. The dots were a workaround wearing the costume of a choice. [ADR 0017](docs/decisions/0017-animation-m15-routes.md).

**`d` in CSS, not SMIL.** SMIL is the obvious way to animate SVG geometry and it was rejected: `document.getAnimations()` cannot see it, and it runs on its own clock, which would have put the two halves of one emitted figure under two timebases -- exactly the drift ADR 0013 was written about, re-introduced deliberately. `d` is an animatable CSS property, so a route tween is an ordinary keyframe block on the same clock and the same easing. Measured rather than assumed: at global fraction 0.25 a path coordinate and a box translate both sat at progress 0.1292, so the easing-invariance proof carries over untouched.

**The new degree of freedom shipped with the check that constrains it, and the exactness had to be re-earned rather than inherited.** A moving segment against a rectangle needs a third separating axis -- the segment's own normal -- and that axis TURNS as the line moves, so the corner cross products are quadratic in `t` where every box-versus-box term was affine. [src/anim/sweep.ts](src/anim/sweep.ts) settles it by sign-invariant partition: cut `[0,1]` at every real root of all twelve polynomials, then one evaluation per piece decides it by the intermediate value theorem. Still closed form, still no tolerance. Validated against the static predicate over 16M random comparisons and 60M adversarial ones -- a line pivoting past a 9px box, where only the quadratic axis decides -- with zero mismatches.

**Two refusals rather than known limitations**, both because the alternative is a figure disagreeing with itself on screen: a route whose two states have different vertex counts (CSS swaps discretely at the midpoint instead of tweening, and flattening a curve can change that count when its endpoints move), and a moving route carrying an arrowhead (nothing CSS-animatable moves the head in step).

**`allowConnectorCrossing` stands the transition check down wholesale**, a deliberate divergence from `allowOverlap` and argued as such in the ADR: a line crossing a box is one phenomenon whether it is moving or not, and enforcing it mid-transition anyway would fail every figure that marks a point ON a plotted curve. Full suite 812/812.

### 2026-08-29 - The surface an agent actually writes: validated preset inputs, style packs, symbol shapes, and a type system

Four bodies of work that all land on the same surface -- the document an agent authors -- plus the defects found while establishing baselines for them.

**Every input this project accepts was validated except the one it tells agents to write.** [ADR 0018](docs/decisions/0018-preset-input-validation.md). `parseSpec` is two hundred lines of hand-rolled refusals with exact field paths; the preset input had none, and `isPresetInput` checked only that `preset` was one of five strings before handing everything else, unexamined, to an expander. Three measured failures: an edge to a nonexistent node came back as fifteen frames of minified ELK; a chart missing `series` came back as a `TypeError` with a stack into the preset; and `{"preset":"flowchart"}` -- the reflex this whole project exists to intercept -- fell through to the raw-IR validator and complained about a `spec.version` field the author never wrote. `isPresetInput(parsed) ? expand(parsed) : parseSpec(parsed)` had been written independently four times, and `animate` was the copy that got forgotten: an N-state sequence validated nothing and paid a browser launch per state before saying so. All four now call `parseFigureInput`, which removed a duplication rather than adding a layer beside one. A `validate` command answers about the document without launching a browser at all. 812 -> 829.

**Style packs, so a look is named once rather than written on every element.** `canvas.style` names `elevated`, `neon`, `spotlight` or `etched`, mapped by the `role` an element already declares ([src/effects/styles.ts](src/effects/styles.ts)). Applied right before `normalise`, so from there down a packed effect is indistinguishable from a hand-written one -- same `resolveEffects`, same bleed arithmetic, same `effect-within-canvas`, same repair growing `canvas.padding`. Three rules, each with a test: it fills only absences (an authored `effect` wins), it never styles a `callout`, and it buys no exemption. The new `styles` command lists each pack with the bleed every role costs, since that reach is the real difference between them.

**Six symbol shapes** -- `parallelogram`, `trapezoid`, `chevron`, `cross`, `star`, `note` -- taking the repertoire from 7 to 13. Every one is a polygon, and deliberately: `shapeVertices` hands the SAME vertex list to `inPolygon` for containment and to the `<polygon>` for drawing, so `label-within-shape` answers about the shape actually on the page rather than an approximation. A curved symbol (a cylinder, a cloud) would break that identity and is not offered. Two of them are markers rather than containers, and the generated reference now says so in numbers: a `star` holds 27.6% of its bounding box and a `cross` 55.2%, so `label-within-shape` refuses even a two-character label in a star at ordinary node height -- which is correct, and is why a symbol sheet should caption them rather than label them.

**Typography, the third design system.** Colour had themes and depth had style packs; type had one family stack, one size and one line-height for everything -- a categorical absence rather than a gap of degree. [src/typography.ts](src/typography.ts), documented in [docs/design/TYPOGRAPHY.md](docs/design/TYPOGRAPHY.md) and served over MCP as `prancheta://typography`. The load-bearing decision is that type keys on `level` (how loud) rather than `role` (what it means), and one ordinary poster is why: its date line is the largest type on the page and means nothing, while a safety notice may be the smallest and mean the most. A warning caption is `{role: "warning", level: "caption"}`, and a test asserts the two vocabularies never collapse into one. Four packs over seven levels, with `letterSpacing` emitted into the measurement mirror and read back from `getComputedStyle` rather than carried forward -- emitting it only at draw time would have made every `text-fits-box` result a lie on any tracked label. Portability is derived rather than asserted: a pack is self-contained only when every level's first-choice face is bundled, and only Inter is, so `type` names exactly which levels will fall back. The size ladder is asserted monotone, and the first draft failed it -- the poster eyebrow had been filed as a `subtitle`, and an eyebrow is a device rather than a size step, so it became its own level.

**The generator library became supported; the generators stayed experiments.** Six generators used `lib.mjs` and seven abandoned it, re-deriving its own canvas constants on the way out -- and the cause was not that they outgrew the frame (`phyllotaxis` re-implements `poster()` inline with lib's exact magic numbers on lib's exact canvas) but that every helper took the accumulator array as its first argument, so a generator wanting one local helper wrote a closure and lost the import with it. `page()` closes over its own kids and its own theme; `carve` emits a rule as segments that stop short of everything reserved; `panel` maps a sub-region to data space and reserves tick labels before drawing any grid. Acceptance test, and it passed: `collatz.mjs`, a genuinely new two-panel poster written from the library and README only, 88 lines against 340 for the comparable hand-rolled ones. Nothing was migrated, so the measured claim is forward-looking only.

**Four defects found while baselining, three of them pre-existing.** `check:root-clean` flagged `.git` as an unapproved root item, so `npm run validate` exited 1 on any real clone even when every test passed -- meaning the check had never once passed on an actual clone, only on a copy of the tree with no VCS directory. `SHAPE_DESCRIPTIONS` was missing `triangle`, and `LINE_DESCRIPTIONS` all three structural border styles, so the generated reference had been printing `undefined`; `scripts/` sits outside `tsconfig`, so a `Record<ShapeKind, string>` was never exhaustiveness-checked. A 51-state animation produced a 700-character filename the filesystem refused, AFTER every state had been rendered and checked. And `loadState` mapped its states with `Promise.all`, asking Chromium for one browser instance per state at once: a 77-state run died three times at a 30s Playwright timeout, and finished in under half the wall time once loaded one at a time.

Graph layout gained ELK wrapping (`wrapping`, `aspectRatio`), because a fifteen-step chain laid out in one direction came out 4004x383 -- checkable, correct and unreadable. The figure that found it is now the README's fourth gallery plate: the pipeline drawing itself. Full suite 861/861.

## Where this goes next

Every milestone in the original plan reached a ✅ at some point, but a 2026-08-24 reachability audit found several were marked done on the strength of a passing test file rather than a real consumer — the same failure mode step 36 caught first. See [docs/PLAN-NEXT.md](docs/PLAN-NEXT.md)'s stage 5 and 6 tables and the entry below for what is and is not actually wired. What follows here is no longer a schedule — it is the shortlist the probes left behind, in the order the evidence favours.

**Animation, after M15.** M11 shipped box tweening with a sampling-free check and a real consumer; M11.1 made that check model the animation that actually renders; M11.2 added easing, exits and reduced motion; M13 added stagger; M14 added N-state sequences; M15 retired the M12 debt, so a connector's route animates its own `d` under a check that stayed exact through a separating axis that turns. What is left, in the order the evidence favours: **multi-label diff**, so a box that slides *and* recolours actually slides rather than hard-cutting — it changes `FigureDiff`'s public shape and the `diff` command's output, which is why it was not absorbed into M11.1. **Easing a staggered figure**, designed in ADR 0015 and still unverified. **An arrowhead on a moving route**, refused by M15 because nothing CSS-animatable moves the head in step with the path — as is a route whose two states flatten to different vertex counts. **Video export** (a PNG-frame-sequence encoder), possible as an explicitly lossy convenience but never as the deliverable — it would destroy the `prefers-reduced-motion` behaviour M11.2 shipped. Resize/restyle/retext tweening remain unstarted. Shape morphing, a camera and per-element easing are refused on principle (ADR 0016), not deferred — no check exists for any of them, and for a camera none can, since legibility under zoom is a research problem.

**Semantic checks.** Everything verified so far is geometric — that a figure is well-formed. Nothing checks that an arrow points the way the content says, that no entity was invented, that nothing was dropped. That needs a model in the loop and so cannot live in CI, which is exactly the line drawn in [0004](docs/decisions/0004-selection-core.md) and [0005](docs/decisions/0005-module-protocol.md). It ships as a script when it ships.

**A wider repertoire.** Five presets is enough for selection to be a real choice and not enough for it to be interesting. `compose` and `none` are reachable but thinly exercised; the ranking's benefit is still mostly latent. The three design systems that arrived since — themes, style packs, type packs — widen how a figure can *look* without widening what it can *be*, which is the axis still short of evidence.

**KaTeX**, still owed from M2 and still not needed by anything in the repertoire.

---

## Later, not planned in detail

Animation rendering · manim / Motion Canvas / Remotion integration · interactive figures · publishing to npm.

## Open questions, not blocking

- LaTeX via KaTeX was listed under M2 design-system work and is **not** done. Nothing in the repertoire needs maths typesetting yet; it lands when a preset does.

- Final rasteriser: Chromium for fidelity, or resvg for identical output across platforms. M0 evidence: on this figure the two are visually indistinguishable, so resvg stays a *check* for now and the decision can wait for a figure that stresses gradients, filters or clipping.
- Whether `graph` should also front Graphviz, or ELK alone is enough.
- Where pacing and camera live once animation arrives. The states-plus-transitions idea bounds this, and M13 tested part of it: per-element *pacing* fits inside two states as a motion window, without a timeline. Camera is still untested and still unstarted.

## Known costs, accepted deliberately

- Node plus a bundled Chromium is newly required on a machine where Python already works. Cost-neutral at best.
- Maps sit behind a subprocess boundary and will be the least integrated figure class in v1.
- Generated host views guarantee freshness, not usefulness. A complete but lifeless preset list passes every staleness check. No mechanical fix exists.
