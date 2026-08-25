/**
 * The browser really animates it, and the keyframes are read back (ADR 0014).
 *
 * Every other animation test asserts on strings this project generated, which
 * proves only that it generated what it meant to. The lesson from
 * src/layout/routing.ts is that agreeing with yourself is not evidence, and
 * the lesson from the fill-mode bug found while writing M11.2 is that CSS has
 * its own opinions about what a declaration means. So this loads the emitted
 * SVG into the same engine that draws the figures and asks the animations
 * themselves where each element is.
 *
 * Sampled through the Web Animations API rather than by waiting: headless
 * throttles rAF, so wall-clock timing measures the harness, not the artefact.
 * Seeking each animation to a fraction of its own duration samples exactly
 * what a viewer would see at that instant.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { commandByName } from "../src/commands.ts";

const animate = commandByName("animate")!;

async function animatedSvg(extra: Record<string, unknown> = {}): Promise<string> {
  const result = await animate.run({
    states: ["fixtures/animate/vanish-appear-before.json", "fixtures/animate/vanish-appear-after.json"],
    durationMs: 2000,
    ...extra,
  });
  return (result.data as { svg: string }).svg;
}

test("a browser plays every declared transition, and each element is where the keyframes say", async () => {
  const svg = await animatedSvg();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<body style="margin:0">${svg}</body>`);

    const sampleAt = (fraction: number) =>
      page.evaluate((f) => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = f * (animation.effect!.getTiming().duration as number);
        }
        const at = (id: string) => document.getElementById(id)!;
        return {
          sweeperX: Math.round(at("sweeper").getBoundingClientRect().x),
          leaving: Number(getComputedStyle(at("vanishing")).opacity),
          arriving: Number(getComputedStyle(at("newcomer")).opacity),
        };
      }, fraction);

    const start = await sampleAt(0);
    const middle = await sampleAt(0.5);
    const end = await sampleAt(1);

    // The mover sweeps, rather than sitting at its destination the whole time
    // — the hard-cut that M11 could not tell apart from a tween.
    assert.ok(middle.sweeperX > start.sweeperX);
    assert.ok(end.sweeperX > middle.sweeperX);
    assert.equal(Math.round((start.sweeperX + end.sweeperX) / 2), middle.sweeperX);

    // The exit ADR 0012 described and M11 never performed.
    assert.equal(start.leaving, 1);
    assert.equal(end.leaving, 0);
    assert.equal(start.arriving, 0);
    assert.equal(end.arriving, 1);

    // Complementary at every instant: this is why checks.ts exempts a
    // crossfading pair instead of reporting it as an overlap.
    assert.equal(middle.leaving + middle.arriving, 1);
  } finally {
    await browser.close();
  }
});

test("under prefers-reduced-motion nothing moves, and what was leaving is gone rather than left visible", async () => {
  const svg = await animatedSvg();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const state = await page.evaluate(() => {
      const at = (id: string) => document.getElementById(id)!;
      return {
        sweeperX: Math.round(at("sweeper").getBoundingClientRect().x),
        leaving: Number(getComputedStyle(at("vanishing")).opacity),
        arriving: Number(getComputedStyle(at("newcomer")).opacity),
      };
    });
    // Straight to the finished figure: the mover at its destination, the
    // newcomer present, and the departed box actually gone -- the one that
    // needs saying, since its natural resting state is fully visible.
    assert.equal(state.leaving, 0);
    assert.equal(state.arriving, 1);
    assert.ok(state.sweeperX > 300);
  } finally {
    await browser.close();
  }
});

test("a delay holds the first state instead of parking movers at their destination", async () => {
  // `animation-fill-mode: forwards` would show the mover already arrived
  // during the hold, then snap it back when the delay expired. `both` is what
  // makes a hold hold.
  const svg = await animatedSvg({ delayMs: 1000 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const duringDelay = await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 500; // inside the 1000ms delay
      }
      const at = (id: string) => document.getElementById(id)!;
      return {
        sweeperX: Math.round(at("sweeper").getBoundingClientRect().x),
        arriving: Number(getComputedStyle(at("newcomer")).opacity),
      };
    });
    assert.ok(duringDelay.sweeperX < 100);
    assert.equal(duringDelay.arriving, 0);
  } finally {
    await browser.close();
  }
});
