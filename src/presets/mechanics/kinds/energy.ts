/**
 * energy: a body along a track of named points at given heights. The total
 * mechanical energy at the first point (gravitational, kinetic, and a
 * compressed spring if any) is carried along, less what each stretch
 * dissipates; at each point E_p = mgh and E_c = E − E_p, drawn as stacked
 * bars to one scale under the point, with the initial total as a dashed line.
 * A point the body cannot reach is said so, not drawn.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../../ir/types.ts";
import { rich } from "../../shared/panel.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveEnergy } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { INK, KEY, M, PAPER, RUST, SLOPE, SOFT, eq, name, panelBelow, quantity, springPath } from "../draw.ts";

type TrackPoint = { name: string; height: number };

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  const track = v.array(raw, "track", path, "points [{ name, height }]");
  if (track.length < 2 || track.length > 6) throw new SpecError(`${path}.track must have 2 to 6 points, got ${track.length}`);
  const names = new Set<string>();
  track.forEach((p, i) => {
    const o = v.object(p, `${path}.track[${i}]`);
    const n = v.requiredString(o, "name", `${path}.track[${i}]`);
    if (n.length > 3) throw new SpecError(`${path}.track[${i}].name must be short (A, B, C), got ${JSON.stringify(n)}`);
    if (names.has(n)) throw new SpecError(`${path}.track[${i}].name ${JSON.stringify(n)} repeats`);
    names.add(n);
    const h = v.requiredNumber(o, "height", `${path}.track[${i}]`);
    if (h < 0) throw new SpecError(`${path}.track[${i}].height must not be negative, got ${h}`);
  });
  const sp = v.optionalNumber(raw, "speed", path);
  if (sp !== undefined && sp < 0) throw new SpecError(`${path}.speed must not be negative, got ${sp}`);
  if (raw.launcher !== undefined) {
    const l = v.object(raw.launcher, `${path}.launcher`);
    positive(l, "stiffness", `${path}.launcher`);
    positive(l, "compression", `${path}.launcher`);
  }
  if (raw.lost !== undefined) {
    const lost = v.array(raw, "lost", path, "energy lost on each stretch, J");
    if (lost.length !== track.length - 1 || lost.some((x) => typeof x !== "number" || x < 0)) throw new SpecError(`${path}.lost must give ${track.length - 1} non-negative energies, one per stretch`);
  }
}

/** A legend entry with real subscripts, free-standing like every legend row. */
function legendText(b: Board, text: string, cx: number, cy: number, colour: string): void {
  const runs = rich(text);
  const block = b.label(runsText(runs), cx, cy, { size: 13, weight: 700, colour, freeStanding: true });
  block.runs = runs.map((q) => ({ ...q }));
}

