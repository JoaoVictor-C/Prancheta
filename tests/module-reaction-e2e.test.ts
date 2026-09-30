/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python reaction module (modules/reaction/render.py), which
 * itself spawns nothing but imports modules/molecule/render.py directly as a
 * sibling module, and verifies its output with a real Chromium instance via
 * runAndVerifyModule. Mirrors tests/module-molecule-e2e.test.ts's shape.
 *
 * If `python` is not on PATH, or python lacks rdkit, the test FAILS loudly
 * rather than skipping, for the same reason the other module e2e tests do.
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
      `python is not available on PATH (required for modules/reaction/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import rdkit, needed by modules/reaction/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (glucose_combustion): every check passes or is not-applicable, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/reaction/render.py", "--name=glucose_combustion"],
      input: { width: 900, height: 260 },
      timeoutMs: TIMEOUT_MS,
    });

    for (const check of verification.checks) {
      assert.ok(
        check.status === "pass" || check.status === "not-applicable",
        `expected pass/not-applicable, got ${check.status} for ${check.id}: ${check.detail}`,
      );
    }

    const measuredById = new Map(verification.measured.map((m) => [m.id, m]));
    for (const element of output.elements) {
      const measured = measuredById.get(element.id);
      assert.ok(measured, `declared element ${element.id} should appear in verification.measured`);
      assert.equal(measured!.found, true, `declared element ${element.id} should resolve (found: true)`);
    }

    // Every tile's ids were re-prefixed; a raw "atom-0-label" colliding
    // across reactants is exactly the bug embed() exists to prevent.
    const ids = output.elements.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "no two declared elements should share an id");

    const arrow = output.elements.find((e) => e.id === "reaction-arrow");
    assert.ok(arrow, "reaction-arrow must be declared");
    assert.ok(arrow!.declaredBox, "reaction-arrow must declare its geometry");
  },
);

test(
  "honest run (esterification): a two-reactant, two-product reaction with no coefficients above 1",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/reaction/render.py", "--name=esterification"],
      input: { width: 900, height: 260 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom reagent, module-geometry-agrees fails on the widened arrow",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/reaction/render.py", "--misdeclare"],
      input: { width: 900, height: 260 },
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
    assert.ok(idsResolve!.detail?.includes("reagent-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);

test(
  "honest run (combustion_methane): water and methane -- bare, unconnected atoms with nothing to draw by default -- get real explicit-hydrogen structures, not blank tiles or text labels",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/reaction/render.py", "--name=combustion_methane"],
      input: { width: 900, height: 320 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    // Participants in first-seen order: CH4, O2, CO2, H2O -> m0..m3.
    // Methane (m0) used to declare literally zero elements: carbon's own
    // label is suppressed under the skeletal convention, and a bare atom
    // with no explicit hydrogens has no bond to draw either.
    const m0 = output.elements.filter((e) => e.id.startsWith("m0-"));
    assert.ok(m0.length > 0, "methane should declare real structure, not an entirely blank tile");
    assert.ok(
      m0.some((e) => e.id.includes("bond")),
      "methane should have real explicit-hydrogen bonds, not just a formula label",
    );

    // Water (m3) used to be a single text label ("H2O"). It should now be a
    // real bent structure: an O atom bonded to two explicit H atoms.
    const m3 = output.elements.filter((e) => e.id.startsWith("m3-"));
    assert.ok(
      m3.some((e) => e.id.includes("bond")),
      "water should have real O-H bonds, not just a text label standing in for a structure",
    );
    assert.equal(
      m3.filter((e) => /atom-\d+-label$/.test(e.id)).length,
      3,
      "water's real structure has 3 labelled atoms (O and 2 H), not 1",
    );
  },
);

test(
  "honest run (glucose_combustion): the equation is plain text (letters and numbers only) in its own row, and EVERY participant also gets a real structural drawing in a separate row below",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/reaction/render.py", "--name=glucose_combustion"],
      input: { width: 1100, height: 320 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    // The equation row: one text token per side per unique component --
    // glucose + O2 on the left, CO2 + H2O on the right -- each a plain
    // "count + formula" label, not a structural drawing.
    const eqnTokens = output.elements.filter((e) => e.id.startsWith("eqn-"));
    assert.equal(eqnTokens.length, 4, "glucose, O2, CO2, H2O -- one equation token each");
    const claims = eqnTokens.map((e) => e.claim);
    assert.ok(claims.some((c) => /C6H12O6|C₆H₁₂O₆/.test(c ?? "")), "glucose's own formula should appear in the equation");
    assert.ok(claims.some((c) => /6 x O2|6 x O₂/.test(c ?? "")), "O2's coefficient should be part of its equation token, not a separate stacked label");

    // Structural row: every one of the 4 unique participants -- glucose, O2,
    // CO2, H2O -- gets a real molecule tile (m0..m3), not just the ones with
    // an "interesting" skeleton. Water's own tile is a single labelled atom
    // (H2O has no explicit bond to draw), which is still a real structural
    // answer to "what does this molecule look like", not a stand-in.
    const tilePrefixes = new Set(
      output.elements
        .map((e) => /^(m\d+)-/.exec(e.id)?.[1])
        .filter((p): p is string => p !== undefined),
    );
    assert.equal(tilePrefixes.size, 4, "all four unique participants should get their own structural tile");
  },
);

// --- acid-base exercise figures: theme, display forms, typesetting, ---------
// --- equilibrium arrow, lone pairs, trimmed canvas ---------------------------

type Box = { x: number; y: number; width: number; height: number };

function runReaction(args: string[]) {
  return runAndVerifyModule({
    command: "python",
    args: ["modules/reaction/render.py", ...args],
    input: { width: 900, height: 260 },
    timeoutMs: TIMEOUT_MS,
  });
}

function assertNoFailures(verification: { checks: { id: string; status: string; detail?: string }[] }): void {
  const failing = verification.checks.filter((c) => c.status === "fail");
  assert.deepEqual(failing, [], `no check should fail: ${JSON.stringify(failing)}`);
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function runPython(args: string[], input = "{}") {
  return spawnSync("python", args, { encoding: "utf8", input });
}

test(
  "arrhenius_hcl: HCl + H2O -> H3O+ + Cl-, on white paper, every check passes",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=arrhenius_hcl"]);
    assertNoFailures(verification);
    const claims = output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(claims, ["HCl", "H2O", "H3O+", "Cl−"]);
    // print is the default theme: white paper, and the dark palette is gone.
    assert.match(output.svg, /fill="#FFFFFF"/);
    assert.doesNotMatch(output.svg, /#0F1115/i);
    const contrast = verification.checks.find((c) => c.id === "module-contrast-sufficient");
    assert.equal(contrast!.status, "pass");
    // Typeset: the charge is a superscript tspan carrying a real minus sign, and
    // the 2 of H2O is a subscript, not a Unicode subscript character.
    assert.match(output.svg, /<tspan font-size="[\d.]+" dy="-[\d.]+">−<\/tspan>/);
    assert.match(output.svg, /<tspan font-size="[\d.]+" dy="[\d.]+">2<\/tspan>/);
    assert.doesNotMatch(output.svg, /[₀-₉⁺⁻]/);
    // No large empty band: the canvas is only as tall as its content.
    const height = Number(/<svg[^>]* height="(\d+)"/.exec(output.svg)![1]);
    assert.ok(height < 260, `canvas should be trimmed to its content, got height ${height}`);
  },
);

test(
  "bronsted_nh3: display forms are checked and used, and --equilibrium draws two half-arrows with a declared box that agrees with the measurement",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=bronsted_nh3"]);
    assertNoFailures(verification);
    const claims = output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(claims, ["NH3", "H2O", "NH4+", "OH−"]);
    const arrow = output.elements.find((e) => e.id === "reaction-arrow")!;
    assert.match(arrow.claim ?? "", /reversible/);
    const group = /<g data-pr-id="reaction-arrow">.*?<\/g>/s.exec(output.svg)![0];
    assert.equal((group.match(/<line /g) ?? []).length, 2);
    assert.ok(arrow.declaredBox!.height > 10, "two stacked half-arrows are taller than a single arrow");
    const agrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.equal(agrees!.status, "pass");
    assert.ok(output.notes?.some((n) => n.includes("display forms checked")));
  },
);

test(
  "lewis_bf3_nh3: lone pairs are drawn as declared decorations -- three on each F, one on N, none on B -- and touch no label",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=lewis_bf3_nh3"]);
    assertNoFailures(verification);
    const claims = output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(claims, ["BF3", "NH3", "F3B–NH3"]);

    const pairs = output.elements.filter((e) => /-atom-\d+-lp-\d+$/.test(e.id));
    const byAtom = new Map<string, number>();
    for (const p of pairs) {
      const atom = /^(m\d+-atom-\d+)-lp-/.exec(p.id)![1]!;
      byAtom.set(atom, (byAtom.get(atom) ?? 0) + 1);
      assert.equal(p.kind, "decoration");
      assert.ok(p.declaredBox, `${p.id} declares its geometry`);
    }
    // BF3 is m0 (F0 B1 F2 F3), NH3 is m1 (with its hydrogens explicit, RDKit writes
    // them first: H0 N1 H2 H3), the adduct is m2.
    assert.equal(byAtom.get("m0-atom-0"), 3);
    assert.equal(byAtom.get("m0-atom-2"), 3);
    assert.equal(byAtom.get("m0-atom-3"), 3);
    assert.equal(byAtom.has("m0-atom-1"), false, "boron in BF3 has an empty orbital, not a lone pair");
    assert.equal(byAtom.get("m1-atom-1"), 1, "nitrogen in NH3 has one lone pair");
    const adductLabels = output.elements.filter((e) => e.id.startsWith("m2-") && /atom-\d+-label$/.test(e.id)).length;
    assert.ok(adductLabels >= 5, "the adduct labels its B, N and F atoms");

    // The core's measured boxes: no lone pair lies over an atom label.
    const measured = new Map(verification.measured.map((m) => [m.id, m]));
    const labelIds = output.elements.filter((e) => e.kind === "label" && e.id.includes("atom-")).map((e) => e.id);
    for (const p of pairs) {
      const pb = measured.get(p.id)?.box as Box;
      for (const id of labelIds) {
        const lb = measured.get(id)?.box as Box | undefined;
        if (!lb || id.split("-atom-")[0] !== p.id.split("-atom-")[0]) continue;
        assert.ok(!overlaps(pb, lb), `${p.id} overlaps ${id}`);
      }
    }
  },
);

test(
  "--display is verified against the computed formula: a mismatch is refused naming both, textbook and Unicode forms are accepted",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const script = "modules/reaction/render.py";
    const wrongAtoms = runPython([script, "--reaction=N.O>>[NH4+].[OH-]", "--display=NH3;H2O>>NH3+;OH-"]);
    assert.notEqual(wrongAtoms.status, 0);
    assert.match(wrongAtoms.stderr, /NH3\+/);
    assert.match(wrongAtoms.stderr, /H4N\+/);
    assert.match(wrongAtoms.stderr, /does not match/);

    const wrongCharge = runPython([script, "--reaction=N.O>>[NH4+].[OH-]", "--display=NH3;H2O>>NH4;OH-"]);
    assert.notEqual(wrongCharge.status, 0);
    assert.match(wrongCharge.stderr, /charge/);

    const wrongCount = runPython([script, "--reaction=N.O>>[NH4+].[OH-]", "--display=NH3;H2O;X>>NH4+;OH-"]);
    assert.notEqual(wrongCount.status, 0);
    assert.match(wrongCount.stderr, /component/);

    const notElement = runPython([script, "--reaction=N.O>>[NH4+].[OH-]", "--display=NH3;Qz2O>>NH4+;OH-"]);
    assert.notEqual(notElement.status, 0);
    assert.match(notElement.stderr, /not an element symbol/);

    // Unicode sub/superscripts, "2-" written without a space, an empty component
    // kept as computed.
    const ok = await runReaction([
      "--reaction=[O-]S(=O)(=O)[O-].[H+]>>[O-]S(=O)(=O)O",
      "--display=SO42-;H+>>HSO₄⁻",
    ]);
    assertNoFailures(ok.verification);
    const okClaims = ok.output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(okClaims, ["SO42−", "H+", "HSO4−"]);

    const kept = await runReaction(["--reaction=N.O>>[NH4+].[OH-]", "--display=;H2O>>NH₄⁺;"]);
    const keptClaims = kept.output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(keptClaims, ["NH3", "H2O", "NH4+", "OH−"]);
  },
);

test(
  "automatic formula writer: conventional order for small inorganic species, Hill order for the rest",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const code = [
      "import sys, json; sys.path.insert(0, 'modules/reaction')",
      "import formula; from rdkit import Chem",
      "out = {}",
      "for s in sys.argv[1:]:",
      "    m = Chem.MolFromSmiles(s); c, q = formula.composition(m)",
      "    out[s] = formula.auto_display(m, c, q)",
      "print(json.dumps(out))",
    ].join("\n");
    const cases: Record<string, string> = {
      N: "NH3",
      O: "H2O",
      Cl: "HCl",
      "[OH3+]": "H3O+",
      "[OH-]": "OH-",
      "[NH4+]": "NH4+",
      "[Cl-]": "Cl-",
      "OS(=O)(=O)O": "H2SO4",
      "O[N+](=O)[O-]": "HNO3",
      "[O-]S(=O)(=O)[O-]": "SO4 2-",
      "FB(F)F": "BF3",
      "F[B-](F)(F)[NH3+]": "F3B–NH3",
      "N->[Ag+]<-N": "[Ag(NH3)2]+",
      "O->[Cu+2](<-O)(<-O)<-O": "[Cu(H2O)4]2+",
      "CC(=O)O": "CH3COOH",
      "OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O": "C6H12O6",
    };
    const result = runPython(["-c", code, ...Object.keys(cases)]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), cases);
  },
);

test(
  "--theme=dark keeps the original palette and its contrast checks; an unknown theme is refused",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=bronsted_nh3", "--theme=dark", "--lone-pairs"]);
    assertNoFailures(verification);
    assert.match(output.svg, /fill="#0F1115"/);
    const contrast = verification.checks.find((c) => c.id === "module-contrast-sufficient");
    assert.equal(contrast!.status, "pass");
    const bad = runPython(["modules/reaction/render.py", "--name=arrhenius_hcl", "--theme=sepia"]);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /unknown --theme/);
  },
);

// --- curved electron-pushing arrows and complexes ------------------------------

function arrowsOf(output: { elements: { id: string; kind: string; claim?: string; declaredBox?: Box }[] }) {
  return output.elements.filter((e) => /^e-arrow-\d+$/.test(e.id));
}

test(
  "lewis_bf3_nh3: one curved arrow from N's lone pair to B, a smooth cubic with a filled head, its declared box agreeing with the measured curve",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=lewis_bf3_nh3"]);
    assertNoFailures(verification);
    const arrows = arrowsOf(output);
    assert.equal(arrows.length, 1);
    assert.match(arrows[0]!.claim ?? "", /lp:2>1 .*empty valence orbital/);
    assert.match(output.svg, /<path data-pr-id="e-arrow-0-curve" d="M [\d.]+ [\d.]+ C [\d. ]+"/);
    assert.match(output.svg, /<g data-pr-id="e-arrow-0">.*?<polygon /s);
    const agrees = verification.checks.find((c) => c.id === "module-geometry-agrees")!;
    assert.equal(agrees.status, "pass");
    // The curve is a declared drawable, so every label is tested against its stroke.
    const measured = new Map(verification.measured.map((m) => [m.id, m]));
    const curve = measured.get("e-arrow-0-curve")!;
    assert.equal(curve.found, true);
    const clear = verification.checks.find((c) => c.id === "module-labels-clear-of-strokes")!;
    assert.equal(clear.status, "pass");
    assert.ok(output.notes?.some((n) => n.includes("curved arrow(s) verified")));
    // The arrow leaves N's pair in the NH3 tile (m1) and ends in the BF3 tile (m0):
    // it starts right of where it ends, and it clears B's label.
    const box = curve.box as Box;
    const bLabel = measured.get("m0-atom-1-label")!.box as Box;
    const nLabel = measured.get("m1-atom-1-label")!.box as Box;
    assert.ok(box.x >= bLabel.x + bLabel.width - 1, "the head stops short of B");
    assert.ok(box.x + box.width <= nLabel.x + 1, "the tail starts at N's pair, left of N");
  },
);

test(
  "bronsted_hcl_h2o and bronsted_nh3_h2o: a lone pair onto H across the plus sign, and the H-X bond onto X; every check passes in all three themes",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    for (const name of ["bronsted_hcl_h2o", "bronsted_nh3_h2o"]) {
      for (const theme of ["print", "light", "dark"]) {
        const { output, verification } = await runReaction([`--name=${name}`, `--theme=${theme}`]);
        assertNoFailures(verification);
        const arrows = arrowsOf(output);
        assert.equal(arrows.length, 2, name);
        assert.match(arrows[0]!.claim ?? "", /hydrogen bonded to another atom/);
        assert.match(arrows[1]!.claim ?? "", /its own breaking bond/);
        const contrast = verification.checks.find((c) => c.id === "module-contrast-sufficient")!;
        assert.equal(contrast.status, "pass");
      }
    }
    const { output } = await runReaction(["--name=bronsted_hcl_h2o"]);
    const claims = output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(claims, ["HCl", "H2O", "H3O+", "Cl−"], "atom maps address atoms; the formulas are the plain species");
  },
);

test(
  "--arrows is verified: no pair, too many pairs, a full octet, a missing bond, an unknown or ambiguous atom -- each refused naming the arrow",
  { timeout: TIMEOUT_MS },
  () => {
    assertRdkitAvailable();
    const script = "modules/reaction/render.py";
    const bf3 = "--reaction=F[B:1](F)[F:3].[NH3:2]>>F[B-](F)(F)[NH3+]";
    const cases: [string[], RegExp][] = [
      [[bf3, "--arrows=lp:1>2"], /'lp:1>2': B of BF3 .* has no lone pair/],
      [[bf3, "--arrows=lp:2>3"], /'lp:2>3': F of BF3 .* cannot take an electron pair/],
      [[bf3, "--arrows=lp:2>9"], /no reactant atom carries map number 9; mapped atoms: 1 \(B/],
      [[bf3, "--arrows=lp:2>H@2"], /has 3 H atoms, so 'H@2' is ambiguous/],
      [[bf3, "--arrows=bond:1-2>1"], /no bond between B of BF3 .* and N of NH3/],
      [[bf3, "--arrows=2>1"], /starts at a lone pair .* or a bond/],
      [[bf3, "--arrows=lp:2>lp:1"], /ends at an atom or a bond, not at a lone pair/],
      [[bf3, "--arrows=lp:2>B@5"], /names reactant component 5, but there are 2/],
      [["--reaction=[Cl:1][H:2].[OH2:3]>>[OH3+].[Cl-]", "--arrows=lp:3>2;lp:3>2;lp:3>2"], /has 2 lone pair\(s\) and 3 arrows/],
      [["--reaction=[NH3:1]->[Ag+]<-N.[H+:2]>>[NH4+].N->[Ag+]", "--arrows=lp:1>2"], /no lone pair to give \(its pair is already its dative bond\)/],
    ];
    for (const [args, pattern] of cases) {
      const r = runPython([script, ...args]);
      assert.notEqual(r.status, 0, args.join(" "));
      assert.match(r.stderr, pattern, args.join(" "));
    }
  },
);

test(
  "complex_silver_ammonia: Ag+ + 2NH3 -> [Ag(NH3)2]+, the display with brackets checked, the ligand N drawn without the pair it gave",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=complex_silver_ammonia"]);
    assertNoFailures(verification);
    const claims = output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(claims, ["Ag+", "2 x NH3", "[Ag(NH3)2]+"]);
    // Free NH3 (m1) keeps its pair; in the complex (m2) neither N has one.
    assert.equal(output.elements.filter((e) => /^m1-atom-\d+-lp-/.test(e.id)).length, 1);
    assert.equal(output.elements.filter((e) => /^m2-atom-\d+-lp-/.test(e.id)).length, 0);
    assert.ok(output.elements.some((e) => e.id.startsWith("m2-bond-") && /dative bond/.test(e.claim ?? "")));
    const wrong = runPython(["modules/reaction/render.py", "--reaction=[Ag+].N.N>>N->[Ag+]<-N", "--display=Ag+;NH3>>[Ag(NH3)3]+"]);
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /does not match/);
  },
);

// --- hidden answers, state symbols, coefficients and balance, equal sizes --------

const canvasOf = (svg: string) => [
  Number(/<svg[^>]* width="(\d+)"/.exec(svg)![1]),
  Number(/<svg[^>]* height="(\d+)"/.exec(svg)![1]),
];

test(
  "--answers=false: the reactants, the arrow and a ? -- no product tile, the same canvas and the same reactant positions as the solution; true is the default",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    for (const name of ["bronsted_hcl_h2o", "arrhenius_hcl", "ammonia_sulfate", "esterification"]) {
      const solution = await runReaction([`--name=${name}`]);
      const explicit = await runReaction([`--name=${name}`, "--answers=true"]);
      const question = await runReaction([`--name=${name}`, "--answers=false"]);
      for (const r of [solution, explicit, question]) assertNoFailures(r.verification);
      assert.equal(explicit.output.svg, solution.output.svg, `${name}: true is the default`);
      assert.deepEqual(canvasOf(question.output.svg), canvasOf(solution.output.svg), `${name}: the question keeps the canvas`);
      const eq = (o: typeof question.output) => o.elements.filter((e) => e.id.startsWith("eqn-"));
      const lhs = (o: typeof question.output) => eq(o).filter((e) => e.id.startsWith("eqn-lhs"));
      assert.deepEqual(lhs(question.output), lhs(solution.output), `${name}: the reactants are written as in the solution`);
      assert.deepEqual(eq(question.output).filter((e) => e.id.startsWith("eqn-rhs")).map((e) => e.claim), ["?"], name);
      assert.ok(eq(solution.output).filter((e) => e.id.startsWith("eqn-rhs")).length >= 1);
      assert.ok(question.output.elements.some((e) => e.id === "reaction-arrow"));
      // Tiles: the reactants' are the solution's, element for element; the products' are absent.
      const tileIds = (o: typeof question.output) =>
        new Set(o.elements.map((e) => /^(m\d+)-/.exec(e.id)?.[1]).filter(Boolean));
      assert.ok(tileIds(question.output).size < tileIds(solution.output).size, `${name}: product tiles are not drawn`);
      assert.ok(tileIds(question.output).size >= 1, `${name}: reactant tiles are drawn`);
      const inSolution = new Map(solution.output.elements.map((e) => [e.id, e]));
      for (const e of question.output.elements.filter((x) => /^m\d+-/.test(x.id))) {
        assert.deepEqual(e, inSolution.get(e.id), `${name}: ${e.id} is where the solution has it`);
      }
      assert.ok(question.output.notes?.some((n) => n.includes("answers hidden")));
    }
    // The curved arrows belong to the reactants: they stay.
    const q = await runReaction(["--name=bronsted_hcl_h2o", "--answers=false"]);
    assert.equal(arrowsOf(q.output).length, 2);
    assert.ok(q.output.notes?.some((n) => /2 curved arrow\(s\) of the reactants stay/.test(n)));
    const bad = runPython(["modules/reaction/render.py", "--name=arrhenius_hcl", "--answers=perhaps"]);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /unknown --answers/);
  },
);

test(
  "--states and --coefficients: 2 NH3(g) + H2SO4(aq) -> 2 NH4+(aq) + SO42-(aq) is written, its states typeset small, and checked to balance",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const { output, verification } = await runReaction(["--name=ammonia_sulfate"]);
    assertNoFailures(verification);
    const claims = output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim);
    assert.deepEqual(claims, ["2 x NH3(g)", "H2SO4(aq)", "2 x NH4+(aq)", "SO42−(aq)"]);
    // The coefficient is one token with its formula, then a small state run on the baseline.
    assert.match(output.svg, /2\u00a0NH<tspan[^>]*>3<\/tspan><tspan font-size="[\d.]+" dy="-6.00">\(g\)<\/tspan>/);
    const stateSize = Number(/<tspan font-size="([\d.]+)" dy="-?[\d.]+">\(aq\)<\/tspan>/.exec(output.svg)![1]);
    assert.ok(stateSize < 30 && stateSize > 15, `a state symbol is smaller than its formula (30), got ${stateSize}`);
    // On the baseline: H2SO4's state undoes exactly the drop of the subscript 4 before it.
    assert.match(output.svg, /dy="6.00">4<\/tspan><tspan font-size="[\d.]+" dy="-6.00">\(aq\)/);
    assert.ok(
      output.notes?.some((n) => /^balance: atoms and charge balance \(H 8, N 2, O 4, S 1; charge 0\)/.test(n)),
      JSON.stringify(output.notes),
    );
    // Per-component values in --display's own layout: one per component as written, or per distinct component.
    const byHand = await runReaction(["--reaction=N#N.[H][H]>>N", "--coefficients=;3>>2", "--states=g;g>>g"]);
    assertNoFailures(byHand.verification);
    assert.deepEqual(
      byHand.output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim),
      ["N2(g)", "3 x H2(g)", "2 x NH3(g)"],
    );
    const empty = await runReaction(["--reaction=N#N.[H][H]>>N", "--coefficients=1;3>>2", "--states=;l>>"]);
    assert.deepEqual(
      empty.output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim),
      ["N2", "3 x H2(l)", "2 x NH3"],
      "empty = none",
    );
    // Hidden answers hide the products' states and coefficients with them.
    const q = await runReaction(["--name=ammonia_sulfate", "--answers=false"]);
    assertNoFailures(q.verification);
    assert.deepEqual(
      q.output.elements.filter((e) => e.id.startsWith("eqn-")).map((e) => e.claim),
      ["2 x NH3(g)", "H2SO4(aq)", "?"],
    );
  },
);

test(
  "the equation is checked to balance when coefficients or --balanced are given: refused naming the element or the charge that differs; reported, not enforced, otherwise",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    const script = "modules/reaction/render.py";
    const wrongAtoms = runPython([script, "--reaction=N#N.[H][H]>>N", "--coefficients=1;2>>2"]);
    assert.notEqual(wrongAtoms.status, 0);
    assert.match(wrongAtoms.stderr, /not balanced -- H: 4 on the left, 6 on the right/);
    assert.doesNotMatch(wrongAtoms.stderr, /N:/, "N balances and is not blamed");
    const wrongCharge = runPython([script, "--reaction=[Ag+].[Cl-]>>[Ag+].[Cl]", "--balanced"]);
    assert.notEqual(wrongCharge.status, 0);
    assert.match(wrongCharge.stderr, /not balanced -- charge: 0 on the left, \+1 on the right/);
    const unbalancedSmiles = runPython([script, "--reaction=N#N.[H][H]>>N", "--balanced"]);
    assert.notEqual(unbalancedSmiles.status, 0, "repetitions are the coefficients --balanced checks");
    assert.match(unbalancedSmiles.stderr, /H: 2 on the left, 3 on the right/);
    // Repeating a component and numbering it are two ways of one thing: never both.
    const both = runPython([script, "--reaction=N#N.[H][H].[H][H].[H][H]>>N.N", "--coefficients=1;3>>2"]);
    assert.notEqual(both.status, 0);
    assert.match(both.stderr, /written 3 times .* not both/);
    assert.match(runPython([script, "--reaction=N#N.[H][H]>>N", "--coefficients=1;x>>2"]).stderr, /not a whole number/);
    assert.match(
      runPython([script, "--reaction=N#N.[H][H]>>N", "--coefficients=1>>2"]).stderr,
      /--coefficients has 1 value\(s\) on the left/,
    );
    assert.match(
      runPython([script, "--reaction=N#N.[H][H]>>N", "--states=g;gas>>g"]).stderr,
      /'gas' is not a state symbol; known: s, l, g, aq/,
    );
    assert.match(runPython([script, "--reaction=N#N.[H][H]>>N", "--states=g;g"]).stderr, /--states must mirror the reaction/);
    // Backward compatible: an unbalanced reaction without either flag still draws, and the notes say so.
    const asWritten = await runReaction(["--reaction=N#N.[H][H]>>N"]);
    assertNoFailures(asWritten.verification);
    assert.ok(
      asWritten.output.notes?.some((n) => /not balanced as written \(H: 2 on the left, 3 on the right; N: 2 on the left, 1 on the right\)/.test(n)),
      JSON.stringify(asWritten.output.notes),
    );
    // Balanced by repetition and checked: the glucose combustion.
    const glucose = await runReaction(["--name=glucose_combustion", "--balanced"]);
    assertNoFailures(glucose.verification);
    assert.ok(glucose.output.notes?.some((n) => /^balance: atoms and charge balance/.test(n)));
    // Charge counts as well as atoms: a balanced ionic equation.
    const ionic = await runReaction(["--reaction=[Ag+].[Cl-]>>[Ag]Cl", "--balanced"]);
    assertNoFailures(ionic.verification);
  },
);

test(
  "every tile uses one atom-label size and one dot size: a bare ion (Cl-) is drawn like the atom labels of its neighbours",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();
    for (const name of ["arrhenius_hcl", "bronsted_hcl_h2o", "complex_silver_ammonia", "bronsted_nh3_h2o"]) {
      const { output, verification } = await runReaction([`--name=${name}`]);
      assertNoFailures(verification);
      const labelSizes = new Set(
        [...output.svg.matchAll(/<text data-pr-id="m\d+-atom-\d+-label"[^>]* font-size="([\d.]+)"/g)].map((m) => m[1]),
      );
      assert.equal(labelSizes.size, 1, `${name}: atom labels in more than one size: ${[...labelSizes]}`);
      const dotRadii = new Set(
        [...output.svg.matchAll(/<g data-pr-id="m\d+-atom-\d+-(?:lp|rad)-\d+"[^>]*>(.*?)<\/g>/g)].flatMap((g) =>
          [...g[1]!.matchAll(/ r="([\d.]+)"/g)].map((m) => m[1]),
        ),
      );
      if (name !== "arrhenius_hcl") {
        assert.equal(dotRadii.size, 1, `${name}: dots in more than one size: ${[...dotRadii]}`);
      }
    }
    // arrhenius_hcl: the Cl- tile is a bare ion, HCl and H3O+ have bonds; one size for all three.
    const { output } = await runReaction(["--name=arrhenius_hcl"]);
    const claims = output.elements.filter((e) => e.kind === "label" && /atom-\d+-label$/.test(e.id));
    assert.ok(claims.some((l) => /is Cl−$/.test(l.claim ?? "")), "the bare ion is a label of its own");
    assert.ok(claims.some((l) => /is Cl$/.test(l.claim ?? "")), "chlorine in HCl is a label");
    const sizes = new Set(
      claims.map((l) => new RegExp(`data-pr-id="${l.id}"[^>]* font-size="([\\d.]+)"`).exec(output.svg)![1]),
    );
    assert.equal(sizes.size, 1);
  },
);
