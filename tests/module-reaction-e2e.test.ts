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
