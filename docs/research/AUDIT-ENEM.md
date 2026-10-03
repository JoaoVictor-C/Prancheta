# Corpus coverage audit — ENEM 2023–2025

The audit [PLAN-COVERAGE](../plans/PLAN-COVERAGE.md) asked for: classify every figure in
a sample of real exams as covered, partial, uncovered or not-generable, and let
the counts decide what to build next. Done on 2026-10-02.

## Corpus and method

Five official ENEM booklets from INEP (`download.inep.gov.br/enem/provas_e_gabaritos/`):
day 2, caderno 7 (Ciências da Natureza + Matemática) of 2023, 2024 and 2025, and
day 1, caderno 1 (Linguagens + Ciências Humanas) of 2024 and 2025 — 160 pages,
450 questions. Every page was rendered and read; every figure got a kind, whether
the question can be solved without it (*essential*), and a verdict against the
repertoire in AGENTS.md:

- **covered** — a preset or module draws it now, from data, correctly;
- **partial** — a preset fits but lacks a named extension;
- **uncovered** — nothing fits;
- **not-generable** — photos, cartoons, artwork: not a figure toolkit's job.

One correction was applied after the per-exam audits: two auditors marked pie
charts uncovered; the `chart` preset draws pies and donuts (ADR 0019), so both
were re-scored as covered. Per-figure rows live outside the repo (scratchpad), as
they paraphrase copyrighted items; this page keeps only counts and question numbers.

## Results

| | figures | essential | covered | partial | uncovered | not-generable |
|---|---|---|---|---|---|---|
| Day 2 (Natureza + Matemática), 3 years | 174 | 156 | 30 | 87 | 37 | 20 |
| Day 1 (Linguagens + Humanas), 2 years | 36 | 32 | 1 | 2 | 1 | 32 |

**Day 1 is not Prancheta's terrain**: 32 of its 36 figures are photographs,
paintings, posters, satellite imagery and cartoons.

**Day 2 is**: of its 154 drawable figures, **30 (19 %) are covered today, and 87
(57 %) are partial** — close to an existing preset, missing a specific extension.
The gap is mostly extensions, not new kinds of figure.

### Day 2 by kind (drawable kinds only, all three years)

| kind | figures | covered | partial | uncovered |
|---|---|---|---|---|
| table (given data, text and numbers) | 25 | 1 | 14 | 10 |
| plane geometry | 16 | 2 | 14 | 0 |
| function graph | 12 | 7 | 5 | 0 |
| line chart (measured series) | 9 | 1 | 7 | 1 |
| solids (3D) | 8 | 0 | 5 | 3 |
| circuit | 7 | 1 | 6 | 0 |
| chemical structure | 7 | 6 | 1 | 0 |
| bar chart | 6 | 3 | 3 | 0 |
| space (R³) | 5 | 0 | 5 | 0 |
| scale drawing / blueprint | 5 | 1 | 2 | 2 |
| scatter | 3 | 1 | 2 | 0 |
| genetics (pedigree, Punnett) | 3 | 0 | 0 | 3 |
| field lines | 3 | 0 | 2 | 1 |
| infographic / biology schematic | 14 | 0 | 3 | 6 |

## What to build, by the counts

1. **A data-table preset** (25 figures, the largest single kind; 2023 Q94, 100,
   110, 118, 121, 137, 139, 144, 166; 2024 Q118, 130, 139, 150, 154, 177, 178;
   2025 Q94, 129, 142, 165, 168, 169). Rows and columns of *given* text and
   numbers, header fill, units, blank cells to fill in, merged headers.
   `value-table` computes from an expression and does not fit.
2. **Measured series and schematic axes** (≈ 17: line charts, function graphs,
   scatter, kinematics; 2023 Q132, 149, 156, 177, 178; 2024 Q101, 114, 152;
   2025 Q108, 127, 135, 145, 167, 169). A curve through given points (polyline
   or smooth), category x axes, value labels, fill between two series, dual y
   axes, and a declared *schematic* mode — axes without numbers, symbolic ticks
   (T, P₀), arrows on the curve — that `axis-number-present` accepts. ENEM's
   five-option graph questions are mostly this.
