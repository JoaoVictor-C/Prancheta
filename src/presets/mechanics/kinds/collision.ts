/**
 * collision: two bodies on a line, before and after. Momentum is conserved;
 * the restitution coefficient decides the rest (1 elastic, 0 they stick
 * together, between: partially elastic). An explosion is the same law run the
 * other way: two bodies together push apart, one velocity given. Velocity
 * arrows share one scale across both rows, so a change of speed is a change
 * of length.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import type { Locale } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveCollision, solveExplosion } from "../physics.ts";
import { common, twoMasses } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, RUST, SOFT, arrow, arrowLabel, hatchLine, name, panelBelow, quantity, rect } from "../draw.ts";

const TYPES = ["elastic", "perfectly-inelastic"] as const;

function validate(raw: Record<string, unknown>, path: string): void {
  twoMasses(raw, path);
  if ((raw.velocities === undefined) === (raw.explosion === undefined)) throw new SpecError(`${path}: give the velocities before a collision, or an explosion, one of them`);
  if (raw.velocities !== undefined) {
    const us = v.array(raw, "velocities", path, "two velocities before, m/s (right positive)");
    if (us.length !== 2 || us.some((x) => typeof x !== "number")) throw new SpecError(`${path}.velocities must be two numbers, m/s`);
    const [u1, u2] = us as number[];
    if (!(u1! > u2!)) throw new SpecError(`${path}.velocities: body 1 (left) must move faster to the right than body 2, or they never meet`);
    if (raw.collision !== undefined && raw.restitution !== undefined) throw new SpecError(`${path}: give collision or restitution, not both`);
    v.optionalEnum(raw, "collision", path, TYPES);
    const e = v.optionalNumber(raw, "restitution", path);
    if (e !== undefined && (e < 0 || e > 1)) throw new SpecError(`${path}.restitution must be from 0 to 1, got ${e}`);
  } else {
    const ex = v.object(raw.explosion, `${path}.explosion`);
    v.requiredNumber(ex, "velocity", `${path}.explosion`);
    v.optionalNumber(ex, "initial", `${path}.explosion`);
    if (raw.collision !== undefined || raw.restitution !== undefined) throw new SpecError(`${path}: an explosion takes no collision or restitution`);
  }
}

function direction(x: number, locale: Locale): string {
  if (Math.abs(x) < 1e-9) return "0 (repouso)";
  return `${quantity(Math.abs(x), locale).text} m/s para a ${x > 0 ? "direita" : "esquerda"}`;
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const [m1, m2] = input.masses as [number, number];
  const ex = input.explosion as { velocity: number; initial?: number } | undefined;
  const us = input.velocities as [number, number] | undefined;
  const e = ex !== undefined ? undefined : input.collision === "perfectly-inelastic" ? 0 : (input.restitution as number | undefined) ?? 1;
  const s = ex !== undefined ? solveExplosion(m1, m2, ex.velocity, ex.initial ?? 0) : solveCollision(m1, m2, us![0], us![1], e!);
  const u1 = ex !== undefined ? (ex.initial ?? 0) : us![0];
  const u2 = ex !== undefined ? (ex.initial ?? 0) : us![1];
  const stuck = e === 0;
  const together = ex !== undefined; // before an explosion the two are one
  const vmax = Math.max(Math.abs(u1), Math.abs(u2), Math.abs(s.v1), Math.abs(s.v2));
  const kv = 80 / vmax;
  const left = M + 110;
  const width = 520;
  const rowH = 150;
  const row1 = M + 40;
  const row2 = row1 + rowH;
  const bw = 60;
  const bh = 44;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `Q = m_{1}·u_{1} + m_{2}·u_{2} = ${quantity(s.p, locale).text} kg·m/s, conservada` });
    if (ex === undefined) lines.push({ text: stuck ? "perfeitamente inelástica: os corpos seguem juntos" : e === 1 ? "elástica: a energia cinética se conserva" : `coeficiente de restituição e = ${formatNumber(e!, locale)}` });
    lines.push({ text: stuck ? `depois: v = ${direction(s.v1, locale)}` : `depois: v_{1} = ${direction(s.v1, locale)}; v_{2} = ${direction(s.v2, locale)}` });
    lines.push({ text: `E_{c} antes = ${quantity(s.Ek0, locale).text} J, depois = ${quantity(s.Ek1, locale).text} J${Math.abs(s.lost) > 1e-9 ? (s.lost > 0 ? `; ${quantity(s.lost, locale).text} J dissipados` : `; ${quantity(-s.lost, locale).text} J liberados`) : ""}` });
  }
  const W0 = Math.ceil(left + width + 60 + M);
  const figH = row2 + bh + 40;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  const ground = (y: number, id: string): void => hatchLine(b, left - 20, left + width, y, 1, id);
  const block = (cx: number, top: number, mass: number, id: string, fill: string): void => {
    rect(b, cx, top, bw, bh, id, fill);
    name(b, `${formatNumber(mass, locale)} kg`, cx, top + bh / 2, id, INK, 13);
  };
  /** A velocity arrow above a block, its name above its tip; "repouso" when it does not move. */
  const velocity = (cx: number, top: number, vel: number, label: string, id: string, owner: string): void => {
    const y = top - 18;
    if (Math.abs(vel) < 1e-9) {
      b.label("repouso", cx, y, { size: 12, colour: SOFT, annotates: owner });
      return;
    }
    const tip = { x: cx + vel * kv, y };
    arrow(b, { x: cx, y }, tip, vel > 0 ? GREEN : RUST, id);
    arrowLabel(b, label, tip, { x: 0, y: -1 }, vel > 0 ? GREEN : RUST, id);
  };
  const A1 = "#CFE0F3";
  const A2 = "#F3E6B8";

  // Before.
  b.label("antes", M + 34, row1 + bh / 2 + 10, { size: 14, weight: 700, colour: SOFT, freeStanding: true });
  ground(row1 + bh + 10, "solo-antes");
  const t1 = row1 + 10;
  if (together) {
    block(left + width / 2 - bw / 2, t1, m1, "antes-1", A1);
    block(left + width / 2 + bw / 2, t1, m2, "antes-2", A2);
    if (Math.abs(u1) > 1e-9) velocity(left + width / 2, t1 - 6, u1, "u", "u", "antes-1");
    else b.label("repouso", left + width / 2, t1 - 18, { size: 12, colour: SOFT, annotates: "antes-1" });
  } else {
    block(left + width * 0.25, t1, m1, "antes-1", A1);
    block(left + width * 0.7, t1, m2, "antes-2", A2);
    velocity(left + width * 0.25, t1, u1, "u_{1}", "u1", "antes-1");
    velocity(left + width * 0.7, t1, u2, "u_{2}", "u2", "antes-2");
  }
  // After.
  b.label("depois", M + 34, row2 + bh / 2 + 10, { size: 14, weight: 700, colour: SOFT, freeStanding: true });
  ground(row2 + bh + 10, "solo-depois");
  const t2 = row2 + 10;
  if (stuck) {
    block(left + width / 2 - bw / 2, t2, m1, "depois-1", A1);
    block(left + width / 2 + bw / 2, t2, m2, "depois-2", A2);
    if (answers) velocity(left + width / 2, t2 - 6, s.v1, "v", "v", "depois-1");
  } else {
    const c1 = left + width * (together ? 0.3 : 0.4);
    const c2 = left + width * (together ? 0.7 : 0.75);
    block(c1, t2, m1, "depois-1", A1);
    block(c2, t2, m2, "depois-2", A2);
    // The question's figure keeps a given velocity (an explosion's first) and hides the solved ones.
    if (answers || together) velocity(c1, t2, s.v1, "v_{1}", "v1", "depois-1");
    if (answers) velocity(c2, t2, s.v2, "v_{2}", "v2", "depois-2");
  }
  void KEY;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? (together ? "explosão" : "colisão")));
}

export const collision: Kind = { id: "collision", fields: ["masses", "velocities", "collision", "restitution", "explosion"], validate, draw };
