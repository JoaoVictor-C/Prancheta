# 0053 — DC circuits: layout given, values solved

## Status

Accepted.

## The need

Física 3 and Circuitos lists (Halliday, Ramalho) keep coming back to a few
drawings:

- "calcule a corrente em cada resistor";
- "qual a ddp entre A e B";
- two batteries in two meshes;
- the Wheatstone bridge;
- a divider with a voltmeter across it.

Each drawing is a small, fixed picture. It carries a handful of typed numbers
(resistances, EMFs) and a handful of derived ones (currents, readings,
potential differences).

Raw IR can draw the picture, but it cannot tell whether "i₂ = 0,6 A" is the
answer to this circuit. It also cannot tell whether the arrow beside the label
points the way the current actually flows. A hand-drawn circuit usually gets
exactly that wrong: in a Kirchhoff problem the direction is a result, not a
choice. The second battery in the two-mesh fixture is being **charged**, so
its current runs backwards.

## The decision

### The layout is given; circuit auto-layout is not built

`docs/PLAN-COVERAGE.md` rules out laying out a circuit from a bare netlist.
Here is why:

- A textbook circuit's shape carries meaning. The source sits on the left,
  parallel arms stand side by side, and the bridge is a rectangle with its
  galvanometer arm in the middle.
- A student copies the exercise's drawing. Any layout the machine invents
  differs from the one on the page they are reading.

So the input names each node with grid coordinates. Each component, wires
included, runs between two nodes, either straight along one axis or along an L
through a stated `via` corner. Grid coordinates have y pointing up, as on every
other plane here.

What the preset does own is refusing a layout that misleads a reader. It
refuses:

- a run through a node it does not connect to (on paper this reads as
  connected);
- two runs on top of each other;
- two runs crossing where there is no node they both end at. A crossing is
  read as a connection by one reader and as none by another, whether or not
  there is a dot.

It also refuses a run too short for its symbol. The layout is checked in grid
coordinates, before anything is drawn.

### The values are solved, by Modified Nodal Analysis

`src/presets/circuit/mna.ts` builds the textbook system:

```
[G B; C D] [v; j] = [i; e],   C = Bᵀ,   D = 0
```

It solves the system by Gaussian elimination with partial pivoting.

- **Wires and closed switches** merge their ends into one node before the
  system is built, so they add no unknowns.
- **An ideal ammeter** is a 0 V source, so its current is an unknown of the
  system.
- **An ideal voltmeter and an open switch** are left out: they conduct nothing.
- **Signs**: a battery's + terminal is its `to`, and a current source drives
  its current from `from` to `to` through itself. Every element's current is
  reported from `from` to `to`, so the sign is the direction.

A solver that finds a singular matrix could say only "singular matrix", and
that tells a student nothing. So every way a DC netlist can have no answer is
detected **structurally**, before the system is built, and refused by name:

| refusal | what the student is told |
| --- | --- |
| a source whose terminals wires join | `E1 is short-circuited: its terminals a and b are joined by w1 and w2` |
| a loop made only of sources and ammeters | the loop's members, and "add the internal resistance as a resistor" |
| a subcircuit with no conducting path to the reference | which elements and nodes float |
| nodes reached only through current sources | `current source I1 is in series with an open circuit: nodes x …` |

The reference node is `ground` when given. Otherwise it is the − terminal of
the first battery or voltage source, which is the node a textbook calls 0 V
without saying so. A residual check after elimination stays as a last line of
defence.

### One current per branch, drawn the way it flows

Components in series carry one current, and a textbook names it once. Two
conducting components are in series when they meet at a node where exactly
two conducting terminals meet. Wires and closed switches have already merged
their nodes; voltmeters and open switches do not count. Each branch gets:

- **a name**: `i₁`, `i₂`, … in input order, or plain `i` for a single loop;
- **an arrowhead**:
  - it sits on a wire of that branch when one is at least ¾ of a grid unit
    long. The wire has to lie on the path between the branch's two series
    terminals, walked through the merged node's wire tree;
  - otherwise it sits on a component's lead;
  - it points the way the computed current flows. The label always shows a
    magnitude, and the arrow shows the direction;
