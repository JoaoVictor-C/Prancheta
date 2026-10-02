/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python molecule module (modules/molecule/render.py) as a
 * subprocess and verifies its output with a real Chromium instance via
 * runAndVerifyModule. Mirrors tests/module-e2e.test.ts's shape for the map
 * module: no mocking, the actual protocol boundary, exercised for real in
 * both directions (an honest run, and a deliberately dishonest one via
 * --misdeclare).
 *
 * If `python` is not on PATH, or python lacks rdkit, the test FAILS loudly
 * rather than skipping, for the same reason module-e2e.test.ts does: a
 * silently skipped probe test is worse than no test at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertRdkitAvailable(): void {
  const probe = spawnSync("python", ["-c", "import rdkit"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/molecule/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import rdkit, needed by modules/molecule/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (glucose): every check passes or is not-applicable, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--name=glucose"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    for (const check of verification.checks) {
      assert.ok(
        check.status === "pass" || check.status === "not-applicable",
        `expected pass/not-applicable, got ${check.status} for ${check.id}: ${check.detail}`,
      );
    }

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.ok(idsResolve, "module-ids-resolve check must be present");
    assert.equal(idsResolve!.examined, output.elements.length);

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.ok(
      (geometryAgrees!.examined ?? 0) > 0,
      "at least one bond should have declared its geometry",
    );

    const measuredById = new Map(verification.measured.map((m) => [m.id, m]));
    for (const element of output.elements) {
      const measured = measuredById.get(element.id);
      assert.ok(measured, `declared element ${element.id} should appear in verification.measured`);
      assert.equal(measured!.found, true, `declared element ${element.id} should resolve (found: true)`);
    }
  },
);

test(
  "honest run (sucrose): a two-ring molecule with eleven labels still collides and overlaps cleanly",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--name=sucrose"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    const collide = verification.checks.find((c) => c.id === "module-labels-do-not-collide");
    assert.ok(collide, "module-labels-do-not-collide check must be present");
    assert.ok((collide!.examined ?? 0) >= 10, "sucrose should declare at least ten labels");
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom bond, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--misdeclare"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    const failing = verification.checks.filter((check) => check.status === "fail");
    assert.ok(
      failing.length >= 2,
      `expected at least two failing checks, got ${failing.length}: ${JSON.stringify(failing)}`,
    );

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.ok(idsResolve, "module-ids-resolve check must be present");
    assert.equal(idsResolve!.status, "fail");
    assert.ok(
      idsResolve!.detail?.includes("bond-phantom"),
      `module-ids-resolve detail should mention bond-phantom, got: ${idsResolve!.detail}`,
    );

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");

    assert.ok(verification.coverage["module-ids-resolve"] > 0);
    assert.ok(verification.coverage["module-geometry-agrees"] > 0);
  },
);

test(
  "--lone-pairs: water shows two pairs on O, ammonia one on N, BF3 three on each F and none on B; every check passes",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const cases: [string, Record<string, number>][] = [
      ["--smiles=O", { "atom-1": 2 }],
      ["--name=ammonia", { "atom-1": 1 }],
      ["--name=boron_trifluoride", { "atom-0": 3, "atom-2": 3, "atom-3": 3 }],
    ];
    for (const [arg, expected] of cases) {
      const { output, verification } = await runAndVerifyModule({
        command: "python",
        args: ["modules/molecule/render.py", arg, "--lone-pairs"],
        input: { width: 720, height: 520 },
        timeoutMs: TIMEOUT_MS,
      });
      assert.deepEqual(
        verification.checks.filter((c) => c.status === "fail"),
        [],
        `${arg}: no check should fail`,
      );
      const counts: Record<string, number> = {};
      for (const e of output.elements) {
        const m = /^(atom-\d+)-lp-\d+$/.exec(e.id);
        if (m) counts[m[1]!] = (counts[m[1]!] ?? 0) + 1;
      }
      // Water and ammonia are drawn with their hydrogens explicit so the pairs
      // have a real structure to sit on; only the heavy atom carries any
      // (RDKit writes the hydrogens first, so the heavy atom is atom 1).
      assert.deepEqual(counts, expected, arg);
    }
  },
);

