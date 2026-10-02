# Choosing what to draw

Hand-written. Reviewed. Every rule id below exists in `src/selection/rules.ts`, and a test fails if this document invents one or forgets one — but the reasoning here is not generated from the table and never should be, because the comparative judgement is the part a table cannot hold.

## The failure this exists to prevent

Given a request, an agent reaches for a flowchart. Not because a flowchart is right, but because it is available. Every shipped diagramming skill has this failure, and it is not a rendering problem — the flowchart renders beautifully. It is a **selection** problem, and selection is the only thing here worth being good at.

So the first question is never "how do I draw this". It is **"what is this, and what would drawing it as a graph destroy?"**

## Answer two questions, not one

**What is the content?** — a graph, a hierarchy, a series, a scene, a set, a function, an interval, a vector, an angle, a construction, a configuration in space, a school solid, a surface, a solid of revolution, a field, a sequence, a linear map, an electric field, a circuit, a ray diagram, an automaton, a boolean function, raw data to summarise, a probability law, a probability tree, overlapping sets, or an acid–base equilibrium.

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

A function is none of those (`S-function-favours-function-graph`). *"Draw y = x² and its tangent at (3; 9)"* names a curve over a continuum, and everything a reader takes from the figure — where it crosses the axis, which point is open, how steep the tangent is — is a property of the function, not of any list of values. So it is not a graph, whatever the word suggests (`S-function-disqualifies-graph`); it is not a chart, which joins the samples it was handed and so draws whatever those samples happened to be (`S-function-disqualifies-chart`); and it is not a stack of blocks, which has no plane at all (`S-function-disqualifies-blocks`). The preset evaluates the expression it is given, computes every labelled point from it, and refuses a coordinate typed by hand — which is how the Cálculo 1 sheet ended up printing "(2, 5)" next to the decimal "0,5". The same function also has a second honest picture, its sign table (`S-function-favours-sign-chart-weakly`): where f, f′ or f″ are positive, negative or zero, and where f rises and falls. It is offered at the floor and never chosen over the graph, because it answers a narrower question — and it is found from the same expression, so the two cannot disagree. A table of its values at chosen points is a third view at the same floor (`S-function-favours-value-table-weakly`), for the exercise that asks "complete the table" before it asks "draw the curve"; every cell is evaluated, none is typed.

An interval is not a function and not a set (`S-interval-favours-number-line`). *"Represente na reta real a solução de x < −1 ou 2 ≤ x < 5"* is a stretch of a continuum whose only facts are its endpoints and whether each belongs, and the number line draws exactly those — ● or ○, a ray to infinity — and computes a union or intersection row from the rows above it rather than accepting one typed. A stack of blocks has no line to stretch along (`S-interval-disqualifies-blocks`).

A vector is not an edge (`S-vector-favours-vectors`, `S-vector-disqualifies-graph`). An edge joins two things and may be drawn any length; a force or a displacement has a length and a direction that must be drawn to scale, and what an exercise does with vectors — adds them, decomposes them, projects one onto another — is arithmetic the preset performs from the vectors themselves, with every printed length measured against the arrow it names.

An angle on the trigonometric circle is its own question (`S-angle-favours-unit-circle`). *"Marque 5π/4 no ciclo e indique seu seno e cosseno"* asks where a rotation lands and what its projections are, not what curve sin traces over time — so it is the unit circle, where the point is (cos θ, sin θ) computed from the angle, the notable values print exactly (√2/2, not 0,707), and the arc beside the printed angle is checked against it.

A construction is not a scene and not a graph (`S-construction-favours-construction`, `S-construction-disqualifies-graph`). A triangle with its circumcircle, an altitude with the lengths it cuts, an ellipse from its foci — each is a chain of definitions, and a figure drawn by hand beside the numbers it claims can disagree with them in every link. The `construction` preset carries the chain out: free points are the only typed coordinates; every intersection, foot, bisector, tangent and conic is computed; and the only numbers on the drawing, lengths and angles, are measured against the ink they label.

