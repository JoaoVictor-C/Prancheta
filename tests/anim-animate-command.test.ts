/**
 * End-to-end reachability test for the `animate` command (ADR 0012, M11).
 *
 * Deliberately goes through `commandByName("animate")!.run(...)` -- the same
 * entry point the CLI and MCP server both use -- rather than importing
 * buildTimeline/emitAnimatedSvg/boxesDoNotOverlapDuringTransition directly.
 * A test that calls the tween math directly cannot tell you whether anything
 * else does; this is the lesson src/layout/routing.ts left behind (see the
 * 2026-08-23 ROADMAP entry), applied to the newest command in the CLI.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { commandByName } from "../src/commands.ts";
import { SpecError } from "../src/ir/types.ts";

const animate = commandByName("animate")!;

test("animate is registered and reachable by name, exactly as diff and render are", () => {
  assert.ok(animate !== undefined);
  assert.equal(animate.name, "animate");
});

test("a diagonal swap fails boxes-do-not-overlap-during-transition end to end, though both frames are individually clean", async () => {
  const result = await animate.run({
    before: "fixtures/animate/swap-before.json",
    after: "fixtures/animate/swap-after.json",
  });
  assert.equal(result.exitCode, 2);
  const data = result.data as { manifest: { before: { ok: boolean }; after: { ok: boolean }; transitionChecks: { id: string; status: string }[]; ok: boolean } };
  assert.equal(data.manifest.before.ok, true);
  assert.equal(data.manifest.after.ok, true);
  assert.equal(data.manifest.ok, false);
  const transition = data.manifest.transitionChecks.find(
    (check) => check.id === "boxes-do-not-overlap-during-transition",
  );
  assert.equal(transition?.status, "fail");
});

test("a clean transition passes end to end and emits an animated SVG with a real @keyframes rule", async () => {
  const result = await animate.run({
    before: "fixtures/animate/swap-before.json",
    after: "fixtures/animate/clean-after.json",
  });
  assert.equal(result.exitCode, 0);
  const data = result.data as { manifest: { ok: boolean }; svg: string };
  assert.equal(data.manifest.ok, true);
  assert.match(data.svg, /@keyframes pr-move-a/);
  assert.match(data.svg, /#a \{ animation: pr-move-a/);
});

test("a moved element relying on a counter-derived id is refused with SpecError, not silently rendered", async () => {
  await assert.rejects(
    () =>
      animate.run({
        before: "fixtures/animate/missing-id-before.json",
        after: "fixtures/animate/missing-id-after.json",
      }),
    SpecError,
  );
});

test("a box that only rotates between states is refused -- the confirmed diff.ts blind spot, closed by the guard, not by diff.ts itself", async () => {
  await assert.rejects(
    () =>
      animate.run({
        before: "fixtures/animate/rotation-mismatch-before.json",
        after: "fixtures/animate/rotation-mismatch-after.json",
      }),
    SpecError,
  );
});

// --- M11.1: the check models the animation the renderer performs (ADR 0013) ---

type AnimateData = {
  manifest: {
    before: { ok: boolean };
    after: { ok: boolean };
    transitionChecks: { id: string; target: string; status: string; detail?: string }[];
    disclosed: { hardCut: string[]; clippedOnExit: string[] };
    ok: boolean;
  };
  svg: string;
};

const transitionOf = (data: AnimateData) =>
  data.manifest.transitionChecks.find(
    (check) => check.id === "boxes-do-not-overlap-during-transition",
  )!;

test("a box that moves AND restyles hard-cuts, so the check no longer reports the crossing it never performs", async () => {
  // The reproduced M11 false positive: `a` was modelled as sliding through
  // `b`'s path, but diff.ts labelled it `restyled` and it was never tweened.
  const result = await animate.run({
    before: "fixtures/animate/restyle-move-before.json",
    after: "fixtures/animate/restyle-move-clean-after.json",
  });
  const data = result.data as AnimateData;
  assert.equal(transitionOf(data).status, "pass");
  assert.equal(result.exitCode, 0);
  // And the hard cut is disclosed rather than hidden or refused.
  assert.deepEqual(data.manifest.disclosed.hardCut, ["a"]);
  assert.match(result.text, /hard-cuts rather than tweening/);
});

test("a hard-cutting box standing in a sweeper's path is caught — the M11 false negative", async () => {
  const result = await animate.run({
    before: "fixtures/animate/occupier-before.json",
    after: "fixtures/animate/occupier-after.json",
  });
  const data = result.data as AnimateData;
  assert.equal(data.manifest.before.ok, true);
  assert.equal(data.manifest.after.ok, true);
  const transition = transitionOf(data);
  assert.equal(transition.status, "fail");
  assert.match(transition.detail ?? "", /though clear of it in the finished figure/);
  assert.equal(result.exitCode, 2);
});

test("everything drawn is a participant: the newcomer, and the box still fading out", async () => {
  // Three-way probe: `vanishing` leaves the spot, `newcomer` takes it, and
  // `sweeper` passes through it. Only what the SVG actually draws counts --
  // and since M11.2 the departing box is drawn, so it counts too.
  const result = await animate.run({
    before: "fixtures/animate/vanish-appear-before.json",
    after: "fixtures/animate/vanish-appear-after.json",
  });
  const data = result.data as AnimateData;
  const failures = data.manifest.transitionChecks.filter((check) => check.status === "fail");
  assert.deepEqual(
    failures.map((failure) => failure.target).sort(),
    ["newcomer", "sweeper"],
  );
  assert.match(
    failures.find((failure) => failure.target === "sweeper")!.detail ?? "",
    /still fading out/,
  );
  // The fade-out ADR 0012 claimed and emit.ts never performed now exists.
  assert.match(data.svg, /@keyframes pr-fade-out-vanishing/);
  assert.match(result.text, /2 faded in, 2 faded out/);
});

test("the emitted CSS honours prefers-reduced-motion, and leaves departing elements gone rather than visible", async () => {
  const result = await animate.run({
    before: "fixtures/animate/vanish-appear-before.json",
    after: "fixtures/animate/vanish-appear-after.json",
  });
  const { svg } = result.data as AnimateData;
  assert.match(svg, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(svg, /#vanishing[^{]*\{ animation: none; opacity: 0; \}/);
});

test("easing rides through to the CSS, and an overshooting one is refused rather than silently unverified", async () => {
  const eased = await animate.run({
    before: "fixtures/animate/swap-before.json",
    after: "fixtures/animate/clean-after.json",
    easing: "ease-in-out",
    delayMs: 200,
  });
  // `both`, not `forwards`: with a delay, `forwards` would park movers at
  // their END position during the hold and snap backwards when it expires.
  assert.match((eased.data as AnimateData).svg, /500ms ease-in-out 200ms 1 both/);

  await assert.rejects(
    () =>
      animate.run({
        before: "fixtures/animate/swap-before.json",
        after: "fixtures/animate/clean-after.json",
        easing: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
      }),
    SpecError,
  );
});

test("a duration the browser would reject is refused, rather than reported as a transition that never runs", async () => {
  for (const durationMs of [0, -1, Number.NaN]) {
    await assert.rejects(
      () =>
        animate.run({
          before: "fixtures/animate/swap-before.json",
          after: "fixtures/animate/clean-after.json",
          durationMs,
        }),
      SpecError,
    );
  }
});

test("an overlap the finished figure also has is left to boxes-do-not-overlap, reported once not twice", async () => {
  const result = await animate.run({
    before: "fixtures/animate/delegated-before.json",
    after: "fixtures/animate/delegated-after.json",
  });
  const data = result.data as AnimateData;
  assert.equal(transitionOf(data).status, "pass");
  assert.equal(data.manifest.after.ok, false);
  assert.equal(data.manifest.ok, false);
  assert.equal(result.exitCode, 2);
});
