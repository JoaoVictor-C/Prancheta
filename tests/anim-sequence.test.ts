/**
 * N-state animation sequences (ADR 0016, M14).
 *
 * Driven through `commandByName("animate")!.run(...)` throughout -- the
 * routing.ts lesson applied once more: a test that imports `animateSequence`
 * directly cannot tell you whether the CLI or MCP surface actually reaches it.
 *
 * The claim under test is that the two-state pipeline (M11.1-M13) generalises
 * to N states with NO change to its own math -- every consecutive pair is the
 * exact same call to diffFigures/buildTimeline/renderedTrajectories/
 * boxesDoNotOverlapDuringTransition -- and that the two new things sequences
 * need (identity continuity between consecutive states, no reappearing under
 * the same id) are refused rather than silently misrendered.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { commandByName } from "../src/commands.ts";
import { SpecError } from "../src/ir/types.ts";

const animate = commandByName("animate")!;

type SequenceManifest = {
  states: { ok: boolean }[];
  segments: { from: number; to: number; persisted: number }[];
  transitionChecks: { id: string; status: string; detail?: string }[];
  disclosed: { hardCut: string[]; clippedOnExit: string[] };
  ok: boolean;
};

test("three or more states route through the sequence engine, not the two-state path", async () => {
  const result = await animate.run({
    states: [
      "fixtures/animate/seq-0.json",
      "fixtures/animate/seq-1.json",
      "fixtures/animate/seq-2.json",
      "fixtures/animate/seq-3.json",
    ],
  });
  assert.equal(result.exitCode, 0);
  const data = result.data as { manifest: SequenceManifest; svg: string };
  assert.equal(data.manifest.states.length, 4);
  assert.equal(data.manifest.segments.length, 3);
});

test("every consecutive pair reuses the exact two-state solver: 3 clean boundaries, 3 pass verdicts", async () => {
  const result = await animate.run({
    states: [
      "fixtures/animate/seq-0.json",
      "fixtures/animate/seq-1.json",
      "fixtures/animate/seq-2.json",
      "fixtures/animate/seq-3.json",
    ],
  });
  const data = result.data as { manifest: SequenceManifest };
  const checks = data.manifest.transitionChecks;
  assert.equal(checks.length, 3);
  assert.ok(checks.every((check) => check.status === "pass"));
  // Each verdict is tagged with the segment it belongs to, so a reader can
  // tell WHICH transition a failure would have come from.
  assert.match(checks[0]!.detail ?? "", /\[state 0 -> 1\]/);
  assert.match(checks[1]!.detail ?? "", /\[state 1 -> 2\]/);
  assert.match(checks[2]!.detail ?? "", /\[state 2 -> 3\]/);
});

test("a collision the two-state solver would catch is caught in exactly the segment it occurs, not the whole run", async () => {
  const result = await animate.run({
    states: [
      "fixtures/animate/stagger-swap-before.json",
      "fixtures/animate/stagger-swap-together.json", // segment 0: real diagonal-swap collision
      "fixtures/animate/stagger-swap-sequenced.json", // segment 1: clean
    ],
  });
  assert.equal(result.exitCode, 2);
  const data = result.data as { manifest: SequenceManifest };
  const failing = data.manifest.transitionChecks.filter((check) => check.status === "fail");
  assert.equal(failing.length, 1);
  assert.match(failing[0]!.detail ?? "", /\[state 0 -> 1\]/);
  const clean = data.manifest.transitionChecks.find((check) => check.status === "pass");
  assert.match(clean?.detail ?? "", /\[state 1 -> 2\]/);
});

test("two consecutive states sharing no element by id are refused as two unrelated figures, not silently animated", async () => {
  await assert.rejects(
    () =>
      animate.run({
        states: [
          "fixtures/animate/seq-unrelated-0.json",
          "fixtures/animate/seq-unrelated-1.json",
          "fixtures/animate/seq-0.json",
        ],
      }),
    (error: unknown) => error instanceof SpecError && /share no element by id/.test(error.message),
  );
});

test("an element that disappears and reappears under the same id is refused, not drawn as two DOM nodes", async () => {
  await assert.rejects(
    () =>
      animate.run({
        states: [
          "fixtures/animate/seq-reappear-0.json",
          "fixtures/animate/seq-reappear-1.json",
          "fixtures/animate/seq-reappear-2.json",
        ],
      }),
    (error: unknown) => error instanceof SpecError && /reappearing under the same id is not supported/.test(error.message),
  );
});

test("fewer than two states is refused with a clear count, before anything renders", async () => {
  await assert.rejects(
    () => animate.run({ states: ["fixtures/animate/seq-0.json"] }),
    (error: unknown) => error instanceof SpecError && /needs at least 2 states, got 1/.test(error.message),
  );
});

test("--durationMs is per transition: total run time scales with segment count, stated in the summary line", async () => {
  const result = await animate.run({
    states: [
      "fixtures/animate/seq-0.json",
      "fixtures/animate/seq-1.json",
      "fixtures/animate/seq-2.json",
      "fixtures/animate/seq-3.json",
    ],
    durationMs: 700,
  });
  assert.match(result.text, /3 transition\(s\) at 700ms each \(2100ms total\)/);
  const svg = (result.data as { svg: string }).svg;
  assert.match(svg, /2100ms linear 0ms 1 both/);
});

// --- and the browser actually plays the merged, multi-segment keyframes ----

test("a browser holds, ramps, holds and ramps again across three segments, and a departed element stays gone", async () => {
  const result = await animate.run({
    states: [
      "fixtures/animate/seq-0.json",
      "fixtures/animate/seq-1.json",
      "fixtures/animate/seq-2.json",
      "fixtures/animate/seq-3.json",
    ],
    durationMs: 1000,
  });
  const svg = (result.data as { svg: string }).svg;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<body style="margin:0">${svg}</body>`);

    const sample = (fraction: number) =>
      page.evaluate((f) => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = f * (animation.effect!.getTiming().duration as number);
        }
        const x = (id: string) => Math.round(document.getElementById(id)!.getBoundingClientRect().x);
        const opacity = (id: string) => Number(getComputedStyle(document.getElementById(id)!).opacity);
        return { aX: x("a"), bOpacity: opacity("b"), cOpacity: opacity("c") };
      }, fraction);

    // Segment boundaries at 0, 1/3, 2/3, 1. `a` moves in segment 0, holds
    // through segment 1, moves again in segment 2.
    const t0 = await sample(0);
    const t1 = await sample(1 / 3);
    const t2 = await sample(2 / 3);
    const t3 = await sample(1);
    assert.notEqual(t0.aX, t1.aX, "a actually travels in segment 0");
    assert.equal(t1.aX, t2.aX, "a holds through segment 1");
    assert.notEqual(t2.aX, t3.aX, "a actually travels in segment 2");

    // `b` departs during segment 1 (present in states 0-1, absent from 2-3)
    // and MUST STAY gone -- the bug this suite exists to pin: without an
    // explicit trailing stop, CSS synthesises the missing tail keyframe from
    // the unanimated default (opacity 1), silently undoing the fade-out.
    // Compared with a tolerance: an EXACT keyframe stop is what is asserted,
    // but the browser's own interpolation still carries floating-point noise
    // (observed ~1e-8) even when landing precisely on one.
    const near = (value: number, target: number) => assert.ok(Math.abs(value - target) < 1e-4);
    near(await sample(0).then((s) => s.bOpacity), 1);
    near(await sample(1 / 3).then((s) => s.bOpacity), 1);
    near(await sample(2 / 3).then((s) => s.bOpacity), 0);
    near(await sample(1).then((s) => s.bOpacity), 0);

    // `c` appears during segment 0 (absent from state 0, present from state 1
    // onward) and must be invisible from t=0 -- the mirror bug, an unwanted
    // leading synthesis that would show it too early.
    near(await sample(0).then((s) => s.cOpacity), 0);
    near(await sample(1).then((s) => s.cOpacity), 1);
  } finally {
    await browser.close();
  }
});
