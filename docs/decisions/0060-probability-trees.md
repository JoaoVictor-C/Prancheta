# 0060 — Probability trees: exact arithmetic, and a tree that adds up

## Status

Accepted.

## The need

Probabilidade and ENEM ask for the same figure repeatedly: an urn drawn twice
with or without replacement, a coin tossed three times, a test for a disease
with a given prevalence, sensitivity and specificity (Bayes). The picture is a
tree, but what the reader takes from it is arithmetic: branch probabilities
multiply along a path, an event is the sum of some paths, and a conditional
probability is a quotient of two such sums. `mindmap` and `graph` draw a tree
with none of that; a hand-authored IR tree lets the printed products disagree
with the branches.

## The decision

**`probability-tree` takes only probabilities, and computes every other number.**

- **Two input forms.** A typed tree (`root`, each branch with `p`) or one BUILT
  from an urn (`urn`, `draws`, `replacement`), whose branch probabilities are
  the counts left in the urn. A colour used up has probability 0 and no branch.
- **Rational arithmetic, not floats** (`fraction.ts`, bigint). `0,1 + 0,2` must
  be exactly `0,3` or "the children sum to 1" becomes a tolerance. Decimals and
  percents are converted exactly (0,95 is 19/20). Every sum, product and
  quotient is reduced. A value is written as a decimal or percent exactly when
  it terminates within six places; otherwise it is rounded and the sign is `≈`,
  never `=`.
- **A tree that does not add up is refused**, naming the node and the sum it
  has, before anything is drawn. One sibling may omit `p` and take the
  complement.
- **A branch shows what the reader counts.** An urn's second draw is `2/4`, not
  `1/2`; the product beside it is reduced (`3/5 · 2/4 = 3/10`). Notation
  follows the input unless `notation` says otherwise.
- **Events are sets of leaves**, given as paths (`"*"` matches any outcome, a
  short path takes every leaf beneath it) or as a count of one outcome. P(E) is
  printed as the sum of its leaf products and its branches are drawn in its
  colour; a conditional `P(A | B)` is computed from the leaves in A∩B and in B
  and printed as the quotient.

## Drawing

Horizontal tree, root at the left, levels evenly spaced, leaves evenly spaced
(more room when a node has three or more children), straight branches; the
canvas grows with the tree. The outcome name is bold text at the branch end and
the branch is trimmed to the text's box, so no line runs through a letter (the
textbook alternative, a circle, does not fit "doente" or "def"). A branch's
probability is placed by the strict `Placer` from candidates beside its
middle on ONE side — above an upward or level branch, below a downward one —
nearest-first along the branch, so it never sits on a line and stays nearer its
own branch than a sibling (`annotation-nearest-its-owner`); it slides along the
branch only when a middle spot would break that. Path products are
`freeStanding` text in an aligned column; node names and branch
probabilities declare the branch they name.

## What was refused

- **Floats with a tolerance** for the sum-to-1 test: it would accept 0,99.
- **Reducing every branch label**: it hides the urn's counts.
- **A free-text event language** ("exatamente uma vermelha"): an expression to
  parse and misread; paths and `count` cover the exercises and are checkable.
- **Leaders from each node to its product**: the aligned rows carry the
  association, and the lines would cross the branch labels.

## Consequences

Up to 32 leaves and 6 levels are accepted; beyond that the input is refused
rather than crammed. Percent input gives a percent figure throughout, which
mirrors how the exercise is worded but rounds the Bayes quotient (`≈ 8,76%`); a
fraction notation gives the exact `19/217` with the percent alongside.
