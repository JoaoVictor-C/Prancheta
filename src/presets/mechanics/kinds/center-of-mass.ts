/**
 * center-of-mass: point masses on a line (x) or a plane (x, y). The centre of
 * mass is the mass-weighted mean of the positions, marked where it falls --
 * nearer the heavier bodies, and not necessarily on any body.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveCenterOfMass } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { INK, M, PAPER, RUST, SOFT, eq, name, panelBelow } from "../draw.ts";

type Body = { mass: number; x: number; y?: number };

function validate(raw: Record<string, unknown>, path: string): void {
  const bs = v.array(raw, "bodies", path, "bodies [{ mass, x, y? }]");
  if (bs.length < 2 || bs.length > 5) throw new SpecError(`${path}.bodies must have 2 to 5 bodies, got ${bs.length}`);
  const plane = bs.some((x) => (x as Record<string, unknown>).y !== undefined);
  bs.forEach((x, i) => {
    const o = v.object(x, `${path}.bodies[${i}]`);
    positive(o, "mass", `${path}.bodies[${i}]`);
    v.requiredNumber(o, "x", `${path}.bodies[${i}]`);
    if (plane) v.requiredNumber(o, "y", `${path}.bodies[${i}]`);
  });
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const bodies = input.bodies as Body[];
  const plane = bodies.some((x) => x.y !== undefined);
  const cm = solveCenterOfMass(bodies);
  const xs = [...bodies.map((x) => x.x), 0];
  const ys = [...bodies.map((x) => x.y ?? 0), 0];
  const x0 = Math.floor(Math.min(...xs));
  const x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  const unit = Math.min(480 / Math.max(1, x1 - x0), plane ? 300 / Math.max(1, y1 - y0) : 480);
  const left = M + (plane ? 90 : 50);
  const top = M + 40;
  const originY = plane ? top + (y1 - y0) * unit : top + 90;
  const X = (x: number): number => left + (x - x0) * unit;
  const Y = (y: number): number => originY - (y - y0) * unit;
  const big = Math.max(...bodies.map((x) => x.mass));
  const radius = (m: number): number => 9 + 13 * Math.sqrt(m / big);
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `${eq("x_{CM}", cm.x, "m", locale).replace(/^x_\{CM\} /, "x_{CM} = Σ m·x / Σ m ")}${plane ? `   ·   ${eq("y_{CM}", cm.y, "m", locale).replace(/^y_\{CM\} /, "y_{CM} = Σ m·y / Σ m ")}` : ""}` });
    lines.push({ text: `massa total ${formatNumber(cm.total, locale)} kg; o centro de massa fica mais perto dos corpos mais pesados` });
  }
  const W0 = Math.ceil(X(x1) + 70 + M);
  const figH = originY + (plane ? 80 : 90);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  // Rulers with a tick and number at every metre: along the bottom (and the left, on a
  // plane), clear of the bodies so no number lands on one.
  const rulerY = plane ? Y(y0) + 34 : Y(0);
  const rulerX = X(x0) - 34;
  b.poly([{ x: X(x0) - 10, y: rulerY }, { x: X(x1) + 30, y: rulerY }], { stroke: INK, width: 1.4, id: "eixo-x" });
  for (let x = x0; x <= x1; x += 1) {
    const id = `tx-${x}`;
    b.poly([{ x: X(x), y: rulerY - 4 }, { x: X(x), y: rulerY + 4 }], { stroke: INK, width: 1.2, id });
    b.label(formatNumber(x, locale), X(x), rulerY + 18, { size: 12, colour: SOFT, annotates: id });
  }
  name(b, "x (m)", X(x1) + 46, rulerY + 18, "eixo-x", SOFT, 12);
  if (plane) {
    b.poly([{ x: rulerX, y: Y(y0) + 10 }, { x: rulerX, y: Y(y1) - 24 }], { stroke: INK, width: 1.4, id: "eixo-y" });
    for (let y = y0; y <= y1; y += 1) {
      const id = `ty-${y}`;
      b.poly([{ x: rulerX - 4, y: Y(y) }, { x: rulerX + 4, y: Y(y) }], { stroke: INK, width: 1.2, id });
      b.label(formatNumber(y, locale), rulerX - 18, Y(y), { size: 12, colour: SOFT, annotates: id });
    }
    name(b, "y (m)", rulerX, Y(y1) - 36, "eixo-y", SOFT, 12);
  }
  bodies.forEach((body, i) => {
    const c = { x: X(body.x), y: plane ? Y(body.y!) : Y(0) - 34 };
    const r = radius(body.mass);
    b.circle(c, r, { fill: "#CFE0F3", stroke: INK, width: 1.3, id: `corpo-${i + 1}` });
    name(b, `${formatNumber(body.mass, locale)} kg`, c.x, c.y - r - 12, `corpo-${i + 1}`, INK, 12);
    if (!plane) b.poly([{ x: c.x, y: c.y + r }, { x: c.x, y: Y(0) - 5 }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: `ref-${i + 1}` });
  });
  // The centre of mass: a cross where it falls (on a line, below the ruler, dropped to it).
  if (answers) {
    const C = { x: X(cm.x), y: plane ? Y(cm.y) : Y(0) + 48 };
    // (on a line: the cross stands below the ruler's numbers, so the numbers stay clear)
    b.poly([{ x: C.x - 9, y: C.y - 9 }, { x: C.x + 9, y: C.y + 9 }], { stroke: RUST, width: 2.6, id: "cm-a" });
    b.poly([{ x: C.x - 9, y: C.y + 9 }, { x: C.x + 9, y: C.y - 9 }], { stroke: RUST, width: 2.6, id: "cm" });
    name(b, "CM", C.x + 26, C.y, "cm", RUST, 13);
  }  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "centro de massa"));
}

export const centerOfMass: Kind = { id: "center-of-mass", fields: ["bodies"], validate, draw };
