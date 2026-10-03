/**
 * orbit: a Kepler ellipse of semi-major axis a (UA) and eccentricity e, the
 * star at a focus. Perihelion and aphelion are at r = a(1 ∓ e). Two sectors
 * swept in the same time -- one around the perihelion, one around the
 * aphelion -- are traced from Kepler's equation, so their areas are equal
 * (the second law, measured by the tests). The speeds at the two ends are
 * drawn in the ratio v_p/v_a = r_a/r_p.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveOrbit } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, SOFT, arrow, arrowLabel, dimensionH, eq, name, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "semiMajor", path);
  const e = v.requiredNumber(raw, "eccentricity", path);
  if (e < 0.1 || e > 0.7) throw new SpecError(`${path}.eccentricity must be from 0,1 to 0,7 to draw both sectors apart, got ${e}`);
  const dt = v.optionalNumber(raw, "interval", path);
  if (dt !== undefined && (dt < 0.03 || dt > 0.15)) throw new SpecError(`${path}.interval is a fraction of the period, from 0,03 to 0,15, got ${dt}`);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const a = input.semiMajor as number;
  const e = input.eccentricity as number;
  const dt = (input.interval as number | undefined) ?? 0.08;
  const o = solveOrbit(a, e);
  const scale = 240 / a; // the major axis is 480 px
  const star = { x: M + 60 + o.ra * scale, y: M + 70 + o.b * scale };
  const P = (q: { x: number; y: number }): Point => ({ x: star.x + q.x * scale, y: star.y - q.y * scale });
  const ellipse = Array.from({ length: 241 }, (_, i) => P(o.at(i / 240)));
  const sector = (t0: number): Point[] => [star, ...Array.from({ length: 41 }, (_, i) => P(o.at(t0 + (dt * i) / 40)))];
  const peri = P(o.at(0));
  const aph = P(o.at(0.5));
  const va = Math.min(34, 110 / o.speedRatio);
  const vp = va * o.speedRatio;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `${eq("r_{p}", o.rp, "UA", locale).replace(/^r_\{p\} /, "periélio: r_{p} = a(1 − e) ")}   ·   ${eq("r_{a}", o.ra, "UA", locale).replace(/^r_\{a\} /, "afélio: r_{a} = a(1 + e) ")}` });
    lines.push({ text: `2.ª lei: no mesmo intervalo de tempo, as áreas varridas são iguais: A_{1} = A_{2}` });
    lines.push({ text: `${eq("v_{p}/v_{a}", o.speedRatio, "", locale).replace(/^v_\{p\}\/v_\{a\} /, "v_{p}/v_{a} = r_{a}/r_{p} ").trimEnd()}: o planeta é mais rápido perto do Sol` });
    lines.push({ text: `3.ª lei, em torno do Sol: T² = a³, ${eq("T", Math.pow(a, 1.5), "anos", locale)}` });
  }
  const W0 = Math.ceil(star.x + o.rp * scale + vp * 0 + 90 + M);
  const figH = star.y + o.b * scale + 70;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  // The two sectors, swept in the same time.
  b.poly(sector(-dt / 2), { fill: "#DCE9F5", stroke: KEY, width: 1, close: true, id: "area-1" });
  b.poly(sector(0.5 - dt / 2), { fill: "#F6E1DA", stroke: "#B8431B", width: 1, close: true, id: "area-2" });
  b.poly(ellipse, { stroke: INK, width: 1.8, id: "orbita" });
  b.circle(star, 11, { fill: "#F2C14E", stroke: INK, width: 1.2, id: "sol" });
  name(b, "Sol", star.x, star.y + 26, "sol", INK, 13);
  b.circle(peri, 5, { fill: INK, stroke: INK, width: 1, id: "periélio" });
  b.circle(aph, 5, { fill: INK, stroke: INK, width: 1, id: "afélio" });
  b.label("periélio", peri.x + 44, peri.y + 22, { size: 13, colour: SOFT, annotates: "periélio" });
  b.label("afélio", aph.x - 34, aph.y - 20, { size: 13, colour: SOFT, annotates: "afélio" });
  // The two areas, named inside their own sectors.
  const inside = (t: number): Point => {
    const q = P(o.at(t));
    return { x: star.x + (q.x - star.x) * 0.62, y: star.y + (q.y - star.y) * 0.62 };
  };
  // Inside its sector, along its upper edge.
  const edge1 = P(o.at(-dt / 4));
  const a1 = { x: star.x + (edge1.x - star.x) * 0.6, y: star.y + (edge1.y - star.y) * 0.6 + 14 };
  // The aphelion sector is thin: its name sits just above its upper edge.
  const edge = P(o.at(0.5 - dt / 2));
  const a2 = { x: star.x + (edge.x - star.x) * 0.55, y: star.y + (edge.y - star.y) * 0.55 - 4 };
  name(b, "A_{1}", a1.x, a1.y - 14, "area-1", KEY, 13);
  name(b, "A_{2}", a2.x, a2.y - 14, "area-2", "#9A3412", 13);
  void inside;
  // The distances to the star, below the axis.
  dimensionH(b, star.y + o.b * scale + 26, star.x, peri.x, "rp");
  name(b, "r_{p}", (star.x + peri.x) / 2, star.y + o.b * scale + 42, "rp", SOFT, 13);
  dimensionH(b, star.y + o.b * scale + 26, aph.x, star.x, "ra");
  name(b, "r_{a}", (aph.x + star.x) / 2, star.y + o.b * scale + 42, "ra", SOFT, 13);
  // The speeds at the ends, tangent, in the ratio of the distances.
  const vpTip = { x: peri.x, y: peri.y - vp };
  const vaTip = { x: aph.x, y: aph.y + va };
  arrow(b, peri, vpTip, GREEN, "vp");
  arrow(b, aph, vaTip, GREEN, "va");
  arrowLabel(b, "v_{p}", vpTip, { x: 1, y: 0 }, GREEN, "vp");
  arrowLabel(b, "v_{a}", vaTip, { x: -1, y: 0 }, GREEN, "va");
  void quantity;
  void formatNumber;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "órbita elíptica (leis de Kepler)"));
}

export const orbit: Kind = { id: "orbit", fields: ["semiMajor", "eccentricity", "interval"], validate, draw };
