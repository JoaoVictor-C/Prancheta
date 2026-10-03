/**
 * oscillator: simple harmonic motion of amplitude A -- a spring-mass system
 * (m, k) shown at x = −A, 0, +A, or a simple pendulum (L) at its two
 * extremes and its lowest point. The velocity is greatest at the middle and
 * zero at the ends; the acceleration points to the middle, greatest at the
 * ends and zero there. The period is 2π√(m/k) or 2π√(L/g).
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveOscillator } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, M, PAPER, RUST, SOFT, arrow, arrowLabel, eq, freeName, hatchLine, name, panelBelow, rect, springPath } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  const system = v.optionalEnum(raw, "system", path, ["spring", "pendulum"]);
  if (system === undefined) throw new SpecError(`${path}.system is required: "spring" or "pendulum"`);
  const A = positive(raw, "amplitude", path);
  if (system === "spring") {
    positive(raw, "mass", path);
    positive(raw, "stiffness", path);
    if (raw.length !== undefined) throw new SpecError(`${path}.length belongs to a pendulum`);
  } else {
    const L = positive(raw, "length", path);
    if (A / L > 0.35) throw new SpecError(`${path}.amplitude must be small beside the length (at most 0,35·L) for the pendulum to be simple`);
    if (raw.stiffness !== undefined) throw new SpecError(`${path}.stiffness belongs to a spring`);
  }
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const A = input.amplitude as number;
  const spring = input.system === "spring";
  const s = solveOscillator(spring ? { mass: input.mass as number, stiffness: input.stiffness as number } : { length: input.length as number }, A, g);
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: spring ? eq("T", s.period, "s", locale).replace(/^T /, "T = 2π√(m/k) ") : eq("T", s.period, "s", locale).replace(/^T /, "T = 2π√(L/g) ") });
    lines.push({ text: `${eq("v_{máx}", s.vMax, "m/s", locale).replace(/^v_\{máx\} /, "v_{máx} = ω·A ")}, no meio   ·   ${eq("a_{máx}", s.aMax, "m/s²", locale).replace(/^a_\{máx\} /, "a_{máx} = ω²·A ")}, nos extremos` });
  }
  const kv = 60 / s.vMax;
  const ka = 60 / s.aMax;
  if (spring) {
    const wall = M + 120;
    const rest = wall + 220; // the block's centre at x = 0
    const scale = 120 / A; // px per metre of displacement
    const rowH = 130;
    const bw = 56;
    const bh = 44;
    const W0 = Math.ceil(rest + A * scale + bw + 110 + M);
    const figH = M + 40 + 3 * rowH;
    const panel = panelBelow({ W: W0, y: figH }, lines);
    const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
    const H = Math.ceil(figH + panel.height + M);
    const b = new Board(W, H, PAPER);
    freeName(b, "x = 0", rest, M + 8, SOFT, 12);
    [-1, 0, 1].forEach((side, i) => {
      const y = M + 40 + i * rowH + 60;
      const cx = rest + side * A * scale;
      b.poly([{ x: wall, y: y - 40 }, { x: wall, y: y + bh / 2 + 6 }], { stroke: INK, width: 3, id: `parede-${i}` });
      hatchLine(b, wall - 20, cx + bw / 2 + 40, y + bh / 2, 1, `piso-${i}`);
      const sp = springPath(0, wall, cx - bw / 2, 8, 9);
      b.poly(sp.map((q) => ({ x: q.y, y: y + q.x })), { stroke: INK, width: 1.6, id: `mola-${i}` });
      rect(b, cx, y - bh / 2, bw, bh, `bloco-${i}`);
      // The equilibrium position, marked under each row's floor.
      b.poly([{ x: rest, y: y + bh / 2 + 14 }, { x: rest, y: y + bh / 2 + 30 }], { stroke: SOFT, width: 1.4, lineStyle: "dashed", id: `equilibrio-${i}` });
      freeName(b, side === 0 ? "x = 0" : side < 0 ? "x = −A" : "x = +A", M + 44, y, INK, 13);
      // v above the block (zero at the ends), a below its top edge toward the middle (zero there).
      if (side === 0) {
        const tip = { x: cx + s.vMax * kv, y: y - bh / 2 - 14 };
        arrow(b, { x: cx, y: tip.y }, tip, GREEN, `v-${i}`);
        arrowLabel(b, "v_{máx}", tip, { x: 0, y: -1 }, GREEN, `v-${i}`);
        name(b, "a = 0", cx, y, `bloco-${i}`, "#8A2E0E", 12);
      } else {
        const tip = { x: cx - side * s.aMax * ka, y: y - bh / 2 - 14 };
        arrow(b, { x: cx, y: tip.y }, tip, RUST, `a-${i}`);
        arrowLabel(b, "a_{máx}", tip, { x: 0, y: -1 }, RUST, `a-${i}`);
        name(b, "v = 0", cx, y, `bloco-${i}`, "#1F5A2B", 12);
      }
    });
    panel.draw(b);
    return parseSpec(b.spec(input.title ?? "oscilador massa-mola"));
  }
  // The pendulum: pivot, the two extremes (pale) and the lowest point.
  const L = input.length as number;
  // A true small swing (a few degrees) cannot be read, so it is drawn at
  // 20° at least, and the figure says so.
  const trueTheta = Math.asin(Math.min(1, A / L));
  const theta = Math.max(trueTheta, (20 * Math.PI) / 180);
  if (theta > trueTheta) lines.push({ text: "o ângulo do desenho está exagerado" });
  const Lpx = 260;
  const O = { x: M + 260, y: M + 40 };
  const bob = (t: number): Point => ({ x: O.x + Lpx * Math.sin(t), y: O.y + Lpx * Math.cos(t) });
  const W0 = Math.ceil(O.x + Lpx * Math.sin(theta) + 160 + M);
  const figH = O.y + Lpx + 110;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, O.x - 70, O.x + 70, O.y, -1, "teto");
  b.poly([O, { x: O.x, y: O.y + Lpx + 14 }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: "vertical" });
  const arc: Point[] = Array.from({ length: 41 }, (_, i) => bob(-theta + (2 * theta * i) / 40));
  b.poly(arc, { stroke: SOFT, width: 1, lineStyle: "dashed", id: "arco" });
  // The string at the lowest point; at the extremes only the bob, on the dashed arc.
  b.poly([O, bob(0)], { stroke: INK, width: 1.8, id: "fio-baixo" });
  for (const [t, id] of [[-theta, "esq"], [theta, "dir"], [0, "baixo"]] as const) {
    b.circle(bob(t), 10, { fill: id === "baixo" ? "#CFE0F3" : "#E8EEF5", stroke: INK, width: 1.2, id: `corpo-${id}` });
  }
  name(b, `L = ${formatNumber(L, locale)} m`, O.x + 40, O.y + Lpx / 2, "fio-baixo", INK, 13);
  // v at the bottom, horizontal; a at each extreme, along the arc toward the bottom.
  const low = bob(0);
  const vTip = { x: low.x + s.vMax * kv, y: low.y + 80 };
  arrow(b, { x: low.x, y: low.y + 80 }, vTip, GREEN, "v");
  arrowLabel(b, "v_{máx}", vTip, { x: 1, y: 0 }, GREEN, "v");
  for (const [t, id] of [[-theta, "esq"], [theta, "dir"]] as const) {
    const p = bob(t);
    const dir = { x: -Math.sign(t) * Math.cos(t), y: Math.abs(Math.sin(t)) };
    const tip = { x: p.x + dir.x * 46, y: p.y + dir.y * 46 }; // both extremes share a_máx, so one length
    const from = { x: p.x + dir.x * 12, y: p.y + dir.y * 12 };
    arrow(b, from, { x: tip.x + dir.x * 12, y: tip.y + dir.y * 12 }, RUST, `a-${id}`);
    arrowLabel(b, "a_{máx}", { x: tip.x + dir.x * 12, y: tip.y + dir.y * 12 }, { x: 0, y: 1 }, RUST, `a-${id}`);
  }
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "pêndulo simples"));
}

export const oscillator: Kind = { id: "oscillator", fields: ["system", "mass", "stiffness", "length", "amplitude"], validate, draw };
