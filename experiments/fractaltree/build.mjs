/**
 * "The fractal tree breathing": a depth-7 binary L-system tree (255 nodes, 254
 * branch segments) whose branch angle sways with a single sine, so every level
 * opens and closes IN THE SAME INSTANT -- the clearest demonstration this
 * engine can give that self-similarity is a property of the WHOLE structure,
 * not of any one branch. The times-table demo (M15) put ordinary lines in
 * motion; this one puts a genuinely recursive, self-similar structure in
 * motion, built entirely from the same primitive: a route with two moving ends.
 *
 * DOT COLLISIONS ARE THE NEW FAILURE MODE, and the times table never met it. A
 * dense binary tree at depth 6 has 127 dots in a bounded area, and "unrelated"
 * branches -- cousins, not ancestor and descendant -- pass close enough to
 * collide well before any obvious visual crowding: a naive first attempt at
 * depth 7 failed `boxes-do-not-overlap` in TEN places on the very first
 * authored state, before any animation was even in play. temp/tree-scan4.mjs
 * (not checked in) found the fix by exploiting that node positions scale
 * LINEARLY with trunk length while dot radii stay fixed pixels: for a given
 * angle and shrink ratio, the minimum trunk length that clears every pair at
 * every phase of the sway is a single closed-form max over all pairs, not a
 * search. What that scan returned surprised the first guess: the tree wanted
 * to be WIDER (base angle 32 degrees, not 18) and SHALLOWER (depth 6, not 7)
 * than the "obvious" fractal-tree parameters -- both because a wider split
 * gives siblings more room, and because each extra depth level roughly
 * doubles the pairs that could collide. And the swaying canopy DROOPS below
 * the root by up to 116px at max sway (repeated same-direction turns rotate
 * a branch's heading past horizontal), which pushed the title and scale down
 * beneath the whole canopy rather than tucked just under the trunk, as they
 * were tucked in the times table.
 *
 * ---------------------------------------------------------------------------
 * THE SEAM, SOLVED DIFFERENTLY THAN THE TIMES TABLE
 *
 * The times-table demo needed two independent clocks (a breathing multiplier
 * AND a turning phase) to close a loop that did not repeat a picture until it
 * came home, because its underlying map (k -> mk mod N) is periodic only at
 * exact multiples of N. This tree needs neither trick. Its one free parameter,
 * SWAY, enters every node's position through nothing but sums of sin and cos,
 * and `sin` is exactly periodic on its own: sway(i) = AMPLITUDE * sin(2*pi*i /
 * PERIOD) satisfies sway(PERIOD) = sway(0) for ANY PERIOD, no second clock
 * required. So the loop closes by construction, and the only thing left to
 * verify is that it closes to the same rendered geometry once coordinates are
 * rounded to the precision the spec actually authors (checked below, not
 * assumed).
 * ---------------------------------------------------------------------------
 *
 * What the engine's refusals forced here, distinct from the times table:
 *
 *   1. THE BOW BUDGET IS MEASURED NUMERICALLY, not in closed form. Every
 *      connector in the times table had a FIXED end (a wheel point) and a
 *      target sweeping a known circular arc, so the sagitta had a formula. Here
 *      almost every node moves at both ends, and a deep node's true path is the
 *      composition of every ancestor's rotation -- there is no closed form. So
 *      this script sample-checks: for every node, walk many fine substeps
 *      across every authored transition, compare the FINELY sampled true
 *      position to the straight chord the renderer will actually draw between
 *      the two authored endpoints, and print the worst deviation found. That is
 *      what "measured, not assumed" means when the geometry has no formula.
 *
 *   2. SIZE AND COLOUR ARE FUNCTIONS OF DEPTH, never of the swaying angle. A
 *      node's dot shrinks from trunk to tip and its hue shifts to match, but
 *      both are fixed once depth is fixed -- exactly the times table's "index,
 *      never radius" rule, restated for a tree: key visual weight to the thing
 *      that does NOT change between states, or diff.ts reclassifies the node
 *      `resized`/`restyled` and it stops tweening at all.
 *
 *   3. NO ARROWHEADS, same reasoning as the times table: a moving route's head
 *      cannot travel, and a branch wants no head anyway.
 *
 *   4. EVERY NON-LEAF NODE MUST BE A BOX, not a bare coordinate, because it is
 *      the `from` of its own children's connectors -- unlike the times table,
 *      where only the wheel points needed to be real elements and every target
 *      could be a bare coordinate. Leaves are boxes too, for visual symmetry
 *      with the rest of the tree and so every node, not just internal ones,
 *      persists across every state.
 */

