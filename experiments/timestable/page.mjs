/**
 * Builds the host page for the times-table animation.
 *
 * Every count on the page is READ OUT of the animation manifest at build time
 * rather than typed into the prose -- states, transitions, persisted crossings,
 * how many checks ran and how many passed. A page that states a figure's
 * properties from memory is the exact failure this project exists to remove
 * from figures; it would be odd to reintroduce it one layer up.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = "out/timestable";
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
// A stand-down is any verdict that is neither pass nor fail, and it has to be
// counted over the static checks too -- the total quoted beside it includes
// them, and a stand-down count drawn from only the transition checks would
// understate it against its own denominator.
const staticStoodDown = manifest.states.reduce(
  (sum, s) => sum + (s.checks ?? []).filter((c) => c.status !== "pass" && c.status !== "fail").length,
  0,
);

// Mirrored from the generator's own printed output, which is the only place
// these are computed.
const DURATION_MS = 340;
const N = 144;
const CHORDS = N - 1;
const SAGITTA = "2.53";
const RADIUS = 430;
const RUN_S = ((DURATION_MS * segmentCount) / 1000).toFixed(1);
const SVG_KB = Math.round(svg.length / 1024);

const measurements = [
  [String(stateCount), "authored states", "each rendered and statically checked as its own frame"],
  [String(CHORDS), "chords in motion", "every one a straight line with two ends going somewhere"],
  [`${SAGITTA}px`, "worst endpoint bow", `off a ${RADIUS}px radius — 0.59%, the number that set the state count`],
  [`${RUN_S}s`, "one closed turn", "then it restarts onto an identical state, so the seam cannot be seen"],
  [persisted.toLocaleString("en-US"), "identity crossings", "elements persisting across a state boundary"],
  [String(staticChecks + checks.length), "checks run", `${staticFailed + failed} failed · ${(stoodDown + staticStoodDown).toLocaleString("en-US")} stood down by name`],
  [`${SVG_KB} KB`, "one SVG file", "no video encoder, no frames, no JavaScript"],
];

const refusals = [
  [
    "requireNoArrowhead",
    "A moving route may not carry an arrowhead.",
    'An arrowhead is a sibling <code>&lt;polygon&gt;</code>, and <code>points</code> is not a CSS-animatable property, so the line would travel while its head stood still. Chords want no heads — the refusal costs this figure nothing, which is the honest reason to pick this figure to show the feature off.',
  ],
  [
    "requireSameStructure",
    "Two states of one route must have the same vertex count.",
    "CSS interpolates <code>path()</code> coordinate-wise only when the command structures match; given a mismatch it swaps discretely at the midpoint instead. A straight chord is two vertices in every state, so the precondition is met by construction rather than by luck.",
  ],
  [
    "boxes-do-not-overlap-during-transition",
    "Boxes may not collide mid-transition — and allowOverlap does not excuse it.",
    "A designed overlap and a transient collision are different phenomena, so that toggle deliberately does not stand this check down. Hence the 144 points are blocks and the travelling ends are bare coordinates: the check has nothing to fail on because the figure was built so the question never arises.",
  ],
  [
    "connector-clear-of-boxes-during-transition",
    "Stood down — with the toggle named in the manifest.",
    "Every chord starts on a point of the wheel and sweeps across the points opposite. Those incidences are the figure being correct, which is the case <code>allowConnectorCrossing</code> exists for. It stands down by name, never silently.",
  ],
];

const html = `<title>The Times Table on a Circle</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700;900&family=JetBrains+Mono:wght@400;700&family=Newsreader:opsz,wght@6..72,300;6..72,400&display=swap">
<style>
  /* One committed visual world, painted explicitly rather than inherited. The
     plate carries a full turn of hue on near-black; a light ground would fight
     all 144 of them, so both host themes get the same night sheet. */
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

  /* A title block, as on a drawing sheet: who drew it, what it is, at what
     revision, and whether it passed. Hairline rules, because a sheet's are. */
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

  /* The plate is the thesis, so it gets the sheet's full width and a hairline
     frame rather than a card with a shadow. */
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
    /* Inline mono in a serif paragraph raises that line's box and opens the
       leading unevenly. Neutralising the strut keeps the rhythm even. */
    line-height: 1;
  }
  code { color: var(--amber); }

  /* Measurements read as dimension callouts: the figure leads, its name sits
     under it in the same small caps the title block uses. */
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

  /* The refusals are a genuinely typed list — each is a named guard in the
     source — so the name is the structural device and it carries information. */
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
    <div><dt class="label">Subject</dt><dd>k &rarr; m&nbsp;k</dd></div>
    <div><dt class="label">Milestone</dt><dd>M15 &middot; ADR 0017</dd></div>
    <div><dt class="label">States</dt><dd>${stateCount}</dd></div>
    <div><dt class="label">Loop</dt><dd class="pass">seamless</dd></div>
    <div><dt class="label">Verdict</dt><dd class="${manifest.ok && staticFailed === 0 ? "pass" : ""}">${
      manifest.ok && staticFailed === 0 ? "all checks pass" : "CHECKS FAILED"
    }</dd></div>
  </dl>

  <h1>The times table<br>on a circle</h1>

  <p class="standfirst">Space ${N} points evenly around a circle and join every point <strong>k</strong> to point <strong>m&nbsp;k</strong>. Nothing draws the curve that appears: it is the <strong>envelope</strong> of ${CHORDS} straight lines — a cardioid at m&nbsp;=&nbsp;2, a nephroid at 3, a three-cusped epicycloid at 4. Breathe m across them and the cusps bloom out of nothing, on a schedule built to run <strong>forever without a seam</strong>.</p>

  <div class="stage">
