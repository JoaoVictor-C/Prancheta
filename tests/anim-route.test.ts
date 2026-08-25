/**
 * Animated connector routes (ADR 0017, M15) -- retiring the M12 debt.
 *
 * Every test here drives the real command through `commandByName`, which is
 * this project's standing rule after the routing.ts scar: a feature with
 * passing unit tests that no real code path reached.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

import { commandByName } from "../src/commands.ts";
import { segmentSweepsBox, EDGE_EPSILON } from "../src/anim/sweep.ts";
import { requireSameStructure } from "../src/anim/route.ts";
import { polylineIntersectsBox } from "../src/layout/connectors.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Check } from "../src/checks.ts";

const animate = commandByName("animate")!;

const run = async (states: string[], extra: Record<string, unknown> = {}) =>
  (await animate.run({ states, ...extra })) as {
    data: { svg: string; manifest: { transitionChecks: Check[] } };
  };

test("a connector pivoting past a box it does not join is caught mid-transition, though both states are clean", async () => {
  // The connector's own `connector-clear-of-boxes` passes in BOTH states --
  // the arm is well above the obstacle at t=0 and well below it at t=1. The
  // defect exists only over the interval, which is precisely the class of
  // defect no instant check can see, and the reason this check is named apart.
  const result = await run([
    "fixtures/animate/route-sweep-before.json",
    "fixtures/animate/route-sweep-after.json",
  ]);
  const checks = result.data.manifest.transitionChecks;
  const sweep = checks.find((c) => c.id === "connector-clear-of-boxes-during-transition");
  assert.ok(sweep, "the route check ran at all");
  assert.equal(sweep.status, "fail");
  assert.equal(sweep.target, "arm");
  assert.match(sweep.detail ?? "", /sweeps across obstacle/);
  // Reported as an interval, not a moment: the span is the finding.
  assert.match(sweep.detail ?? "", /over t in \[0\.\d+, 0\.\d+\]/);

  // And the box check has nothing to say -- neither box moved. A failure here
  // would mean the route defect was being laundered through the wrong check.
  const boxes = checks.find((c) => c.id === "boxes-do-not-overlap-during-transition");
  assert.equal(boxes?.status, "pass");
});

test("the browser draws the route the check modelled: sampled geometry matches the affine prediction", async () => {
  // The M11.1 defect was two derivations of one motion disagreeing. For routes
  // the risk is sharper, because `d` interpolation is the browser's to
  // perform: if CSS did anything other than move each vertex affinely, the
  // closed-form sweep would be answering about a motion nobody renders.
  const result = await run(
    ["fixtures/animate/route-sweep-before.json", "fixtures/animate/route-sweep-after.json"],
    { durationMs: 1000 },
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<body style="margin:0">${result.data.svg}</body>`);

    const endpointAt = (fraction: number) =>
      page.evaluate((f) => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = f * (animation.effect!.getTiming().duration as number);
        }
        const path = document.querySelector<SVGPathElement>("#arm > path")!;
        const end = path.getPointAtLength(path.getTotalLength());
        const start = path.getPointAtLength(0);
        return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      }, fraction);

    const at0 = await endpointAt(0);
    const at1 = await endpointAt(1);
    const farTravel = Math.abs(at0.end.y - at1.end.y);
    const pivotTravel = Math.abs(at0.start.y - at1.start.y);
    assert.ok(farTravel > 100, "the far end really travels");
    // The near end is not perfectly still, and should not be: a route is
    // CLIPPED to the box it leaves, so the exit point slides around that box's
    // boundary as the line turns. What makes it a hinge is that the near end
    // stays within its own 10px box while the far end crosses the canvas.
    assert.ok(
      pivotTravel < 20 && pivotTravel < farTravel / 10,
      `near end travelled ${pivotTravel}, far end ${farTravel}`,
    );

    // The claim under test: every intermediate vertex is the affine blend of
    // its two endpoints. Tolerance is for the browser's own float noise and
    // getPointAtLength's flattening, not for a modelling gap.
    for (const f of [0.25, 0.5, 0.75]) {
      const sampled = await endpointAt(f);
      const predicted = at0.end.y + (at1.end.y - at0.end.y) * f;
      assert.ok(
        Math.abs(sampled.end.y - predicted) < 0.5,
        `at t=${f} the drawn endpoint was ${sampled.end.y}, the modelled one ${predicted}`,
      );
    }
  } finally {
    await browser.close();
  }
});

test("a figure that permits connector crossing stands the route check down by name, never silently", async () => {
  // A point marked ON a plotted curve is a connector crossing a box it does not
  // join, in every frame, by construction. Reporting that over the interval
  // too would fail every such figure; saying nothing would read the same as
  // "checked and clean". So it reports not-applicable with the toggle named.
  const result = await run([
    "experiments/derivative/deriv-0.json",
    "experiments/derivative/deriv-1.json",
  ]);
  const sweep = result.data.manifest.transitionChecks.find(
    (c) => c.id === "connector-clear-of-boxes-during-transition",
  );
  assert.equal(sweep?.status, "not-applicable");
  assert.match(sweep?.detail ?? "", /allowConnectorCrossing/);
});

test("two routes with different vertex counts are refused, because CSS would swap them rather than tween", () => {
  // CSS interpolates a path only between equal command sequences; given
  // anything else it swaps discretely at the midpoint. Tweening one anyway
  // would put the check back to modelling a motion the renderer never
  // performs -- M11.1, one degree of freedom further out.
  assert.throws(
    () =>
      requireSameStructure(
        "bendy",
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        [
          { x: 0, y: 0 },
          { x: 5, y: 8 },
          { x: 10, y: 10 },
        ],
      ),
    (error: unknown) =>
      error instanceof SpecError && /2 point\(s\) in one state and 3 in the next/.test(error.message),
  );

  // The equal-count case is the one that may proceed.
  assert.doesNotThrow(() =>
    requireSameStructure("straight", [{ x: 0, y: 0 }], [{ x: 1, y: 1 }]),
  );
});

test("the closed-form sweep agrees with the static predicate everywhere, including where only the turning normal separates", () => {
  // The x and y axes give affine inequalities; the segment's own normal gives
  // quadratics, and that third axis is the whole reason sweep.ts exists. This
  // pins it against the static predicate the transition check must agree with
  // at its endpoints, over the geometry where the normal is what decides: a
  // line pivoting about a fixed point past a small box.
  const P = { x: 300, y: 300 };
  let seed = 20260825;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, u: number) => ({
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  });

  let mismatches = 0;
  let grazed = 0;
  for (let trial = 0; trial < 200; trial += 1) {
    const th0 = rnd() * Math.PI - Math.PI / 2;
    const th1 = th0 + (rnd() - 0.5) * 1.2;
    const L = 260;
    const arm = (th: number) => ({
      a: { x: P.x - Math.cos(th) * L, y: P.y - Math.sin(th) * L },
      b: { x: P.x + Math.cos(th) * L, y: P.y + Math.sin(th) * L },
    });
    const from = arm(th0);
    const to = arm(th1);

    const angle = th0 + (th1 - th0) * rnd() + (rnd() - 0.5) * 0.25;
    const radius = 40 + rnd() * 200;
    const size = 9;
    const box = {
      x: P.x + Math.cos(angle) * radius - size / 2,
      y: P.y + Math.sin(angle) * radius - size / 2,
      width: size,
      height: size,
    };

    const ranges = segmentSweepsBox(from.a, to.a, from.b, to.b, box, box);
    if (ranges.length > 0) grazed += 1;
    const covered = (t: number) => ranges.some((g) => t >= g.lo - 1e-9 && t <= g.hi + 1e-9);

    const N = 600;
    for (let i = 0; i <= N; i += 1) {
      const t = i / N;
      const truth = polylineIntersectsBox(
        [lerp(from.a, to.a, t), lerp(from.b, to.b, t)],
        box,
        EDGE_EPSILON,
      );
      if (truth === covered(t)) continue;
      // A disagreement within one sample step of a boundary is the sampler's
      // resolution, not the solver's: the solver is the one with the exact
      // answer there.
      const nearEdge = ranges.some(
        (g) => Math.abs(t - g.lo) < 2 / N || Math.abs(t - g.hi) < 2 / N,
      );
      if (!nearEdge) mismatches += 1;
    }
  }
  assert.ok(grazed > 100, `the geometry has to actually exercise the check (grazed ${grazed}/200)`);
  assert.equal(mismatches, 0);
});

test("a route that moves while carrying an arrowhead is refused, not drawn with the head left behind", async () => {
  // `points` is not CSS-animatable and a transform would mean a rotation, so
  // there is no way to carry the head along. Drawing the line travelling while
  // its head stayed put would be the figure contradicting itself on screen.
  await assert.rejects(
    run(["fixtures/animate/route-arrow-before.json", "fixtures/animate/route-arrow-after.json"]),
    (error: unknown) =>
      error instanceof SpecError &&
      /carries arrow "end", which cannot travel with it/.test(error.message),
  );
});