- **a label** `i₁ = 0,6 A`, which `annotates` the arrowhead. The label is
  placed so that it is nearer the arrowhead than the wire under it. It stays
  level with the arrowhead's base, where the arrowhead reaches out toward it
  and the wire does not.

A branch with no current gets `i₂ = 0` beside its first resistor, and no
arrow: zero current has no direction to draw.

### Where a current's value goes

A bridge has short leads between crowded labels. On a first attempt, the
Wheatstone fixture's `i₁ = 18/7 A` could find honest room only 50 px above its
arrow, stacked over `R₁ = 2 Ω`. Every check passed, but a reader would have to
hunt for which arrow it named.

`show.currentValues` decides where the values go:

- **`"auto"`** (the default) draws the values beside the arrows when every one
  of them fits within 9 px of its nearest honest spot. Otherwise it redraws
  the figure with only `i₁` on the arrow and the values listed in the panel.
- **`"drawing"`** and **`"panel"`** force one of the two.

The two passes are whole layouts, not a patch. The panel's height changes the
canvas.

The arrow search helps "auto" stay on the drawing. For each branch it tries
every candidate host, wires first and then longest first, and accepts the
first one where the label is near. So the bridge's labels moved onto the lead
past each resistor, and the fixture stays in drawing mode.

### Numbers

Currents, voltages and powers go through `src/locale/format.ts`. A value is
written exactly when it is a short decimal (`11,52 W`, `0,72 W`) or snaps to a
fraction with a denominator up to 12 (`2/3 A`, `18/7 A`). Otherwise it is
written `≈ 0,514 A`, with three significant figures. Units follow the number
after a space, and decimals use the pt-BR comma.

### Symbols

The symbols follow the Brazilian textbook:

- zigzag resistor (IEC rectangle on request);
- battery as a long thin plate (+) and a short thick one (−);
- circled voltage source with + and −, and circled current source with an
  arrow;
- ⊗ lamp;
- Ⓐ and Ⓥ meters;
- a lever switch between two open terminals.

Each circled symbol is **one** pen stroke. It runs up the upper half-circle,
back along the lower half, over the upper half again, and on to the tail. A
component's leads, body and outline are therefore one mark, which is what its
value label `annotates`.

The "+" signs are drawn as two strokes rather than typeset. A glyph beside a
plate is text by the checks' reckoning, and at 4 px from the plate it would be
text on ink.

### Subscripts in the panel

The IR sets a label in a single run of text, so `U_AB` has no subscript. The
panel therefore sets each line as a row of blocks:

- a base run, set flush right against the subscript that follows it;
- the subscript, at 9.5 px and 4 px lower, set flush left;
- and so on across the line.

Widths come from a per-character estimate that is deliberately a little
generous. The slack falls after a subscript, where a space follows anyway.
`text-fits-box` verifies each run against Chromium's own measurement.

## What was refused

- **Auto-layout from a netlist.** See above.
- **Letting the author set a current's direction.** In a textbook the author
  "adopts" a direction and the sign of the answer corrects it. The figure
  shows the answer, so it shows the true direction. If an exercise wants the
  adopted-direction picture, that is a different figure: an unsolved one.
- **A generic "singular matrix" error.** Each unsolvable case gets its own
  structural check and a sentence the student can act on.
- **Junction dots at every node.** A dot marks a T, meaning three or more
  runs. A corner does not get one.
- **Typeset "+" and "−" beside plates.** They are drawn, as above.

## The cost, stated

- Components in parallel between the same two nodes must be given separate
  runs, through their own nodes or `via` corners. The preset refuses to draw
  two components on one run rather than choosing an offset for them.
- A current source's branch gets an arrow on its lead as well as the arrow in
  its own symbol. Both point the same way.
- The panel's subscripts assume the bundled sans' metrics. A much wider
  fallback font would fail `text-fits-box`, and the failure would be reported,
  not hidden.
- The subscript would be better handled in core. If a `Block` could hold rich
  text runs (base and subscript), the panel's hand-packed rows could go.
