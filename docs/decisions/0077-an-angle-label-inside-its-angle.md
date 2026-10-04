# 0077 — An angle label inside its angle

## Status

Accepted · 2026-10-03. Amends `annotation-nearest-its-owner` (introduced with `Block.annotates`) and `sweep-matches-its-label` (ADR 0019).

## The defect

A textbook writes θ inside the angle it names, between the two arms, just past the arc. Prancheta refused it.

- **Why the check refused it.** `annotation-nearest-its-owner` fails a label whose centre is nearer some other drawn element than the one it names. Inside a narrow angle, every spot clear of the arc is nearer an arm than the arc.
  - Measured on an incline drawing: θ at 1.4r and 14° sat 45 px from its arc and 41 px from the ground line.
- **What it forced.** Authors had to carry the label away on a leader line, which crossed the slope. The convention every school figure uses could not be drawn.
- **The value went unchecked.** `sweep-matches-its-label` read only a bare number ("30°"). A label in the usual form "θ = 30°" made no claim it could read, so the printed angle was never compared with the arc.

## Decision

1. **A label inside its own angle is not misread as naming the arms.** When a label annotates an arc that marks an angle, and its centre lies inside that angle near the vertex, a rival is set aside if its nearest point to the label lies within 10 px of either arm.
   - **What counts as an angle mark.** A `sweep` connector with no arrowhead whose two ends both land on other drawn ink (within 10 px). An angle arc runs from arm to arm. A rotation arrow (α round a pulley) carries an arrowhead, so it never qualifies, wherever its ends land.
   - **Inside the angle.** The label centre lies within the arc's angular range, measured about the drawn arc's own circumcentre: what is measured is what is drawn. It must also lie no farther from the vertex than max(2.5r, r + 60 px). The 60 px floor lets a tiny arc's label fit; both constants are tunable against fixtures.
   - **Only the arms.** The 10 px band covers the arm lines themselves, the hatching drawn along a surface (about 4 px off it), and extension lines offset from an arm. A third line through the vertex inside the angle, or an arrow farther than 10 px from both arms, still competes.
   - **Everywhere else the strict rule holds unchanged.** That means a label outside the angle, beyond the reach, or naming an arc with an arrowhead.
2. **"θ = 30°" states its value.** `sweep-matches-its-label` reads past a leading name and equals sign that contain no digits. The value check now runs on the label a textbook actually prints.

## Rejected

- **Naming a place.** Tested: θ annotating a `place` set at its own centre passed, and so did the same label moved 260 px away. The author chooses the place, so the check holds no position, and the stated angle is no longer compared with the arc.
- **Excusing everything through the vertex.** In a free-body diagram every force passes through the block's centre. A label could then sit on a third arrow inside the angle.
- **Declaring texture.** A `textureOf` field with its own check was considered. The 10 px band covers hatching and offset extension lines alike, with no new field.

## Consequences

- The constraint ships with the freedom.
  - The relief is bounded by the sector, the reach and the arrowhead rule, and falls back to the strict rule outside them.
  - `sweep-matches-its-label` now verifies the value of every "name = value°" label an angle carries.
- A narrow angle whose label does not fit between its arms still needs a leader. That is geometry, not the check: `text-clear-of-ink` refuses the overlap.
- Tests: `tests/angle-label.test.ts`.
  - **Passes:** the incline's θ inside its arc, with its 30° verified.
  - **Refused:**
    - a label across the slope;
    - a label beyond the reach;
    - the same arc with an arrowhead;
    - a third line inside the angle.
