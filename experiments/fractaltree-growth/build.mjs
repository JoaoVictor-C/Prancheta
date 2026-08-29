/**
 * "The fractal tree, growing": the same recursive binary tree as the
 * breathing demo, but authored as its own CONSTRUCTION rather than as a
 * finished figure that moves. One generation at a time, a level's branches
 * bud out of their parents and extend to full length, so what plays is the
 * recursion itself running -- not a still tree animated afterward.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS TWO STATES PER GENERATION, NOT ONE
 *
 * A generation's new nodes could simply fade in already at their final
 * position -- diff.ts classifies a first-seen id as `appeared` regardless of
 * where it is authored, so that would render and check exactly as well as
 * what is here. It was tried and rejected for a specific reason: a dot
 * popping into existence a full branch-length from its parent reads as
 * teleporting, not growing, because "appear" is a pure opacity fade with NO
 * motion -- an appearing id has no prior position for the renderer to move it
 * from.
 *
 * So each generation gets two authored states instead of one:
 *
 *   SPROUT -- the new nodes appear (fade in, the ordinary `appeared` case) at
 *             a SHORT STUB close to their parent, not at their final spot.
 *   GROW   -- the same ids, now persisting, MOVE from that stub out to their
 *             true position -- an ordinary `moved` tween, the same primitive
 *             every other figure in this project uses.
 *
 * Fade-in-at-a-stub, then slide-to-length, is what makes it read as a branch
 * growing rather than a dot appearing. And the GROW step is the one case in
 * this project where the linear CSS tween is not an approximation of
 * something curved -- there is no "true" continuous growth being approximated
 * here, the straight-line extension IS the authored motion, so no bow
 * measurement applies.
 * ---------------------------------------------------------------------------
 *
 * FOUR DIRECTIONS FROM ONE SHARED ROOT
 *
 * Four independent trees hang off the same root point, each the SAME
 * recursion pointed a quarter turn further: heading 0 (up), PI/2 (right), PI
 * (down), 3PI/2 (left). They share the actual root NODE, so growing all four
 * reads as one organism budding outward in every direction, not four figures
 * sharing a canvas.
 *
 * The up/down pair alone (an earlier version of this demo) only needed to
 * stay on its own side of one LINE through the root -- any tree that never
 * points more than 90 degrees off its own axis automatically stays in its
 * half-plane. Four quadrants is a stricter bound: each tree now has to stay
 * within its own 90-degree WEDGE (45 degrees either side of its axis), since
 * a wedge narrower than 180 degrees is the intersection of two half-planes
 * and therefore convex -- meaning if every NODE is within the wedge, so is
 * every stub interpolated between two nodes, which is exactly what the
 * during-transition check needs.
 *
 * That bound is NOT free at this tree's original proportions. Measured (not
 * assumed): at the 32-degree branch angle the up/down version used, the
 * furthest node sits 81.3 degrees off vertical -- almost double the 45-degree
 * budget a four-way split allows. The angle had to come down. A scan of
 * branch angle against realised spread found 14 degrees keeps every node
 * within 36-38 degrees of its own axis, a comfortable margin against the
 * geometry, not the arithmetic.
 *
 * DEPTH IS 5, NOT 6, for a related but distinct reason: an angle this narrow
 * packs generation-6 siblings too close together for any dot size or trunk
 * length to separate, at ANY overall scale -- rescaling the whole tree up
 * moves the clearance problem, it does not remove it, which is the tell that
 * a limit is topological rather than a distance to be bought back with a
 * bigger canvas. Five generations sit inside a scale that still renders
 * cleanly; a sixth was refused rather than chased with an ever-larger trunk.
 *
 * THE SYMMETRIC ANGLE ITSELF WAS A SECOND, SEPARATE BUG, and it was the
 * bigger one. `boxes-do-not-overlap-during-transition` kept failing on the
 * exact same handful of path pairs (an L-heavy path against an R-heavy one)
 * no matter how far the trunk length or dot size were pushed -- direct proof
 * the cause was not clearance at all. With angleL exactly equal to angleR,
 * specific L/R sequences net back to precisely the SAME heading (e.g. "LRRL"
 * sums to zero turn), which lands that branch's whole subtree exactly on top
 * of its own quadrant's central axis -- structurally, not by chance -- where
 * an unrelated sibling's growth sweep was always going to cross it. The fix
 * was not a bigger number, it was breaking the coincidence: angleL 14.8deg,
 * angleR 13.2deg. No two distinct turn sequences net to the same heading
 * anymore, so the systematic on-axis collision cannot recur at any depth this
 * asymmetry is carried to. Every transition passes clean with room to spare
 * (10px trunk dots, not the 7px this angle needed before the real cause was
 * found).
 *
 * Node ids are prefixed per direction (`u`, `r`, `d`, `l`) so the four
 * quadrants' otherwise-identical path strings never collide as ids; the root
 * is the one id genuinely shared, since it is the one point all four draw
 * from.
 * ---------------------------------------------------------------------------
 */

