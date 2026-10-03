/**
 * projectile: a launch with speed v₀ at angle θ (0 = horizontal) from height
 * h₀. The trajectory is sampled from the solution; the top, the range and the
 * flight time are computed; velocity arrows at the launch, the top and the
 * landing share one scale, so the horizontal component is visibly the same
 * at all three.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveProjectile } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, RUST, SLOPE, SOFT, arcPts, arrow, arrowLabel, dimension, dimensionH, eq, hatchLine, name, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "speed", path);
  const angle = v.requiredNumber(raw, "angle", path);
  if (angle < 0 || angle > 85) throw new SpecError(`${path}.angle must be from 0 (horizontal) to 85 degrees, got ${angle}`);
  if (raw.components === true && angle > 70) throw new SpecError(`${path}.components: above 70° the horizontal component is too short to draw beside its angle`);
  const h = v.optionalNumber(raw, "height", path);
  if (h !== undefined && h < 0) throw new SpecError(`${path}.height must not be negative, got ${h}`);
  if (angle === 0 && !(h !== undefined && h > 0)) throw new SpecError(`${path}: a horizontal launch needs a height to fall from`);
  v.optionalBoolean(raw, "components", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const v0 = input.speed as number;
  const theta = input.angle as number;
  const h0 = (input.height as number | undefined) ?? 0;
  const components = input.components === true && theta > 0;
  const s = solveProjectile(v0, theta, g, h0);
  // One length scale for both axes (the path's true shape), one scale for velocities.
  const scale = Math.min(520 / s.range, 240 / s.H);
  // Velocities on their own scale, sized from the path: the fastest arrow (at the landing)
  // is at most 70 px and a fifth of the range, so arrows annotate the path and do not swamp it.
  const vLand = Math.hypot(s.vx, s.vy0 - g * s.tFlight);
  // ...but v₀ itself never under 40 px, so the launch reads; the others stay in proportion.
  const kv = Math.max(40 / v0, Math.min(70 / vLand, (0.22 * s.range * scale) / vLand));
  const left = M + (h0 > 0 ? 110 : 60);
  const top = M + 60;
  const ground = top + s.H * scale;
  const X = (x: number): number => left + x * scale;
  const Y = (y: number): number => ground - y * scale;
  const launch = { x: X(0), y: Y(h0) };
  const apexT = s.tUp;
  const hasApex = theta > 0 && apexT > 1e-9 && apexT < s.tFlight;
  const end = s.at(s.tFlight);
  const landing = { x: X(end.x), y: Y(0) };
  const vEnd = { x: end.vx * kv, y: -end.vy * kv };
  const lines: PanelLineInput[] = [];
  if (answers) {
    if (theta > 0) {
      lines.push({ text: `${eq("v_{0x}", s.vx, "m/s", locale).replace(/^v_\{0x\} /, "v_{0x} = v_{0}·cos θ ")}   ·   ${eq("v_{0y}", s.vy0, "m/s", locale).replace(/^v_\{0y\} /, "v_{0y} = v_{0}·sen θ ")}` });
      lines.push({ text: `${eq("t_{s}", s.tUp, "s", locale).replace(/^t_\{s\} /, "t_{subida} = v_{0y}/g ")}   ·   ${eq("H", s.H, "m", locale).replace(/^H /, h0 > 0 ? "H = h_{0} + v_{0y}²/2g " : "H = v_{0y}²/2g ")}` });
    }
    lines.push({ text: theta > 0 ? eq("t", s.tFlight, "s", locale).replace(/^t /, "tempo de voo: t ") : eq("t", s.tFlight, "s", locale).replace(/^t /, "queda: t = √(2h_{0}/g) ") });
    lines.push({ text: eq("A", s.range, "m", locale).replace(/^A /, "alcance: A = v_{x}·t ") });
    lines.push({ text: eq("v", Math.hypot(end.vx, end.vy), "m/s", locale).replace(/^v /, "ao chegar ao solo: v = √(v_{x}² + v_{y}²) ") });
  }
  // The decomposition of v₀, when asked, is a small inset to the right: at the launch its
  // components would lie on the ground and on the path.
  const half = Math.sin((theta * Math.PI) / 360);
  const dArc = 15;
  // ...and beyond v₀'s arrow, so the label is not read as v₀'s.
  const arcR = theta > 0 ? Math.max(30, Math.ceil((dArc * (1 - half)) / half) + 6, Math.ceil(v0 * kv) + 12) : 0;
  const insetArcR = theta > 0 ? Math.max(30, Math.ceil((dArc * (1 - half)) / half) + 6) : 0;
  const insetLen = components ? Math.max(110, (insetArcR + dArc + 26) / Math.cos((theta * Math.PI) / 180)) : 0;
  const insetW = components ? insetLen * Math.cos((theta * Math.PI) / 180) + 120 : 0;
  const figRight = Math.max(landing.x + Math.max(0, vEnd.x) + 90, X(s.range) + 60);
  const W0 = Math.ceil(figRight + insetW + M);
  const insetH = components ? insetLen * Math.sin((theta * Math.PI) / 180) + 90 : 0;
  const figH = Math.max(ground + 60, landing.y + vEnd.y + 40, top + insetH);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  const v0Tip = { x: launch.x + s.vx * kv, y: launch.y - s.vy0 * kv };
  const v0Len = v0 * kv;
  const top0 = s.at(apexT);
  const apex = { x: X(top0.x), y: Y(top0.y) };
  const vxLen = s.vx * kv;

  // The ground (and the cliff it is launched from).
  if (h0 > 0) b.poly([{ x: launch.x - 70, y: ground }, { x: launch.x, y: ground }, { x: launch.x, y: launch.y }, { x: launch.x - 70, y: launch.y }], { fill: SLOPE, stroke: INK, width: 2, close: true, id: "plataforma" });
  hatchLine(b, (h0 > 0 ? launch.x - 70 : launch.x - 30), X(s.range) + 50, ground, 1, "solo");
  // The path, sampled from the solution and cut where a velocity arrow shows the motion
  // (after the launch and after the top), as a guide is cut around an axis number.
  const vEndLen = Math.hypot(vEnd.x, vEnd.y);
  const hidden = (q: Point): boolean =>
    Math.hypot(q.x - launch.x, q.y - launch.y) < v0Len + 36 ||
    Math.hypot(q.x - landing.x, q.y - landing.y) < vEndLen + 30 ||
    (hasApex && q.x > apex.x - 4 && q.x < apex.x + vxLen + 36 && Math.abs(q.y - apex.y) < 24);
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (let i = 0; i <= 160; i += 1) {
    const p = s.at((s.tFlight * i) / 160);
    const q = { x: X(p.x), y: Y(p.y) };
    if (hidden(q)) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else run.push(q);
  }
  if (run.length > 1) runs.push(run);
  runs.forEach((r, k) => b.poly(r, { stroke: SOFT, width: 1.6, lineStyle: "dashed", id: `trajetoria-${k + 1}` }));
  // The top, its height, and the range.
  if (hasApex) {
    dimension(b, apex.x, apex.y, ground, "altura");
    name(b, "H", apex.x + 16, (apex.y + ground) / 2 + 14, "altura", SOFT, 14);
    arrow(b, apex, { x: apex.x + vxLen, y: apex.y }, KEY, "v-topo");
    arrowLabel(b, "v_{x}", { x: apex.x + vxLen, y: apex.y }, { x: 0, y: -1 }, KEY, "v-topo");
    b.circle(apex, 3.5, { fill: INK, stroke: INK, width: 1, id: "topo" });
  }
  if (h0 > 0) {
    dimension(b, launch.x - 90, launch.y, ground, "altura-inicial");
    name(b, "h_{0}", launch.x - 106 - 6, (launch.y + ground) / 2, "altura-inicial", SOFT, 14);
  }
  dimensionH(b, ground + 30, launch.x, landing.x, "alcance");
  name(b, "A", (launch.x + landing.x) / 2, ground + 46, "alcance", SOFT, 14);
  // Velocities, to one scale.
  b.circle(launch, 6, { fill: INK, stroke: INK, width: 1, id: "corpo" });
  arrow(b, launch, v0Tip, GREEN, "v0");
  // Its name on the side the path curves away from: above the tangent.
  const up = { x: -s.vy0 / v0, y: -s.vx / v0 };
  arrowLabel(b, "v_{0}", { x: v0Tip.x - (s.vx / v0) * 10, y: v0Tip.y + (s.vy0 / v0) * 10 }, up, GREEN, "v0");
  if (theta > 0) {
    // As on the incline: the label sits on the bisector d past the arc, nearer the arc than
    // either side of the angle -- d < (R + d)·sen(θ/2) fixes R.
    b.poly(arcPts(launch, arcR, -(theta * Math.PI) / 180, 0, 20), { stroke: INK, width: 1.3, id: "angulo" });
    const mid = -(theta * Math.PI) / 360;
    b.label(`${formatNumber(theta, locale)}°`, launch.x + (arcR + dArc) * Math.cos(mid), launch.y + (arcR + dArc) * Math.sin(mid), { size: 14, weight: 700, colour: INK, annotates: "angulo" });
  }
  // The landing velocity arrives along the path and ends at the ground -- it never goes through it.
  const landFrom = { x: landing.x - vEnd.x, y: landing.y - vEnd.y };
  arrow(b, landFrom, landing, RUST, "v-solo");
  const out = { x: -vEnd.y / vEndLen, y: vEnd.x / vEndLen }; // the side away from the path's inside
  const side = out.x < 0 ? { x: -out.x, y: -out.y } : out;
  name(b, "v", (landFrom.x + landing.x) / 2 + side.x * 16, (landFrom.y + landing.y) / 2 + side.y * 16, "v-solo", RUST, 15);
  if (components) {
    // The inset: v₀ with its components and the angle, on its own (longer) scale.
    const c = Math.cos((theta * Math.PI) / 180);
    const sn = Math.sin((theta * Math.PI) / 180);
    const O = { x: figRight + 50, y: top + insetLen * sn + 30 };
    const tip = { x: O.x + insetLen * c, y: O.y - insetLen * sn };
    const xTip = { x: tip.x, y: O.y };
    const yTip = { x: O.x, y: tip.y };
    b.label("decomposição de v₀", O.x + (insetLen * c) / 2 + 10, top - 22, { size: 13, colour: SOFT, freeStanding: true });
    b.poly([tip, xTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-x" });
    b.poly([tip, yTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-y" });
    arrow(b, O, xTip, SOFT, "v0x", { width: 1.8 });
    arrow(b, O, yTip, SOFT, "v0y", { width: 1.8 });
    arrow(b, O, tip, GREEN, "v0-inset");
    arrowLabel(b, "v_{0x}", xTip, { x: 0, y: 1 }, SOFT, "v0x");
    arrowLabel(b, "v_{0y}", yTip, { x: -1, y: 0 }, SOFT, "v0y");
    arrowLabel(b, "v_{0}", tip, { x: c, y: -sn }, GREEN, "v0-inset");
    b.poly(arcPts(O, insetArcR, -(theta * Math.PI) / 180, 0, 20), { stroke: INK, width: 1.3, id: "angulo-inset" });
    const mid = -(theta * Math.PI) / 360;
    b.label("θ", O.x + (insetArcR + dArc) * Math.cos(mid), O.y + (insetArcR + dArc) * Math.sin(mid), { size: 14, weight: 700, colour: INK, annotates: "angulo-inset" });
  }
  panel.draw(b);  void quantity;
  return parseSpec(b.spec(input.title ?? (theta > 0 ? `lançamento oblíquo a ${theta}°` : "lançamento horizontal")));
}

export const projectile: Kind = { id: "projectile", fields: ["speed", "angle", "height", "components"], validate, draw };
