/**
 * circular: uniform circular motion of radius R, from a speed or a period. At
 * each chosen position the velocity is drawn tangent and the centripetal
 * acceleration toward the centre; both have the same length everywhere,
 * because in uniform motion their magnitudes do not change.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveCircular } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, M, PAPER, RUST, SOFT, arcPts, arrow, arrowLabel, eq, name, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "radius", path);
  if ((raw.speed === undefined) === (raw.period === undefined)) throw new SpecError(`${path}: give the speed or the period, one of them`);
  if (raw.speed !== undefined) positive(raw, "speed", path);
  else positive(raw, "period", path);
  if (raw.positions !== undefined) {
    const ps = v.array(raw, "positions", path, "angles in degrees");
    if (ps.length < 1 || ps.length > 4 || ps.some((p) => typeof p !== "number")) throw new SpecError(`${path}.positions must be 1 to 4 angles, degrees`);
  }
  v.optionalBoolean(raw, "clockwise", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const R = input.radius as number;
  const s = solveCircular(R, input.speed !== undefined ? { speed: input.speed as number } : { period: input.period as number });
  const positions = (input.positions as number[] | undefined) ?? [30, 150, 270];
  const cw = input.clockwise === true;
  const Rpx = 140;
  const C = { x: M + 100 + Rpx, y: M + 70 + Rpx };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `${eq("v", s.v, "m/s", locale)}   ·   ${eq("ω", s.omega, "rad/s", locale).replace(/^ω /, "ω = v/R ")}` });
    lines.push({ text: `${eq("T", s.T, "s", locale).replace(/^T /, "T = 2πR/v ")}   ·   ${eq("f", s.f, "Hz", locale).replace(/^f /, "f = 1/T ")}` });
    lines.push({ text: eq("a_{c}", s.ac, "m/s²", locale).replace(/^a_\{c\} /, "a_{c} = v²/R ") + ", apontando para o centro" });
  }
  const W0 = Math.ceil(C.x + Rpx + 140 + M);
  const figH = C.y + Rpx + 90;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  b.poly(arcPts(C, Rpx, 0, 2 * Math.PI, 96), { stroke: INK, width: 1.8, id: "trajetoria" });
  b.circle(C, 3.5, { fill: INK, stroke: INK, width: 1, id: "centro" });
  // The radius, to a point between two positions, with its given length.
  const between = ((positions[0]! + (positions[1] ?? positions[0]! + 120)) / 2) * (Math.PI / 180);
  const rEnd = { x: C.x + Rpx * Math.cos(between), y: C.y - Rpx * Math.sin(between) };
  b.poly([C, rEnd], { stroke: SOFT, width: 1.2, lineStyle: "dashed", id: "raio" });
  const rMid = { x: (C.x + rEnd.x) / 2, y: (C.y + rEnd.y) / 2 };
  // Beside the radius, on whichever side is clear.
  const rn = { x: -Math.sin(between), y: -Math.cos(between) };
  b.place(`R = ${formatNumber(R, locale)} m`, rMid.x, rMid.y, [rn, { x: -rn.x, y: -rn.y }], { size: 13, weight: 700, colour: SOFT, annotates: "raio", steps: 10 });
  name(b, "O", C.x - 12, C.y + 14, "centro", INK, 13);
  positions.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const P: Point = { x: C.x + Rpx * Math.cos(a), y: C.y - Rpx * Math.sin(a) };
    const sign = cw ? -1 : 1;
    const t = { x: -Math.sin(a) * sign, y: -Math.cos(a) * sign }; // tangent, in the sense of motion
    const inward = { x: -Math.cos(a), y: Math.sin(a) };
    const vTip = { x: P.x + t.x * 70, y: P.y + t.y * 70 };
    const aTip = { x: P.x + inward.x * 50, y: P.y + inward.y * 50 };
    arrow(b, P, aTip, RUST, `ac-${i + 1}`);
    arrow(b, P, vTip, GREEN, `v-${i + 1}`);
    b.circle(P, 6, { fill: INK, stroke: INK, width: 1, id: `corpo-${i + 1}` });
    arrowLabel(b, "v", vTip, t, GREEN, `v-${i + 1}`);
    arrowLabel(b, "a_{c}", aTip, inward, RUST, `ac-${i + 1}`);
  });
  void quantity;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "movimento circular uniforme"));
}

export const circular: Kind = { id: "circular", fields: ["radius", "speed", "period", "positions", "clockwise"], validate, draw };
