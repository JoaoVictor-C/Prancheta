# 0070 — Genetics: a cross and a family tree, both computed

## Status

Accepted.

## The need

Biologia lists and ENEM (2024 Q112, 2025 Q107 ×2) ask for two figures: the
Punnett square of a cross and the pedigree of a trait, usually with a
probability to read off ("qual a probabilidade de II-3 ser portador?"). No
preset drew either; a hand-built IR lets a cell disagree with the gametes it
sits under, or a printed 2/3 disagree with the family drawn.

## The decision

**One preset, `genetics`, two kinds; the input is genotypes and relations, never
positions or results.**

- *Punnett.* Genotypes are read as pairs of alleles (a base letter and an
  optional superscript, so `Xᴬ`, `Iᴮ`, `Cᴿ` are one allele, written back as real
  superscript runs, ADR 0062). Independent assortment gives each parent's
  distinct gametes with exact weights; cells are sorted dominant-first; the
  phenotype of a cell comes from the stated dominance (complete, incomplete,
  codominance, with ABO named by default). Genotype and phenotype proportions
  are fractions (`bigint`, reused from `probability-tree`) and the
  smallest-integer ratio. Cells are tinted by phenotype; `highlight` outlines
  the cells a genotype pattern (`A_bb`) or a phenotype matches and prints their
  sum.
- *Pedigree.* Generations follow from parents, the order within a row from
  sibship order with married-in partners at the ends, x positions from a
  least-squares problem with minimum spacing (pool-adjacent-violators), lines
  orthogonal. Labels are **derived** (Roman generation, place in the row); a
  typed id that looks like a label but differs is refused. Consanguinity is
  derived from a shared ancestor.
- *Analysis.* An individual's state is the number of disease-allele copies; the
  pedigree is enumerated exactly (integer weights, quarters), constrained by
  the drawn phenotypes, carriers and given genotypes. Marginals give each
  individual's possible genotypes and every query exactly. An empty enumeration
  names the first individual whose phenotype breaks the mode. Conditioning on
  relatives is real: an unaffected son lowers his mother's carrier probability
  (X-linked fixture: 1/3, not 1/2).
- **A founder's genotype is not invented.** A probability that changes between
  two different founder priors is refused ("depends on how common the allele
  is"), unless `analysis.frequency` or that individual's `genotype` is given.
  The pedigree alone cannot say it.
- A query with `sex` is the joint "a boy and affected", and its printed text
  says so, never the conditional.

## Drawing and `answers: false`

Text is set by the shared panel and runs; every label declares what it names.
With `answers: false` the Punnett keeps the gametes and drops cells and panel;
the pedigree keeps the chart as given and drops genotypes and probabilities.
The analysis still runs, so inconsistency is refused either way.

## What was refused

- The ♀/♂ glyphs: not in the bundled face (ADR 0063); sexes are named in words
  (mãe/pai, filha/filho).
- Typed coordinates for the pedigree, and typed labels that disagree with the
  layout.
- A uniform founder prior presented as an answer.

## Not covered

Linked genes, Y-linked and mitochondrial inheritance, twins, long partner
chains, marriages across generations.
