/**
 * The module protocol, tested without a module.
 *
 * Every other module test in this suite proves the protocol works by running
 * a real figure module, which means the protocol's own coverage is only as
 * available as rdkit, ase, scipy, metpy, pyproj and dna_features_viewer are.
 * That was tolerable while three modules in the repertoire were stdlib-only
 * and could always run. Removing those three -- because none of them cleared
 * the bar for being a module at all -- would have taken the protocol's cheap,
 * dependency-free coverage with them, which is a bad reason to keep a module
 * and a worse reason to lose a test.
 *
 * So the planted-defect self-test lives here instead, as a checked-in SVG and
 * manifest pair. No subprocess, no Python, no scientific stack: just the two
 * things decision 0005 says a module hands back, and the browser the core
 * already trusts to measure them.
 *
 * The pair is deliberately small and hand-written. Its geometry is round
 * numbers a reader can verify against the SVG by eye, which is what makes a
 * failure here point at the checker rather than at a module's arithmetic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { parseModuleOutput } from "../src/modules/protocol.ts";
import { verifyModuleFigure } from "../src/modules/verify.ts";
import type { ModuleVerification } from "../src/modules/verify.ts";

const TIMEOUT_MS = 60_000;

function loadPair(svgName: string, manifestName: string) {
  const svg = readFileSync(new URL(`./fixtures/${svgName}`, import.meta.url), "utf8");
  const manifest = JSON.parse(
    readFileSync(new URL(`./fixtures/${manifestName}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  return parseModuleOutput({ ...manifest, svg });
}

async function verify(svgName: string, manifestName: string): Promise<ModuleVerification> {
  const browser: Browser = await chromium.launch({
    args: ["--disable-lcd-text", "--force-color-profile=srgb"],
  });
  try {
    return await verifyModuleFigure(browser, loadPair(svgName, manifestName));
  } finally {
    await browser.close();
  }
}

function check(verification: ModuleVerification, id: string) {
  const found = verification.checks.find((entry) => entry.id === id);
  assert.ok(found, `${id} must be present in the manifest`);
  return found!;
}

test(
  "honest pair: every check passes or is not-applicable, and none of them is vacuous",
  { timeout: TIMEOUT_MS },
  async () => {
    const verification = await verify("protocol-figure.svg", "protocol-figure.json");

    const failing = verification.checks.filter((entry) => entry.status === "fail");
    assert.equal(
      failing.length,
      0,
      `no check should fail on the honest pair: ${JSON.stringify(failing)}`,
    );

    // A protocol test that only counted passes would be satisfied by a checker
    // that examined nothing. These four have real elements to look at, so a
    // not-applicable here would mean the checker stopped seeing them.
    for (const id of [
      "module-ids-resolve",
      "module-geometry-agrees",
      "module-label-within-feature",
      "module-feature-on-its-stroke",
    ]) {
      assert.equal(check(verification, id).status, "pass", `${id} should pass, not stand down`);
      assert.ok((verification.coverage[id] ?? 0) > 0, `${id} must have examined something`);
    }
  },
);

test(
  "planted defects: each one is caught, and by the check that is meant to catch it",
  { timeout: TIMEOUT_MS },
  async () => {
    const verification = await verify(
      "protocol-figure.svg",
      "protocol-figure.misdeclared.json",
    );

    const ids = check(verification, "module-ids-resolve");
    assert.equal(ids.status, "fail");
    assert.ok(ids.detail?.includes("phantom"), `expected the phantom id named: ${ids.detail}`);

    const geometry = check(verification, "module-geometry-agrees");
    assert.equal(geometry.status, "fail");
    assert.ok(
      geometry.detail?.includes("region-a"),
      `expected the shifted box named: ${geometry.detail}`,
    );

    const within = check(verification, "module-label-within-feature");
    assert.equal(within.status, "fail");
    assert.ok(
      within.detail?.includes("caption"),
      `expected the escaped label named: ${within.detail}`,
    );

    // The relation is the one planted defect that is a lie about MEANING: the
    // marker really is on the trace, and really is not on region-a, and the
    // figure is perfectly well formed either way.
    const relation = check(verification, "module-feature-on-its-stroke");
    assert.equal(relation.status, "fail");
    assert.ok(
      relation.detail?.includes("marker does not lie on region-a"),
      `expected the refuted relation named: ${relation.detail}`,
    );
    assert.ok(
      !relation.detail?.includes("does not lie on trace"),
      `the relation that DOES hold must not be reported as broken: ${relation.detail}`,
    );
  },
);

test(
  "a label nobody can read fails, and the surface it is scored against is the one drawn under it",
  { timeout: TIMEOUT_MS },
  async () => {
    const verification = await verify("protocol-illegible.svg", "protocol-illegible.json");

    const contrast = check(verification, "module-contrast-sufficient");
    assert.equal(contrast.status, "fail");
    assert.ok(
      contrast.detail?.includes("panel-label"),
      `expected the illegible label named: ${contrast.detail}`,
    );
    // Scored against the panel it sits on, not the canvas behind the panel.
    // Getting this wrong is the whole reason the check composites in paint
    // order rather than reading a declared background.
    assert.ok(
      contrast.detail?.includes("rgb(36, 48, 74)"),
      `expected the panel's own colour as the substrate: ${contrast.detail}`,
    );

    // Everything else about this figure is fine. A checker that failed the
    // whole manifest would prove nothing about which defect it found.
    const others = verification.checks.filter(
      (entry) => entry.status === "fail" && entry.id !== "module-contrast-sufficient",
    );
    assert.equal(
      others.length,
      0,
      `only contrast should fail on this pair: ${JSON.stringify(others)}`,
    );
  },
);
