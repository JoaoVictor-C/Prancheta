/**
 * springs: two springs holding a weight, in series (one under the other: the
 * same force in each, the stretches add) or in parallel (side by side: the
 * same stretch, the forces add). The loaded system hangs beside the same
 * system unloaded, every length to one scale.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveSprings } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, SOFT, arrow, arrowLabel, dimension, eq, hatchLine, name, panelBelow, quantity, rect, springPath } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  const ks = v.array(raw, "stiffness", path, "two spring constants [k₁, k₂], N/m");
  if (ks.length !== 2 || ks.some((k) => typeof k !== "number" || !(k > 0))) throw new SpecError(`${path}.stiffness must be two positive spring constants, N/m`);
  const arr = v.optionalEnum(raw, "arrangement", path, ["series", "parallel"]);
  if (arr === undefined) throw new SpecError(`${path}.arrangement is required: "series" or "parallel"`);
  if (raw.natural !== undefined) positive(raw, "natural", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const [k1, k2] = input.stiffness as [number, number];
  const arr = input.arrangement as "series" | "parallel";
  const L0 = (input.natural as number | undefined) ?? 0.15;
  const s = solveSprings(k1, k2, mass, g, arr);
  const series = arr === "series";
  const natTotal = series ? 2 * L0 : L0;
  const scale = 260 / (natTotal + s.x);
  if (s.x * scale < 18) throw new SpecError(`mechanics: the stretch x = ${quantity(s.x, locale).text} m is too small beside the springs to draw to scale; use a shorter natural length`);
  const ceil = M + 30;
  const xL = M + 110;
  const xR = xL + 210;
  const yNat = ceil + natTotal * scale;
  const yEnd = yNat + s.x * scale;
  const bw = 70;
  const bh = 46;
  const kF = 80 / s.P;
  const pTip = { x: xR, y: yEnd + bh + s.P * kF };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push(series
      ? { text: `em série: a mesma força P = ${quantity(s.P, locale).text} N em cada mola; os alongamentos se somam` }
      : { text: `em paralelo: o mesmo alongamento nas duas; as forças se somam e dão P = ${quantity(s.P, locale).text} N` });
    lines.push({ text: series ? eq("k_{eq}", s.k, "N/m", locale).replace(/^k_\{eq\} /, "k_{eq} = k_{1}·k_{2}/(k_{1} + k_{2}) ") : eq("k_{eq}", s.k, "N/m", locale).replace(/^k_\{eq\} /, "k_{eq} = k_{1} + k_{2} ") });
    lines.push({ text: `${eq("x", s.x, "m", locale).replace(/^x /, "x = P/k_{eq} ")}${series ? `   ·   x_{1} = ${quantity(s.parts[0]!.x, locale).text} m, x_{2} = ${quantity(s.parts[1]!.x, locale).text} m` : `   ·   F_{1} = ${quantity(s.parts[0]!.F, locale).text} N, F_{2} = ${quantity(s.parts[1]!.F, locale).text} N`}` });
  }
  const W0 = Math.ceil(xR + 140 + M);
  const figH = pTip.y + 36;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, xL - 60, xR + 70, ceil, -1, "teto");
  b.poly([{ x: xL + 30, y: yNat }, { x: xR + 80, y: yNat }], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "guia" });
  /** One system (unloaded at xL, loaded at xR): its springs between ceil and its end. */
  const system = (x: number, end: number, loaded: boolean): void => {
    const tag = loaded ? "c" : "s";
    if (series) {
      const mid = loaded ? ceil + (L0 + s.parts[0]!.x) * scale : ceil + L0 * scale;
      b.poly(springPath(x, ceil, mid, 6, 9), { stroke: INK, width: 1.7, id: `mola1-${tag}` });
      b.circle({ x, y: mid }, 3, { fill: INK, stroke: INK, width: 1, id: `junta-${tag}` });
      b.poly(springPath(x, mid, end, 6, 9), { stroke: INK, width: 1.7, id: `mola2-${tag}` });
      if (!loaded) {
        name(b, "k_{1}", x + 30, (ceil + mid) / 2, `mola1-${tag}`, INK, 14);
        name(b, "k_{2}", x + 30, (mid + end) / 2, `mola2-${tag}`, INK, 14);
      }
    } else {
      for (const [dx, i] of [[-20, 1], [20, 2]] as const) {
        b.poly(springPath(x + dx, ceil, end - 6, 6, 8), { stroke: INK, width: 1.7, id: `mola${i}-${tag}` });
        if (!loaded) name(b, `k_{${i}}`, x + dx + (dx < 0 ? -26 : 26), (ceil + end) / 2, `mola${i}-${tag}`, INK, 14);
      }
      b.poly([{ x: x - 34, y: end - 6 }, { x: x + 34, y: end - 6 }, { x: x + 34, y: end }, { x: x - 34, y: end }] as Point[], { fill: INK, stroke: INK, width: 1, close: true, id: `barra-${tag}` });
    }
  };
  system(xL, yNat, false);
  system(xR, yEnd, true);
  rect(b, xR, yEnd, bw, bh, "bloco");
  name(b, `${formatNumber(mass, locale)} kg`, xR, yEnd + bh / 2, "bloco", INK, 13);
  b.poly([{ x: xR + 40, y: yEnd }, { x: xR + 72, y: yEnd }], { stroke: SOFT, width: 1.1, id: "ext-x" });
  dimension(b, xR + 62, yNat, yEnd, "x");
  name(b, "x", xR + 80, (yNat + yEnd) / 2, "x", SOFT, 15);
  arrow(b, { x: xR, y: yEnd + bh }, pTip, KEY, "peso");
  arrowLabel(b, "P", pTip, { x: 1, y: 0 }, KEY, "peso");
  void GREEN;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? (series ? "molas em série" : "molas em paralelo")));
}

export const springs: Kind = { id: "springs", fields: ["mass", "stiffness", "arrangement", "natural"], validate, draw };