test(
  "--theme: print (white paper) is the default, dark keeps the original palette, both pass the contrast check; the canvas is trimmed to the drawing",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    for (const [flag, paper] of [[undefined, "#FFFFFF"], ["--theme=light", "#F3F5F9"], ["--theme=dark", "#0F1115"]] as const) {
      const { output, verification } = await runAndVerifyModule({
        command: "python",
        args: ["modules/molecule/render.py", "--name=ethanol", ...(flag ? [flag] : [])],
        input: { width: 720, height: 520 },
        timeoutMs: TIMEOUT_MS,
      });
      assert.deepEqual(verification.checks.filter((c) => c.status === "fail"), []);
      assert.ok(output.svg.includes(`fill="${paper}"`), `${flag ?? "default"} should paint ${paper}`);
      const contrast = verification.checks.find((c) => c.id === "module-contrast-sufficient");
      assert.equal(contrast!.status, "pass");
      const height = Number(/<svg[^>]* height="(\d+)"/.exec(output.svg)![1]);
      assert.ok(height < 200, `ethanol's canvas should hug its drawing, got height ${height}`);
    }
  },
);

test(
  "atom labels are typeset: a charge is a superscript tspan with a real minus sign, an H count a subscript tspan",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--smiles=F[B-](F)(F)[NH3+]"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });
    assert.deepEqual(verification.checks.filter((c) => c.status === "fail"), []);
    assert.match(output.svg, /<tspan font-size="[\d.]+" dy="-[\d.]+">−<\/tspan>/);
    assert.match(output.svg, /<tspan font-size="[\d.]+" dy="-[\d.]+">\+<\/tspan>/);
    assert.match(output.svg, /<tspan font-size="[\d.]+" dy="[\d.]+">3<\/tspan>/);
    const labels = output.elements.filter((e) => e.kind === "label").map((e) => e.claim);
    assert.ok(labels.includes("atom 1 is B−"), JSON.stringify(labels));
  },
);

// --- lone pairs: dative bonds, charges, expanded shells; Lewis-dot placement ---

test(
  "lone-pair counts: a dative bond uses its donor's pair; charged, hypervalent and radical atoms count right",
  { timeout: TIMEOUT_MS },
  () => {
    assertRdkitAvailable();
    const code = [
      "import sys, json; sys.path.insert(0, 'modules/molecule')",
      "import render; from rdkit import Chem",
      "out = {}",
      "for s in sys.argv[1:]:",
      "    m = Chem.MolFromSmiles(s)",
      "    out[s] = [[a.GetSymbol(), render.lone_pair_count(a), render.radical_count(a)] for a in m.GetAtoms()]",
      "print(json.dumps(out))",
    ].join("\n");
    const result = spawnSync("python", ["-c", code, "N->[Ag+]<-N", "O->[Cu+2](<-O)(<-O)<-O", "[O-][N+](=O)[O-]",
      "OS(=O)(=O)O", "FS(F)(F)F", "[O]N=O", "[OH3+]", "[C-]#N"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const got = JSON.parse(result.stdout);
    // The N of each ammine gave its only pair to silver: nothing left to draw.
    assert.deepEqual(got["N->[Ag+]<-N"], [["N", 0, 0], ["Ag", 0, 0], ["N", 0, 0]]);
    // Water as a ligand keeps one of its two pairs.
    assert.deepEqual(got["O->[Cu+2](<-O)(<-O)<-O"].filter((a: unknown[]) => a[0] === "O").map((a: unknown[]) => a[1]), [1, 1, 1, 1]);
    assert.deepEqual(got["[O-][N+](=O)[O-]"].map((a: unknown[]) => a[1]), [3, 0, 2, 3]);
    assert.equal(got["OS(=O)(=O)O"][1][1], 0, "S in H2SO4 uses all six electrons in bonds");
    assert.equal(got["FS(F)(F)F"][1][1], 1, "S in SF4 keeps one pair");
    assert.deepEqual(got["[O]N=O"][0], ["O", 2, 1], "the radical O: two pairs and one unpaired electron");
    assert.equal(got["[OH3+]"][0][1], 1);
    assert.equal(got["[C-]#N"][0][1], 1);
  },
);

test(
  "a complex: N->[Ag+]<-N draws no pair on either N, and each dative bond as an arrow towards silver (--dative=line: a plain line)",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--smiles=N->[Ag+]<-N", "--lone-pairs"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });
    assert.deepEqual(verification.checks.filter((c) => c.status === "fail"), []);
    assert.equal(output.elements.filter((e) => /-lp-/.test(e.id)).length, 0, "no lone pair anywhere");
    const bonds = output.elements.filter((e) => /^bond-\d+$/.test(e.id));
    assert.equal(bonds.length, 2);
    for (const b of bonds) {
      assert.match(b.claim ?? "", /dative bond: atom \d \(N\) gives its lone pair to atom 1 \(Ag\)/);
      assert.match(output.svg, new RegExp(`<path data-pr-id="${b.id}" d="M [^"]+ Z"`), "shaft and filled head in one path");
    }
    const labels = output.elements.filter((e) => e.kind === "label").map((e) => e.claim);
    assert.ok(labels.includes("atom 0 is H3N"), `the left ammine reads towards its bond: ${JSON.stringify(labels)}`);

    const line = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--smiles=N->[Ag+]<-N", "--dative=line"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });
    assert.deepEqual(line.verification.checks.filter((c) => c.status === "fail"), []);
    assert.match(line.output.svg, /<line data-pr-id="bond-0"/);
    const bad = spawnSync("python", ["modules/molecule/render.py", "--smiles=N->[Ag+]<-N", "--dative=wavy"], {
      encoding: "utf8",
      input: "{}",
    });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /unknown --dative/);
  },
);

