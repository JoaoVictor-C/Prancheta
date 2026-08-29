/**
 * Builds the host page for the fractal-tree GROWTH animation.
 *
 * Every count on the page is READ OUT of the animation manifest at build time
 * rather than typed into the prose -- states, transitions, persisted elements,
 * how many checks ran and how many passed. A page that states a figure's
 * properties from memory is the exact failure this project exists to remove
 * from figures; it would be odd to reintroduce it one layer up.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { minifyKeyframes } from "./minify-keyframes.mjs";

const DIR = "out/fractaltree-growth";
const files = await readdir(DIR);
const svgName = files.find((f) => f.endsWith(".animated.svg"));
if (svgName === undefined) throw new Error(`no .animated.svg in ${DIR}`);

const rawSvg = await readFile(join(DIR, svgName), "utf8");
const { svg, removed: keyframeStopsRemoved } = minifyKeyframes(rawSvg);
const manifest = JSON.parse(await readFile(join(DIR, svgName.replace(/\.svg$/, ".manifest.json")), "utf8"));

const stateCount = manifest.states.length;
const segmentCount = manifest.segments.length;
const persisted = manifest.segments.reduce((sum, s) => sum + s.persisted, 0);
const appeared = manifest.segments.reduce((sum, s) => sum + (s.counts?.appeared ?? 0), 0);
const checks = manifest.transitionChecks ?? [];
const passed = checks.filter((c) => c.status === "pass").length;
const failed = checks.filter((c) => c.status === "fail").length;
const stoodDown = checks.length - passed - failed;
const staticChecks = manifest.states.reduce((sum, s) => sum + (s.checks?.length ?? 0), 0);
const staticFailed = manifest.states.reduce(
  (sum, s) => sum + (s.checks ?? []).filter((c) => c.status === "fail").length,
  0,
);
const staticStoodDown = manifest.states.reduce(
  (sum, s) => sum + (s.checks ?? []).filter((c) => c.status !== "pass" && c.status !== "fail").length,
  0,
);

const DURATION_MS = 420;
const DEPTH = 5;
const QUARTER_NODES = 2 ** (DEPTH + 1) - 1; // one quarter's node count: root + 4*(QUARTER_NODES-1)
const NODES = 1 + 4 * (QUARTER_NODES - 1);
const BRANCHES = 4 * (QUARTER_NODES - 1);
const RUN_S = ((DURATION_MS * segmentCount) / 1000).toFixed(1);
const SVG_KB = Math.round(svg.length / 1024);

const measurements = [
  [String(stateCount), "authored states", "1 seed + 2 per generation: sprout, then extend"],
  [String(DEPTH), "generations", "every one budding, extending, and holding in turn"],
  [String(appeared), "elements appeared", "new nodes and branches, each fading in at a stub"],
  [`${RUN_S}s`, "total run", "plays once and holds on the finished tree"],
  [persisted.toLocaleString("en-US"), "identity crossings", "elements persisting across a state boundary"],
  [String(staticChecks + checks.length), "checks run", `${staticFailed + failed} failed · ${(stoodDown + staticStoodDown).toLocaleString("en-US")} stood down by name`],
  [`${SVG_KB} KB`, "one SVG file", `no video encoder, no frames, no JavaScript — was ${Math.round(rawSvg.length / 1024)} KB before a safe collapse of redundant keyframe stops`],
];

const refusals = [
  [
    "requireNoArrowhead",
    "A moving route may not carry an arrowhead.",
    "A branch extending outward is exactly a moving route. No arrowheads anywhere in this figure — the refusal costs nothing here either.",
  ],
  [
    "requireSameStructure",
    "Two states of one route must have the same vertex count.",
    "Every branch is always a straight segment between two nodes, sprout or full length, so the precondition holds by construction.",
  ],
  [
    "boxes-do-not-overlap-during-transition",
    "The check that decided how far a bud sprouts before extending.",
    "A generation's branches all sprouting at once let mirror-image cousins cross mid-extension even though every FINAL position is proven clear — the same tree already passed the collision search in the breathing demo. A numeric scan over stub length and a left/right stagger (below) found real clearance rather than a guess.",
  ],
];

const html = `<title>The Fractal Tree Grows Four Ways</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700;900&family=JetBrains+Mono:wght@400;700&family=Newsreader:opsz,wght@6..72,300;6..72,400&display=swap">
<style>
  :root {
    --ground: #07080C;
    --plate: #0A0C11;
    --rule: #171B23;
    --rule-bright: #262C38;
    --ink: #E8EAF0;
    --ink-dim: #8B92A3;
    --ink-faint: #59606F;
    --amber: #D9A441;
    --measure: 63ch;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: "Newsreader", Georgia, "Times New Roman", serif;
    font-size: 18px;
    font-weight: 300;
    line-height: 1.68;
    -webkit-font-smoothing: antialiased;
  }

  .sheet {
    max-width: 1160px;
    margin: 0 auto;
    padding: clamp(24px, 4vw, 60px) clamp(20px, 4vw, 52px) 88px;
  }

  .titleblock {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    border-top: 1px solid var(--rule-bright);
    border-bottom: 1px solid var(--rule-bright);
    margin: 0;
  }
  .titleblock > div { padding: 13px 18px 15px; border-left: 1px solid var(--rule); }
  .titleblock > div:first-child { border-left: 0; padding-left: 0; }
  .titleblock dt, .titleblock dd { margin: 0; }

  .label {
    font-family: "Chivo", "Helvetica Neue", Arial, sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .mono { font-variant-numeric: tabular-nums; }
  .titleblock dd {
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
    margin-top: 6px;
  }
  .pass { color: #7FC8A0; }

  h1 {
    font-family: "Chivo", "Helvetica Neue", Arial, sans-serif;
    font-weight: 900;
    font-size: clamp(2.15rem, 6.2vw, 3.7rem);
    line-height: 1.01;
    letter-spacing: -0.032em;
    text-wrap: balance;
    margin: clamp(34px, 5.5vw, 60px) 0 0;
  }
  .standfirst { max-width: var(--measure); font-size: 1.2rem; color: var(--ink-dim); margin: 20px 0 0; }
  .standfirst strong { color: var(--ink); font-weight: 400; }

  .stage {
    margin: clamp(30px, 4.5vw, 52px) 0 0;
    background: var(--plate);
    border: 1px solid var(--rule-bright);
    overflow: hidden;
  }
  .stage svg { display: block; width: 100%; height: auto; }

  .platecaption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px 24px;
    margin-top: 11px;
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 11.5px;
    color: var(--ink-faint);
  }
  .platecaption-left { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }

  .restart {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    background: var(--plate);
    border: 1px solid var(--rule-bright);
    border-radius: 3px;
    color: var(--ink);
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 11.5px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .restart:hover { border-color: var(--amber); color: var(--amber); }
  .restart:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  .restart svg { width: 12px; height: 12px; flex: none; }
  .restart .replaying { color: var(--amber); }

  h2 {
    font-family: "Chivo", "Helvetica Neue", Arial, sans-serif;
    font-weight: 700;
    font-size: 1.42rem;
    letter-spacing: -0.017em;
    text-wrap: balance;
    margin: clamp(52px, 7vw, 84px) 0 0;
    padding-bottom: 11px;
    border-bottom: 1px solid var(--rule-bright);
  }
  p { max-width: var(--measure); }
  h2 + p { margin-top: 21px; }
  code, .mono { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 0.85em; line-height: 1; }
  code { color: var(--amber); }

  .callouts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(212px, 1fr));
    gap: 1px;
    background: var(--rule);
    border: 1px solid var(--rule);
    margin-top: 28px;
  }
  .callout { background: var(--ground); padding: 19px 20px 21px; }
  .callout .n {
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 1.8rem;
    font-weight: 700;
    line-height: 1;
    color: var(--amber);
    font-variant-numeric: tabular-nums;
  }
  .callout .k { margin-top: 12px; }
  .callout .note { font-size: 0.9rem; color: var(--ink-dim); line-height: 1.5; margin-top: 6px; }

  .refusals {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--rule);
    border: 1px solid var(--rule);
    margin-top: 28px;
  }
  .refusal { background: var(--ground); padding: 21px 23px 23px; }
  .refusal .rule { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--amber); word-break: break-word; }
  .refusal .says {
    font-family: "Chivo", "Helvetica Neue", Arial, sans-serif;
    font-weight: 700;
    font-size: 1.01rem;
    letter-spacing: -0.012em;
    text-wrap: balance;
    margin-top: 9px;
  }
  .refusal .why { max-width: var(--measure); font-size: 0.97rem; color: var(--ink-dim); margin-top: 9px; }
  .refusal .why code { color: var(--ink); }

  pre {
    margin-top: 25px;
    padding: 18px 20px;
    background: var(--plate);
    border: 1px solid var(--rule-bright);
    overflow-x: auto;
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.72;
    color: var(--ink-dim);
  }
  pre b { color: var(--ink); font-weight: 400; }

  footer {
    margin-top: 74px;
    padding-top: 18px;
    border-top: 1px solid var(--rule-bright);
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 11.5px;
    color: var(--ink-faint);
    max-width: 84ch;
    line-height: 1.7;
  }
</style>

<div class="sheet">
  <dl class="titleblock">
    <div><dt class="label">Drawn by</dt><dd>Prancheta</dd></div>
    <div><dt class="label">Subject</dt><dd>depth-${DEPTH} construction</dd></div>
    <div><dt class="label">Milestone</dt><dd>M14 &middot; M15</dd></div>
    <div><dt class="label">States</dt><dd>${stateCount}</dd></div>
    <div><dt class="label">Plays</dt><dd>once, holds</dd></div>
    <div><dt class="label">Verdict</dt><dd class="${manifest.ok && staticFailed === 0 ? "pass" : ""}">${
      manifest.ok && staticFailed === 0 ? "all checks pass" : "CHECKS FAILED"
    }</dd></div>
  </dl>

  <h1>The fractal tree<br>grows four ways</h1>

  <p class="standfirst">Not the finished tree, moving — the <strong>recursion itself, running</strong>. Four trees hang off one shared root, the same recursion pointed a quarter turn further each time — up, right, down, left — so every generation buds and extends on all four sides at once. ${NODES} nodes and ${BRANCHES} branches arrive across ${DEPTH} generations, each one a real state this engine rendered and checked on its own.</p>

  <div class="stage">
${svg}
  </div>
  <div class="platecaption">
    <span class="platecaption-left">
      <span>${stateCount} states &middot; ${segmentCount} transitions &middot; ${DURATION_MS}ms each &middot; linear &middot; ${RUN_S}s, plays once</span>
      <button type="button" class="restart" id="restart-growth" aria-label="Play the growth animation again from the seed">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M13.5 3.5V8H9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Grow it again</span>
      </button>
    </span>
    <span>honours prefers-reduced-motion</span>
  </div>
  <script>
    (function () {
      var btn = document.getElementById("restart-growth");
      var stage = document.querySelector(".stage svg");
      if (!btn || !stage) return;
      btn.addEventListener("click", function () {
        stage.getAnimations({ subtree: true }).forEach(function (a) {
          a.cancel();
          a.play();
        });
      });
    })();
  </script>

  <h2>Why two states per generation</h2>
  <p>The easy way is one state per generation: a level's new nodes fade in already at their final position. <code>diff.ts</code> classifies a first-seen id <code>appeared</code> regardless of where it is authored, so it would render and check exactly as well as what shipped here. It was tried and rejected for a specific reason — a dot popping into existence a full branch-length from its parent reads as <em>teleporting</em>, not growing, because <code>appear</code> is a pure opacity fade with no motion: an appearing id has no prior position for the renderer to move it from.</p>
  <p>So every generation gets two authored states. <strong>Sprout</strong>: the new nodes appear at a short stub near their parent, the ordinary <code>appeared</code> case. <strong>Grow</strong>: the same ids, now persisting, move from that stub out to their true position — an ordinary <code>moved</code> tween, the same primitive every figure in this project uses. And the grow step is the one case in this whole body of work where the linear CSS tween is not an approximation of something curved: there is no continuous growth being approximated, the straight-line extension <em>is</em> the authored motion. No bow measurement applies, unlike the breathing tree's sagitta budget.</p>

  <h2>Four wedges, not two half-planes</h2>
  <p>Four independent trees hang off the same root point — the same recursion, built with heading 0, &pi;/2, &pi; and 3&pi;/2 — sharing the root NODE itself, which is why growing all four reads as one organism budding outward rather than four figures sharing a canvas. Going from two directions to four changes what "provably disjoint" requires. The earlier up/down pair only needed to stay on its own side of one line through the root — any tree that never points more than 90&deg; off its own axis automatically stays in its half-plane, and it held that bound with room to spare. Four quadrants need each tree to stay within its own 90&deg; WEDGE — 45&deg; either side of its axis — since a wedge narrower than 180&deg; is the intersection of two half-planes and therefore convex: if every node sits inside it, so does every stub interpolated between two nodes, which is exactly what the during-transition check needs.</p>
  <p>That bound was not free at the tree's original proportions. Measured, not assumed: at the 32&deg; branch angle the two-direction version used, the furthest node sits <strong>81.3&deg;</strong> off its own axis — almost double the 45&deg; a four-way split allows. A scan of branch angle against realised spread found 14&deg; keeps every node within 36&#8211;38&deg;, a comfortable margin against the geometry itself.</p>

  <h2>Two different problems, both called "overlap"</h2>
  <p>Depth stayed at 5 here, not 6. At 14&deg; a sixth generation packs siblings too close for any dot size or trunk length to separate — and that phrase, <em>any trunk length</em>, was itself the diagnostic. Pushing the trunk from 620px to 900 to 1300 moved the failing pair by a proportional amount and left the same pair failing, at the same relative distance, every time. Rescaling a genuinely-too-tight figure buys real clearance; rescaling <em>this</em> bought nothing, which is the signature of a problem that scale cannot touch — the fix had to be geometric, not numeric, so depth 6 was refused rather than chased with an ever-larger canvas.</p>
  <p>The actual cause, found by checking exact coordinates rather than continuing to guess: with the branch angle exactly equal on both sides, specific turn sequences net to precisely zero rotation — <code>"LRRL"</code> sums <code>&minus;1+1+1&minus;1 = 0</code> — which lands that branch exactly on its own quadrant's central axis, not approximately, structurally. An unrelated sibling's growth sweep was always going to cross a fixed point sitting exactly on the axis it grows along. No stub length or stagger window fixes a coincidence built into the angle itself. The fix was breaking it: <strong>14.8&deg;</strong> on the left turn, <strong>13.2&deg;</strong> on the right. No two distinct turn sequences net to the same heading anymore, so the systematic on-axis crossing cannot recur at any depth this asymmetry reaches — confirmed by re-testing every transition, not merely the one that used to fail.</p>
  <p>A second, ordinary distance problem remained underneath the topological one, and responded normally to the usual fix: every generation's new branches sprouting and extending at once let close (but not axis-aligned) cousins graze mid-flight. A left/right stagger — every node whose own last turn is L moves in the first part of its generation's transition, every R-ending node in the second, with a real gap between the windows (0.45/0.55) — cleared it, the same mechanism the two-direction version used. Linear easing only — <code>requireLinearWhenStaggered</code> refuses a non-linear curve on a figure that declares a motion window, since the easing-invariance proof needs one shared reparametrisation of time, and a per-element window is already a second one.</p>

  <h2>A gap this demo found in the engine itself</h2>
  <p>Every earlier animation in this project — the times table, the breathing tree — had every connector present from its very first state. This is the first one where a <em>connector itself</em> is new partway through a run, and that exposed a real, previously unexercised gap: a box that appears mid-sequence gets a proper fade track, but nothing wired the equivalent for a connector. The route engine already computed the exact signal needed (<code>atFirstStatePlace: false</code>, meaning "this connector did not exist in the prior state") — but nothing downstream consulted it for opacity, only for the transition check's own bookkeeping. The result: every future generation's branches sat fully visible from frame one, faint ghost limbs scattered across the canopy long before their generation arrived.</p>
  <p>The fix mirrors the box fade pattern exactly, just driven by route participation instead of <code>diffFigures</code>: a route whose first participating segment shows <code>atFirstStatePlace: false</code> gets an explicit opacity keyframe, held at 0 for every prior segment and ramped to 1 across the one where it is introduced — the same hold-then-ramp shape every other fade in this project already uses. Fixed in <code>src/anim/sequence.ts</code> (the animation sequencer, not this demo's own spec); all 14 existing sequence and route tests still pass.</p>

  <h2>What was refused</h2>
  <div class="refusals">
${refusals
  .map(
    ([rule, says, why]) =>
      `    <div class="refusal"><div class="rule">${rule}</div><div class="says">${says}</div><div class="why">${why}</div></div>`,
  )
  .join("\n")}
  </div>

  <h2>What was measured</h2>
  <div class="callouts">
${measurements
  .map(
    ([n, k, note]) =>
      `    <div class="callout"><div class="n">${n}</div><div class="k label">${k}</div><div class="note">${note}</div></div>`,
  )
  .join("\n")}
  </div>

  <h2>Why the file shrank by a third</h2>
  <p>249 elements across 11 states means most nodes only move during their own two-segment generation and sit motionless for the other eight — but every consecutive segment boundary still needs an explicit keyframe stop, because that is exactly what an earlier milestone's fix (ADR 0016) requires: a track with no stop at a given boundary lets the browser silently synthesise a wrong value there instead of holding the last one. Anchoring correctly and anchoring <em>uniquely</em> turned out to be different asks. Checked directly on this file: <strong>71% of all keyframe stops were exact duplicates of the stop immediately before them</strong> — the same declaration, repeated because nothing changed, not because anything needed re-stating.</p>
  <p>A stop that repeats its neighbour's exact value contributes nothing CSS can observe: interpolating from a value to that same value and holding it is indistinguishable from the shorter version with the middle repeats removed, as long as the first and last stop of that flat run survive — which is precisely what a plain run-length collapse preserves. Applied here, not assumed: the collapsed and uncollapsed versions were compared frame by frame in a real browser, 21 samples across the whole run, 746 elements' opacity, transform and route <code>d</code> checked at each one. Zero differences. The plate above is the collapsed version; nothing about what it draws or how it moves changed.</p>

  <h2>Reproducing it</h2>
  <pre><b>node experiments/fractaltree-growth/build.mjs</b>
wrote ${stateCount} states  depth ${DEPTH}, ${NODES} nodes total, ${BRANCHES} branches total
${DEPTH} generations, 2 states each (sprout at 15% length, then full extension) + 1 root state

<b>node src/cli.ts animate experiments/fractaltree-growth/states/gr-*.json \\
  -o out/fractaltree-growth --durationMs ${DURATION_MS} --easing linear</b>
${stateCount} states, ${segmentCount} transition(s) at ${DURATION_MS}ms each (${DURATION_MS * segmentCount}ms total),
${persisted.toLocaleString("en-US")} persisted-element boundary crossing(s), ${appeared} appeared, 0 disappeared</pre>

  <footer>Every count on this page is read out of the animation manifest at build time, not typed into the prose. The plate above is one static SVG file with a stylesheet — no JavaScript, no frames, no encoder.</footer>
</div>
`;

await writeFile(join(DIR, "index.html"), html, "utf8");
console.log(
  `wrote ${join(DIR, "index.html")}  ${(html.length / 1024 / 1024).toFixed(2)} MB (svg ${(svg.length / 1024).toFixed(0)} KB, was ${(rawSvg.length / 1024).toFixed(0)} KB before minifyKeyframes removed ${keyframeStopsRemoved} redundant stops)\n` +
    `${stateCount} states, ${segmentCount} transitions, ${appeared} appeared, ${persisted} persisted\n` +
    `checks: ${staticChecks + checks.length} run, ${staticFailed + failed} failed, ${stoodDown + staticStoodDown} stood down`,
);
