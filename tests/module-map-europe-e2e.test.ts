/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python map module's real-geography variant
 * (modules/map/render.py --name=europe) and verifies its output with a real
 * Chromium instance via runAndVerifyModule. Uses real Natural Earth country
 * boundaries bundled at modules/map/data/europe_countries.geojson -- see
 * modules/map/MODULE.md for how it was prepared.
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
  "honest run (europe): real country boundaries, every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--name=europe"],
      input: { width: 1000, height: 800 },
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
    assert.equal(countries.length, 39, "should declare all 39 bundled European countries");
    for (const country of countries) assert.ok(country.declaredBox, `${country.id} must declare its geometry`);

    // Some countries are deliberately left unlabelled to avoid a collision
    // (crowded micro-states) rather than forcing one -- both states should
    // exist in a real render.
    const labels = output.elements.filter((e) => e.id.endsWith("-label") && e.id.startsWith("country-"));
    assert.ok(labels.length > 0, "at least some countries should be labelled");
    assert.ok(labels.length < countries.length, "not every country should be labelled at this density");
  },
);

test(
  "honest run at multiple canvas sizes: label placement holds up, not just at one aspect ratio",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    for (const [width, height] of [
      [720, 520],
      [900, 700],
      [1200, 900],
    ] as const) {
      const { verification } = await runAndVerifyModule({
        command: "python",
        args: ["modules/map/render.py", "--name=europe"],
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
  "misdeclare run: catches a phantom country, a shifted declared box, and a bbox-centre label on a concave country",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--name=europe", "--misdeclare"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    const failing = verification.checks.filter((check) => check.status === "fail");
    assert.ok(
      failing.length >= 3,
      `expected at least three failing checks, got ${failing.length}: ${JSON.stringify(failing)}`,
    );

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.equal(idsResolve!.status, "fail");
    assert.ok(idsResolve!.detail?.includes("phantom-country"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.equal(geometryAgrees!.status, "fail");

    const labelWithin = verification.checks.find((c) => c.id === "module-label-within-feature");
    assert.equal(labelWithin!.status, "fail");
  },
);