test(
  "--lone-pairs on a charged heteroatom draws its hydrogens as atoms: F3B-NH3's N+ is an atom, not an \"NH3+\" group label",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--smiles=F[B-](F)(F)[NH3+]", "--lone-pairs"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });
    assert.deepEqual(verification.checks.filter((c) => c.status === "fail"), []);
    const labels = output.elements.filter((e) => e.kind === "label").map((e) => e.claim);
    assert.ok(labels.includes("atom 4 is N+"), JSON.stringify(labels));
    assert.equal(labels.filter((c) => /is H$/.test(c ?? "")).length, 3);
  },
);

test(
  "Lewis-dot placement: pairs sit on the sides of their atom, the two dots parallel to that side, never overlapping another pair or a label",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    type Box = { x: number; y: number; width: number; height: number };
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const species = ["O", "N", "FB(F)F", "[O-][N+](=O)[O-]", "OS(=O)(=O)O", "CC(=O)[O-]", "[Cl-]", "[OH-]", "[OH3+]"];
    for (const smiles of species) {
      const { output, verification } = await runAndVerifyModule({
        command: "python",
        args: ["modules/molecule/render.py", `--smiles=${smiles}`, "--lone-pairs"],
        input: { width: 720, height: 520 },
        timeoutMs: TIMEOUT_MS,
      });
      assert.deepEqual(verification.checks.filter((c) => c.status === "fail"), [], smiles);
      const measured = new Map(verification.measured.map((m) => [m.id, m.box as Box]));
      const pairs = output.elements.filter((e) => /-lp-\d+$/.test(e.id));
      assert.ok(pairs.length > 0, smiles);
      const labels = output.elements.filter((e) => e.kind === "label");
      for (const p of pairs) {
        for (const q of pairs) {
          if (p.id < q.id) assert.ok(!overlaps(measured.get(p.id)!, measured.get(q.id)!), `${smiles}: ${p.id} overlaps ${q.id}`);
        }
        for (const l of labels) {
          const lb = measured.get(l.id);
          if (lb) assert.ok(!overlaps(measured.get(p.id)!, lb), `${smiles}: ${p.id} overlaps ${l.id}`);
        }
      }
    }
    // Nitrate's O-: three pairs, each on a side of the atom, each drawn with its
    // two dots level (a pair above or below) or plumb (a pair left or right).
    const { output } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--smiles=[O-][N+](=O)[O-]", "--lone-pairs"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });
    for (const k of [0, 1, 2]) {
      const group = new RegExp(`<g data-pr-id="atom-0-lp-${k}"[^>]*>(.*?)</g>`).exec(output.svg)![1]!;
      const [a, b] = [...group.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
      assert.ok(Math.abs(a![0]! - b![0]!) < 0.05 || Math.abs(a![1]! - b![1]!) < 0.05, `pair ${k} is parallel to a side: ${group}`);
    }
  },
);

