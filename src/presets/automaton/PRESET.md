# automaton

A finite automaton, DFA or NFA, for Linguagens Formais e Autômatos and Teoria
da Computação (Sipser, Menezes): "desenhe o AFD que reconhece as palavras
terminadas em ab", "mostre a execução de aab", "o AFN com ε-transições e o que
ele aceita". The automaton is the only typed thing. Every drawn position is
computed from it, and **whether a word is accepted is never typed**: each word in
`words` is *run*, and the panel prints the path or the sets the run computed.
See [`docs/decisions/0056-automata.md`](../../../docs/decisions/0056-automata.md)
for what was refused and why.

**Choose it when** the content is a finite automaton — states, a start arrow,
accepting states and transitions on symbols — and the question is what it
recognises or how it runs on a word. It is not `graph` (a graph has no start
arrow, no accepting states, no notion of a run), nor a flowchart of a program
(`labelled-blocks`), nor a Turing machine or pushdown automaton (not covered).

## Input

```json
{
  "preset": "automaton",
  "kind": "dfa",
  "alphabet": ["a", "b"],
  "states": ["q0", "q1", "q2"],
  "start": "q0",
  "accept": ["q2"],
  "transitions": [
    { "from": "q0", "on": "a", "to": "q1" },
    { "from": "q0", "on": "b", "to": "q0" },
    { "from": "q1", "on": "a", "to": "q1" },
    { "from": "q1", "on": "b", "to": "q2" },
    { "from": "q2", "on": "a", "to": "q1" },
    { "from": "q2", "on": "b", "to": "q0" }
  ],
  "words": ["aab", "ba", ""]
}
```

| field | what it does |
| --- | --- |
| `kind` | `"dfa"` or `"nfa"`. |
| `alphabet` | Single visible characters, no repeats, never `ε`. |
| `states`, `start`, `accept` | State names (any non-empty string, at most 14). `q0` is set `q₀`: digits after a letter become subscripts, also inside `{q0,q1}`. |
| `transitions` | `{ from, on, to }`. `on` is a symbol, an array of symbols (`["a","b"]`) or `"ε"` (NFA only). Symbols on the same (from, to) pair are merged into one edge labelled `a, b`; an identical transition written twice is merged, not refused. |
| `partial` | DFA only. Missing transitions go to an **implicit dead state**, which is not drawn; the panel says so and lists what is missing. |
| `layout` | `"line"`, `"circle"`, or `{ "q0": [x, y], … }` for every state (y up; one unit is about 120px). Default: a **line** when there are at most four states and every edge joins neighbours in breadth-first order from the start (a chain), otherwise a **circle** ordered breadth first from the start, the start state at the left. |
| `words` | Up to 10 words over the alphabet; `""` is the empty word, printed `ε`. |
| `title` | As every preset. |

## What is drawn

Sipser style: states are circles with the name centred, accepting states are
double circles, the start state has an arrow out of nowhere. Edges are straight
arrows; **two opposite transitions between two states are two gently curved
arcs**, each bulging to the left of its own travel, so they never overlap; an
edge that skips a state on a forced line is one wide arc above (forward) or
below (back); **self-loops** turn away from the rest of the automaton (up on a
line, outward on a circle) and rotate to the freest direction when a neighbouring
edge or the start arrow is in the way.

**Arrowheads touch the target's circle, not its centre.** Every edge is a line or
a circular arc (`{ arc, centre }` segments), trimmed against the circle of each
end by the exact intersection, and the head is a filled triangle whose tip is
that point. `tests/automaton.test.ts` decodes the drawing and checks every tip
lies on its target's circle, every tail on its source's.

Edge labels sit beside the edge's midpoint on the **outside** of its curve
(away from the automaton's centre, for a straight edge), never on the line,
nearer their own edge than any other. Among the clear spots the one best
separated from every other edge is taken, so two labels between crossing edges
are not mistaken for each other's.

## The runs

Below the diagram, `AFD: Σ = {a, b}, estado inicial q₀, F = {q₂}`, then one row
per word:

- **DFA**: the state path with the symbol on each arrow —
  `q₀ →a q₁ →a q₁ →b q₂: aceita`. On a partial DFA a missing transition ends the
  path in `morto` and rejects: `q₀ →b morto: rejeita`.
- **NFA**: the set of states after each step, starting from the ε-closure of
  the start — `{q₀, q₁, q₂} →a {q₁, q₃} →b {q₂}: rejeita`; the empty set is `∅`.
- Accepted iff the last state (DFA) or any state of the last set (NFA) is in F.
  A long run wraps onto continuation lines.

## Pure helpers

Exported from `preset.ts` and tested against independent oracles (a regular
expression, binary arithmetic) over every word up to length 8–9:

- `runDfa(a, word)` → `{ path, symbols, accepted, dead }`
- `runNfa(a, word)` → `{ sets, symbols, accepted }`
- `epsilonClosure(a, states)` — terminates on ε-cycles, keeps the automaton's state order
- `subsetConstruction(nfa)` → a total DFA of the reachable subsets (`{q0,q1}`, `∅`), breadth first; its result is itself a valid input to this preset
- `normaliseAutomaton(input)` → the validated `Automaton` with one symbol per transition

## What is checked

The box-model checks every preset renders through: `text-clear-of-ink`,
`annotation-nearest-its-owner` (a state's name names its innermost circle),
`label-declares-what-it-names`, `boxes-do-not-overlap`, `contrast-sufficient`.
Every fixture in [`fixtures/automaton/`](../../../fixtures/automaton/dfa-ends-in-ab.json)
passes all of them.

## What is refused

- A DFA that is not total (naming the missing state and symbol, and offering
  `partial`) or not deterministic (naming the state, symbol and both targets).
- `ε` in a DFA or in the alphabet; `partial` on an NFA.
- An unknown state or symbol in a transition, `start`, `accept` or a word; an
  unknown field (a typo is not silently ignored); a `layout` that misses a
  state, names a stranger or puts two states at one place.

## What is not covered

Turing machines, pushdown automata, transducers; edge labels with more than one
character per symbol; a drawn dead state (say `partial` and the panel states it);
a dense automaton (eight or more states with many crossing edges) is drawn
correctly but its labels can sit close to crossing edges — give a `layout`.

## answers: false

"Which of these words does it accept?" is the usual question, and the diagram
is its given, so the diagram stays whole: states, start arrow, accepting
rings, every edge label, and the header line with Σ and F (and the implicit
dead-state note of a `partial` DFA). The run panel keeps the word list but
loses what was computed: each line reads `aab: ?` instead of the path or
state sets and `aceita` / `rejeita`. The words are still validated against
the alphabet.
