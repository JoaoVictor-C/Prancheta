/**
 * lever: a beam on one support with loads hanging at given positions, and one
 * unknown -- the force at a given position, or where a given force must act.
 * Torques about the support sum to zero. The class of the lever (interfixa,
 * inter-resistente, interpotente) follows when there is one load. Every force
 * is drawn to one scale, at its true position on a beam drawn to scale.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveLever } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { BLOCK, GREEN, INK, KEY, M, PAPER, SLOPE, SOFT, arrow, arrowLabel, dimensionH, eq, hatchLine, name, panelBelow, quantity } from "../draw.ts";

type Load = { at: number; mass?: number; force?: number };

function validate(raw: Record<string, unknown>, path: string): void {
  const L = positive(raw, "length", path);
  const support = v.requiredNumber(raw, "support", path);
  if (support < 0 || support > L) throw new SpecError(`${path}.support must lie on the beam, from 0 to ${L} m, got ${support}`);
  const loads = v.array(raw, "loads", path, "loads [{ at, mass } or { at, force }]");
  if (loads.length < 1 || loads.length > 3) throw new SpecError(`${path}.loads must have 1 to 3 loads, got ${loads.length}`);
  loads.forEach((l, i) => {
    const o = v.object(l, `${path}.loads[${i}]`);
    const at = v.requiredNumber(o, "at", `${path}.loads[${i}]`);
    if (at < 0 || at > L) throw new SpecError(`${path}.loads[${i}].at must lie on the beam, got ${at}`);
    if ((o.mass === undefined) === (o.force === undefined)) throw new SpecError(`${path}.loads[${i}] gives a mass (kg) or a force (N), one of them`);
    if (o.mass !== undefined) positive(o, "mass", `${path}.loads[${i}]`);
    else positive(o, "force", `${path}.loads[${i}]`);
  });
  const u = v.object(raw.unknown, `${path}.unknown`);
  if ((u.at === undefined) === (u.force === undefined)) throw new SpecError(`${path}.unknown gives where the force acts ({ at }) or how large it is ({ force }), one of them`);
  if (u.at !== undefined) {
    const at = v.requiredNumber(u, "at", `${path}.unknown`);
    if (at < 0 || at > L) throw new SpecError(`${path}.unknown.at must lie on the beam, got ${at}`);
    if (Math.abs(at - support) < 1e-9) throw new SpecError(`${path}.unknown.at is the support, where a force has no torque`);
  } else positive(u, "force", `${path}.unknown`);
}

const CLASS_NAME = { 1: "interfixa (o apoio entre a força e a carga)", 2: "inter-resistente (a carga entre o apoio e a força)", 3: "interpotente (a força entre o apoio e a carga)" } as const;

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const L = input.length as number;
  const support = input.support as number;
  const raw = input.loads as Load[];
  const loads = raw.map((l, i) => ({ at: l.at, force: l.force ?? l.mass! * g, name: raw.length === 1 ? "P" : `P_{${i + 1}}`, mass: l.mass }));
  const u = input.unknown as { at?: number; force?: number };
  const s = solveLever(support, loads, u.at !== undefined ? { at: u.at } : { force: u.force! });
  if (s.unknown.at < -1e-9 || s.unknown.at > L + 1e-9) throw new SpecError(`mechanics: the force would have to act ${quantity(s.unknown.at, locale).text} m from the left end, off the beam`);
  const sx = 520 / L; // px per metre along the beam
  const left = M + 60;
  const X = (m: number): number => left + m * sx;
  const beamY0 = M + 150;
  const beamH = 12;
  const forces = [...loads.map((l) => l.force), Math.abs(s.unknown.force)];
  const k = 100 / Math.max(...forces);
  const up = s.unknown.force < 0; // the unknown pushes up when negative (loads push down)
  // Room above the beam for F (when it pushes down) and for every row of arms.
  const armsPerSide = [-1, 1].map((side) => [...loads.map((l) => l.at), s.unknown.at].filter((x) => Math.sign(x - support) === side).length);
  const beamY = M + 40 + (up ? 0 : Math.abs(s.unknown.force) * k) + 30 * Math.max(...armsPerSide) + 10;
  void beamY0;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: "em equilíbrio, os torques em relação ao apoio se anulam: Σ F·d = 0" });
    for (const l of loads) lines.push({ text: `${l.name} = ${quantity(l.force, locale).text} N, braço d = ${quantity(Math.abs(l.at - support), locale).text} m` });
    if (u.at !== undefined) lines.push({ text: `${eq("F", Math.abs(s.unknown.force), "N", locale)}${up ? ", para cima" : ""} (braço ${quantity(Math.abs(s.unknown.at - support), locale).text} m)` });
    else lines.push({ text: `a força de ${quantity(Math.abs(s.unknown.force), locale).text} N age a ${quantity(Math.abs(s.unknown.at - support), locale).text} m do apoio (${quantity(s.unknown.at, locale).text} m da ponta esquerda)` });
    if (s.leverClass !== undefined) lines.push({ text: `alavanca ${CLASS_NAME[s.leverClass]}` });
  }
  const W0 = Math.ceil(X(L) + 80 + M);
  const lowest = beamY + beamH + Math.max(...loads.map((l) => l.force * k + (l.mass !== undefined ? 52 : 0)), up ? 0 : Math.abs(s.unknown.force) * k);
  const figH = Math.max(lowest + 50, beamY + 120);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  // The beam, and the support under it at its true position.
  b.poly([{ x: X(0), y: beamY }, { x: X(L), y: beamY }, { x: X(L), y: beamY + beamH }, { x: X(0), y: beamY + beamH }], { fill: SLOPE, stroke: INK, width: 2, close: true, id: "barra" });
  const sx0 = X(support);
  const tri = [{ x: sx0, y: beamY + beamH }, { x: sx0 + 16, y: beamY + beamH + 30 }, { x: sx0 - 16, y: beamY + beamH + 30 }];
  b.poly(tri, { fill: INK, stroke: INK, width: 1, close: true, id: "apoio" });
  hatchLine(b, sx0 - 34, sx0 + 34, beamY + beamH + 30, 1, "base");
  // Arms, above the beam and above F's tail: from the support to each force, to scale. Each side
  // stacks its own, shortest nearest the beam, so no reference line crosses a longer arm's row.
  const fLen0 = Math.abs(s.unknown.force) * k;
  const rowBase = beamY - (up ? 0 : fLen0) - 30;
  const all = [...loads.map((l, i) => ({ at: l.at, id: `carga-${i + 1}` })), { at: s.unknown.at, id: "forca" }]
    .filter((f) => Math.abs(f.at - support) > 1e-9);
  let rows = 0;
  for (const side of [-1, 1]) {
    const mine = all.filter((f) => Math.sign(f.at - support) === side).sort((a, c) => Math.abs(a.at - support) - Math.abs(c.at - support));
    mine.forEach((f, r) => {
      const y = rowBase - r * 30;
      const id = `braco-${f.id}`;
      dimensionH(b, y, Math.min(sx0, X(f.at)), Math.max(sx0, X(f.at)), id);
      const refEnd = f.id === "forca" && !up ? beamY - fLen0 - 6 : beamY - 4;
      b.poly([{ x: X(f.at), y: y + 6 }, { x: X(f.at), y: refEnd }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: `ref-${f.id}` });
      const known = u.at !== undefined || f.id !== "forca";
      const text = known ? `${formatNumber(Math.abs(f.at - support), locale)} m` : "d_{F}";
      name(b, text, (sx0 + X(f.at)) / 2, y - 12, id, SOFT, 13);
    });
    rows = Math.max(rows, mine.length);
  }
  b.poly([{ x: sx0, y: beamY - 4 }, { x: sx0, y: rowBase - (rows - 1) * 30 - 6 }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: "ref-apoio" });  // Loads: a block hanging under the beam (when a mass), its weight below; forces to scale.
  loads.forEach((l, i) => {
    const x = X(l.at);
    let from = beamY + beamH;
    if (l.mass !== undefined) {
      b.poly([{ x, y: beamY + beamH }, { x, y: beamY + beamH + 14 }], { stroke: INK, width: 1.6, id: `fio-${i + 1}` });
      b.poly([{ x: x - 22, y: beamY + beamH + 14 }, { x: x + 22, y: beamY + beamH + 14 }, { x: x + 22, y: beamY + beamH + 50 }, { x: x - 22, y: beamY + beamH + 50 }], { fill: BLOCK, stroke: INK, width: 1.8, close: true, id: `bloco-${i + 1}` });
      name(b, `${formatNumber(l.mass, locale)} kg`, x, beamY + beamH + 32, `bloco-${i + 1}`, INK, 12);
      from = beamY + beamH + 50;
    }
    const tip = { x, y: from + l.force * k };
    arrow(b, { x, y: from }, tip, KEY, `peso-${i + 1}`);
    arrowLabel(b, l.name, tip, { x: 0, y: 1 }, KEY, `peso-${i + 1}`);
  });
  // The unknown force, at its solved position, pushing down or up.
  const fx = X(s.unknown.at);
  const fLen = Math.abs(s.unknown.force) * k;
  const fFrom = up ? { x: fx, y: beamY + beamH + fLen } : { x: fx, y: beamY - fLen };
  const fTo = up ? { x: fx, y: beamY + beamH } : { x: fx, y: beamY };
  arrow(b, fFrom, fTo, GREEN, "forca");
  // Its name beside its head, at the beam, whichever way it pushes.
  arrowLabel(b, "F", { x: fx, y: up ? fTo.y + 12 : fTo.y - 12 }, { x: 1, y: 0 }, GREEN, "forca");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "alavanca em equilíbrio"));
}

export const lever: Kind = { id: "lever", fields: ["length", "support", "loads", "unknown"], validate, draw };