// --- resonance forms and hidden answers ---------------------------------------

async function runMolecule(args: string[]) {
  return runAndVerifyModule({
    command: "python",
    args: ["modules/molecule/render.py", ...args],
    input: { width: 720, height: 520 },
    timeoutMs: TIMEOUT_MS,
  });
}

/** Where each atom label of each resonance form (tile f<k>) sits, relative to that form's own atom 1 label. */
function labelOffsets(svg: string): Map<number, Map<number, [number, number]>> {
  const forms = new Map<number, Map<number, [number, number]>>();
  for (const m of svg.matchAll(/<g transform="translate\(([\d.-]+) ([\d.-]+)\)">/g)) {
    const from = m.index! + m[0].length;
    const next = svg.indexOf('<g transform="translate(', from);
    const block = svg.slice(from, next < 0 ? svg.length : next);
    const atoms = new Map<number, [number, number]>();
    for (const t of block.matchAll(/data-pr-id="f(\d+)-atom-(\d+)-label" x="([\d.-]+)" y="([\d.-]+)"/g)) {
      atoms.set(Number(t[2]), [Number(m[1]) + Number(t[3]), Number(m[2]) + Number(t[4])]);
      forms.set(Number(t[1]), atoms);
    }
  }
  return forms;
}

test(
  "--resonance: nitrate and carbonate draw three forms, acetate and ozone two, joined by double-headed arrows, all on the same coordinates",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const expected: Record<string, number> = { nitrate: 3, carbonate: 3, acetate: 2, ozone: 2 };
    for (const [name, forms] of Object.entries(expected)) {
      const { output, verification } = await runMolecule([`--name=${name}`, "--resonance"]);
      assert.deepEqual(verification.checks.filter((c) => c.status === "fail"), [], name);
      const tiles = new Set(output.elements.map((e) => /^f(\d+)-/.exec(e.id)?.[1]).filter(Boolean));
      assert.equal(tiles.size, forms, `${name}: ${forms} resonance forms`);
      const arrows = output.elements.filter((e) => /^res-arrow-\d+$/.test(e.id));
      assert.equal(arrows.length, forms - 1, `${name}: one arrow between neighbouring forms`);
      assert.ok(output.notes?.some((n) => n.includes(`enumerated ${forms} distinct`)), name);
      // Lone pairs and charges are drawn per form: every form has some.
      for (const k of tiles) assert.ok(output.elements.some((e) => e.id.startsWith(`f${k}-atom-`) && /-lp-/.test(e.id)), `${name} form ${k} has pairs`);

      // Same coordinates: an atom labelled in every form sits at the same offset from the first such atom in all of them.
      const offsets = labelOffsets(output.svg);
      const common = [...offsets.get(0)!.keys()].filter((a) => [...offsets.values()].every((atoms) => atoms.has(a)));
      assert.ok(common.length >= 2, `${name}: at least two atoms are labelled in every form`);
      const anchor = common[0]!;
      for (const [k, atoms] of offsets) {
        for (const atom of common) {
          const dx = atoms.get(atom)![0] - atoms.get(anchor)![0] - (offsets.get(0)!.get(atom)![0] - offsets.get(0)!.get(anchor)![0]);
          const dy = atoms.get(atom)![1] - atoms.get(anchor)![1] - (offsets.get(0)!.get(atom)![1] - offsets.get(0)!.get(anchor)![1]);
          assert.ok(Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05, `${name}: atom ${atom} moved between form 0 and form ${k} (${dx}, ${dy})`);
        }
        // ... and every form sits on one baseline: the anchor is at the same height in each.
        assert.ok(Math.abs(atoms.get(anchor)![1] - offsets.get(0)!.get(anchor)![1]) < 0.05, `${name}: form ${k} is on the same row`);
      }
    }
    // Different electrons per form: the double bond is on a different oxygen in each nitrate form.
    const { output } = await runMolecule(["--name=nitrate", "--resonance"]);
    const svgDoubles = output.svg
      .split('<g transform="translate(')
      .slice(1)
      .map((tile) => (tile.match(/<g data-pr-id="f\d-bond-\d" stroke="[^"]*" stroke-width="1.8"><line[^>]*\/><line/g) ?? []).length);
    assert.deepEqual(svgDoubles, [1, 1, 1], "exactly one double bond per form");
  },
);

test(
  "--resonance is capped at four forms and says so; a species with no other form draws one structure and says so",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const many = await runMolecule(["--smiles=c1ccc2c(c1)ccc1ccccc12", "--resonance"]);
    assert.deepEqual(many.verification.checks.filter((c) => c.status === "fail"), []);
    assert.equal(new Set(many.output.elements.map((e) => /^f(\d+)-/.exec(e.id)?.[1]).filter(Boolean)).size, 4);
    assert.ok(many.output.notes?.some((n) => /capped at 4 forms, 1 more not drawn/.test(n)), JSON.stringify(many.output.notes));
    const one = await runMolecule(["--smiles=CCO", "--resonance"]);
    assert.deepEqual(one.verification.checks.filter((c) => c.status === "fail"), []);
    assert.ok(one.output.notes?.some((n) => /no other resonance form/.test(n)));
    assert.equal(one.output.elements.filter((e) => /^res-arrow-/.test(e.id)).length, 0);
  },
);

