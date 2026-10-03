/**
 * incline: a block on an inclined plane. P = mg; along and across the slope
 * P_x = P·sen θ and P_y = P·cos θ = N; with μ the block slides when tg θ > μ
 * (kinetic friction μN, a = g(sen θ − μ cos θ)) and is held otherwise (static
 * friction equal to P_x, a = 0).
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveIncline } from "../physics.ts";
import { common, friction, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { BLOCK, GREEN, INK, KEY, M, PAPER, RUST, SLOPE, SOFT, arcPts, arrow, arrowLabel, eq, hatchLine, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  const angle = raw.angle === undefined ? undefined : v.requiredNumber(raw, "angle", path);
  if (angle === undefined) throw new SpecError(`${path}.angle is required for an incline (degrees)`);
  if (angle < 10 || angle > 75) throw new SpecError(`${path}.angle must be from 10 to 75 degrees, got ${angle}`);
  friction(raw, path);
  v.optionalBoolean(raw, "components", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const mu = input.friction as number | undefined;
  const theta = input.angle as number;
  const t = (theta * Math.PI) / 180;
  const s = solveIncline(mass, g, theta, mu);
  const components = (input.components as boolean | undefined) ?? true;
  // A shallow slope is drawn longer, not lower: the forces need its height.
  const L = Math.min(640, 260 / Math.tan(t));
  const Ht = L * Math.tan(t);
  const side = 60;
  const f = 0.45; // where the block sits, as a fraction of the slope from its top
  // One scale for every force, chosen so P's and P_y's tips stay at least
  // 64px above the ground: a label below a tip must not be read as the ground's.
  const above = Ht * (1 - f); // height of the block's contact point above the ground
  const kP = (above + side / 2 / Math.cos(t) - 64) / s.P;
  const kY = ((above - 64) / Math.cos(t) + side / 2) / s.Py;
  const k = Math.max(0.05, Math.min(110 / s.P, kP, kY));
  // Laid out with the ground at y = 0, then moved so the topmost ink is M + 30 down.
  const x0 = M + 40;
  const T0 = { x: x0, y: -Ht };
  const u = { x: Math.cos(t), y: Math.sin(t) }; // down the slope
  const nrm = { x: u.y, y: -u.x }; // out of the slope
  const len = L / Math.cos(t);
  const Q0 = { x: T0.x + u.x * len * f, y: T0.y + u.y * len * f };
  const G0 = { x: Q0.x + (nrm.x * side) / 2, y: Q0.y + (nrm.y * side) / 2 };
  const nTop = G0.y + nrm.y * s.N * k - 34;
  const corner = Q0.y - (u.y * side) / 2 + nrm.y * side - 34;
  const yb = M + 30 - Math.min(T0.y, nTop, corner);
  const T = { x: x0, y: yb - Ht };
  const A = { x: x0, y: yb };
  const B = { x: x0 + L, y: yb };
  const Q = { x: Q0.x, y: Q0.y + yb };
  const G = { x: G0.x, y: G0.y + yb };
  const at = (p: Point, d: Point, f: number): Point => ({ x: p.x + d.x * f * k, y: p.y + d.y * f * k });
  const pTip = at(G, { x: 0, y: 1 }, s.P);
  const nTip = at(G, nrm, s.N);
  const xTip = at(G, u, s.Px);
  const yTip = at(G, { x: -nrm.x, y: -nrm.y }, s.Py);
  // Friction acts at the contact, against the motion: drawn from the up-slope face, out of the block.
  const fFrom = { x: G.x - (u.x * side) / 2, y: G.y - (u.y * side) / 2 };
  const fTip = at(fFrom, { x: -u.x, y: -u.y }, Math.max(s.friction, 18 / k));

  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P = m·g = ${quantity(s.P, locale).text} N` });
    lines.push({ text: `${eq("P_{x}", s.Px, "N", locale).replace(/^P_\{x\} /, "P_{x} = P·sen θ ")}` });
    lines.push({ text: `${eq("P_{y}", s.Py, "N", locale).replace(/^P_\{y\} /, "N = P_{y} = P·cos θ ")}` });
    if (mu !== undefined) {
      lines.push(s.sliding
        ? { text: `tg θ > μ: o bloco desliza; ${eq("F_{at}", s.friction, "N", locale).replace(/^F_\{at\} /, "F_{at} = μ·N ")}` }
        : { text: `tg θ ≤ μ: o bloco fica em repouso; o atrito estático equilibra P_{x}: ${eq("F_{at}", s.friction, "N", locale)}` });
    }
    lines.push({
      text: s.sliding
        ? eq("a", s.a, "m/s²", locale).replace(/^a /, mu === undefined ? "a = g·sen θ " : "a = g(sen θ − μ cos θ) ")
        : "a = 0",
    });
  }
  const W0 = Math.ceil(Math.max(B.x + 80, nTip.x + 140, xTip.x + 120) + M);
  const figH = Math.max(yb + 30, pTip.y + 40);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  b.poly([A, T, B], { fill: SLOPE, stroke: INK, width: 2.2, close: true, id: "rampa" });
  hatchLine(b, x0 - 30, B.x + 50, yb, 1, "chao");
  // The angle at the foot of the slope.
  // The label sits on the bisector a distance d past the arc. It must be nearer the arc than
  // either side of the angle: d < (R + d)·sen(θ/2), so R is chosen to leave d = 16 room.
  const half = Math.sin(t / 2);
  const d = 16;
  const R = Math.max(44, Math.ceil((d * (1 - half)) / half) + 8);
  b.poly(arcPts(B, R, Math.PI, Math.PI + t, 24), { stroke: INK, width: 1.4, id: "angulo" });
  const mid = Math.PI + t / 2;
  b.label(`${formatNumber(theta, locale)}°`, B.x + (R + d) * Math.cos(mid), B.y + (R + d) * Math.sin(mid), { size: 14, weight: 700, colour: INK, annotates: "angulo" });
  // The block, square on the slope.
  const corners = [
    { x: Q.x - (u.x * side) / 2, y: Q.y - (u.y * side) / 2 },
    { x: Q.x + (u.x * side) / 2, y: Q.y + (u.y * side) / 2 },
    { x: Q.x + (u.x * side) / 2 + nrm.x * side, y: Q.y + (u.y * side) / 2 + nrm.y * side },
    { x: Q.x - (u.x * side) / 2 + nrm.x * side, y: Q.y - (u.y * side) / 2 + nrm.y * side },
  ];
  b.poly(corners, { fill: BLOCK, stroke: INK, width: 2.2, close: true, id: "bloco" });
  // Components first, dashed, with the parallelogram that makes them P's.
  if (components) {
    b.poly([pTip, xTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-x" });
    b.poly([pTip, yTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-y" });
    arrow(b, G, xTip, SOFT, "px", { width: 1.8, dashed: true });
    arrow(b, G, yTip, SOFT, "py", { width: 1.8, dashed: true });
  }
  arrow(b, G, pTip, KEY, "peso");
  arrow(b, G, nTip, GREEN, "normal");
  if (mu !== undefined && s.friction > 1e-9) arrow(b, fFrom, fTip, RUST, "atrito");
  b.circle(G, 3.2, { fill: INK, stroke: INK, width: 1, id: "centro" });
  // Labels beyond each tip.
  const unit = (p: Point, q: Point): Point => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  };
  arrowLabel(b, "P", pTip, { x: 0, y: 1 }, KEY, "peso");
  arrowLabel(b, "N", nTip, nrm, GREEN, "normal");
  if (components) {
    arrowLabel(b, "P_{x}", xTip, unit(G, xTip), SOFT, "px");
    arrowLabel(b, "P_{y}", yTip, unit(G, yTip), SOFT, "py");
  }
  if (mu !== undefined && s.friction > 1e-9) arrowLabel(b, "F_{at}", fTip, { x: -u.x, y: -u.y }, RUST, "atrito");
  b.place(`${formatNumber(mass, locale)} kg`, corners[3]!.x - 30, corners[3]!.y - 14, [{ x: -1, y: 0 }, { x: 0, y: -1 }], { size: 14, weight: 700, colour: INK, annotates: "bloco", steps: 8 });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? `plano inclinado de ${theta}°`));
}

export const incline: Kind = { id: "incline", fields: ["mass", "angle", "friction", "components"], validate, draw };
