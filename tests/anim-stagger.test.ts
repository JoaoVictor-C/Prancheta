/**
 * Motion windows (ADR 0015).
 *
 * Two things have to hold together, and each is worthless without the other.
 * The RENDERER must actually hold, ramp and hold — verified in a browser,
 * because CSS keyframe stops are the mechanism and only the browser can say
 * what they do. And the CHECK must model that piecewise motion exactly, which
 * is tested in both directions: a stagger that removes a collision the shared
 * clock has, and a stagger that creates one it does not. The second is the
 * important one — it is the defect class that only exists once staggering
 * does, so a renderer shipped without it would be shipping a blind spot.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { commandByName } from "../src/commands.ts";
import { SpecError } from "../src/ir/types.ts";
import { parseSpec } from "../src/ir/types.ts";
import { pairOverlapRanges, overlapRangesDuringTransition } from "../src/anim/checks.ts";
import { anyRangeMeetsOpenInterval } from "../src/anim/interval.ts";
import { FULL_WINDOW } from "../src/anim/trajectory.ts";
import type { Trajectory } from "../src/anim/trajectory.ts";
import type { Rect } from "../src/ir/types.ts";

const animate = commandByName("animate")!;

function rect(x: number, y: number): Rect {
  return { x, y, width: 40, height: 40 };
}

function moves(
  id: string,
  from: [number, number],
  to: [number, number],
  window = FULL_WINDOW,
): Trajectory {
  return {
    id,
    from: rect(from[0], from[1]),
    to: rect(to[0], to[1]),
    tweened: true,
    fade: null,
    inFinishedFigure: true,
    atFirstStatePlace: true,
    window,
  };
}

// --- the decomposition itself ------------------------------------------------

test("with no window, the piecewise solve IS the affine solve — over ten thousand random pairs", () => {
  // The degenerate case has to be exactly the old behaviour, not merely close
  // to it, or M13 silently changes the verdict on every figure already drawn.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const r = (): Rect => ({ x: rnd() * 400 - 200, y: rnd() * 400 - 200, width: 20 + rnd() * 60, height: 20 + rnd() * 60 });

  let disagreements = 0;
  for (let i = 0; i < 10000; i += 1) {
    const a0 = r();
    const b0 = r();
    const a1 = { ...r(), width: a0.width, height: a0.height };
    const b1 = { ...r(), width: b0.width, height: b0.height };
    const affine = anyRangeMeetsOpenInterval(overlapRangesDuringTransition(a0, a1, b0, b1), 0, 1);
    const piecewise = anyRangeMeetsOpenInterval(
      pairOverlapRanges(
        { ...moves("a", [0, 0], [0, 0]), from: a0, to: a1 },
        { ...moves("b", [0, 0], [0, 0]), from: b0, to: b1 },
      ),
      0,
      1,
    );
    if (affine !== piecewise) disagreements += 1;
  }
  assert.equal(disagreements, 0);
});

test("sequencing removes the diagonal-swap collision", () => {
  const together = pairOverlapRanges(moves("a", [0, 0], [100, 100]), moves("b", [100, 0], [0, 100]));
  assert.equal(anyRangeMeetsOpenInterval(together, 0, 1), true);

  const sequenced = pairOverlapRanges(
    moves("a", [0, 0], [100, 100], { start: 0, end: 0.5 }),
    moves("b", [100, 0], [0, 100], { start: 0.5, end: 1 }),
  );
  assert.equal(anyRangeMeetsOpenInterval(sequenced, 0, 1), false);
});

test("sequencing can also CREATE a collision the shared clock never has", () => {
  // A convoy 120 apart, both sliding 300 right: on one clock the gap is
  // constant. Let the follower go first and it drives through the parked
  // leader — a defect that only exists because staggering does.
  const leader: [number, number] = [120, 0];
  const follower: [number, number] = [0, 0];
  const together = pairOverlapRanges(
    moves("leader", leader, [420, 0]),
    moves("follower", follower, [300, 0]),
  );
  assert.equal(anyRangeMeetsOpenInterval(together, 0, 1), false);

  const staggered = pairOverlapRanges(
    moves("leader", leader, [420, 0], { start: 0.5, end: 1 }),
    moves("follower", follower, [300, 0], { start: 0, end: 0.5 }),
  );
  assert.equal(anyRangeMeetsOpenInterval(staggered, 0, 1), true);
});

// --- the spec surface --------------------------------------------------------

test("a motion window must be an ordered pair inside [0,1]", () => {
  const withMotion = (motion: unknown) =>
    parseSpec({
      version: 1,
      root: {
        type: "scene",
        layout: "absolute",
        width: 200,
        height: 200,
        children: [{ type: "block", id: "a", x: 0, y: 0, width: 40, height: 40, motion }],
      },
    });
  assert.doesNotThrow(() => withMotion({ start: 0.2, end: 0.7 }));
  assert.throws(() => withMotion({ start: 0.7, end: 0.2 }), SpecError);
  assert.throws(() => withMotion({ start: 0.5, end: 0.5 }), SpecError);
  assert.throws(() => withMotion({ start: -0.1, end: 0.5 }), SpecError);
  assert.throws(() => withMotion({ start: 0, end: 1.5 }), SpecError);
  assert.throws(() => withMotion({ start: 0 }), SpecError);
});

// --- end to end --------------------------------------------------------------

test("the diagonal swap fails together and passes sequenced, through the real command", async () => {
  const together = await animate.run({
    states: ["fixtures/animate/stagger-swap-before.json", "fixtures/animate/stagger-swap-together.json"],
  });
  assert.equal(together.exitCode, 2);

  const sequenced = await animate.run({
    states: ["fixtures/animate/stagger-swap-before.json", "fixtures/animate/stagger-swap-sequenced.json"],
  });
  assert.equal(sequenced.exitCode, 0);
  // Stagger is keyframe stops, never animation-delay: one clock, one duration.
  const svg = (sequenced.data as { svg: string }).svg;
  assert.match(svg, /@keyframes pr-move-a-0 \{ 0% \{[^}]*\} 45%, 100% \{/);
  assert.match(svg, /@keyframes pr-move-b-1 \{ 0%, 55% \{[^}]*\} 100% \{/);
  assert.match(svg, /#a \{ animation: pr-move-a-0 500ms linear 0ms 1 both; \}/);
});

test("a convoy is clean together and caught when the follower sets off first", async () => {
  const together = await animate.run({
    states: ["fixtures/animate/stagger-convoy-before.json", "fixtures/animate/stagger-convoy-together.json"],
  });
  assert.equal(together.exitCode, 0);

  const staggered = await animate.run({
    states: ["fixtures/animate/stagger-convoy-before.json", "fixtures/animate/stagger-convoy-follower-first.json"],
  });
  assert.equal(staggered.exitCode, 2);
  const failure = (staggered.data as { manifest: { transitionChecks: { status: string; target: string }[] } })
    .manifest.transitionChecks.find((check) => check.status === "fail");
  assert.equal(failure?.target, "follower");
});

test("easing is refused on a staggered figure, rather than emitting motion the check cannot speak about", async () => {
  await assert.rejects(
    () =>
      animate.run({
        states: ["fixtures/animate/stagger-swap-before.json", "fixtures/animate/stagger-swap-sequenced.json"],
        easing: "ease-in-out",
      }),
    SpecError,
  );
  // The same figure is fine linear, and an unstaggered one is fine eased.
  await assert.doesNotReject(() =>
    animate.run({
      states: ["fixtures/animate/stagger-swap-before.json", "fixtures/animate/stagger-swap-together.json"],
      easing: "ease-in-out",
    }),
  );
});

// --- and the browser actually does it ---------------------------------------

test("a browser holds, ramps and holds — the keyframe stops are the real mechanism", async () => {
  const result = await animate.run({
    states: ["fixtures/animate/stagger-swap-before.json", "fixtures/animate/stagger-swap-sequenced.json"],
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
        return { a: x("a"), b: x("b") };
      }, fraction);

    // `a` travels over [0, 0.45]; `b` waits until 0.55.
    const t0 = await sample(0);
    const t45 = await sample(0.45);
    const t55 = await sample(0.55);
    const t1 = await sample(1);

    assert.equal(t0.b, t55.b, "b holds at its first-state position until its window opens");
    assert.equal(t45.a, t1.a, "a holds at its second-state position after its window closes");
    assert.notEqual(t0.a, t45.a, "a actually travels inside its own window");
    assert.notEqual(t55.b, t1.b, "b actually travels inside its own window");

    // Linear inside the window: the midpoint of a's ramp is the midpoint of a.
    const mid = await sample(0.225);
    assert.ok(Math.abs(mid.a - (t0.a + t45.a) / 2) <= 1);
  } finally {
    await browser.close();
  }
});

test("a window staggers a fade too, so an exit can finish before an entrance begins", async () => {
  // `gone` leaves over the first 40%, `new` arrives over the last 40%. The
  // window is declared on the box; its label inherits it, because emit.ts
  // drives a box and its own text from one keyframe block rather than deriving
  // the label's timing separately.
  const result = await animate.run({
    states: ["fixtures/animate/stagger-fade-before.json", "fixtures/animate/stagger-fade-after.json"],
  });
  assert.equal(result.exitCode, 0);
  const svg = (result.data as { svg: string }).svg;
  assert.match(svg, /@keyframes pr-fade-in-new-\d+ \{ 0%, 60% \{ opacity: 0; \} 100% \{ opacity: 1; \} \}/);
  assert.match(svg, /@keyframes pr-fade-out-gone-\d+ \{ 0% \{ opacity: 1; \} 40%, 100% \{ opacity: 0; \} \}/);
  for (const id of ["new--label", "gone--label"]) {
    assert.match(svg, new RegExp(`#${id.replace("--", "--")} \{ animation: pr-fade-(in|out)-`));
  }
});