test(
  "--answers=false hides lone pairs, radical dots and formal charges and keeps the skeleton; true is the default and unchanged",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const smiles = "--smiles=[O-][N+](=O)[O-]";
    const shown = await runMolecule([smiles, "--lone-pairs"]);
    const explicit = await runMolecule([smiles, "--lone-pairs", "--answers=true"]);
    const hidden = await runMolecule([smiles, "--lone-pairs", "--answers=false"]);
    for (const r of [shown, explicit, hidden]) assert.deepEqual(r.verification.checks.filter((c) => c.status === "fail"), []);
    assert.equal(explicit.output.svg, shown.output.svg, "true is the default");
    assert.ok(shown.output.elements.some((e) => /-lp-/.test(e.id)));
    assert.match(shown.output.svg, /−<\/tspan>/, "charges drawn by default");
    assert.equal(hidden.output.elements.filter((e) => /-(lp|rad)-\d+$/.test(e.id)).length, 0, "no pair or dot declared");
    assert.doesNotMatch(hidden.output.svg, /<circle/, "no dot drawn");
    assert.doesNotMatch(hidden.output.svg, /[+−]<\/tspan>/, "no formal charge drawn");
    const skeleton = (r: typeof shown) => r.output.elements.filter((e) => /^bond-\d+$/.test(e.id)).map((e) => e.id);
    assert.deepEqual(skeleton(hidden), skeleton(shown), "same bonds");
    assert.deepEqual(
      hidden.output.elements.filter((e) => e.kind === "label").map((e) => e.id),
      shown.output.elements.filter((e) => e.kind === "label").map((e) => e.id),
      "same atoms labelled",
    );
    // A radical's dot is an answer too.
    const radical = await runMolecule(["--smiles=[O]N=O", "--lone-pairs", "--answers=false"]);
    assert.equal(radical.output.elements.filter((e) => /-rad-/.test(e.id)).length, 0);
    // Resonance: the statement is the structure as written, without pairs or charges.
    const res = await runMolecule(["--name=nitrate", "--resonance", "--answers=false"]);
    assert.deepEqual(res.verification.checks.filter((c) => c.status === "fail"), []);
    assert.equal(new Set(res.output.elements.map((e) => /^f(\d+)-/.exec(e.id)?.[1]).filter(Boolean)).size, 1);
    assert.equal(res.output.elements.filter((e) => /-lp-/.test(e.id)).length, 0);
    const bad = spawnSync("python", ["modules/molecule/render.py", "--smiles=O", "--answers=maybe"], { encoding: "utf8", input: "{}" });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /unknown --answers/);
  },
);