3. **Construction extensions** (14 partial: 2023 Q145, 154, 163, 172b, 177;
   2024 Q144, 150, 155, 163, 174; 2025 Q139, 148, 156, 173, 177). Circular
   sectors with the angle, belts tangent to two circles, annuli, semicircles on
   sides, dimension lines, styled regions, direction arrows on paths, a grid
   substrate.
4. **Solid and space extensions** (13: frustum and composite solids, a liquid
   level plane, an inscribed solid, nets, a cube with its projections, polyhedra
   from face data; 2023 Q136, 148, 165; 2024 Q161, 174, 175; 2025 Q126, 138,
   149, 170, 177).
5. **Circuit symbols** (6 partial: LED, non-ideal source with internal
   resistance, symbolic resistances like 0,2 Rc, tapped resistive wire;
   2024 Q131, 132; 2025 Q119, 130).
6. **Genetics** (3 uncovered: pedigree charts and Punnett squares; 2024 Q112,
   2025 Q107) — small, and common in Biologia lists.

The long tail — illustrated science schematics (fuel cell, solar heater, CRT,
reactors), lab apparatus, mechanics pictures with pulleys and trucks — appears
once each, and a toolkit adds little to an illustration; it stays out of scope
unless a course list shows it recurring.

Items 1–5 would turn roughly 75 of the 87 partial figures into covered ones —
from 19 % to about 60–65 % of the drawable day-2 figures. (Measured after
Phase 6: 64 %; see below.)

## After Phase 6 (re-scored 2026-10-02)

Phase 6 built items 1–6 (ADRs 0065–0070). Every row that was partial or
uncovered was re-scored. A row became covered only when the specific piece its
verdict named as missing now exists. The judgement uses the verdict notes, the
agents' renders of their own exercises in the same style, and the question
numbers each agent reported; it does not re-read every page.

| | drawable | covered | partial | uncovered |
|---|---|---|---|---|
| Day 2, before Phase 6 | 154 | 30 (19 %) | 87 (57 %) | 37 |
| Day 2, after Phase 6 | 154 | **98 (64 %)** | 34 (22 %) | 22 |

By kind, tables went from 1 to 23 of 25 covered; function graphs from 7 to 12 of
12; circuits from 1 to 7 of 7; solids from 0 to 7 of 8; line charts from 1 to 8
of 9. Day 1 has 4 drawable figures, and 3 are now covered.

What stays open is mostly the long tail this page already set aside:
illustrations (fuel cell, CRT, induction cooktop, nuclear plant, pulleys, a
truck), pictograms and icon rows, and pictures inside a figure (an aircraft, a
flag, beetles). The few small clusters a preset could still take on:

- **uniform field between plates** (3: 2024 Q127 twice, 2025 Q113) — `field`
  draws point charges only;
- **routes with bearings** and a compass dial (3: 2024 Q119, 2025 Q164 twice);
- **nodes at given positions** (2: 2023 Q146, 2025 Q180) — `graph` always lays
  out with ELK;
- merged body cells in `data-table` (2023 Q100), baffles in a tank (2024 Q161).

None reaches the size of Phase 6's items. The next ranking should come from the
course lists below.

Then two presets took on what was cheap and recurring (ADRs 0072, 0073):
`pictogram` covers 2023 Q176, 2024 Q142 and 2025 Q137, and `mechanics` covers
2023 Q109. That makes **102 of 154 (66 %)** covered. The rest of the long tail
— a fuel cell, a cathode-ray tube, an induction cooktop — is illustration with
nothing to compute. It stays raw IR, written per exercise.
`fixtures/ir/raw-ir-fuel-cell.json` is the worked example.

## Not yet audited

University course lists (the user's own Cálculo 1, Geometria Analítica, Química
lists) go in `ProjectHub/Listas/_corpus/` and will be audited as a separate
group, so school-level and university-level needs are not averaged together.
