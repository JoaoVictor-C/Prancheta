/**
 * gravitation: two bodies pulling each other with F = G·m₁·m₂/d², equal and
 * opposite (action and reaction, whatever the masses). With `compare`, the
 * same pair at another distance below, its arrows scaled by (d/d')² -- the
 * inverse square law made visible.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveGravitation } from "../physics.ts";
import { common, positive, twoMasses } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, M, PAPER, SOFT, arrow, arrowLabel, dimensionH, name, panelBelow, sci } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  twoMasses(raw, path);
  positive(raw, "distance", path);
  if (raw.compare !== undefined) {
    const c = v.requiredNumber(raw, "compare", path);
    if (!(c > 0) || c === raw.distance) throw new SpecError(`${path}.compare must be another positive distance, got ${c}`);
  }
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const [m1, m2] = input.masses as [number, number];
  const d = input.distance as number;
  const d2 = input.compare as number | undefined;
  const F = solveGravitation(m1, m2, d);
  const rows = d2 === undefined ? [{ d, F, tag: "" }] : [{ d, F, tag: "" }, { d: d2, F: solveGravitation(m1, m2, d2), tag: "'" }];
  const dmax = Math.max(...rows.map((r) => r.d));
  const span = 380; // px for the longest distance
  const Fmax = Math.max(...rows.map((r) => r.F));
  const kF = 90 / Fmax;
  // Body sizes from their masses, relative to each other (radius ∝ ∛m), 12–34 px.
  const big = Math.max(m1, m2);
  const radius = (m: number): number => 12 + 22 * Math.cbrt(m / big);
  const r1 = radius(m1);
  const r2 = radius(m2);
  const left = M + 90;
  const rowH = 150;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `F = G·m_{1}·m_{2}/d² = ${sci(F, locale)} N   (G = 6,67 · 10^{−11} N·m²/kg²)` });
    lines.push({ text: "as duas forças têm o mesmo módulo e sentidos opostos (ação e reação), mesmo com massas diferentes" });
    if (d2 !== undefined) {
      const ratio = (d / d2) ** 2;
      lines.push({ text: `a ${sci(d2, locale)} m: F' = F·(d/d')² = F·${formatNumber(Math.round(ratio * 1e4) / 1e4, locale)} = ${sci(rows[1]!.F, locale)} N` });
    }
  }
  const W0 = Math.ceil(left + span + r2 + 120 + M);
  const figH = M + 40 + rows.length * rowH;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  rows.forEach((row, i) => {
    const y = M + 70 + i * rowH;
    const x1 = left;
    const x2 = left + (span * row.d) / dmax;
    const t = row.tag;
    b.circle({ x: x1, y }, r1, { fill: "#CFE0F3", stroke: INK, width: 1.4, id: `corpo1-${i}` });
    b.circle({ x: x2, y }, r2, { fill: "#F3E6B8", stroke: INK, width: 1.4, id: `corpo2-${i}` });
    name(b, `m_{1}`, x1, y + r1 + 16, `corpo1-${i}`, INK, 13);
    name(b, `m_{2}`, x2, y + r2 + 16, `corpo2-${i}`, INK, 13);
    // Each body is pulled toward the other: equal arrows, opposite senses.
    const len = Math.max(14, row.F * kF);
    arrow(b, { x: x1 + r1, y }, { x: x1 + r1 + len, y }, GREEN, `f12-${i}`);
    arrow(b, { x: x2 - r2, y }, { x: x2 - r2 - len, y }, GREEN, `f21-${i}`);
    arrowLabel(b, `F${t}`, { x: x1 + r1 + len, y }, { x: 0, y: -1 }, GREEN, `f12-${i}`);
    arrowLabel(b, `F${t}`, { x: x2 - r2 - len, y }, { x: 0, y: -1 }, GREEN, `f21-${i}`);
    dimensionH(b, y + Math.max(r1, r2) + 36, x1, x2, `d-${i}`);
    name(b, `${sci(row.d, locale)} m`, (x1 + x2) / 2, y + Math.max(r1, r2) + 52, `d-${i}`, SOFT, 13);
  });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "atração gravitacional"));
}

export const gravitation: Kind = { id: "gravitation", fields: ["masses", "distance", "compare"], validate, draw };
