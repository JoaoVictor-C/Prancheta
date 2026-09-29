# 0057 — Boolean logic: one expression, two figures

## Status

Accepted.

## The need

Lógica, Matemática Discreta and Eletrônica Digital ask for two figures about
the same object. "Construa a tabela-verdade de (p → q) ∧ (q → p)" wants the
values row by row; "desenhe o circuito de S = A′B + AB′" wants the gates. A
student's exercise list asks for both, and for the link between them: the
minterms read off the table, the minimal form the minimisation gives, the
circuit that form draws, the same output computed when the inputs are 1, 0, 1.

The project's answer so far was raw IR, where nothing ties a column to the
expression it is headed with, or a gate to the tree it should be. A V typed
in the wrong row, an AND drawn where the expression says OR, a circuit for
the unsimplified form beside the simplified expression: each is plausible on
the page and wrong, which is what every preset here exists to prevent.

## The decision

**One module, two presets.** `src/math/boolean.ts` owns the language and the
arithmetic; `truth-table` and `logic-circuit` are two ways to draw what it
computes.

### A closed grammar, in both notations

A recursive-descent parser with no `eval` and no `Function`. Precedence,
tightest first: not, and, xor, or, →, ↔; → is right-associative, the rest
left. Every course's spelling is accepted (`and`, `·`, `*`, `∧`, `&`; `or`, `+`,
`∨`; `not`, `¬`, `~`, postfix `'`; `xor`, `⊕`; `nand`, `nor`; `→`, `->`; `↔`,
`<->`; the constants `0 1 V F`), because an exercise written for one course
must not need retyping for another.

**Juxtaposition is AND** (`A'B + AB'`), because that is how an electronics
course writes a function. It forces one decision: **a variable is one letter
with optional digits** (`A`, `p`, `x1`, `Q_2`). `AB` is A·B and cannot be a
variable called AB, and `V` and `F` are constants. The cost is that `Cin`
cannot be a signal name; `C` or `c1` can. The alternative — multi-letter
names, no juxtaposition — would have made `A'B + AB'` a syntax error in the
one subject that writes it all the time.

Errors carry a position (`falta um operando depois de "and" (posição 6)`), and
the presets show the source with a caret under it.

### Variable order

`variablesOf` is **order of first appearance**, left to right. It is the
order a reader sees in the text, and it makes the table's columns and the
circuit's input lines agree without either being told. A caller who wants
alphabetical says so (`truth-table.variables`). The first variable is the most
significant bit of a row's minterm number.

### Minimisation: Quine–McCluskey, exact

`simplify` finds every prime implicant by iterated combining, takes the
essential ones, and covers what is left by **Petrick's method**: the product of
sums, with absorption, choosing the fewest terms and then the fewest literals.
Petrick's product is capped (`PETRICK_LIMIT`, 20 000 partial products); past it a
greedy cover is used and the result says `exact: false`. Up to six variables the
cap is never reached. Terms are patterns (`"1-1"`), written A·C or A ∧ C only
when printed.

The tests do not compare against a hand-copied answer. They enumerate **every
implicant** of a function, keep the maximal ones, try **every subset**, and
take the cheapest cover — for all 256 functions of three variables and 300
pseudo-random functions of four — and require the same term count and literal
count. A bug the implementation and a hand-copied table shared would not
survive that.

### `truth-table`

Columns: variables, then (optionally) each compound subexpression in
evaluation order, then each expression. Every cell is `evalBool` of the parsed
tree. `notation: "logic"` writes V/F and starts at V…V; `"digital"` writes 1/0
and starts at 0…0, so the row number is the minterm number. Column widths are
measured from the text each column holds, header and cells, never from the
header alone (`value-table` once let a wide value run into its neighbour).

The panel is what the exercise asks next, each line computed from the same
rows that were printed: tautologia / contradição / contingência; whether two
columns are equal (`P ≡ Q`) or on which rows they differ; Σm, the canonical sum
and the minimal form. The comparison is decided twice — column by column and
by `equivalent` — and a disagreement throws.

