# 0056 — Finite automata, and a run that is computed

## Status

Accepted.

## The need

Linguagens Formais e Teoria da Computação ask for one figure over and over: an
AFD or AFN drawn as circles and arrows, and a claim about it — "o autômato
aceita aab", "reconhece as palavras terminadas em ab", "mostre a execução". What
the reader takes from the figure is a set of facts: which words end in an
accepting state. In a hand-made figure the drawing is the easy half, and the
claim beside it is the half that goes wrong: a transition off by one state, a
word marked "aceita" that the automaton in fact rejects.

The project's answer so far was `graph`, which draws nodes and edges. A graph is
the wrong thing here, and not for lack of styling. An automaton is a graph whose
*meaning is its runs*. `graph` has no start arrow, no accepting (double) circle,
no self-loop turned away from the rest of the figure, no pair of opposite edges
bowed apart, and above all no notion of running a word.

## The decision

**`automaton` is a preset whose only typed content is the automaton itself**:
`kind` (dfa or nfa), the alphabet, states, start, accepting states and
transitions. Acceptance is *never typed*. Each word in `words` is run:

- a **DFA** walks one state per symbol; the panel prints the path with the
  symbol on each arrow, `q₀ →a q₁ →a q₁ →b q₂: aceita`;
- an **NFA** carries the *set* of states it could be in, takes the ε-closure at
  the start and after every step, and prints the sets,
  `{q₀, q₁, q₂} →a {q₁, q₃}: …`; it accepts iff some state of the last set is
  accepting.

The simulation is exported (`runDfa`, `runNfa`, `epsilonClosure`) along with
`subsetConstruction(nfa)`, a total DFA of the reachable subsets. They are pure
functions with tests that compare them to independent oracles over *every* word
up to length 8 or 9 — a regular expression for "ends in ab", binary arithmetic
for "divisible by 5" — so the panel's verdict is what the automaton does, and
the tests are what say the simulation is right.

### Validation is where a mistyped automaton is caught

A DFA must be **total and deterministic** over the alphabet. A missing
transition is refused naming the state and symbol; a repeated one naming both
targets; either message says what to do (`partial: true`, or `kind: "nfa"`).
`partial: true` sends every missing transition to an *implicit dead state*. That
state is **not drawn** — the textbook convention — but the panel says it exists
and lists what leads there, and a run that falls into it prints `morto` and
rejects; nothing is silently dropped. ε is legal only in an NFA and never in the
alphabet; an unknown state or symbol anywhere is refused with its path; so is an
unknown field, because a typo such as `acepts` would otherwise draw an automaton
that accepts nothing and say so confidently.

### Drawing: exact geometry, so an arrowhead touches the circle

Every edge is a straight run or a **circular arc**, and the head must end *on the
target's boundary*. Both ends are trimmed by exact geometry rather than by
overdrawing: a line is cut where it meets each circle; an arc is cut where its
own circle meets each state circle, which is a chord of known length and gives
the parameter directly (φ = 2·asin(R / 2ρ)). Arcs are emitted as `MarkSegment`
`{ arc, centre }` in pieces of at most 60°, so each is minor. The arrowhead is a
separate filled triangle whose tip *is* the trimmed end. The tests decode the
drawing and check that every tip lies on its target's circle to 0.05px and every
tail on its source's.

- **Opposite transitions** between two states become two arcs, each bulging to
  the *left of its own travel*: consistent handedness is what puts them on
  opposite sides of the chord, and it needs no special case for line or circle.
- **Self-loops** are a small circle intersecting the state's, drawn the long way
  round with the head arriving on the state's boundary; they turn away from the
  automaton (up on a line, outward on a circle) and rotate to the widest gap
  when an edge or the start arrow is there.
- **Layout.** Up to four states in a chain (every edge joins neighbours in
  breadth-first order) is a line; anything else a circle ordered breadth first
  from the start, which is placed at the left; explicit `"line"`, `"circle"` or
  `{ state: [x, y] }` override. Forcing a line on an automaton that is not a
  chain draws its skipping edges as wide arcs above and below.
- **Accepting states** are two circles. The state's name annotates the
  *innermost* one: with the outer circle as its owner, `annotation-nearest-its-owner`
  correctly found the inner circle nearer, and the fix was to say which circle
  the name is inside, not to move the name.

### Labels: outside the curve, and not between crossing edges

An edge label sits beside the midpoint on the outside of the curve (for a
straight edge, away from the automaton's centre), never on the line. The check
`annotation-nearest-its-owner` treats an arrowhead as an element of its own, so
placement counts the head as a rival too — an early version passed its own test
and failed the check because a label near a tip was nearer the head than the
edge. Among the spots that clear every rule, the one best separated from *other*
edges relative to its own is taken; without that, two labels between crossing
chords of a five-state circle sat side by side and read as each other's.

## What was refused

- **Reusing `graph` with a flag.** It would have to grow a start arrow, double
  circles, loop placement, paired arcs and a simulation, none of which any other
  graph wants. The selection rule `disqualifies` graph for an automaton.
- **Typing the verdict** (`"aceita": ["aab"]`). Exactly the claim that goes
  wrong; here a wrong claim cannot be written.
- **Drawing the dead state.** Sipser and Menezes both omit it by convention; a
  total DFA that wants it drawn lists it as an ordinary state.
- **A force-directed layout.** Automata are drawn on a line or a circle in every
  textbook, and a layout that moves states between runs would make a sequence of
  figures (an NFA and its determinisation) unrecognisable as one another.

## Consequences

`tests/automaton.test.ts` (50 tests) pins the simulation, the subset
construction, validation, the drawn geometry and every fixture in
`fixtures/automaton/` passing every check. Known limit: an automaton with many
states and many crossing edges (the determinisation of the 4-state NFA has 8) is
drawn correctly but its labels can be close to crossing edges; give a `layout`.
Not covered: Turing machines, pushdown automata, transducers, multi-character
symbols.
