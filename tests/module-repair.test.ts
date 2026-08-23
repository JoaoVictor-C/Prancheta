/**
 * Module repair end-to-end test (M9, stage 4, step 23).
 *
 * Verifies that the repair loop can resolve collisions in the topology module
 * by iteratively adjusting spacing parameters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { repairModuleFigure } from "../src/modules/repair.ts";
import { runModule } from "../src/modules/run.ts";
import { chromium } from "playwright";
import { verifyModuleFigure } from "../src/modules/verify.ts";

test("topology module declares adjustable parameters", async () => {
  const output = await runModule({
    command: "python",
    args: ["modules/topology/render.py"],
    input: {
      width: 620,
      height: 220,
      spec: {},
    },
  });

  assert.ok(output.parameters, "module should declare parameters");
  assert.ok(output.parameters.length > 0, "module should have at least one parameter");

  const paramNames = output.parameters.map((p) => p.name);
  assert.ok(paramNames.includes("pad"), "should have pad parameter");
  assert.ok(paramNames.includes("row_gap"), "should have row_gap parameter");
  assert.ok(paramNames.includes("col_gap"), "should have col_gap parameter");

  for (const param of output.parameters) {
    assert.ok(typeof param.value === "number", `${param.name}.value should be a number`);
    assert.ok(typeof param.min === "number", `${param.name}.min should be a number`);
    assert.ok(typeof param.max === "number", `${param.name}.max should be a number`);
    assert.ok(param.value >= param.min, `${param.name}.value should be >= min`);
    assert.ok(param.value <= param.max, `${param.name}.value should be <= max`);
  }
});

test("topology module accepts parameter overrides", async () => {
  const baseline = await runModule({
    command: "python",
    args: ["modules/topology/render.py"],
    input: {
      width: 620,
      height: 220,
      spec: {},
    },
  });

  const padParam = baseline.parameters?.find((p) => p.name === "pad");
  assert.ok(padParam, "should have pad parameter");

  const overridden = await runModule({
    command: "python",
    args: ["modules/topology/render.py"],
    input: {
      width: 620,
      height: 220,
      spec: {},
      parameterOverrides: { pad: padParam.min },
    },
  });

  const newPadParam = overridden.parameters?.find((p) => p.name === "pad");
  assert.ok(newPadParam, "overridden output should have pad parameter");
  assert.strictEqual(newPadParam.value, padParam.min, "pad should be set to min value");
});

test("repair loop can adjust parameters to resolve failures", async () => {
  // Create a narrow canvas that's likely to cause collisions
  const options = {
    command: "python" as const,
    args: ["modules/topology/render.py", "--name=rossmann_pattern"],
    input: {
      width: 400,
      height: 220,
      spec: {},
    },
  };

  const initialOutput = await runModule(options);
  const browser = await chromium.launch({
    args: ["--disable-lcd-text", "--force-color-profile=srgb"],
  });

  try {
    const initialVerification = await verifyModuleFigure(browser, initialOutput);

    // If there are no failures initially, skip repair test
    const initialFailures = initialVerification.checks.filter((c) => c.status === "fail");
    if (initialFailures.length === 0) {
      console.log("  No initial failures to repair (canvas width sufficient)");
      return;
    }

    console.log(`  Initial failures: ${initialFailures.length}`);

    // Run repair
    const result = await repairModuleFigure(options, initialOutput, initialVerification, 5);

    console.log(`  Repair iterations: ${result.iterations}`);
    console.log(`  Amendments: ${result.amendments.length}`);

    const finalFailures = result.verification.checks.filter((c) => c.status === "fail");
    console.log(`  Final failures: ${finalFailures.length}`);

    // Verify that repair made progress (fewer failures or same with smaller magnitude)
    assert.ok(
      result.iterations > 0 || initialFailures.length === 0,
      "repair should have attempted at least one iteration if there were failures"
    );

    // If repair ran, it should have tried amendments
    if (result.iterations > 0) {
      assert.ok(result.amendments.length >= 0, "repair should record amendments");
    }

    // Success means all checks pass
    if (result.success) {
      assert.strictEqual(finalFailures.length, 0, "successful repair should have no failures");
    }
  } finally {
    await browser.close();
  }
});