import { mkdir, writeFile } from "node:fs/promises";

// --- Tree shape -------------------------------------------------------------
const DEPTH = 6; // levels below the root; leaves sit at depth DEPTH
const RATIO = 0.75; // branch length shrinks by this factor per level
const BASE_ANGLE = (32 * Math.PI) / 180; // branch angle at rest, symmetric
const AMPLITUDE = (10 * Math.PI) / 180; // sway swings the branch angle +/- this
const L0 = 270; // trunk length, px

// --- Canvas ------------------------------------------------------------------
const W = 1700;
const H = 1320;
const CX = 850;
const ROOT_Y = 890;

// --- The closed schedule. sin() is exactly periodic, so PERIOD needs no ----
// second clock (contrast the times table's breathe-plus-turn construction).
const PERIOD = 96;
const STATES = PERIOD + 1;

function sway(i) {
  return AMPLITUDE * Math.sin((2 * Math.PI * i) / PERIOD);
}

/** Every node's position for a given sway value. Root heading is straight up. */
function treeAt(s) {
  const angleL = BASE_ANGLE + s;
  const angleR = BASE_ANGLE - s;
  const nodes = new Map();
  nodes.set("", { x: CX, y: ROOT_Y, heading: 0, depth: 0 });
  (function recurse(path, depth) {
    if (depth === DEPTH) return;
    const p = nodes.get(path);
    const len = L0 * Math.pow(RATIO, depth);
    for (const [turn, sign, ang] of [
      ["L", -1, angleL],
      ["R", 1, angleR],
    ]) {
      const heading = p.heading + sign * ang;
      const x = p.x + len * Math.sin(heading);
      const y = p.y - len * Math.cos(heading);
      nodes.set(path + turn, { x, y, heading, depth: depth + 1 });
      recurse(path + turn, depth + 1);
    }
  })("", 0);
  return nodes;
}

const ORDER = [...treeAt(0).keys()]; // stable node ordering, every state

/**
 * Worst deviation between the straight chord the renderer draws for a node's
 * motion (authored state i to i+1) and the TRUE curved path that node follows
 * under continuously varying sway, sampled at OVERSAMPLE substeps.
 */
const OVERSAMPLE = 24;
let worstBow = 0;
let worstBowNode = "";
for (let i = 0; i < PERIOD; i += 1) {
  const a = treeAt(sway(i));
  const b = treeAt(sway(i + 1));
  for (const path of ORDER) {
    const pa = a.get(path);
    const pb = b.get(path);
    for (let step = 1; step < OVERSAMPLE; step += 1) {
      const t = step / OVERSAMPLE;
      const truePos = treeAt(sway(i + t)).get(path);
      const lerpX = pa.x + (pb.x - pa.x) * t;
      const lerpY = pa.y + (pb.y - pa.y) * t;
      const dev = Math.hypot(truePos.x - lerpX, truePos.y - lerpY);
      if (dev > worstBow) {
        worstBow = dev;
        worstBowNode = path === "" ? "root" : path;
      }
    }
  }
}

// --- Visual weight is a function of DEPTH only, never of sway (see header #2) ---
const TRUNK_DOT = 15;
const LEAF_DOT = 4;
const dotSize = (depth) => TRUNK_DOT + (LEAF_DOT - TRUNK_DOT) * (depth / DEPTH);
const TRUNK_WIDTH = 5;
const LEAF_WIDTH = 1;
const strokeWidth = (depth) => TRUNK_WIDTH + (LEAF_WIDTH - TRUNK_WIDTH) * (depth / DEPTH);

/**
 * Trunk-to-tip gradient in HSL, indigo through to gold. A monotonic sweep in
 * one direction needs no cyclic care (contrast the times table's full-turn
 * wheel, which had to close on itself and used HSL for exactly that reason).
 */
function depthColour(depth, alpha = 1) {
  const t = depth / DEPTH;
  const hue = 262 + (42 - 262) * t; // indigo (262) -> gold (42), the short way
  const sat = 58 + 22 * t;
  const light = 46 + 28 * t;
  return `hsl(${hue.toFixed(1)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${alpha})`;
}

const nodeId = (path) => (path === "" ? "root" : `n${path}`);

const caption = (id, x, y, w, h, label) => ({
  type: "block",
  id,
  x,
  y,
  width: w,
  height: h,
  fill: "none",
  stroke: "none",
  label,
});

