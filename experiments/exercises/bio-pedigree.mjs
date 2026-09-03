/*
 * BIOLOGY 1 -- a pedigree, and the square that explains it.
 *
 * AN HONEST NOTE ON WHAT IS DERIVED HERE, because it is less than on the other
 * plates. The generation rows are assigned by hand: a pedigree is a DAG with
 * two parents converging on every child, not a tree, and no layout algorithm
 * in this repertoire handles converging parental edges. So the POSITIONS are
 * authored, and this plate does not pretend otherwise.
 *
 * What IS computed is the shading. Nobody decided which symbols are
 * half-filled. An unaffected individual is marked an obligate carrier when the
 * rules of autosomal recessive inheritance force it -- here, because they have
 * an affected child -- and the inference runs over the family as data. The
 * Punnett square beside it is filled from the SAME inference, so the two are
 * one computation rendered twice: shade a symbol wrongly and the square it
 * came from would contradict it.
 *
 * The probability the exercise asks for is readable from either, and printed
 * on neither.
 *
 *   node experiments/exercises/bio-pedigree.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- the family, as data ---------------------------------------------------
const PEOPLE = [
  { id: "I-1", sex: "m", affected: false, gen: 0, x: 250 },
  { id: "I-2", sex: "f", affected: false, gen: 0, x: 370 },
  { id: "II-1", sex: "m", affected: false, gen: 1, parents: ["I-1", "I-2"], x: 168 },
  { id: "II-2", sex: "f", affected: true, gen: 1, parents: ["I-1", "I-2"], x: 288 },
  { id: "II-3", sex: "m", affected: false, gen: 1, parents: ["I-1", "I-2"], x: 408 },
  { id: "II-4", sex: "f", affected: false, gen: 1, x: 528 },
  { id: "III-1", sex: "f", affected: false, gen: 2, parents: ["II-3", "II-4"], x: 408 },
  { id: "III-2", sex: "m", affected: false, gen: 2, parents: ["II-3", "II-4"], x: 528 },
];
const by = Object.fromEntries(PEOPLE.map((q) => [q.id, q]));

/**
 * Obligate carriers, inferred rather than declared.
 *
 * Under autosomal recessive inheritance an affected individual is aa, so every
 * allele they carry came from a parent: both parents must carry one. And an
 * unaffected child of an affected parent must have taken that parent's a.
 * Nothing else is forced -- an unaffected sib of an affected child is a
 * carrier with probability 2/3, which is a probability and not a certainty,
 * and is exactly what the question is about.
 */
function obligateCarriers(people) {
  const out = new Set();
  for (const q of people) {
    if (!q.affected) continue;
    for (const pid of q.parents ?? []) if (!by[pid].affected) out.add(pid);
    for (const c of people) if ((c.parents ?? []).includes(q.id) && !c.affected) out.add(c.id);
  }
  return out;
}
const CARRIER = obligateCarriers(PEOPLE);

const p = new Plate({ subject: "Biology", title: "Who must be a carrier", height: 820 });

// ==========================================================================
// the pedigree
// ==========================================================================
const GENY = [214, 348, 482];
const R = 17;

function symbol(q) {
  const y = GENY[q.gen];
  const affected = q.affected;
  const carrier = CARRIER.has(q.id);
  const fill = affected ? "#23262C" : "#FFFFFF";
  if (q.sex === "m") {
    const box = [
      { x: q.x - R, y: y - R }, { x: q.x + R, y: y - R },
      { x: q.x + R, y: y + R }, { x: q.x - R, y: y + R },
    ];
    p.poly(box, { fill, stroke: INK, width: 1.6, close: true });
    if (carrier) {
      p.poly([{ x: q.x - R, y: y - R }, { x: q.x, y: y - R }, { x: q.x, y: y + R }, { x: q.x - R, y: y + R }],
        { fill: "#23262C", stroke: "none", width: 0, close: true });
      p.poly(box, { fill: "none", stroke: INK, width: 1.6, close: true });
    }
  } else {
    p.disc({ x: q.x, y }, R, fill);
    if (carrier) {
      p.mark({
        from: { x: q.x, y: y - R },
        segments: [{ arc: { x: q.x, y: y + R }, centre: { x: q.x, y } }, { line: { x: q.x, y: y - R } }],
        close: true, fill: "#23262C", stroke: "none", strokeWidth: 0,
      });
    }
    p.circle({ x: q.x, y }, R, { stroke: INK, width: 1.6 });
  }
  p.label(q.id, q.x, y + R + 14, { size: 11.5, colour: SOFT, weight: 600 });
  p.reserve(q.x, y, R * 2 + 8, R * 2 + 30);
}

// mating and sibship lines, drawn from the family data
function mating(aId, bId, kids) {
  const a = by[aId];
  const b = by[bId];
  const y = GENY[a.gen];
  p.seg({ x: a.x + R, y }, { x: b.x - R, y }, { stroke: INK, width: 1.4 });
  const mid = (a.x + b.x) / 2;
  const drop = (GENY[a.gen] + GENY[a.gen + 1]) / 2 - 8;
  p.seg({ x: mid, y }, { x: mid, y: drop }, { stroke: INK, width: 1.4 });
  const xs = kids.map((k) => by[k].x);
  p.seg({ x: Math.min(...xs), y: drop }, { x: Math.max(...xs), y: drop }, { stroke: INK, width: 1.4 });
  for (const k of kids) p.seg({ x: by[k].x, y: drop }, { x: by[k].x, y: GENY[by[k].gen] - R }, { stroke: INK, width: 1.4 });
}
mating("I-1", "I-2", ["II-1", "II-2", "II-3"]);
mating("II-3", "II-4", ["III-1", "III-2"]);
PEOPLE.forEach(symbol);

