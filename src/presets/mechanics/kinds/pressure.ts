/**
 * pressure: hydrostatics. `setup: "depth"` -- points at given depths in a
 * liquid, p = p₀ + ρ·g·h at each, the depths to scale. `setup: "u-tube"` --
 * two liquids that do not mix in a U-tube: at the level of their interface
 * the pressures are equal, so ρ₁·h₁ = ρ₂·h₂ above it.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { pressureAt, solveUTube } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { INK, M, PAPER, SOFT, dimension, eq, freeName, name, panelBelow, quantity, sci } from "../draw.ts";

type DepthPoint = { name: string; depth: number };

function validate(raw: Record<string, unknown>, path: string): void {
  const setup = v.optionalEnum(raw, "setup", path, ["depth", "u-tube"]);
  if (setup === undefined) throw new SpecError(`${path}.setup is required: "depth" or "u-tube"`);
  if (setup === "depth") {
    if (raw.liquidDensity !== undefined) positive(raw, "liquidDensity", path);
    const ps = v.array(raw, "points", path, "points [{ name, depth }]");
    if (ps.length < 1 || ps.length > 4) throw new SpecError(`${path}.points must have 1 to 4 points`);
    ps.forEach((p, i) => {
      const o = v.object(p, `${path}.points[${i}]`);
      v.requiredString(o, "name", `${path}.points[${i}]`);
      const d = v.requiredNumber(o, "depth", `${path}.points[${i}]`);
      if (d < 0) throw new SpecError(`${path}.points[${i}].depth must not be negative`);
    });
    const p0 = v.optionalNumber(raw, "surface", path);
    if (p0 !== undefined && p0 < 0) throw new SpecError(`${path}.surface (the pressure at the surface) must not be negative`);
  } else {
    const ds = v.array(raw, "densities", path, "the two liquids' densities [ρ₁, ρ₂], kg/m³");
    if (ds.length !== 2 || ds.some((d) => typeof d !== "number" || !(d > 0))) throw new SpecError(`${path}.densities must be two positive densities`);
    positive(raw, "height", path);
  }
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  if (input.setup === "u-tube") {
    const [r1, r2] = input.densities as [number, number];
    const h1 = input.height as number;
    const h2 = solveUTube(r1, h1, r2);
    const scale = 220 / Math.max(h1, h2);
    const xL = M + 140;
    const xR = xL + 200;
    const w = 50;
    const iface = M + 60 + Math.max(h1, h2) * scale; // the interface level
    const bottom = iface + 90;
    const lines: PanelLineInput[] = [];
    if (answers) {
      lines.push({ text: "no nível da interface, as pressões nos dois ramos são iguais: ρ_{1}·g·h_{1} = ρ_{2}·g·h_{2}" });
      lines.push({ text: eq("h_{2}", h2, "m", locale).replace(/^h_\{2\} /, "h_{2} = ρ_{1}·h_{1}/ρ_{2} ") });
    }
    const W0 = Math.ceil(xR + w / 2 + 140 + M);
    const figH = bottom + 40;
    const panel = panelBelow({ W: W0, y: figH }, lines);
    const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
    const H = Math.ceil(figH + panel.height + M);
    const b = new Board(W, H, PAPER);
    const c1 = "#F3E6B8";
    const c2 = "#DCE9F5";
    // Liquid 2 fills the bend and the right branch; liquid 1 sits on it in the left branch.
    b.poly([{ x: xL - w / 2, y: iface }, { x: xL + w / 2, y: iface }, { x: xL + w / 2, y: bottom - w }, { x: xR - w / 2, y: bottom - w }, { x: xR - w / 2, y: iface - h2 * scale }, { x: xR + w / 2, y: iface - h2 * scale }, { x: xR + w / 2, y: bottom }, { x: xL - w / 2, y: bottom }], { fill: c2, stroke: "none", close: true, id: "liquido-2" });
    b.poly([{ x: xL - w / 2, y: iface - h1 * scale }, { x: xL + w / 2, y: iface - h1 * scale }, { x: xL + w / 2, y: iface }, { x: xL - w / 2, y: iface }], { fill: c1, stroke: "none", close: true, id: "liquido-1" });
    const top = M + 30;
    b.poly([{ x: xL - w / 2, y: top }, { x: xL - w / 2, y: bottom }, { x: xR + w / 2, y: bottom }, { x: xR + w / 2, y: top }], { stroke: INK, width: 2.2, id: "tubo-fora" });
    b.poly([{ x: xL + w / 2, y: top }, { x: xL + w / 2, y: bottom - w }, { x: xR - w / 2, y: bottom - w }, { x: xR - w / 2, y: top }], { stroke: INK, width: 2.2, id: "tubo-dentro" });
    b.poly([{ x: xL - w / 2 - 30, y: iface }, { x: xR + w / 2 + 30, y: iface }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: "interface" });
    dimension(b, xL - w / 2 - 50, iface - h1 * scale, iface, "h1");
    name(b, "h_{1}", xL - w / 2 - 70, iface - (h1 * scale) / 2, "h1", SOFT, 14);
    dimension(b, xR + w / 2 + 50, iface - h2 * scale, iface, "h2");
    name(b, "h_{2}", xR + w / 2 + 72, iface - (h2 * scale) / 2, "h2", SOFT, 14);
    freeName(b, `1: ${formatNumber(r1, locale)} kg/m³`, xL, top - 14, INK, 12);
    freeName(b, `2: ${formatNumber(r2, locale)} kg/m³`, xR, top - 14, INK, 12);
    panel.draw(b);
    return parseSpec(b.spec(input.title ?? "tubo em U com dois líquidos"));
  }
  const rho = (input.liquidDensity as number | undefined) ?? 1000;
  const p0 = (input.surface as number | undefined) ?? 1e5;
  const points = input.points as DepthPoint[];
  const dmax = Math.max(...points.map((p) => p.depth), 1e-9);
  const scale = 240 / dmax;
  const tank = { x0: M + 40, x1: M + 470, top: M + 40 };
  const surface = tank.top + 30;
  const bottom = surface + dmax * scale + 40;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `p = p_{0} + ρ·g·h, com p_{0} = ${sci(p0, locale)} Pa e ρ = ${formatNumber(rho, locale)} kg/m³` });
    for (const p of points) lines.push({ text: `${p.name} (h = ${formatNumber(p.depth, locale)} m): p = ${sci(pressureAt(p0, rho, g, p.depth), locale)} Pa` });
  }
  const W0 = Math.ceil(tank.x1 + 120 + M);
  const figH = bottom + 40;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  b.poly([{ x: tank.x0, y: surface }, { x: tank.x1, y: surface }, { x: tank.x1, y: bottom }, { x: tank.x0, y: bottom }], { fill: "#DCE9F5", stroke: "none", close: true, id: "liquido" });
  b.poly([{ x: tank.x0, y: surface }, { x: tank.x1, y: surface }], { stroke: "#2F6FAE", width: 1.6, id: "superficie" });
  b.poly([{ x: tank.x0, y: tank.top }, { x: tank.x0, y: bottom }, { x: tank.x1, y: bottom }, { x: tank.x1, y: tank.top }], { stroke: INK, width: 2.4, id: "tanque" });
  points.forEach((p, i) => {
    const x = tank.x0 + 50 + i * 100;
    const y = surface + p.depth * scale;
    b.circle({ x, y }, 5, { fill: INK, stroke: INK, width: 1, id: `ponto-${i}` });
    // Each point named with its depth; the depth itself is a dashed drop from the surface.
    const label = `${p.name} (${formatNumber(p.depth, locale)} m)`;
    name(b, label, x + 12 + b.measure(label, 13, 0.1, 700) / 2, y, `ponto-${i}`, INK, 13);
    if (p.depth > 0) b.poly([{ x, y: surface + 2 }, { x, y: y - 7 }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: `prof-${i}` });
  });
  void quantity;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "pressão num líquido"));
}

export const pressure: Kind = { id: "pressure", fields: ["setup", "liquidDensity", "points", "surface", "densities", "height"], validate, draw };