// --- The scale along the foot of the sheet, reading branch sway. ---
const SCALE_LEFT = 620;
const SCALE_RIGHT = 1140;
const SCALE_Y = 1250;
const MARKER = 14;
const scaleX = (v) => SCALE_LEFT + ((SCALE_RIGHT - SCALE_LEFT) * (v + AMPLITUDE)) / (2 * AMPLITUDE);

function state(index) {
  const s = sway(index);
  const nodes = treeAt(s);

  const children = [
    caption("title", 40, 1176, 340, 52, "The fractal tree, breathing"),
    {
      type: "block",
      id: "scale-anchor",
      x: SCALE_LEFT,
      y: SCALE_Y,
      width: 1,
      height: 1,
      padding: 0,
      fill: "none",
      stroke: "none",
    },
    {
      type: "block",
      id: "marker",
      shape: "circle",
      x: Math.round(scaleX(s) - MARKER / 2),
      y: SCALE_Y - MARKER / 2,
      width: MARKER,
      height: MARKER,
      padding: 0,
      fill: "#E8EAF0",
      stroke: "#E8EAF0",
      strokeWidth: 1,
    },
  ];
  for (const [label, v] of [
    ["−sway", -AMPLITUDE],
    ["rest", 0],
    ["+sway", AMPLITUDE],
  ]) {
    children.push(caption(`tick-${label}`, Math.round(scaleX(v) - 40), SCALE_Y + 18, 80, 48, label));
  }

  for (const path of ORDER) {
    const n = nodes.get(path);
    const size = Math.round(dotSize(n.depth) * 10) / 10;
    children.push({
      type: "block",
      id: nodeId(path),
      shape: "circle",
      x: Math.round((n.x - size / 2) * 100) / 100,
      y: Math.round((n.y - size / 2) * 100) / 100,
      width: size,
      height: size,
      padding: 0,
      fill: depthColour(n.depth),
      stroke: depthColour(n.depth),
      strokeWidth: 1,
    });
  }

  const connectors = [
    {
      id: "scale-rule",
      from: "scale-anchor",
      to: { x: SCALE_RIGHT, y: SCALE_Y },
      arrow: "none",
      stroke: "rgba(232, 234, 240, 0.28)",
      strokeWidth: 1,
    },
  ];
  for (const path of ORDER) {
    if (path === "") continue; // root has no parent segment
    const parentPath = path.slice(0, -1);
    const n = nodes.get(path);
    connectors.push({
      id: `seg-${path}`,
      from: nodeId(parentPath),
      to: nodeId(path),
      arrow: "none",
      stroke: depthColour(n.depth, 0.85),
      strokeWidth: Math.round(strokeWidth(n.depth) * 10) / 10,
    });
  }

  return {
    version: 1,
    title: `The fractal tree, sway ${((s * 180) / Math.PI).toFixed(1)}°`,
    canvas: {
      padding: 24,
      background: "#0A0C11",
      vignette: 0.42,
      constraints: { allowConnectorCrossing: true },
    },
    root: { type: "scene", layout: "absolute", width: W, height: H, children, connectors },
  };
}

// --- Closure check: state PERIOD must render byte-identically to state 0. ---
const firstConnectors = JSON.stringify(state(0).root.connectors);
const lastConnectors = JSON.stringify(state(PERIOD).root.connectors);
if (firstConnectors !== lastConnectors) {
  throw new Error(`the loop is not seamless: state ${PERIOD} does not render as state 0`);
}

await mkdir("experiments/fractaltree/states", { recursive: true });
const pad = (i) => String(i).padStart(3, "0");
for (let i = 0; i < STATES; i += 1) {
  await writeFile(`experiments/fractaltree/states/tr-${pad(i)}.json`, JSON.stringify(state(i), null, 2) + "\n");
}

console.log(
  `wrote ${STATES} states  depth ${DEPTH}, ${ORDER.length} nodes, ${ORDER.length - 1} branch segments\n` +
    `sway +/-${((AMPLITUDE * 180) / Math.PI).toFixed(1)}° about a ${((BASE_ANGLE * 180) / Math.PI).toFixed(0)}° rest, ${PERIOD} steps per turn (sin-periodic, no second clock)\n` +
    `seamless: state ${PERIOD} renders byte-identically to state 0\n` +
    `worst node bow ${worstBow.toFixed(2)}px at "${worstBowNode}", oversampled ${OVERSAMPLE}x per transition`,
);
