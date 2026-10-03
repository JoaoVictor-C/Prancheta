# Plans

A plan is written before a body of work, kept current while the work is under way (every row has a status), and given a **Status:** line at its head once it is done. Finished plans stay here as the record of why things were built in the order they were. What a step actually found goes in [ROADMAP.md](../../ROADMAP.md), and what it left open goes in [TODO.md](../../TODO.md).

**In progress**

| plan | what it covers |
| --- | --- |
| [PLAN-PHYSICS.md](PLAN-PHYSICS.md) | Mechanics, kinematics, energy, momentum, gravitation, statics, fluids. P0–P2 are done; P3 (function-graph worked examples) is next. |

**Done**, newest first

| plan | what it covered |
| --- | --- |
| [PLAN-CHEMISTRY.md](PLAN-CHEMISTRY.md) | Molecules, reactions, mhchem in sheets, the acid–base preset. |
| [PLAN-COVERAGE.md](PLAN-COVERAGE.md) | Phases 0–6: Cálculo 1 to 3, Geometria Analítica, Álgebra Linear, physics, discrete, statistics, and what ENEM asks for. |
| [PLAN-EXERCISES.md](PLAN-EXERCISES.md) | Exercise figures: derived geometry, frames, the angle mark, the function graph. |
| [CONSTRAINT-TOGGLES-PLAN.md](CONSTRAINT-TOGGLES-PLAN.md) | The three constraint toggles. |
| [ORGANIZATION-CLEANUP-PLAN.md](ORGANIZATION-CLEANUP-PLAN.md) | The root-directory cleanup behind ADR 0011. |
| [PLAN-NEXT.md](PLAN-NEXT.md) | M5–M10: colour, export, scales, module repair, constraints. |
| [PLAN.md](PLAN.md) | M0–M4: the walking skeleton to the two hard probes. |

**Starting a new plan.** Name it `PLAN-<SUBJECT>.md` and add a row under *In progress*. Give it a rules section saying what every item owes, and a phase table with one status per row. When the last row is done:

- add the **Status:** line at its head;
- move its row to *Done*;
- write the ROADMAP entry.