import { mkdir, writeFile } from "node:fs/promises";

// --- Tree shape --------------------------------------------------------------
// Narrower (14deg, not 32) BECAUSE of the four-way split, and asymmetric
// (14.8/13.2, not one shared angle) BECAUSE of the on-axis collision the
// symmetric version hit -- see the header for both. Depth 5, not 6 -- also
// the header.
const DEPTH = 5;
const RATIO = 0.75;
const ANGLE_L = (14.8 * Math.PI) / 180;
const ANGLE_R = (13.2 * Math.PI) / 180;
const L0 = 750;

// --- Canvas ------------------------------------------------------------------
// Each direction's reach, measured (not assumed) from the actual asymmetric
// geometry above. The along-axis reach sets both W and H, since two opposite
// directions' reach exceeds the perpendicular spread.
const REACH = 2255;
const PAD = 40;
const CX = PAD + REACH;
const ROOT_Y = PAD + REACH;
const W = CX + REACH + PAD;
const FOOT = 220;
const H = ROOT_Y + REACH + PAD + FOOT;

/** Every node's REST position for one quarter, `headingOffset` rotates the whole tree. */
function tree(headingOffset) {
  const nodes = new Map();
  nodes.set("", { x: CX, y: ROOT_Y, heading: headingOffset, depth: 0 });
  (function recurse(path, depth) {
    if (depth === DEPTH) return;
    const p = nodes.get(path);
    const len = L0 * Math.pow(RATIO, depth);
    for (const [turn, sign] of [
      ["L", -1],
      ["R", 1],
    ]) {
      const heading = p.heading + sign * (sign < 0 ? ANGLE_L : ANGLE_R);
      const x = p.x + len * Math.sin(heading);
      const y = p.y - len * Math.cos(heading);
      nodes.set(path + turn, { x, y, heading, depth: depth + 1 });
      recurse(path + turn, depth + 1);
    }
  })("", 0);
  return nodes;
}

const QUARTERS = [
  { key: "u", nodes: tree(0) },
  { key: "r", nodes: tree(Math.PI / 2) },
  { key: "d", nodes: tree(Math.PI) },
  { key: "l", nodes: tree((3 * Math.PI) / 2) },
];
const ORDER = [...QUARTERS[0].nodes.keys()];
for (const q of QUARTERS) {
  q.byLevel = Array.from({ length: DEPTH + 1 }, () => []);
  for (const path of ORDER) q.byLevel[q.nodes.get(path).depth].push(path);
}

/** How far out of its parent a just-sprouted node sits, as a fraction of its full branch length. */
const SPROUT_FRAC = 0.15;

/**
 * A generation's new branches all extending at once let opposite-hand cousins
 * cross mid-flight, a real but ordinary distance problem (unlike the on-axis
 * bug the header describes, which the angle asymmetry fixed on its own). The
 * stagger is keyed to the same bit the up/down version used: every node whose
 * OWN last turn is L moves in the first part of its generation's transition,
 * every R-ending node in the second, with a real gap between the two windows
 * (0.45/0.55, not 0.5/0.5). Linear easing only:
 * `requireLinearWhenStaggered` refuses a non-linear curve on a figure that
 * declares a motion window. The rule is per-PATH, so it applies identically
 * to all four quadrants -- each stripes itself, and never needs to stagger
 * against the others, since the four cones never meet.
 */
function growWindow(path) {
  return path.endsWith("R") ? { start: 0.55, end: 1 } : { start: 0, end: 0.45 };
}

function stubPosition(nodes, path) {
  const n = nodes.get(path);
  const p = nodes.get(path.slice(0, -1));
  return { x: p.x + (n.x - p.x) * SPROUT_FRAC, y: p.y + (n.y - p.y) * SPROUT_FRAC };
}

// --- Visual weight is a function of DEPTH only (see the breathing demo's own note) ---
const TRUNK_DOT = 8.5;
const LEAF_DOT = 2.1;
const dotSize = (depth) => TRUNK_DOT + (LEAF_DOT - TRUNK_DOT) * (depth / DEPTH);
const TRUNK_WIDTH = 3;
const LEAF_WIDTH = 0.7;
const strokeWidth = (depth) => TRUNK_WIDTH + (LEAF_WIDTH - TRUNK_WIDTH) * (depth / DEPTH);

function depthColour(depth, alpha = 1) {
  const t = depth / DEPTH;
  const hue = 262 + (42 - 262) * t;
  const sat = 58 + 22 * t;
  const light = 46 + 28 * t;
  return `hsl(${hue.toFixed(1)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${alpha})`;
}