A configuration in space is its own question (`S-space-favours-space`). *"Represente o plano 2x + 3y + 6z = 12 e a reta r que o fura em I"* is about which points, lines and planes there are, and which part of r a reader sees through π. The `vectors` preset has no third axis (`S-space-disqualifies-vectors`), and a graph has no coordinates at all (`S-space-disqualifies-graph`). The `space` preset draws it through the textbook's cavalier camera. Typed coordinates are the only input. Every intersection, foot, cross product and common perpendicular is computed. Every distance, angle and equation is printed exact in the panel, and a line is dashed exactly where a plane patch is nearer the reader.

A school solid is its own question (`S-solid-favours-solid`). *"Um cone tem raio 2 e altura 4; calcule a geratriz e o volume"* is about a body and the numbers its dimensions fix, not about points on axes. The `space` preset draws lines and planes and has no rims or silhouettes (`S-solid-disqualifies-space`), and a graph has no geometry at all (`S-solid-disqualifies-graph`). The `solid` preset takes the dimensions once. Every vertex, rim ellipse and silhouette is computed from them. Hidden edges are dashed by which faces the reader sees. Diagonals, slant heights, volumes and areas are printed exact (`2√3`, `2√5`, `16π/3`), and each length on the drawing is measured in true 3D length. Composites (a sphere in a cube, a cone in a cylinder) are transparent: each solid dashes only its own hidden edges.

The graph of a function of two variables is its own question (`S-surface-favours-surface`). *"Esboce o gráfico de f(x, y) = x² + y² e suas curvas de nível"* is not a curve on a plane — `function-graph` has one variable (`S-surface-disqualifies-function-graph`) — and not a configuration of points, lines and planes (`S-surface-disqualifies-space`). The `surface` preset takes the expression and the domain. Every mesh height is f, cells are painted far to near, which is exact for a surface with one z per (x, y), and every line is drawn only where no nearer cell covers it. Level curves are found where f = c and drawn at their height and projected onto a floor; a point's height is computed, and its tangent plane is printed exact (`z = 2x + 2y − 2`). A sphere, a torus or a surface that crosses itself has more than one z per (x, y), and no preset or module draws it yet: say so rather than approximate it. A flat contour map is the `field` preset's.

A solid of revolution is not a school solid (`S-revolution-favours-revolution`, `S-revolution-disqualifies-solid`). *"Calcule o volume do sólido obtido girando a região entre y = x² e y = x em torno do eixo x"* names a region and an axis, and the body exists only as what the region sweeps; the `solid` preset has dimensions and no functions, and the `space` preset has no curved silhouette (`S-revolution-disqualifies-space`). The `revolution` preset takes the bounding functions, the interval and the axis. The region is sampled from the functions, the silhouette and rims are swept from it, and the far half is dashed. The slice the method names — disc, washer or shell — is drawn at a chosen x with R(x), r(x) and dx labelled on it, and the volume integral is evaluated numerically and printed exact when it snaps (`2π/15`), never typed.

A field is not a function and not a vector (`S-field-favours-field`). *"Esboce o campo de direções de y′ = x − y e a solução com y(0) = 3"* asks for a direction at every point and the curve that follows them. `function-graph` draws curves it is handed (`S-field-disqualifies-function-graph`), and `vectors` draws a few arrows to scale (`S-field-disqualifies-vectors`). The `field` preset evaluates the slope or the vector (P, Q) on a lattice and integrates every solution or flow curve from its starting point by RK4, stopping and saying so at a singularity. Level curves of f(x, y) = c are found by marching squares, and the gradient drawn across them is computed by central differences.

A sequence is not a function (`S-sequence-favours-sequence`, `S-sequence-disqualifies-function-graph`). *"Represente os cinco primeiros termos de aₙ = (−1)ⁿ/n e indique seu limite"* has nothing between n and n + 1, and a curve through its terms draws values that do not exist. It is not a chart either (`S-sequence-disqualifies-chart`): a chart plots the numbers it is handed, and here every term, every partial sum and each limit is computed from the formula. The `sequence` preset evaluates aₙ or Sₙ at each n and draws unjoined dots. It computes the limit of the terms and the limit of the partial sums separately, with the numeric kit. Each limit is drawn as its own dashed line at its own height, printed exact when it snaps (`= 1`, `= e`) and approximate when it does not.

