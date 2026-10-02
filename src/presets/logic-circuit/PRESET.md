# logic-circuit

A gate diagram drawn **from the expression tree**: "desenhe o circuito de
S = (A·B) + C′", "implemente o XOR só com AND, OR e NOT", "simplifique a
função maioria e desenhe o circuito", "simule com A = 1, B = 0, C = 1". The
distinctive-shape (ANSI/IEEE) symbols of Tocci — AND a D, OR a shield, NOT a
triangle and a bubble, NAND/NOR with the bubble, XOR/XNOR with the extra curve.
See [`docs/decisions/0057-boolean-logic.md`](../../../docs/decisions/0057-boolean-logic.md).

**Choose it when** the reader must see the gates and how the signals reach the
output. For the values row by row use `truth-table` (same expression, same
grammar). It is not a state machine (`automaton`), a general network (`graph`),
or an analog schematic.

## Input

```json
{
  "preset": "logic-circuit",
  "expr": "not (A and B) and (C nand D)",
  "output": "Y",
  "inputs": { "A": 1, "B": 1, "C": 1, "D": 0 }
}
```

| field | what it does |
| --- | --- |
| `expr` | The expression, in the grammar of [`truth-table`](../truth-table/PRESET.md): `and`/`·`/`*`/`∧`, `or`/`+`/`∨`, `not`/`¬`/`'`, `xor`/`⊕`, `nand`, `nor`, `->`, `<->`, juxtaposition (`A'B + AB'`), constants. A variable is one letter with optional digits. |
| `output` | The output's name. Default `S`. |
| `inputs` | `{ "A": 1, "B": 0 }`: **simulate**. Every variable must be given; a name that is not in the expression is refused. |
| `simplify` | Draw the Quine–McCluskey **minimal sum of products** instead; the panel prints both expressions and both gate counts. |
| `notation` | How the panel writes expressions: `"digital"` (· + ′, default) or `"logic"` (∧ ∨ ¬). |
| `title` | The figure's title. |

## How the diagram is built

- **Inputs** are named lines on the left in order of first appearance; the
  output is on the right, named.
- **Gates by depth**: a gate sits one layer past its deepest input, so depth
  reads left to right.
- **Flattening**: `A·B·C` is one AND with three inputs (up to four; five or
  more become a tree). `not(and)` is a NAND, `not(or)` a NOR, `p → q` is
  `¬p ∨ q`, `p ↔ q` an XNOR. A double negation is drawn as two NOTs.
- **Sharing**: an identical subexpression is drawn once and fanned out.
- **Wires** are horizontal and vertical runs only. A wire that must pass over
  layers runs in a lane of its own, so **no wire crosses a gate**. A fan-out
  gets a **junction dot**; two wires that merely cross get none. No two
  different wires lie on one line over the same stretch, or within 9px of it.
- **Order and height** come from crossing minimisation (barycentre sweeps) and
  from aligning a gate's pins with the wires that feed it.

## Simulation

With `inputs`, every gate is evaluated from its inputs and the value of every
net is printed beside its wire (small, off the wire, `annotates` the wire it
names); a wire carrying 1 is drawn in blue and 0 in slate, but the digit says it
too. The output reads `Y = 0`. The simulated output is then checked against
`evalBool` on the expression; a disagreement is an error, not a figure.

## What is checked

The box-model checks every preset renders through (`text-clear-of-ink`,
`annotation-nearest-its-owner`, `label-declares-what-it-names`, `contrast-sufficient`,
`arc-is-circular`). `tests/logic-circuit.test.ts` decodes the drawing itself:
every wire orthogonal, none lying on another, none through a gate, each gate
with exactly one wire ending on it per input and one leaving, gates left of the
gates they feed, dots exactly where three wire ends meet, and the simulation
against `evalBool` on every row of many expressions, random ones included.

## What is refused

A parse error (with position and a caret); `inputs` that omit a variable, name
one that is not in the expression, or give something other than 0, 1, true,
false; an `output` longer than eight characters.

## What is not covered

Flip-flops and sequential logic, buses, multi-letter signal names (`Cin`),
tri-state gates, and hop arcs at crossings (a crossing is a plain crossing).

Fixtures: [`fixtures/logic-circuit/`](../../../fixtures/logic-circuit/and-or-not.json).

## answers: false

The figure of the exercise, not of its solution. The circuit is drawn with its
input names, its output name and the expression line (`S = …`). Hidden:
the gate count; with `inputs`, every wire's value, the ON/OFF colouring of the
wires, the value beside the output and the `→ S = …` line (the input values
stay on their input lines and are listed as the givens, `A = 1, B = 0`); with
`simplify`, the ORIGINAL circuit is drawn instead of the minimal one, and the
simplified expression and the before/after count are left out (so the figure
is the same as one without `simplify`). The circuit is still simulated and
simplified internally, so a wrong input is refused the same way.
