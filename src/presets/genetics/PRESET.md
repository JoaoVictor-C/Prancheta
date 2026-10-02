# genetics

Punnett squares and pedigrees (*heredogramas*) of Biologia and ENEM ("o cruzamento
de plantas Aa × Aa", "o heredograma abaixo mostra uma doença autossômica
recessiva; qual a probabilidade de II-3 ser portador?"). Two kinds, one preset;
every number is **computed** -- gametes, cells, proportions, genotype
possibilities, probabilities -- in exact fractions. See
[`docs/decisions/0070-genetics.md`](../../../docs/decisions/0070-genetics.md).

**Choose it when** the figure is a genetic cross or a family tree of a trait. It
is not a probability tree (`probability-tree`) nor a general tree (`graph`).

## kind "punnett"

```json
{ "preset": "genetics", "kind": "punnett", "parents": ["AaBb", "AaBb"],
  "phenotypes": { "A": { "dominant": "amarela", "recessive": "verde" },
                  "B": { "dominant": "lisa", "recessive": "rugosa" } },
  "highlight": ["A_bb"] }
```

| field | what it does |
| --- | --- |
| `parents` | Two genotypes: `"Aa"`, `"AaBb"` (pairs, independent assortment), sex-linked `"XᴬXᵃ"` / `"X^A X^a"` × `"XᴬY"`, multiple alleles `"Iᴬi"`. First = rows, second = columns. |
| `names` | The parents' names; default Mãe/Pai (sex-linked) or Genitor 1/2. |
| `dominance` | `"complete"` (default), `"incomplete"`, `"codominance"`; one word or per locus (`{"I": "codominance"}`). |
| `phenotypes` | Names per locus. Complete: `{"dominant", "recessive"}`. Incomplete/codominance: genotype to name (`{"CᴿCᵂ": "rosa"}`). Unnamed: `A_`/`aa`, and ABO gives A, B, AB, O. |
| `sexWords` | Words for offspring sex in a sex-linked cross; default filha/filho. |
| `highlight` | Genotype patterns (`"A_bb"`, `"XᵃY"`) or phenotype names: cells outlined, `P(…)` printed. |

Drawn: the gametes of each parent on the margins (distinct, in dominant-first
order), every offspring genotype in its cell (alleles dominant first, real
superscripts), cells tinted by phenotype with a swatch legend. Panel: genotype
fractions and ratio (`1 : 2 : 1`), phenotype fractions and ratio
(`9 : 3 : 3 : 1`), requested probabilities with a percentage.

## kind "pedigree"

```json
{ "preset": "genetics", "kind": "pedigree",
  "individuals": [ { "id": "I-1", "sex": "M" }, { "id": "I-2", "sex": "F" },
    { "id": "II-1", "sex": "F", "affected": true, "parents": ["I-1", "I-2"] } ],
  "analysis": { "mode": "autosomal recessive",
                "queries": [ { "of": "II-1", "is": "affected" } ] } }
```

| field | what it does |
| --- | --- |
| `individuals[]` | `id`, `sex` (`M` square, `F` circle, `?` diamond), `affected` (filled), `carrier` (dot or half), `deceased` (slash), `proband` (arrow), `parents` (two ids), `name`, `genotype` (given by the exercise, used by the analysis). |
| `marriages[]` | `{between: [a, b], consanguineous?}` for couples without children listed; shared parents make a marriage by themselves. A shared ancestor in the chart makes it consanguineous (double line) by itself. |
| `carrierStyle` | `"dot"` (default) or `"half"`. |
| `legend` | Key of the symbols used (default true). |
| `analysis` | `mode` ("autosomal recessive/dominant", "X-linked recessive/dominant", Portuguese too), `frequency` (disease allele, `"1/100"`), `queries`: `{of, is: carrier / affected / unaffected}`, `{of, is: "genotype", genotype}`, `{childOf: [a, b], is: affected / carrier, sex?}` (with `sex` the probability is the joint "a boy and affected"). |

Layout is computed: generation from parents, order within a row (sibships
follow their parents; individuals who marry in stand at the sibship's ends),
positions by least squares (children under the parents' marriage, partners one
spacing apart), orthogonal lines. **Labels (`II-3`) are derived** from the
layout; an id that looks like a label but differs from it is refused.

The analysis enumerates every genotype assignment in exact integers, keeps
those that show the drawn phenotypes, prints each individual's genotype (`Aa`,
`A_`, `XᴬXᴬ ou XᴬXᵃ`) under the symbol and every query exactly
(`P(II-3 ser portador) = 2/3 ≈ 66,67%`). **Refused**: a pedigree no assignment
explains (the first individual that makes it impossible is named); a
probability that changes with the genotype of an unrelated married-in
individual unless `frequency` or that individual's `genotype` is given; a
carrier mark in a dominant or male-X mode.

## answers: false

Punnett: the margins (gametes) stay; every cell, tint, outline and the whole
panel go. Pedigree: the chart as given (sexes, affected, carriers, marriages,
labels, legend) stays; the genotypes under the symbols and the panel (verdict
and probabilities) go. The analysis still runs, so an inconsistent pedigree is
refused either way.

## Not covered

Linked genes (crossing-over), Y-linked and mitochondrial inheritance, twins,
three or more partners in a chain, marriages that cross generations (a couple
is placed in the later generation; children must be exactly one below).

Fixtures: [`fixtures/genetics/`](../../../fixtures/genetics/). Tests:
`tests/genetics.test.ts`.