// the key
{
  const kx = 150;
  const ky = 592;
  const entry = (i, draw, text) => {
    const x = kx + i * 200;
    draw(x, ky);
    // align:"start" sets the text at the box's LEFT edge, and the box is
    // centred on cx -- so the centre has to be pushed out by half the width or
    // the caption sits back on top of its own swatch.
    const w = 150;
    p.label(text, x + 24 + w / 2, ky, { size: 11.5, colour: SOFT, align: "start", width: w });
  };
  entry(0, (x, y) => { p.poly([{ x: x - 12, y: y - 12 }, { x: x + 12, y: y - 12 }, { x: x + 12, y: y + 12 }, { x: x - 12, y: y + 12 }], { fill: "#FFFFFF", stroke: INK, width: 1.4, close: true }); }, "male,\nunaffected");
  entry(1, (x, y) => { p.disc({ x, y }, 12, "#23262C"); p.circle({ x, y }, 12, { stroke: INK, width: 1.4 }); }, "female,\naffected");
  entry(2, (x, y) => {
    p.disc({ x, y }, 12, "#FFFFFF");
    p.mark({ from: { x, y: y - 12 }, segments: [{ arc: { x, y: y + 12 }, centre: { x, y } }, { line: { x, y: y - 12 } }], close: true, fill: "#23262C", stroke: "none", strokeWidth: 0 });
    p.circle({ x, y }, 12, { stroke: INK, width: 1.4 });
  }, "obligate carrier —\ninferred, not assumed");
}

// ==========================================================================
// the Punnett square for the mating that produced the affected child
// ==========================================================================
{
  const QX = 760;
  const QY = 250;
  const C = 84;
  const alleles = ["A", "a"];
  const cells = [];
  for (const m of alleles) for (const f of alleles) cells.push([m, f].sort().join(""));

  p.label("THE MATING THAT PRODUCED II-2", QX + C, QY - 74, { size: 11, colour: FAINT, weight: 600, tracking: 2 });
  p.label("I-1  ×  I-2   —   both Aa, because their daughter is aa", QX + C, QY - 44, { size: 12.5, colour: SOFT });

  alleles.forEach((a, i) => {
    p.label(a, QX + C / 2 + i * C, QY - 14, { size: 15, colour: INK, weight: 700 });
    p.label(a, QX - 18, QY + C / 2 + i * C, { size: 15, colour: INK, weight: 700 });
  });
  let k = 0;
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const g = cells[k];
      k += 1;
      const x = QX + c * C;
      const y = QY + r * C;
      const affected = g === "aa";
      const carrier = g === "Aa";
      p.poly([{ x, y }, { x: x + C, y }, { x: x + C, y: y + C }, { x, y: y + C }], {
        fill: affected ? "rgba(35,38,44,0.86)" : carrier ? "rgba(35,38,44,0.20)" : "#FFFFFF",
        stroke: INK, width: 1.4, close: true,
      });
      p.label(g, x + C / 2, y + C / 2 - 8, { size: 19, colour: affected ? "#FFFFFF" : INK, weight: 700, claim: false });
      p.label(affected ? "affected" : carrier ? "carrier" : "homozygous", x + C / 2, y + C / 2 + 18,
        { size: 11, colour: affected ? "#E8E6E0" : SOFT, claim: false });
    }
  }
  p.reserve(QX + C, QY + C, C * 2 + 60, C * 2 + 80);
  p.ask("of the unaffected children, what fraction carry a ?", QX + C, QY + 2 * C + 34,
    [{ x: 0, y: 1 }, { x: 0, y: -1 }], { size: 12.5 });
}

p.ask("III-1 is unaffected. Is she a carrier ?", by["III-1"].x - 30, GENY[2] + 62,
  [{ x: 0, y: 1 }, { x: -1, y: 0.4 }], { size: 12.5 });

p.label(
  "No symbol was shaded by hand. The half-filled ones are what the inheritance rules force, given who is affected — and the square is the same inference, drawn again.",
  p.W / 2, 660, { size: 12, colour: FAINT },
);

p.question([
  "The condition shown is caused by a single gene. II-4 married into the family; in the wider population 1 person in 25 is a carrier.",
  "(a)  Is the condition dominant or recessive, autosomal or sex-linked? Give the evidence from the pedigree, not from the shading.",
  "(b)  Why must I-1 and I-2 both be carriers, while II-1 and II-3 only might be?      (c)  What is P(II-3 is a carrier)?",
  "(d)  Find the probability that III-1 is a carrier.      (e)  What is the chance that III-1 and III-2 are both carriers?",
]);

p.write(process.argv[2] ?? "experiments/exercises/bio-pedigree.json");
console.log(`  obligate carriers inferred: ${[...CARRIER].join(", ")}`);