A linear map is not a vector and not a graph (`S-linear-map-favours-linear-map`, `S-linear-map-disqualifies-vectors`, `S-linear-map-disqualifies-graph`). *"Represente a transformação T(x, y) = (2x + y, x + y), a imagem do quadrado unitário e a área da imagem"* asks what one matrix does to the whole plane, not which arrows add up: `vectors` adds and scales arrows and cannot carry a lattice or a region through a map, and a graph has no coordinates at all. The `linear-map` preset takes the 2×2 matrix — numbers, expressions such as `"sqrt(3)/2"`, or a named rotation, reflection about a line, shear, scale or projection, whose matrix it computes and prints. The image of the lattice, T(e₁) and T(e₂) as the columns, the unit square's parallelogram, the eigen-lines and every shape's primed vertices are computed from it, and the printed area |det A| is measured against the polygon drawn by the area check. Complex eigenvalues are stated as `a ± bi` with no line drawn, and a singular map says which line it collapses the plane onto.

A charge diagram is a field, not a set of arrows (`S-electric-field-favours-field`). *"Esboce as linhas de campo de duas cargas, +2q e −q"* asks for curves that leave the positive charge, end on the negative one, and whose count follows the charge. `function-graph` draws curves it is given (`S-electric-field-disqualifies-function-graph`), and `vectors` draws a few arrows (`S-electric-field-disqualifies-vectors`). The `field` preset with `kind: "charges"` seeds lines on each source in proportion to its charge and integrates them along E. A line stops on entering a charge of the other sign, at the box, or at a point where E = 0, which it marks. Equipotentials are found where V = Σ q/r = c.

A DC circuit is not a graph and not a callout scene (`S-circuit-favours-circuit`, `S-circuit-disqualifies-graph`, `S-circuit-disqualifies-annotated-figure`). *"No circuito abaixo, calcule a corrente em cada resistor e a ddp entre A e B"* shows a fixed drawing whose numbers are consequences. The `circuit` preset takes the nodes with their grid coordinates and each component between two of them; only resistances, EMFs and source currents are typed. Every branch current, meter reading, U_AB and power comes from nodal analysis, and each arrow points the way conventional current actually flows — in a two-battery problem, the battery being charged shows it. A circuit with no answer is refused by name: a shorted source, a loop of ideal sources, a floating subcircuit.

A ray diagram is its own question (`S-optics-favours-optics`). *"Construa a imagem de um objeto de 3 cm a 30 cm de uma lente convergente de distância focal 10 cm e classifique-a"* or *"um raio passa do ar para a água com 30° de incidência; desenhe o raio refratado"*: the image and the angle are consequences, and rays placed by hand can miss them. Rays are not vectors (`S-optics-disqualifies-vectors`) and not callouts (`S-optics-disqualifies-annotated-figure`). The `optics` preset computes the image by Gauss (1/f = 1/p + 1/p′, A = −p′/p), constructs the principal rays from their own rules — virtual images and extensions dashed — and prints the nature of the image. At an interface the refracted angle is Snell's, and past the critical angle the figure shows total internal reflection with θc.

An automaton is a graph whose meaning is its runs (`S-automaton-favours-automaton`, `S-automaton-disqualifies-graph`, `S-automaton-disqualifies-labelled-blocks`). *"Desenhe o AFD que reconhece as palavras terminadas em ab e mostre a execução de aab e ba"* needs a start arrow, double circles for accepting states, and each word run through the machine. The `automaton` preset draws it in Sipser's style and prints, for each word, the path of states (or, for an NFA, the sets of states with ε-closure) and "aceita" or "rejeita", computed and never typed.

A boolean function has two honest pictures, and the verb chooses. *"Mostre que ¬(p ∨ q) é equivalente a ¬p ∧ ¬q"* asks for its values: a `truth-table` (`S-boolean-favours-truth-table`), one row per assignment, a column per subexpression, and a line saying which columns agree — not a `value-table`, which evaluates real functions (`S-boolean-disqualifies-value-table`). *"Desenhe o circuito de S = A′B + AB′ só com portas AND, OR e NOT"* asks for gates: a `logic-circuit` (`S-logic-circuit-favours-logic-circuit`), laid out from the expression tree, never a graph (`S-logic-circuit-disqualifies-graph`). Both parse the same expression; asked to simplify, the circuit draws the Quine–McCluskey minimal form, and given the inputs, it prints every wire's value.

