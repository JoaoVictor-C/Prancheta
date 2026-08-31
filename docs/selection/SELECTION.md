# Choosing what to draw

Hand-written. Reviewed. Every rule id below exists in `src/selection/rules.ts`, and a test fails if this document invents one or forgets one — but the reasoning here is not generated from the table and never should be, because the comparative judgement is the part a table cannot hold.

## The failure this exists to prevent

Given a request, an agent reaches for a flowchart. Not because a flowchart is right, but because it is available. Every shipped diagramming skill has this failure, and it is not a rendering problem — the flowchart renders beautifully. It is a **selection** problem, and selection is the only thing here worth being good at.

So the first question is never "how do I draw this". It is **"what is this, and what would drawing it as a graph destroy?"**

## Answer two questions, not one

**What is the content?** — a graph, a hierarchy, a series, a scene, or a set.

**How must it be drawn?** — plain flow, annotated, a cross-section, over a substrate, or as a chart.

Keeping these apart is the whole trick. *"Draw our microservice call graph as a subway map"* is unambiguously a graph **and** unambiguously demands a substrate. Collapse the two questions into one and you must reject one truth to honour the other. So: **an idiom constrains how a figure is drawn; it never changes what the content is** (`I-substrate-does-not-disqualify-structure`). What a substrate *can* do is rule out a form that cannot express it — stacked blocks have no plane to lay a substrate on (`I-substrate-disqualifies-plain-blocks`).

## Refusal comes before preference

Most of the value is in what gets **refused**.

A spatial scene is not a graph. Boxes and arrows will render an engine block, and the result will be wrong in a way that looks fine — so the graph preset is refused outright for scenes (`S-nograph-disqualifies-graph`), and refusal beats weight even when the content is *also* a graph. An annotated schematic of a signal path is both; it is still drawn as a figure.

A series is not a graph either (`S-series-disqualifies-graph`), and it is not a stack of labelled blocks (`S-series-disqualifies-blocks`) — values without a scale become unordered text, which is worse than useless because it looks deliberate. Nor, still, is a chart a graph (`I-chart-disqualifies-everything`): a bar's length is a claim about a scale, and nodes and edges misrepresent that claim exactly as badly as unordered blocks do. This rule predates the chart preset below and outlived the reason it was first written — refusing the graph for a chart idiom was always correct; only the excuse ("this repertoire does not have one") stopped being true.

## Then prefer

A graph is drawn by the graph preset (`S-graph-favours-graph`). Plainly. The flowchart is not forbidden — it is only wrong when the content is not a graph.

A single-rooted hierarchy is a mindmap (`S-hierarchy-favours-mindmap`) rather than a general graph, because a radial tree shows depth at a glance where a layered graph shows only edges. A tree is still a graph, so the graph preset stays a weaker candidate (`S-hierarchy-favours-graph-weakly`) — which matters when the content is asserted to be *both*, as a dependency graph with diamonds is. Assert both and you get the graph; that is not a bug.

A scene wants callouts on leader lines (`S-scene-favours-annotated`), as does any request that names its parts (`I-annotated-favours-annotated`) or asks to be sectioned (`I-cross-section-favours-annotated`). This is the figure class nothing else serves, and the reason the repertoire exists at all.

A set of items with no relations between them is a stack of labelled blocks (`S-set-favours-blocks`). The plain case must stay reachable: *"just show me the three inputs and the one output"* must not escalate into a graph.

Plain flow is the **absence** of an idiom, not a signal. It nudges towards blocks and never carries a figure by itself (`I-plain-flow-favours-blocks`). An earlier version of this table weighted it as real evidence, and every ordinary flowchart came out as a graph composed with a redundant stack of blocks.

A series with a scale is a chart (`S-series-favours-chart`), as is any request that asks to be drawn as one (`I-chart-favours-chart`) — quarterly revenue, request counts by endpoint, anything where length or position stands for a number. Built entirely from the same boxes every other preset composes: a bar's height or width **is** the encoded value, arithmetic rather than new geometry, so the whole pipeline — text measurement, the repair loop, every check — applies with no new code. A pie or donut is this preset's too, as of the Mark: a wedge is not a box, but it is an outline the IR can state and the checks can walk, and a slice's printed share is measured against the angle it actually sweeps. This sentence used to say the opposite, and said so correctly until ADR 0019 changed what the core could express.

## Answer three questions, not two

There is a third axis, and it is short: **whose geometry is this?**

Almost every request answers "the core's", and the axis stays empty. A few
answer otherwise — a map is projected, a molecule is depicted, a unit cell is
built from lattice vectors and drawn through a depth sort — and for those the
right answer is not a preset at all but a figure module on the far side of
[decision 0005](../decisions/0005-module-protocol.md)'s process boundary.

This axis exists because delegation cannot be reached by exhaustion. The
"none" outcome means nothing fit; a request for a map fits something perfectly well, and
saying "nothing fits" about it would be false. So a domain is something a
request **positively asserts**, and it reads values no preset rule reads —
which is also why these rules tie with nothing in the table beside them.

**A domain refuses the presets that would misrepresent it**, the same move the
scene rule makes one level up. A molecule genuinely *is* a graph — atoms and
bonds — so the graph preset would score well and render beautifully, and no
chemist would accept the result, because which bonds are wedges falls out of
stereocentre perception rather than out of layout
(`D-molecular-disqualifies-graph`). Territory is genuinely a set of named
regions, and stacking them as boxes throws away the only thing a map is for
(`D-cartographic-disqualifies-blocks`).

## Three answers that are not a preset

**Delegate.** Cartographic content goes to the map module
(`D-cartographic-delegates-map`), molecular content to the molecule module
(`D-molecular-delegates-molecule`), crystallographic content to the crystal
module (`D-crystallographic-delegates-crystal`). Delegation is decided before
preset ranking, and that precedence is deliberate: a request that names a
domain is answered across the boundary however well some surviving preset
scores.

Three domains, not seven. The rest of the module repertoire — function plots,
dendrograms, sequence diagrams, soundings — is reached by asking for it rather
than by describing content, and inventing predicates nobody would assert would
make this table longer without making anything more reachable.

**The stated limit.** Delegation is all-or-nothing here: a request that is both
cartographic *and* wants callouts on leader lines delegates, and the callouts
are the module's problem or nobody's. Composing a module with a preset is not
something this table can express, and pretending otherwise by ranking them
together would produce a figure neither half agrees to.

**Compose.** When two candidates clear the floor on *disjoint* evidence, the figure is genuinely two things — a topology *and* a set of callouts — and flattening it into one preset repeats the failure at the top of this page. Overlapping evidence is not composition: an org chart fires both the hierarchy and graph rules, but on the same fact, so it is one figure.

**None.** When nothing clears the floor, say so and author raw IR. A request the repertoire cannot serve is information, not an error.

Until delegation existed, the module repertoire was a list an agent had to already know to consult — nothing in the ranking could reach it, so for selection purposes eleven figure kinds may as well not have been built. That was a real defect in this table and not a missing feature of the modules.

## What the tests actually prove

CI verifies that this **decision procedure** is sound, total, tie-free, and faithfully documented — and that a rendered figure's recorded reasoning matches the preset it actually used.

CI does **not** verify that a model reads a real request correctly. That needs a model in the loop; it ships as a script, not a test. The twenty phrasings in `fixtures/selection/phrasings.json` are therefore tested only from the annotated predicate vector onward.

And one more limit, stated plainly because it is easy to overclaim: those annotations and this rule table were written by the same hand. CI checks **self-consistency between two artefacts with a common author**, not correctness against any external standard.
