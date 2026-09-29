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
- Internal resistance as an attribute (draw it as a resistor in series).
- Dependent sources.
- Non-ideal meters.
- Diagonal runs (the diamond-drawn Wheatstone bridge; draw it rectangular).

## answers: false

`answers: false` draws what the exercise gives and none of what it asks. Kept:
the symbols with their given values (and names), node letters, the ground, the
meters' letters (A, V). Hidden: every branch-current arrow and its label, the
meters' readings, and the whole panel (`U_AB`, node potentials, powers,
currents listed in panel mode). The current arrows are part of the answer
because their direction is what "qual o sentido da corrente" asks. The circuit
is still solved, so an unsolvable netlist is refused either way.
