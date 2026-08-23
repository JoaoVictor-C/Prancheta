/*
 * "No Point Inside" -- a Delaunay triangulation.
 *
 * The defining property: the circumcircle of every triangle is empty of all
 * other sites. That is also what makes the figure drawable here. Prancheta
 * refuses a connector that passes through a box it does not join, and the
 * empty-circumcircle property is exactly the guarantee that no site sits on
 * top of an edge it is not an endpoint of.
 *
 * Sites are placed by dart-throwing with a radius-dependent minimum spacing,
 * so the mesh is fine at the centre and coarse at the rim.
 */
import { poster, makeRamp, fade, nid } from "./lib.mjs";

const kids = [];
const cons = [];

const CX = 440;
const CY = 478;
const R = 332;
const VDOT = 5.4;

const ramp = makeRamp([
  [0.00, "#FFE7B4"],
  [0.28, "#F9A25F"],
  [0.52, "#E2607A"],
  [0.74, "#9C56A6"],
  [1.00, "#4A4394"],
]);

// --- sites: adaptive dart-throwing inside a disc ---------------------------
const spacingAt = (rad) => 21 + 46 * Math.pow(rad / R, 1.7);

let seed = 20260823;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const pts = [];
for (let attempt = 0; attempt < 26000 && pts.length < 260; attempt += 1) {
  const rad = R * Math.sqrt(rand());
  const th = rand() * 2 * Math.PI;
  const p = { x: CX + rad * Math.cos(th), y: CY + rad * Math.sin(th), r: rad };
  const need = spacingAt(rad);
  let ok = true;
  for (const q of pts) {
    if (Math.hypot(p.x - q.x, p.y - q.y) < Math.max(need, spacingAt(q.r))) { ok = false; break; }
  }
  if (ok) pts.push(p);
}

// --- Bowyer-Watson ---------------------------------------------------------
const all = pts.map((p) => ({ x: p.x, y: p.y }));
const S = all.length;
all.push({ x: CX - 40 * R, y: CY - 3 * R }, { x: CX, y: CY + 40 * R }, { x: CX + 40 * R, y: CY - 3 * R });

function inCircumcircle(p, a, b, c) {
  const ax = a.x - p.x, ay = a.y - p.y;
  const bx = b.x - p.x, by = b.y - p.y;
  const cx = c.x - p.x, cy = c.y - p.y;
  const det =
    (ax * ax + ay * ay) * (bx * cy - by * cx) -
    (bx * bx + by * by) * (ax * cy - ay * cx) +
    (cx * cx + cy * cy) * (ax * by - ay * bx);
  // Positive when a,b,c are counter-clockwise; normalise by orientation.
  const orient = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return orient > 0 ? det > 0 : det < 0;
}

let tris = [[S, S + 1, S + 2]];
for (let i = 0; i < S; i += 1) {
  const p = all[i];
  const bad = [];
  const kept = [];
  for (const t of tris) {
    if (inCircumcircle(p, all[t[0]], all[t[1]], all[t[2]])) bad.push(t);
    else kept.push(t);
  }
  const seen = new Map();
  for (const [a, b, c] of bad) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  tris = kept;
  for (const [key, n] of seen) {
    if (n !== 1) continue;
    const [u, v] = key.split(",").map(Number);
    tris.push([u, v, i]);
  }
}
tris = tris.filter((t) => t.every((i) => i < S));

// --- edges -----------------------------------------------------------------
const edges = new Map();
for (const [a, b, c] of tris) {
  for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const key = u < v ? `${u},${v}` : `${v},${u}`;
    edges.set(key, [Math.min(u, v), Math.max(u, v)]);
  }
}

// Sites first, so every connector has a block to leave from.
all.slice(0, S).forEach((p, i) => {
  const t = Math.min(1, Math.hypot(p.x - CX, p.y - CY) / R);
  kids.push({
    type: "block", id: `v${i}`, x: p.x - VDOT / 2, y: p.y - VDOT / 2,
    width: VDOT, height: VDOT, shape: "circle",
    fill: ramp(t), stroke: "transparent", strokeWidth: 0, padding: 0,
  });
});

let drawn = 0;
for (const [u, v] of edges.values()) {
  const a = all[u];
  const b = all[v];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const rad = Math.hypot(mx - CX, my - CY);
  // Trim the long slivers the convex hull always produces.
  if (Math.hypot(b.x - a.x, b.y - a.y) > 2.3 * spacingAt(rad)) continue;
  cons.push({
    from: `v${u}`, to: `v${v}`, arrow: "none",
    stroke: fade(ramp(Math.min(1, rad / R)), 0.5), strokeWidth: 0.9,
  });
  drawn += 1;
}

poster({
  kids,
  name: "delaunay",
  eyebrow: "D  E  L  A  U  N  A  Y",
  title: "No Point Inside",
  textTop: 906,
  caption:
    "Of all the ways to join a scatter of points into triangles, one is singular:\n" +
    "the triangulation where no circumcircle contains a fourth point.",
  footnote: `${S} sites  ·  ${drawn} edges  ·  spacing grows with radius`,
});

// The poster helper writes the spec; re-write it with the connectors attached.
import { readFileSync, writeFileSync } from "node:fs";
const spec = JSON.parse(readFileSync("out/delaunay.json", "utf-8"));
spec.root.connectors = cons;
writeFileSync("out/delaunay.json", JSON.stringify(spec, null, 2));
console.log(`  + ${cons.length} connectors`);
void nid;