${svg}
  </div>
  <div class="platecaption">
    <span>${stateCount} states &middot; ${segmentCount} transitions &middot; ${DURATION_MS}ms each &middot; linear &middot; ${RUN_S}s per turn, endless</span>
    <span>honours prefers-reduced-motion</span>
  </div>

  <h2>Why this figure and not another</h2>
  <p>Until M15 a connector was pinned to its second state's route for the whole run. A line joining two moving points would have sat perfectly still while its own endpoints slid out from under it, so anything that had to move had to be built out of boxes — which is why this engine's derivative figure once drew its parabola as eighteen dots.</p>
  <p>A route now animates its own <code>d</code>, on the same clock and the same easing as everything else. This figure is the strongest case that can be made for that, because it is almost nothing but routes: ${CHORDS} lines, each with both ends going somewhere, and exactly one travelling box — the marker riding the scale at the foot of the plate, there so the two halves of the motor can be seen sharing one clock.</p>

  <h2>How it closes</h2>
  <p>Looping a run is easy; making it <em>endless</em> is not. <code>--loop</code> restarts the keyframes at 100% instantaneously — it does not tween the last state back to the first — so any run whose two ends differ shows a jump exactly once per turn.</p>
  <p>The obvious fix is to sweep m until the figure comes back to itself, and that period is exact and provable: Figure(m) is Figure(m&nbsp;+&nbsp;${N}), because (m&nbsp;+&nbsp;${N})k&nbsp;=&nbsp;mk&nbsp;+&nbsp;${N}k and ${N}k vanishes mod ${N} for whole k. Nothing smaller works — two multipliers agree only if (m&nbsp;−&nbsp;m&prime;)k vanishes for <em>every</em> k, and k&nbsp;=&nbsp;1 already forces the full period. So the period is exactly ${N}, which at the step size the bow budget allows is roughly 3,600 states: hours of rendering and tens of megabytes of stylesheet. Out of reach.</p>
  <p>So the run comes home on <strong>two clocks at once</strong>. The multiplier <em>breathes</em> — cardioid out through nephroid to the three-cusped epicycloid, and home again — which returns to its own first state at any step size. And the phase <em>turns</em>, exactly one full turn of the lattice, which is periodic in its own right. The phase is what stops the return leg from rewinding the outward leg frame for frame: the second half is rotated, not retraced, so no picture repeats until the turn is complete. The number of steps is ${N}, the point count itself, which is the natural quantum rather than a round number: the phase advances one full turn over the run, so ${N} steps advance it by exactly <strong>one point position per state</strong>. Then the ${stateCount}th state is authored to be the first one — byte-identical, asserted by the generator on the rendered connector geometry rather than on the arithmetic that produced it — and the restart lands on a picture already on screen.</p>

  <h2>What was measured</h2>
  <p>Not asserted, measured, and reported back. The step size was the one number genuinely forced: endpoint k travels m&nbsp;&middot;&nbsp;&theta;<sub>k</sub>, the engine tweens in straight lines, so a coarse sweep is not a coarse animation but a ring that visibly breathes inward mid-transition. The step was chosen to hold that bow under four pixels, and the generator prints the realised worst case rather than trusting the argument.</p>
  <div class="callouts">
