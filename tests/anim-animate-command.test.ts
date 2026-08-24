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
