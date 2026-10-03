# circuit

DC circuit diagrams for Física 3 and Circuitos (Halliday, Ramalho): "calcule a
corrente em cada resistor", "qual a ddp entre A e B", Kirchhoff's two-mesh
problems, series and parallel, the Wheatstone bridge. **You give the layout.**
Every node has grid coordinates, and every component, wires included, runs
between two nodes. **The preset computes the electrical values.** Every
current, potential difference, meter reading and power on the figure comes
from Modified Nodal Analysis (`mna.ts`). See
[`docs/decisions/0053-circuits.md`](../../../docs/decisions/0053-circuits.md)
for what was refused and why.

**Choose it when** the content is a circuit of resistors, lamps, batteries,
ideal sources, switches and ideal meters, and the question is about its
currents and voltages. It is not for logic gates (`logic-circuit`), and not for
a block diagram of a system (`graph`). It also cannot lay out a bare netlist:
you place the nodes the way the exercise draws them.

## Input

```json
{
  "preset": "circuit",
  "nodes": { "A": [0, 2], "B": [2, 2], "C": [4, 2], "D": [4, 0], "E": [0, 0] },
  "components": [
    { "id": "E1", "kind": "battery", "from": "E", "to": "A", "value": 12 },
    { "id": "R1", "kind": "resistor", "from": "A", "to": "B", "value": 2 },
    { "id": "R2", "kind": "resistor", "from": "B", "to": "C", "value": 4 },
    { "id": "R3", "kind": "resistor", "from": "C", "to": "D", "value": 6 },
    { "kind": "wire", "from": "D", "to": "E" }
  ],
  "show": { "voltages": [["A", "C"]] }
}
```

- **`nodes`**: a name and `[x, y]` for each node, with y pointing up. One grid
  unit is drawn at 70–120 px, whatever fits a 440 px plot.
- **`components`**: each is `{ id, kind, from, to, value?, via?, closed? }`.
  A run from `from` to `to` must be horizontal or vertical. For an L-shaped
  run, give its corner as `via: [x, y]`. The symbol goes on the longer leg.
  `id` is required for every kind except `wire`.

| kind | value | notes |
| --- | --- | --- |
| `resistor` | Ω | zigzag, or a rectangle with `"symbols": "iec"` |
| `lamp` | Ω | ⊗ |
| `battery` | V | long thin plate (+) and short thick plate (−); **+ at `to`** |
| `voltage-source` | V | a circle with + and −; **+ at `to`** |
| `current-source` | A | a circle with an arrow; the current flows **from `from` to `to`** through it |
| `wire` | — | |
| `switch` | — | `closed: true/false` (default open) |
| `ammeter` | — | ideal (0 Ω); prints its reading \|i\| |
| `voltmeter` | — | ideal (open); prints V(`to`) − V(`from`) |

- **`ground`**: the reference node. If you leave it out, the preset uses the −
  terminal of the first battery or voltage source. When given, the ground
  symbol is drawn.
- **`show`**:
  - `currents` (default true): one arrow per branch current.
  - `voltages: [["A", "B"], …]`: prints `U_AB = V_A − V_B = 6 V`.
  - `nodeVoltages`: prints V for every named node and draws the ground.
  - `power`: prints P for every resistor, lamp and source. A source is marked
    `(fornecida)` when it supplies power and `(recebida)` when it absorbs it.
  - `names`: writes `R₁ = 2 Ω` instead of `2 Ω`.
  - `nodeNames`: `"letters"` (default: nodes named by one capital letter, such
    as A or C′), `"all"`, `"none"`, or a list of node names.
  - `currentValues`: `"auto"` (default), `"drawing"` or `"panel"`.
- **`symbols`**: `"zigzag"` (default) or `"iec"`. **`title`** and **`locale`**
  work as in every other preset.

## Diodes, real sources, symbols, taps and load boxes (ADR 0069)

| kind / field | meaning |
| --- | --- |
| `led`, `diode` | triangle and bar; current flows `from` (anode) to `to` (cathode). `vf`: forward voltage in V (default 0, ideal). An LED has two emission arrows and, when the answers are shown and it conducts, is filled yellow. |
| `battery` + `r` | a real source: the battery and its internal resistance r in series (towards the + terminal) inside a dashed box. The terminals are `from` and `to`, so `U_AB` across them is ε − r·i. `show.terminal: true` prints `U = ε − r·i = 12 − 0,5 · 4 = 10 V`. |
| `value`, `r` as a string | symbolic: `"R"`, `"2R"`, `"0,2 R_c"`, `"E"`. |
| `potentiometer` | a resistive wire from `from` to `to` (one straight run, no `via`) of total `value`. `taps`: `[{ "node": "W", "at": 0.25 }]` (`at` a number in (0, 1) or `"1/6"`, measured from `from`) or `{ "equal": ["A", "B", "C"] }`. A tap is a node **placed by the preset** (do not list it in `nodes`); other components connect to it by name. |
| a node as `{ "at": "C", "dx": 0, "dy": 2 }` | a node placed relative to another one (a tap included), so a lead stays above its tap. |
| `load` | a labelled box (`label`, default "aparelho") with `value` Ω **or** `rated: { "power": W, "voltage": V }` (R = U²/P derived). |
| `hideValue: true` | no value beside the component. |