/** Cosine easing between two heights: level at both ends, so every point is a crest, a valley or a step. */
function ease(a: number, b: number, t: number): number {
  return a + ((b - a) * (1 - Math.cos(Math.PI * t))) / 2;
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const track = input.track as TrackPoint[];
  const v0 = (input.speed as number | undefined) ?? 0;
  const launcher = input.launcher as { stiffness: number; compression: number } | undefined;
  const lost = (input.lost as number[] | undefined) ?? [];
  const s = solveEnergy(mass, g, track, v0, launcher === undefined ? undefined : { k: launcher.stiffness, x: launcher.compression }, lost);
  if (!(s.E0 > 0)) throw new SpecError("mechanics: the body starts with no energy at all -- give it height, speed or a spring");
  const n = track.length;
  const maxH = Math.max(...track.map((p) => p.height));
  const sh = maxH > 0 ? 170 / maxH : 1;
  const left = M + 60 + (launcher === undefined ? 0 : 70);
  const dx = 560 / (n - 1);
  const top = M + 70;
  const base = top + maxH * sh + 20;
  const X = (i: number): number => left + i * dx;
  const Y = (h: number): number => base - 20 - h * sh;
  const barTop = base + 60;
  const barH = 150;
  const se = barH / s.E0;
  const barBase = barTop + barH;
  const lines: PanelLineInput[] = [];
  if (answers) {
    const parts = [`m·g·h_{${track[0]!.name}}`];
    if (v0 > 0) parts.push(`m·v_{${track[0]!.name}}²/2`);
    if (launcher !== undefined) parts.push("k·x²/2");
    lines.push({ text: `E_{mec} = ${parts.join(" + ")} = ${quantity(s.E0, locale).text} J` });
    s.points.slice(1).forEach((p, i) => {
      const loss = lost[i] ?? 0;
      const lossText = loss > 0 ? `${formatNumber(loss, locale)} J dissipados; ` : "";
      lines.push({
        text: p.reached
          ? `${p.name}: ${lossText}E_{p} = ${quantity(p.Ep, locale).text} J, E_{c} = ${quantity(p.Ek, locale).text} J, ${eq("v", p.v, "m/s", locale)}`
          : `${p.name}: ${lossText}não é atingido -- a energia mecânica não chega a m·g·h_{${p.name}} = ${quantity(p.Ep, locale).text} J`,
      });
    });
  }
  const W0 = Math.ceil(X(n - 1) + 120 + M);
  const figH = answers ? barBase + 50 : base + 30;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  // The track: eased between the points, filled down to the ground.
  const curve: Point[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k <= 30; k += 1) {
      if (i > 0 && k === 0) continue;
      const t = k / 30;
      curve.push({ x: X(i) + dx * t, y: Y(ease(track[i]!.height, track[i + 1]!.height, t)) });
    }
  }
  const x0 = left - 40 - (launcher === undefined ? 0 : 70);
  const x1 = X(n - 1) + 40;
  b.poly([{ x: x0, y: Y(track[0]!.height) }, ...curve, { x: x1, y: Y(track[n - 1]!.height) }, { x: x1, y: base }, { x: x0, y: base }], { fill: SLOPE, stroke: "none", close: true, id: "terreno" });
  b.poly([{ x: x0, y: Y(track[0]!.height) }, ...curve, { x: x1, y: Y(track[n - 1]!.height) }], { stroke: INK, width: 2.4, id: "pista" });
  // Each point named with its height, above it; the first is where the body starts, so its
  // name sits above the body and names it.
  track.forEach((p, i) => {
    const at = { x: X(i), y: Y(p.height) };
    const text = `${p.name} (${formatNumber(p.height, locale)} m)`;
    if (i > 0) {
      b.circle(at, 4, { fill: INK, stroke: INK, width: 1, id: `ponto-${i}` });
      name(b, text, at.x, at.y - 22, `ponto-${i}`, INK, 14);
    } else {
      name(b, text, at.x, at.y - 46, "corpo", INK, 14);
    }
  });
  b.poly([{ x: x0, y: base - 20 }, { x: x1, y: base - 20 }], { stroke: INK, width: 1.4, id: "nivel-zero" });
  // The body at the start, and its spring if launched.
  const start = { x: X(0), y: Y(track[0]!.height) };
  if (launcher !== undefined) {
    const wallX = start.x - 120;
    b.poly([{ x: wallX, y: start.y - 40 }, { x: wallX, y: start.y }], { stroke: INK, width: 3, id: "parede" });
    // A vertical spring path laid along x: its "y" runs from the wall to the body.
    const sp = springPath(0, wallX, start.x - 10, 7, 8);
    b.poly(sp.map((q) => ({ x: q.y, y: start.y - 12 + q.x })), { stroke: INK, width: 1.6, id: "mola" });
  }
  b.circle({ x: start.x, y: start.y - 12 }, 10, { fill: KEY, stroke: INK, width: 1.2, id: "corpo" });
  // The bars: E_p and E_c stacked under each point, to one scale; the initial total dashed.
  if (answers) {
    b.poly([{ x: X(0) - 30, y: barBase - s.E0 * se }, { x: X(n - 1) + 30, y: barBase - s.E0 * se }], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "e-inicial" });
    b.poly([{ x: X(0) - 30, y: barBase }, { x: X(n - 1) + 30, y: barBase }], { stroke: INK, width: 1.4, id: "barras-base" });
    s.points.forEach((p, i) => {
      if (!p.reached) return;
      const w = 26;
      const cx = X(i);
      const ep = p.Ep * se;
      const ek = p.Ek * se;
      if (ep > 0.5) b.poly([{ x: cx - w / 2, y: barBase }, { x: cx + w / 2, y: barBase }, { x: cx + w / 2, y: barBase - ep }, { x: cx - w / 2, y: barBase - ep }], { fill: KEY, stroke: "none", close: true, id: `ep-${i}` });
      b.label(p.name, cx, barBase + 16, { size: 13, weight: 700, colour: SOFT, freeStanding: true });
      if (ek > 0.5) b.poly([{ x: cx - w / 2, y: barBase - ep }, { x: cx + w / 2, y: barBase - ep }, { x: cx + w / 2, y: barBase - ep - ek }, { x: cx - w / 2, y: barBase - ep - ek }], { fill: RUST, stroke: "none", close: true, id: `ek-${i}` });
    });
    // The legend, to the right of the last bar.
    const lx = X(n - 1) + 52;
    b.poly([{ x: lx, y: barTop + 20 }, { x: lx + 14, y: barTop + 20 }, { x: lx + 14, y: barTop + 34 }, { x: lx, y: barTop + 34 }], { fill: KEY, stroke: "none", close: true, id: "legenda-ep" });
    legendText(b, "E_{p}", lx + 34, barTop + 27, KEY);
    b.poly([{ x: lx, y: barTop + 46 }, { x: lx + 14, y: barTop + 46 }, { x: lx + 14, y: barTop + 60 }, { x: lx, y: barTop + 60 }], { fill: RUST, stroke: "none", close: true, id: "legenda-ec" });
    legendText(b, "E_{c}", lx + 34, barTop + 53, RUST);
  }
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "energia mecânica ao longo da pista"));
}

export const energy: Kind = { id: "energy", fields: ["mass", "track", "speed", "launcher", "lost"], validate, draw };
