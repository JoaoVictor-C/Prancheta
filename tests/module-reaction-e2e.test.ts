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
