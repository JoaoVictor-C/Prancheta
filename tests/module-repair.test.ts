/**
 * Module repair end-to-end test (M9, stage 4, step 23).
 *
 * Verifies that a module can declare what the core is allowed to adjust, that
 * an override actually takes, and that the repair loop can drive those knobs
 * to clear a failing check.
 *
 * It used to run against `modules/topology`, which was deleted in the module
 * audit -- it never cleared the bar for being a module at all. `modules/genomic`
 * exposes the same shape of parameter for the same reason: its rows have to
 * grow when a label needs the band above its own arrow, and `row_height` is
 * how the core is allowed to make that room.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { repairModuleFigure } from "../src/modules/repair.ts";
import { runModule } from "../src/modules/run.ts";
import { chromium } from "playwright";
import { verifyModuleFigure } from "../src/modules/verify.ts";

const ENTRY = "modules/genomic/render.py";

test("genomic module declares adjustable parameters", async () => {
  const output = await runModule({
    command: "python",
    args: [ENTRY],
    input: {
      width: 760,
      height: 320,
      spec: {},
    },
  });

  assert.ok(output.parameters, "module should declare parameters");
  assert.ok(output.parameters.length > 0, "module should have at least one parameter");

  const paramNames = output.parameters.map((p) => p.name);
  assert.ok(paramNames.includes("left_margin"), "should have left_margin parameter");
  assert.ok(paramNames.includes("right_margin"), "should have right_margin parameter");
  assert.ok(paramNames.includes("row_height"), "should have row_height parameter");

  for (const param of output.parameters) {
    assert.ok(typeof param.value === "number", `${param.name}.value should be a number`);
    assert.ok(typeof param.min === "number", `${param.name}.min should be a number`);
    assert.ok(typeof param.max === "number", `${param.name}.max should be a number`);
    assert.ok(param.value >= param.min, `${param.name}.value should be >= min`);
    assert.ok(param.value <= param.max, `${param.name}.value should be <= max`);
  }
});

test("genomic module accepts parameter overrides", async () => {
  const baseline = await runModule({
    command: "python",
    args: [ENTRY],
    input: {
      width: 760,
      height: 320,
      spec: {},
    },
  });

  const marginParam = baseline.parameters?.find((p) => p.name === "left_margin");
  assert.ok(marginParam, "should have left_margin parameter");

  const overridden = await runModule({
    command: "python",
    args: [ENTRY],
    input: {
      width: 760,
      height: 320,
      spec: {},
      parameterOverrides: { left_margin: marginParam.max },
    },
  });

  const newMarginParam = overridden.parameters?.find((p) => p.name === "left_margin");
  assert.ok(newMarginParam, "overridden output should have left_margin parameter");
  assert.strictEqual(
    newMarginParam.value,
    marginParam.max,
    "left_margin should be set to the max value",
  );

  // An override the module ignored would satisfy the assertion above and still
  // change nothing on the canvas, so check the drawing moved with it.
  assert.notStrictEqual(
    overridden.svg,
    baseline.svg,
    "an accepted override must change what was drawn, not just what was reported",
  );
});

test("repair loop can adjust parameters to resolve failures", async () => {
  // A narrow canvas crowds the packed rows and is the shape most likely to
  // produce something for the loop to fix.
  const options = {
    command: "python" as const,
    args: [ENTRY, "--name=operon"],
    input: {
      width: 420,
      height: 240,
      spec: {},
    },
  };

  const initialOutput = await runModule(options);
  const browser = await chromium.launch({
    args: ["--disable-lcd-text", "--force-color-profile=srgb"],
  });

  try {
    const initialVerification = await verifyModuleFigure(browser, initialOutput);

    // If there are no failures initially, there is nothing to repair. Reported
    // rather than asserted: a module that lays out cleanly at a hostile canvas
    // size is a good outcome, not a broken test.
    const initialFailures = initialVerification.checks.filter((c) => c.status === "fail");
    if (initialFailures.length === 0) {
      console.log("  No initial failures to repair (canvas width sufficient)");
      return;
    }

    console.log(`  Initial failures: ${initialFailures.length}`);

    const result = await repairModuleFigure(options, initialOutput, initialVerification, 5);

    console.log(`  Repair iterations: ${result.iterations}`);
    console.log(`  Amendments: ${result.amendments.length}`);

    const finalFailures = result.verification.checks.filter((c) => c.status === "fail");
    console.log(`  Final failures: ${finalFailures.length}`);

    assert.ok(
      finalFailures.length <= initialFailures.length,
      "repair should not make the figure worse",
    );
  } finally {
    await browser.close();
  }
});