### `logic-circuit`

Built **from the expression tree**, never from a typed netlist. The tree becomes
a DAG of gates: same-kind chains are flattened into one gate of up to four
inputs (a tree beyond that), `not(and)` is a NAND, `not(or)` a NOR, `p → q` is
`¬p ∨ q`, `p ↔ q` an XNOR, and an identical subexpression is one gate fanned out.

**Layout** is layered by depth, left to right, with the output on the right. The
order in a layer is barycentre sweeps, kept at the fewest crossings; heights come
from an isotonic fit to what feeds and is fed, snapping a gate so one pin is dead
straight rather than leaving a jog of a few pixels. A wire that must pass over
a layer gets a lane there, occupied by no gate, so **a wire never crosses a
gate**. Between layers each net has a vertical trunk on its own track, the tracks
ordered by exhaustive search for the fewest crossings.

**Wires are orthogonal, and honest about connection.** A junction dot is drawn
exactly where three or more wire ends meet — a fan-out — and a plain crossing
has none. Two different wires may not lie on one line over the same stretch or
within 9px of it: from a distance that reads as a connection that is not there.
A source that would sit level with a pin it does not feed, with no order of
trunks that separates them (two nets that swap places), is moved clear of it.

**Symbols** are the distinctive shapes: AND a D (two lines and two quarter
circles), OR a shield (arcs of circles: the front from the corner to the tip
about a centre level with the corner, so the curve leaves tangent, the back a
shallow arc), NOT a triangle and a bubble, NAND/NOR/XNOR the same with a
bubble, XOR/XNOR an extra curve. Input wires end **on the outline**, on the
curve for an OR, not on the bounding box.

**Simulation** (`inputs`) evaluates every gate from its inputs and prints the
value of every net beside its wire, small and off the wire, each label declaring
the wire it names and placed by search until it is clear of ink and nearest
its own wire. The output value is printed; the wire's colour says the same
thing as the digit but is never the only signal. The result is checked against
`evalBool` on the expression, and a disagreement is an error.

**Simplify** draws the minimal sum of products (a circuit of the *simplified*
expression, not the original) and prints both expressions and both gate counts,
so the saving is a number the reader can check.

### Selection

Two structure values are proposed: **`boolean`** (a boolean function to be
tabulated) favours `truth-table` strongly, and **`logic-circuit`** (the same
function to be built from gates) favours `logic-circuit`. The words that
separate them are the reader's verb: *tabela-verdade, tautologia, equivalência,
mintermos* against *circuito, portas, desenhe o circuito, simule, implemente
com portas*.

## What was refused

- **Hand-typed truth values or netlists.** A V or a gate typed by hand is the
  failure this project exists to prevent; both figures are drawn from the
  parsed expression.
- **`eval`.** The grammar is closed, small, and tested.
- **Multi-letter variables with juxtaposition.** Ambiguous: is `AB` a variable
  or a product? The course that writes products by juxtaposition wins.
- **Cancelling a double negation.** `A″` is drawn as two NOTs; the student asked
  for the tree, and `simplify` is where reduction is asked for.
- **Hop arcs at crossings.** A plain crossing is the convention; a hop invites
  the reading that the wires touch.
- **A greedy cover as the minimiser.** It is not minimal, and the tests catch it.
- **A Karnaugh map.** A grid the minimal form is read from is a different
  figure and is not drawn; the minimal form itself is printed.

## The cost, stated

- A signal cannot be called `Cin`: it reads as C·i·n, silently, because that is
  what juxtaposition means. `C`, `c1` and `Q_2` are names.
- The layout is a heuristic. It is checked (orthogonal, no overlap, no wire
  through a gate, one wire per pin, dots exactly at junctions, on hundreds of
  random expressions) but it does not find the *smallest* diagram, and a large
  function can show more crossings than a hand-drawn one.
- Six variables is the limit of the table (64 rows) and of a circuit that is
  still readable; Petrick's method is exact only up to its cap.
- The circuit has no sequential elements. A flip-flop is a different figure.
