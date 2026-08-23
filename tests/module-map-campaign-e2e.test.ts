/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python map module's campaign variant
 * (modules/map/render.py --name=campaign) and verifies its output with a
 * real Chromium instance via runAndVerifyModule. The original 3-region
 * L-shape probe is covered separately by tests/module-e2e.test.ts and is
 * untouched by this addition -- see modules/map/MODULE.md.
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
  "honest run (campaign): every check passes, eleven territories (ten mainland plus an offshore island), six legend categories, three arrows",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--name=campaign"],
      input: { width: 900, height: 560 },
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

    const territories = output.elements.filter(
      (e) => e.kind === "feature" && !e.id.startsWith("legend"),
    );
    // Ten mainland grid territories plus Ostholm Isles, a small offshore
    // island drawn like any other territory but not part of the grid --
    // it borders nothing, so it needed no jitter-matching, only its own
    // irregular coastline.
    assert.equal(territories.length, 11, "should declare eleven territories");
    assert.ok(territories.some((t) => t.id === "ostholm"), "should include the offshore island");

    const swatches = output.elements.filter((e) => e.id.startsWith("legend-swatch-"));
    assert.equal(swatches.length, 6, "should declare six legend category swatches");

    const arrows = output.elements.filter((e) => e.id.startsWith("thrust-"));
    assert.equal(arrows.length, 3, "should declare three movement arrows");
    for (const arrow of arrows) assert.ok(arrow.declaredBox, `${arrow.id} must declare its geometry`);
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom territory, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--name=campaign", "--misdeclare"],
      input: { width: 900, height: 560 },
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
    assert.ok(idsResolve!.detail?.includes("phantom-territory"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
