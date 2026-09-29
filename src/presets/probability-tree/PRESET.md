# probability-tree

A tree diagram of successive random stages, for Probabilidade and ENEM: "uma
urna tem 3 bolas vermelhas e 2 azuis; retiram-se duas sem reposição", "um teste
tem 95% de sensibilidade... qual a probabilidade de estar doente dado que o
teste deu positivo?". Every probability printed — a path's product, an event's
sum, a Bayes quotient — is exact rational arithmetic on the numbers typed (or
counted from the urn). See
[`docs/decisions/0060-probability-trees.md`](../../../docs/decisions/0060-probability-trees.md).

**Choose it when** the content is a sequence of random stages whose outcomes
multiply along a path. It is not `mindmap` or `graph` (a tree layout without the
arithmetic), nor `chart` (a distribution as bars).

## Input

Exactly one of two forms.

```json
{ "preset": "probability-tree", "urn": { "V": 3, "A": 2 }, "draws": 2, "replacement": false,
  "events": [{ "name": "cores diferentes", "paths": [["V", "A"], ["A", "V"]] }] }
```

```json
{ "preset": "probability-tree",
  "stages": ["condição", "resultado do teste"],
  "root": { "children": [
    { "label": "D", "p": "1%",  "children": [{ "label": "+", "p": "95%" }, { "label": "−", "p": "5%" }] },
    { "label": "S", "p": "99%", "children": [{ "label": "+", "p": "10%" }, { "label": "−", "p": "90%" }] } ] },
  "events": [{ "name": "D", "paths": [["D"]] }, { "name": "+", "paths": [["*", "+"]] }],
  "given": { "event": "D", "given": "+" } }
```

- **`urn`** `{ colour: count }`, **`draws`** 1–6, **`replacement`** (default
  false): the tree is built; each branch is n/N from the balls left. A colour
  used up has no branch.
- **`root.children`**: `{ label, p, children? }`. `p` is a number (`0.6`), or a
  string: `"3/5"`, `"0,6"`, `"60%"`. At most one sibling may omit `p`; it is 1
  minus the others. Sibling labels must differ. Leaves may sit at different
  depths.
- **`stages`**: a heading over each level (urns get "1ª retirada", ...).
- **`events`** (at most 3, each its own colour): `paths` — a list of outcome
  paths; a shorter path takes every leaf beneath it and `"*"` matches any
  outcome — or `count: { of, is | atLeast | atMost }`. Their branches are drawn
  in the event's colour and `P(E)` is printed as the sum of the leaf products.
- **`given`** `{ event, given }` (or a list): `P(A ∩ B)` and
  `P(A | B) = P(A ∩ B) / P(B)` are computed from leaves and printed with the
  quotient (a percent too, when the notation is fractions).
- **`notation`** `fraction | decimal | percent`: default is what the input used
  (all percents → percents, all decimals → decimals, else fractions).
  **`also`** `percent | decimal` appends that spelling to every result.
- **`title`**, **`locale`** as every preset.

## Refusals

The children of every node must sum to exactly 1 (rational arithmetic; the
message names the node and the sum it has). Also: a probability outside [0, 1],
a duplicate sibling label, more than 32 leaves or 6 levels, an event matching no
leaf, a `given` naming an undeclared event or one of probability 0.

## What is drawn

Root on the left, levels evenly spaced, leaves evenly spaced, straight
branches. The probability is beside the branch's middle — above an upward or
level branch, below a downward one — never on the line; the outcome is bold text
at the branch end; one aligned column at the right holds `P(V ∩ A) = 3/5 · 2/4 =
3/10`. A branch prints its probability as written (an urn's `2/4` stays `2/4`);
every computed value is reduced. Decimals and percents are exact when they
terminate within six places, otherwise rounded and marked `≈`.

## Limits

Up to 32 leaves and 6 levels; the canvas grows rather than crams. No
tree editing beyond typed input; no continuous distributions; events are sets
of leaves, so an event not expressible as paths or a count is written as paths.