**Diode states.** Every on/off assignment is solved (2ⁿ, n ≤ 14) and only a
self-consistent one is kept: an ON diode holds V_a − V_b = V_f and carries
i ≥ 0, an OFF one carries nothing and sees V_a − V_b ≤ V_f. None consistent, or
two that differ electrically, is refused by name. The panel says
`D₁: aceso, i = 20 mA` or `D₁: apagado` (`show.states`, default on). Currents
under 0,1 A are written in mA.

**Symbolic values.** The solver scales: every resistance (resistors, lamps,
loads, potentiometers, internal r) must be a multiple of ONE symbol and every
EMF a multiple of ONE other symbol (all numbers, or all symbols; mixing is
refused). It solves with each symbol = 1 and prints currents as multiples of
E/R, voltages of E and powers of E²/R: `i = E/(3R)`, `U = 6E/11`,
`P = 25E²/(121R)`. This is a scale solve, not a computer-algebra system: a
resistance `r` unrelated to `R` (a second symbol) is not supported, and neither
are current sources, `vf > 0` or a rated load among symbols.

## What is drawn

- **Symbols**: see the table above. The battery's "+" is drawn as two strokes,
  not typeset, so it is never text sitting on ink.
- **Values**: `10 Ω`, `12 V` or `2 A` beside the component, on the outside of
  the circuit when there is room.
- **Branch currents**: components in series share one branch. They are joined
  at a node where exactly two conducting terminals meet; wires and closed
  switches merge named nodes into one. Each branch gets one arrowhead and one
  name, `i₁, i₂, …`, or just `i` when the circuit has a single current.
  - The arrow points the way conventional current **actually** flows.
  - It sits on a wire of the branch when one is long enough, and otherwise on
    a component's lead.
  - The label reads `i₁ = 0,5 A`. A value is written exactly when it is a
    short decimal or snaps to a fraction (`2/3 A`, `18/7 A`). Otherwise it is
    `≈` with three significant figures. A branch with no current reads
    `i₂ = 0`.
  - With `currentValues: "auto"`, if any label cannot sit right beside its
    arrow, the whole figure is redrawn with only `i₁` on the arrows and the
    values listed in the panel.
- **Junction dots**: only at a node where three or more runs meet.
- **Node names**: for the nodes chosen by `nodeNames`.
- **The panel** below the circuit: current values (in panel mode), then
  voltages, node potentials and powers. Subscripts are set small and low.

Units are separated from the number by a space, and decimals use the pt-BR
comma.

## What is refused

Every refusal names the component or node at fault.

- **Layouts**:
  - a run that is neither horizontal nor vertical (the message suggests a
    `via`);
  - two nodes at the same place;
  - a run through a node it does not connect to;
  - two runs on top of each other;
  - two runs crossing where there is no node they both end at;
  - a run too short to hold its symbol.
- **Netlists** (from `mna.ts`):
  - a source short-circuited by wires (the message names the wires);
  - an ammeter bypassed by a wire;
  - a loop made only of voltage sources and ammeters;
  - a floating subcircuit, meaning one with no conducting path to the ground;
  - a current source in series with an open circuit;
  - a resistance ≤ 0.
- **Input**:
  - a `value` on a meter (its reading is computed, never typed);
  - a negative EMF (swap `from` and `to` instead);
  - an unknown node or flag;
  - an id used twice.

## What is checked

Every fixture passes the same box-model checks as every other preset:
`text-clear-of-ink`, `annotation-nearest-its-owner` (a current's label names
its arrowhead, and a value's label names its symbol), `label-nearest-its-place`
for node names, `label-declares-what-it-names`, `contrast-sufficient` and
`content-within-canvas`.

`tests/circuit.test.ts` tests the solver against circuits solved by hand:
series, parallel, divider, Wheatstone balanced and unbalanced (18/7, 12/7,
6/7 and 30/7 A), two batteries (7,2 V; 2,4, 0,6 and 1,8 A), superposition, a
current source, and power balance in every fixture. It also reads each drawn
arrowhead back and checks it against the sign of its current.

## What is not covered

- Automatic layout from a netlist.
- Capacitors, inductors and AC.
- Two or more different symbols for one quantity type (see "Symbolic values"),
  a current source or a non-zero diode drop in a symbolic circuit.
- A movable meter lead drawn as a motion: draw one figure per tap (the tap is
  a node; move the ammeter's `to`).
- Dependent sources.
- Non-ideal meters.
- Diagonal runs (the diamond-drawn Wheatstone bridge; draw it rectangular).

## answers: false

`answers: false` draws what the exercise gives and none of what it asks. Kept:
the symbols with their given values (and names; an LED's V_f, a source's r, a
load's rating and label, symbolic values), node letters, the ground, the
meters' letters (A, V). Hidden: every branch-current arrow and its label, the
meters' readings, an LED's lit fill, and the whole panel (`U_AB`, node potentials, powers,
currents listed in panel mode). The current arrows are part of the answer
because their direction is what "qual o sentido da corrente" asks. The circuit
is still solved, so an unsolvable netlist is refused either way.
