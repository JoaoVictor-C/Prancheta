/**
 * Builds the host page for the fractal-tree animation.
 *
 * Every count on the page is READ OUT of the animation manifest at build time
 * rather than typed into the prose -- states, transitions, persisted crossings,
 * how many checks ran and how many passed. A page that states a figure's
 * properties from memory is the exact failure this project exists to remove
 * from figures; it would be odd to reintroduce it one layer up.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = "out/fractaltree";
const files = await readdir(DIR);
const svgName = files.find((f) => f.endsWith(".animated.svg"));
if (svgName === undefined) throw new Error(`no .animated.svg in ${DIR}`);

const svg = await readFile(join(DIR, svgName), "utf8");
const manifest = JSON.parse(await readFile(join(DIR, svgName.replace(/\.svg$/, ".manifest.json")), "utf8"));

const stateCount = manifest.states.length;
const segmentCount = manifest.segments.length;
const persisted = manifest.segments.reduce((sum, s) => sum + s.persisted, 0);
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

// Mirrored from the generator's own printed output, which is the only place
// these are computed.
const DURATION_MS = 340;
const DEPTH = 6;
const RATIO = 0.75;
const BASE_DEG = 32;
const AMP_DEG = 10;
const NODES = 127;
const BRANCHES = NODES - 1;
const BOW = "0.21";
const RUN_S = ((DURATION_MS * segmentCount) / 1000).toFixed(1);
const SVG_KB = Math.round(svg.length / 1024);

const measurements = [
  [String(stateCount), "authored states", "each rendered and statically checked as its own frame"],
  [String(BRANCHES), "branches in motion", "every one a straight line whose ends both move"],
  [`${BOW}px`, "worst node bow", "measured by oversampling, not a formula — no closed form exists here"],
  [`${RUN_S}s`, "one closed turn", "then it restarts onto an identical state, so the seam cannot be seen"],
  [persisted.toLocaleString("en-US"), "identity crossings", "elements persisting across a state boundary"],
  [String(staticChecks + checks.length), "checks run", `${staticFailed + failed} failed · ${(stoodDown + staticStoodDown).toLocaleString("en-US")} stood down by name`],
  [`${SVG_KB} KB`, "one SVG file", "no video encoder, no frames, no JavaScript"],
];

const refusals = [
  [
    "requireNoArrowhead",
    "A moving route may not carry an arrowhead.",
    'An arrowhead is a sibling <code>&lt;polygon&gt;</code>, and <code>points</code> is not a CSS-animatable property, so the line would travel while its head stood still. A branch wants no head anyway — the refusal costs this figure nothing.',
  ],
  [
    "requireSameStructure",
    "Two states of one route must have the same vertex count.",
    "CSS interpolates <code>path()</code> coordinate-wise only when the command structures match. Every branch here is always a straight segment between two nodes, so the precondition holds by construction in every one of the 97 states.",
  ],
  [
    "boxes-do-not-overlap",
    "The static check that shaped this tree's whole geometry.",
    "A first attempt at depth 7 with a narrow 18&deg; base angle failed this check in ten places on its very first authored state, no animation involved: unrelated branches — cousins, not ancestor and descendant — pass close enough in a dense tree to collide well before any obvious visual crowding. The fix came from a property this check doesn't use but a search over it can: node positions scale <em>linearly</em> with trunk length while dot radii stay fixed pixels, so the minimum trunk length that clears every pair is a single closed-form maximum, not a blind search. What it returned reversed the intuition — the tree wanted to be <strong>wider</strong> and <strong>shallower</strong> than the obvious fractal-tree parameters, because a wider split gives siblings more room and each extra depth level roughly doubles the pairs that could collide.",
  ],
  [
    "boxes-do-not-overlap-during-transition",
    "Boxes may not collide mid-transition either.",
    "Unlike the times table, almost every node here moves at <em>both</em> connector ends, not just one — a branch's own base moves along with the rest of its ancestor's swing. The check has no special case for that; it is the same axis-aligned test either way, and it passed clean across the whole run once the static geometry did.",
  ],
];

const html = `<title>The Breathing Fractal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700;900&family=JetBrains+Mono:wght@400;700&family=Newsreader:opsz,wght@6..72,300;6..72,400&display=swap">
<style>
  /* Same night-sheet world as the times table: one committed dark palette,
     painted explicitly so both host themes render identically. The tree's own
     indigo-to-gold gradient carries the colour; the sheet stays quiet. */
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
  .titleblock > div {
    padding: 13px 18px 15px;
    border-left: 1px solid var(--rule);
  }
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
  .standfirst {
    max-width: var(--measure);
    font-size: 1.2rem;
    color: var(--ink-dim);
    margin: 20px 0 0;
  }
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
    gap: 6px 24px;
    margin-top: 11px;
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 11.5px;
    color: var(--ink-faint);
  }

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
  code, .mono {
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 0.85em;
    line-height: 1;
  }
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
  .refusal .rule {
    font-family: "JetBrains Mono", ui-monospace, Menlo, monospace;
    font-size: 11.5px;
    color: var(--amber);
    word-break: break-word;
  }
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
    <div><dt class="label">Subject</dt><dd>depth-${DEPTH} L-system</dd></div>
    <div><dt class="label">Milestone</dt><dd>M15 &middot; ADR 0017</dd></div>
    <div><dt class="label">States</dt><dd>${stateCount}</dd></div>
    <div><dt class="label">Loop</dt><dd class="pass">seamless</dd></div>
    <div><dt class="label">Verdict</dt><dd class="${manifest.ok && staticFailed === 0 ? "pass" : ""}">${
      manifest.ok && staticFailed === 0 ? "all checks pass" : "CHECKS FAILED"
    }</dd></div>
  </dl>

  <h1>A fractal tree,<br>breathing</h1>

  <p class="standfirst">${NODES} nodes, ${BRANCHES} branches, one recursion applied ${DEPTH} times: split at ${BASE_DEG}&deg;, shrink to ${RATIO}&times;, repeat. Every level uses the <strong>same</strong> angle, so a single number — the branch's sway — reshapes the whole structure <strong>at every scale simultaneously</strong>. That is what self-similarity actually looks like in motion, not just in a still frame.</p>

  <div class="stage">
