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
