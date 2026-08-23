/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python crystal-lattice module (modules/crystal/render.py)
 * and verifies its output with a real Chromium instance via
 * runAndVerifyModule. Mirrors the shape of the other module e2e tests in
 * this directory.
 *
 * If `python` is not on PATH, or python lacks ase/scipy, the test FAILS
 * loudly rather than skipping, for the same reason the other module e2e
 * tests do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertAseAvailable(): void {
  const probe = spawnSync("python", ["-c", "import ase, numpy"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/crystal/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import ase/numpy, needed by modules/crystal/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (diamond_cubic): every check passes or is not-applicable, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertAseAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/crystal/render.py", "--name=diamond_cubic"],
      input: { width: 560, height: 560 },
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

    const atoms = output.elements.filter((e) => e.id.startsWith("atom-") && !e.id.endsWith("-label"));
    assert.ok(atoms.length > 0, "should declare at least one atom");
    for (const atom of atoms) assert.ok(atom.declaredBox, `${atom.id} must declare its geometry`);
  },
);

test(
  "honest run (nacl_rocksalt): every check passes, with a single conventional cell -- not a repeated supercell -- both Na and Cl label cleanly",
  { timeout: TIMEOUT_MS },
  async () => {
    assertAseAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/crystal/render.py", "--name=nacl_rocksalt"],
      input: { width: 560, height: 560 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    // The old 2x2x2 repeated supercell put every Na atom exactly on a cell
    // edge in every projection, forcing it unlabelled. A single conventional
    // cell -- ase.build.bulk(..., cubic=True), boundary sites duplicated to
    // every corner/edge/face they touch, no repeat -- has far fewer Na atoms
    // at fixed, known positions, and this rotation clears both elements.
    const labels = output.elements.filter((e) => e.id.endsWith("-label")).map((e) => e.claim);
    assert.ok(labels.some((c) => /as Na$/.test(c ?? "")), "Na should label cleanly in the single-cell view");
    assert.ok(labels.some((c) => /as Cl$/.test(c ?? "")), "Cl should label cleanly in the single-cell view");

    // 4 Na + 4 Cl per conventional rocksalt cell, boundary-duplicated to
    // 14 (corner+face sites) + 13 (edge+body-centre sites) = 27 atoms total
    // -- the real textbook rock-salt unit cell atom count, not an arbitrary
    // repeat.
    const atoms = output.elements.filter((e) => e.id.startsWith("atom-") && !e.id.endsWith("-label"));
    assert.equal(atoms.length, 27, "a conventional rocksalt cell, boundary-duplicated, has 27 drawn atoms");
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom atom, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertAseAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/crystal/render.py", "--misdeclare"],
      input: { width: 560, height: 560 },
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
    assert.ok(idsResolve!.detail?.includes("atom-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