/** Root is the one id genuinely shared between the four quarters. */
const nodeId = (key, path) => (path === "" ? "root" : `${key}${path}`);

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

// --- The scale along the foot of the sheet, reading generation number. ---
const SCALE_LEFT = CX - 260;
const SCALE_RIGHT = CX + 260;
const SCALE_Y = H - 90;
const MARKER = 14;
const scaleX = (gen) => SCALE_LEFT + ((SCALE_RIGHT - SCALE_LEFT) * gen) / DEPTH;

/**
 * One authored state. `frontier` is the deepest LEVEL present so far;
 * `phase` is "rest" (nothing new), "sprout" (this level's new nodes just
 * appeared, at their stub position) or "grown" (this level's new nodes are
 * at their true final position). markerGen is where the scale marker sits.
 */
function state(frontier, phase, markerGen) {
  const children = [
    caption("title", CX - 300, H - 170, 600, 52, "The fractal tree, growing in four directions"),
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
      x: Math.round(scaleX(markerGen) - MARKER / 2),
      y: SCALE_Y - MARKER / 2,
      width: MARKER,
      height: MARKER,
      padding: 0,
      fill: "#E8EAF0",
      stroke: "#E8EAF0",
      strokeWidth: 1,
    },
  ];
  for (let g = 0; g <= DEPTH; g += 1) {
    children.push(caption(`tick-${g}`, Math.round(scaleX(g) - 40), SCALE_Y + 18, 80, 48, `gen ${g}`));
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

  // Root is a single shared box, pushed once, before any quarter's loop.
  children.push({
    type: "block",
    id: "root",
    shape: "circle",
    x: Math.round(CX - dotSize(0) / 2),
    y: Math.round(ROOT_Y - dotSize(0) / 2),
    width: Math.round(dotSize(0) * 10) / 10,
    height: Math.round(dotSize(0) * 10) / 10,
    padding: 0,
    fill: depthColour(0),
    stroke: depthColour(0),
    strokeWidth: 1,
  });

  for (const q of QUARTERS) {
    for (let level = 1; level <= frontier; level += 1) {
      const isNewestLevel = level === frontier;
      const useStub = isNewestLevel && phase === "sprout";
      for (const path of q.byLevel[level]) {
        const n = q.nodes.get(path);
        const pos = useStub ? stubPosition(q.nodes, path) : n;
        const size = Math.round(dotSize(n.depth) * 10) / 10;
        children.push({
          type: "block",
          id: nodeId(q.key, path),
          shape: "circle",
          x: Math.round((pos.x - size / 2) * 100) / 100,
          y: Math.round((pos.y - size / 2) * 100) / 100,
          width: size,
          height: size,
          padding: 0,
          fill: depthColour(n.depth),
          stroke: depthColour(n.depth),
          strokeWidth: 1,
          ...(isNewestLevel ? { motion: growWindow(path) } : {}),
        });
        const parentPath = path.slice(0, -1);
        connectors.push({
          id: `seg-${q.key}${path}`,
          from: nodeId(q.key, parentPath),
          to: nodeId(q.key, path),
          arrow: "none",
          stroke: depthColour(n.depth, 0.85),
          strokeWidth: Math.round(strokeWidth(n.depth) * 10) / 10,
        });
      }
    }
  }

  return {
    version: 1,
    title: `The fractal tree, generation ${frontier} (${phase})`,
    canvas: {
      padding: 24,
      background: "#0A0C11",
      vignette: 0.42,
      constraints: { allowConnectorCrossing: true },
    },
    root: { type: "scene", layout: "absolute", width: W, height: H, children, connectors },
  };
}

// --- Build the state sequence: root, then sprout+grow per generation. ---
const states = [state(0, "rest", 0)];
for (let level = 1; level <= DEPTH; level += 1) {
  states.push(state(level, "sprout", level - 1 + 0.35));
  states.push(state(level, "grown", level));
}

await mkdir("experiments/fractaltree-growth/states", { recursive: true });
const pad = (i) => String(i).padStart(3, "0");
for (const [i, doc] of states.entries()) {
  await writeFile(`experiments/fractaltree-growth/states/gr-${pad(i)}.json`, JSON.stringify(doc, null, 2) + "\n");
}

const totalNodes = 1 + 4 * (ORDER.length - 1);
const totalBranches = 4 * (ORDER.length - 1);
console.log(
  `wrote ${states.length} states  depth ${DEPTH}, ${totalNodes} nodes total (4-way), ${totalBranches} branches total\n` +
    `${DEPTH} generations, 2 states each (sprout at ${(SPROUT_FRAC * 100).toFixed(0)}% length, then full extension) + 1 root state\n` +
    `canvas ${W}x${H}px  final generation: ${4 * QUARTERS[0].byLevel[DEPTH].length} new leaves (all four quarters)`,
);