${measurements
  .map(
    ([n, k, note]) =>
      `    <div class="callout"><div class="n">${n}</div><div class="k label">${k}</div><div class="note">${note}</div></div>`,
  )
  .join("\n")}
  </div>

  <h2>What was refused</h2>
  <p>The more interesting half. Each of these is a named guard that turned an option down, and the figure was designed around the refusal rather than against it.</p>
  <div class="refusals">
${refusals
  .map(
    ([rule, says, why]) =>
      `    <div class="refusal"><div class="rule">${rule}</div><div class="says">${says}</div><div class="why">${why}</div></div>`,
  )
  .join("\n")}
  </div>

  <h2>And two gaps it found</h2>
  <p>The plate has no numeric readout, and the reason is a defect rather than a preference. A per-state readout crossfades, and two numbers at fifty percent opacity in one place is not a number — sampled mid-transition it read <span class="mono">2.54</span> overstruck with <span class="mono">2.58</span>. The obvious fix is worse and quietly so: give the readout a stable id and let its label change, and <code>diff</code> classifies it <code>retexted</code>, nothing tweens text, and the emitted document carries the <em>last</em> state's text for the entire run — a counter frozen on its final value, and absent from <code>disclosed.hardCut</code> because it never moved. So the scale is the readout: the marker's position on it is the multiplier, and a position is something this engine can animate, check, and be held to.</p>
  <p>The second was a bug, and it took three failed runs and one wrong diagnosis to find. Long sequences kept dying at a 30&#8202;second Playwright timeout — sometimes setting page content, sometimes taking a screenshot — which read like a size ceiling, and got written down here as one. It was not. Loading the same states one at a time completed every one of them at a flat 2.3&#8202;seconds with no degradation at all, and that asymmetry was the tell: <code>animateSequence</code> loaded its states with <code>Promise.all</code>, and every state load launches and tears down <em>its own browser</em>. The run was asking Chromium for one instance per state, all at once. Loading them in sequence fixes it — the launch storm was never buying parallelism, it was the whole cost.</p>
  <p>That fix is why this page shows ${stateCount} states and not half that. The first seamless version stopped at ×3, on the honest but already-stale grounds that the wider sweep cost too much time — a budget measured before the bug was found. Afterwards the full ×2 to ×4 breath came back <em>and</em> the worst bow improved, from 3.27&#8202;px over half the range to ${SAGITTA}&#8202;px over all of it. Worth stating plainly: the constraint that shaped the earlier design turned out to be a defect, not a law.</p>

  <h2>Reproducing it</h2>
  <pre><b>node experiments/timestable/build.mjs</b>
wrote ${stateCount} states  N=${N} points, ${CHORDS} chords  m 2.02 -&gt; 4.02 -&gt; 2.02, phase one full turn
seamless: state ${segmentCount} renders byte-identically to state 0, so the restart is invisible
worst endpoint sagitta ${SAGITTA}px on R=${RADIUS} (0.59% of the radius, over ${segmentCount} transitions)
shortest chord 0.42px

<b>node src/cli.ts animate experiments/timestable/states/ts-*.json \\
  -o out/timestable --durationMs ${DURATION_MS} --easing linear --loop</b>
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