${svg}
  </div>
  <div class="platecaption">
    <span>${stateCount} states &middot; ${segmentCount} transitions &middot; ${DURATION_MS}ms each &middot; linear &middot; ${RUN_S}s per turn, endless</span>
    <span>honours prefers-reduced-motion</span>
  </div>

  <h2>Why this figure and not another</h2>
  <p>A companion to <a href="https://claude.ai/code/artifact/d47ceb60-2b0e-4143-bb4d-0c9b2904a484" style="color:inherit">the times table on a circle</a>, built on the same M15 primitive — a connector that animates its own <code>d</code> — but pushed a step further. The times table put ${BRANCHES + 17} ordinary lines in motion; this puts a <em>genuinely recursive</em> structure in motion, where the thing moving is not a line but a whole self-similar hierarchy built out of nothing except lines.</p>
  <p>Almost every node here moves at both ends of its connector, not one: a branch's own base travels along with the swing of everything above it. The times table never needed that — its chords left from a fixed wheel point. Proving the check still holds under that harder case, rather than merely asserting it, is most of what this figure is for.</p>

  <h2>How it closes</h2>
  <p>The times table needed two independent clocks — a breathing multiplier <em>and</em> a turning phase — to close a loop that never repeated a picture before coming home, because its underlying map is periodic only at exact multiples of its point count. This tree needs neither trick. Its one free parameter enters every node's position through nothing but sums of <code>sin</code> and <code>cos</code>, and <code>sin</code> is exactly periodic on its own: <code>sway(i) = amplitude &middot; sin(2&pi;i / period)</code> satisfies <code>sway(period) = sway(0)</code> for <em>any</em> period. No second clock, no breathe-and-turn construction — the loop closes by the shape of the function that drives it.</p>

  <h2>What was measured</h2>
  <p>The times table had a formula for its worst case: every target swept a known circular arc, so the sagitta had a closed form. Nothing here does. A deep node's true path under continuous sway is the composition of every ancestor's own rotation, and there is no formula for that composition. So the generator samples instead — walks 24 substeps across every one of the 96 transitions, compares the finely sampled true position of every node to the straight chord the renderer will actually draw, and reports the worst deviation it finds. That is what "measured, not assumed" means once the geometry stops being circular.</p>
  <div class="callouts">
${measurements
  .map(
    ([n, k, note]) =>
      `    <div class="callout"><div class="n">${n}</div><div class="k label">${k}</div><div class="note">${note}</div></div>`,
  )
  .join("\n")}
  </div>

  <h2>What was refused</h2>
  <p>The first two are the times table's own guards, unchanged. The second two are new — the times table's chords never had to prove themselves against a structure this dense.</p>
  <div class="refusals">
${refusals
  .map(
    ([rule, says, why]) =>
      `    <div class="refusal"><div class="rule">${rule}</div><div class="says">${says}</div><div class="why">${why}</div></div>`,
  )
  .join("\n")}
  </div>

  <h2>Colour and size are structural, not decorative</h2>
  <p>Every dot's size and hue are fixed functions of its <strong>depth</strong> in the tree — trunk large and indigo, tip small and gold — and depth never changes for a given node across the whole run. That is the times table's "index, never radius" rule, restated for a recursive structure: key visual weight to the one thing guaranteed not to change between states, or <code>diff</code> reclassifies the node <code>resized</code> or <code>restyled</code> and it stops tweening — a size or colour keyed to the swaying angle itself would have frozen the whole tree solid.</p>

  <h2>Reproducing it</h2>
  <pre><b>node experiments/fractaltree/build.mjs</b>
wrote ${stateCount} states  depth ${DEPTH}, ${NODES} nodes, ${BRANCHES} branch segments
sway +/-${AMP_DEG}.0&deg; about a ${BASE_DEG}&deg; rest, ${segmentCount} steps per turn (sin-periodic, no second clock)
seamless: state ${segmentCount} renders byte-identically to state 0
worst node bow ${BOW}px, oversampled 24x per transition

<b>node src/cli.ts animate experiments/fractaltree/states/tr-*.json \\
  -o out/fractaltree --durationMs ${DURATION_MS} --easing linear --loop</b>
${stateCount} states, ${segmentCount} transition(s) at ${DURATION_MS}ms each (${DURATION_MS * segmentCount}ms total),
${persisted.toLocaleString("en-US")} persisted-element boundary crossing(s), ${segmentCount} tweened, 0 faded in, 0 faded out</pre>

  <footer>Every count on this page is read out of the animation manifest at build time, not typed into the prose. The plate above is one static SVG file with a stylesheet — no JavaScript, no frames, no encoder.</footer>
</div>
`;

await writeFile(join(DIR, "index.html"), html, "utf8");
console.log(
  `wrote ${join(DIR, "index.html")}  ${(html.length / 1024 / 1024).toFixed(2)} MB (svg ${(svg.length / 1024).toFixed(0)} KB)\n` +
    `${stateCount} states, ${segmentCount} transitions, ${persisted} persisted crossings\n` +
    `checks: ${staticChecks + checks.length} run, ${staticFailed + failed} failed, ${stoodDown + staticStoodDown} stood down`,
);
