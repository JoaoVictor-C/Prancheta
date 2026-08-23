/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python map module's second real-geography variant
 * (modules/map/render.py --name=south_america) and verifies its output with
 * a real Chromium instance via runAndVerifyModule. Shares
 * _render_political_region with --name=europe; this test exists to prove
 * that shared machinery generalises to a second, differently-shaped region
 * rather than being Europe-specific in disguise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertPythonAvailable(): void {
  const probe = spawnSync("python", ["-c", "import shapely, pyproj"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/map/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import shapely/pyproj, needed by modules/map/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (south_america): real country boundaries, every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--name=south_america"],
      input: { width: 800, height: 900 },
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

    const countries = output.elements.filter((e) => e.id.startsWith("country-") && !e.id.endsWith("-label"));
    assert.equal(countries.length, 13, "should declare all 13 bundled South American countries");

    const swatches = output.elements.filter((e) => e.id.startsWith("legend-swatch-"));
    assert.equal(swatches.length, 4, "should declare four ECONOMY-tier legend swatches");
  },
);

test(
  "honest run at multiple canvas sizes: shared label-placement logic holds up on a second region",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    for (const [width, height] of [
      [720, 520],
      [900, 800],
      [1000, 900],
    ] as const) {
      const { verification } = await runAndVerifyModule({
        command: "python",
        args: ["modules/map/render.py", "--name=south_america"],
        input: { width, height },
        timeoutMs: TIMEOUT_MS,
      });
      assert.ok(
        verification.checks.every((check) => check.status !== "fail"),
        `${width}x${height}: no check should fail: ` +
          `${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
      );
    }
  },
);

test(
  "misdeclare run: catches a phantom country and a shifted declared box",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--name=south_america", "--misdeclare"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    const failing = verification.checks.filter((check) => check.status === "fail");
    assert.ok(
      failing.length >= 2,
      `expected at least two failing checks, got ${failing.length}: ${JSON.stringify(failing)}`,
    );

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.equal(idsResolve!.status, "fail");
    assert.ok(idsResolve!.detail?.includes("phantom-country"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