Raw observations are summarised, not plotted (`S-data-favours-statistics`, `S-data-disqualifies-chart`). *"Construa o histograma das alturas dos 40 alunos e calcule a média e o desvio padrão"* or *"desenhe o boxplot das notas das turmas A e B e identifique os outliers"* give a list of numbers, and every bar height, quartile and spread is a consequence of it. A chart plots values it is handed, one separated bar per category; a histogram's bars touch over consecutive classes [a; b), and each height is a count. The `statistics` preset chooses the classes by Sturges' rule (or uses yours), computes the quartiles by one stated method, draws the whiskers to the last value within 1,5·IQR and the outliers beyond, and prints n, x̄, Md, Mo, s and IQR from the same data.

A probability law with an event is its own question (`S-distribution-favours-distribution`). *"Sombreie a área sob N(70; 5²) entre 60 e 75 e calcule a probabilidade"*, *"encontre os valores críticos de um teste bilateral com α = 5%"* or *"binomial n = 10, p = 0,3: P(X = 3)"* take the law's parameters and the event. A density typed into `function-graph` leaves the curve, the bounds and the number free to disagree (`S-distribution-disqualifies-function-graph`), and a chart draws data, not a law (`S-distribution-disqualifies-chart`). The `distribution` preset shades the region, measures its printed probability against the area drawn, labels the boundaries with x and z, and prints the standardisation and the Φ arithmetic — arithmetic that holds on the page to its last digit.

Random stages that multiply along a path are a probability tree (`S-probability-tree-favours-probability-tree`). *"Uma urna tem 3 bolas vermelhas e 2 azuis; retiram-se duas sem reposição; qual a probabilidade de cores diferentes?"* is arithmetic on a tree: each branch carries its probability, each leaf the product of its path, the event is the sum of the highlighted paths. A mindmap or a graph would draw the tree and none of that (`S-probability-tree-disqualifies-mindmap`, `S-probability-tree-disqualifies-graph`). The `probability-tree` preset builds the tree from the urn or from typed branches, refuses a node whose branches do not sum to 1, and computes path products, event sums and Bayes conditionals in exact fractions.

How sets overlap is a Venn diagram (`S-set-relations-favours-venn`). *"Sombreie (A ∪ B) − C"* or *"numa pesquisa com 100 pessoas, 45 leem o jornal A, 30 o B, 12 ambos: quantas não leem nenhum?"* is about regions: which ones an expression covers, how many people each holds. Blocks cannot show shared members (`S-set-relations-disqualifies-blocks`), and overlapping sets are not intervals (`S-set-relations-disqualifies-number-line`). The `venn` preset traces every region from the circle geometry, shades an expression by evaluating it on each region, solves survey data by inclusion–exclusion — refusing data that would leave a region negative — and prints each count inside its own region, the outside included. The older "set" structure, an unordered bag of items, stays a stack of blocks.

A titration, a species-distribution diagram or the pH scale is its own question (`S-acid-base-favours-acid-base`). *"Trace a curva de titulação de 25 mL de CH₃COOH 0,1 mol/L com NaOH 0,1 mol/L e marque o ponto de equivalência"*, *"mostre a fração de H₂CO₃, HCO₃⁻ e CO₃²⁻ em função do pH"* or *"coloque na escala de pH uma solução com [H⁺] = 10⁻³ mol/L"* take the constants, concentrations and volumes, never the points. A curve typed into `function-graph` leaves the equivalence point and the pKa read at half-equivalence free to disagree with it (`S-acid-base-disqualifies-function-graph`), and a chart draws values it is handed (`S-acid-base-disqualifies-chart`). The `acid-base` preset solves the charge balance at every volume, marks the initial, half-equivalence and equivalence points on the curve it draws, prints an indicator's verdict from the jump it computed, and puts the crossings of a distribution diagram at exactly pH = pKa.

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
