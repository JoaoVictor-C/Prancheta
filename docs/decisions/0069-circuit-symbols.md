# 0069 — Circuit symbols: diodes, real sources, symbolic values, taps, load boxes

## Status

Accepted. Extends [0053](0053-circuits.md); item 5 of
[`docs/research/AUDIT-ENEM.md`](../research/AUDIT-ENEM.md) (2024 Q131, Q132; 2025 Q119, Q130).
Uses the rich text of [0062](0062-rich-text-and-the-reading-panel.md) and the
label claims of [0035](0035-what-a-label-hides-and-claims.md).

## The need

Six ENEM figures were drawable only in part. An LED had no symbol, and whether
it lights depends on a voltage and a current nobody had computed. A source with
internal resistance was a battery and a resistor the reader had to know belonged
together. The options of 2025 Q130 are circuits whose resistances are
`R_C` and `0,2 R_C`, not numbers. 2024 Q132 is a resistive wire with taps and a
lead moved from tap to tap. 2025 Q119 draws the appliance as a labelled box
whose power and voltage are given.

## The decision

Everything stays the way 0053 built it: the layout is given, and every current,
voltage and reading is solved. Nothing here is typed.

### LEDs and diodes: every state is solved, the consistent one kept

`led` and `diode` run from anode (`from`) to cathode (`to`) with a forward
voltage `vf` (default 0, the ideal diode). The model is piecewise-linear: ON
holds V_a − V_b = V_f with i ≥ 0, OFF carries nothing with V_a − V_b ≤ V_f.

The solver does not guess a state and iterate, which can cycle and can land on
a state that happens to satisfy itself. `solveWithDiodes` (in `mna.ts`) solves
**every** assignment (2ⁿ, n ≤ 14) and keeps those that are self-consistent.
One consistent state is the answer. None is refused ("no on/off state of D1 is
consistent"). Two that differ electrically are refused as ambiguous, naming both.
A diode exactly at its knee carries 0 either way; those two assignments are the
same reading and are not an ambiguity. An assignment the netlist checks refuse
(a loop of sources, a floating part) is skipped; if all are refused, that
refusal is the message.

An LED that conducts is filled yellow when answers are shown. The panel states
`D₁: aceso, i = 20 mA` or `D₁: apagado`. Currents under 0,1 A are written in
mA.

### A real source: ε and r in series, terminal voltage computed

`battery` takes `r`. It is drawn as the battery then r in series towards the +
terminal, inside a dashed box (the textbook sign for "one source"), with the
EMF label by the plates and `r = …` beside the resistor. In the netlist it is
a voltage source and a resistor through a hidden node, but the branch analysis
sees ONE component between the terminals, so the current arrow and `i₁` are
the source's. `show.terminal` prints `U = ε − r·i = 12 − 0,5 · 4 = 10 V` from
the solved i; `U_AB` across the terminals agrees. A shorted real source drives
ε/r, no longer a refusal.

### Symbolic values: solve by scale, one symbol per quantity type

A `value` (or `r`) may be a string: `"R"`, `"2R"`, `"0,2 R_c"`, `"E"`. The
circuit is linear in its EMFs and homogeneous in its resistances, so a full
symbolic solve is not needed. Every resistance must be a multiple of one symbol
and every EMF of one other; the solver sets each symbol to 1 and the
coefficients are the answer. Currents print as multiples of E/R, voltages of E,
powers of E²/R: `i = E/(3R)`, `U = 6E/11`, `P = 25E²/(121R)` (denominators up to
400; otherwise `≈ 0,207 E²/R`). Subscripts are real (runs).

What is refused, naming the components: numbers mixed with symbols in one type
(`R2 is numeric`), two resistance symbols (so an `r` unrelated to `R` is out),
the same letter for both types, a current source, `vf > 0`, a rated load.
This is a single-scale solver, not computer algebra, and says so.

### A tapped wire and nodes placed relative to it

`potentiometer` is one straight resistive wire with a total resistance. Its
`taps` (`[{node, at}]`, or `{equal: [...]}`) are nodes at a fraction of its length
from `from`, **placed by the preset** (a typed tap position could disagree with
the fraction it claims). The wire is solved as the series of segments between
taps, so each segment has its own current and arrow. A tap is drawn as a dot on
the wire's axis (the axis is part of the wire's mark, so a tap lies ON it, which
is what makes a place under 0035).

A node may be `{ "at": "C", "dx": 0, "dy": 2 }`, placed relative to another
node, tap included, so a lead stays above its tap. The movable ammeter lead of
2024 Q132 is the ammeter's `to`: one figure per position, each solved. The
motion itself is not drawn.

### The load box

`load` is a rectangle with a label inside (default "aparelho") sized to the
text, and either `value` (Ω) or `rated: {power, voltage}` with R = U²/P derived.
Both given, or neither, is refused.

## answers: false

Kept: every given (values, symbols, V_f, r, the box label and rating). Hidden:
currents and arrows, readings, the lit LED, `U`, powers, the diode states, and
the terminal-voltage line. The circuit is still solved, so a circuit with no
answer is refused either way.

## What it does not do

- Several symbols per quantity, or a symbolic `r` independent of `R`.
- A diode's exponential curve; the model is constant-drop.
- More than 14 diodes in one circuit.
- A diagonal run, a movable lead drawn as motion.

## Consequences

`tests/circuit.test.ts` pins each addition against a hand-solved case: the LED at
20 mA, reversed and starved, two LEDs in parallel, an ideal diode, a refused
contradiction, a real source's 4 A and 10 V and its ε/r short-circuit current,
5E/(11R) and its siblings, the 25 Ω / 75 Ω split and the 8 V divider, a rated
load of 15 Ω; power balance holds in every fixture, diode drops and internal
resistances included. Seven fixtures are added (`led-series-resistor`,
`led-two-branches`, `source-internal-resistance`, `symbolic-series-parallel`,
`potentiometer-divider`, `household-load-box`, `tapped-wire-ammeter`). The seven
earlier fixtures render byte-identically.
