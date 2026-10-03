/**
 * pulleys: n movable pulleys in series (0–3), each hung by its own rope from
 * the ceiling and lifting the one below; tension halves at each, T_i = P/2^i,
 * and the hand pulls F = P/2^n (through a fixed pulley when `redirect`). The
 * rope is traced from the pulley geometry -- vertical runs tangent to each
 * wheel, wrapping under a movable one and over the fixed one.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import { hasScripts, rich } from "../../shared/panel.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solvePulleys } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { BLOCK, INK, KEY, M, PAPER, RUST, SOFT, WHEEL, arcPts, arrow, arrowLabel, eq, hatchLine, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  const n = v.optionalNumber(raw, "movable", path);
  if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 3)) throw new SpecError(`${path}.movable must be 0, 1, 2 or 3, got ${n}`);
  v.optionalBoolean(raw, "redirect", path);
  v.optionalBoolean(raw, "tensions", path);
  if (raw.redirect === false && (n ?? 1) === 0) throw new SpecError(`${path}: with no movable pulley the rope needs the fixed pulley (redirect)`);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const n = (input.movable as number | undefined) ?? 1;
  const redirect = (input.redirect as boolean | undefined) ?? true;
  const tensions = input.tensions === true;
  const s = solvePulleys(mass, g, n);
  const r = 24;
  const ceil = 56;
  const dy = n >= 2 ? 135 : 105; // stacked pulleys leave room for a tension label between them
  const k = 90 / s.P; // px per newton
  const fixedY = ceil + 62;
  const lowY = (redirect ? fixedY : ceil) + 2 * r + 80 + (n - 1) * dy;
  const C: Point[] = [];
  const x1 = M + 120;
  for (let i = 0; i < n; i += 1) C.push({ x: x1 + i * r, y: lowY - i * dy });
  const Fp: Point | undefined = redirect ? { x: n === 0 ? x1 + r : C[n - 1]!.x + 2 * r, y: fixedY } : undefined;
  const hangX = n === 0 ? Fp!.x - r : C[0]!.x;
  const hookY = n === 0 ? fixedY + 2 * r + 80 : C[0]!.y;
  const blockTop = (n === 0 ? hookY : hookY + r + 36);
  const blockH = 52;
  const pTip = blockTop + blockH + s.P * k;
  const freeX = redirect ? Fp!.x + r : C[n - 1]!.x + r;
  const endY = redirect ? Math.max(blockTop, (n === 0 ? fixedY : C[0]!.y) + 30) : C[n - 1]!.y - dy * 0.85;
  const fLen = Math.max(18, s.F * k);
  const lines: PanelLineInput[] = answers
    ? [
        { text: `P = m·g = ${formatNumber(mass, locale)} · ${formatNumber(g, locale)} = ${quantity(s.P, locale).text} N` },
        n === 0
          ? { text: `a polia fixa só muda a direção: F = P = ${quantity(s.F, locale).text} N` }
          : { text: `cada polia móvel divide a força por 2: F = P/${s.advantage} = ${eq("", s.F, "N", locale).slice(3)}` },
        ...(tensions ? s.tensions.map((t, i) => ({ text: `T_{${i + 1}} = P/${2 ** (i + 1)} = ${eq("", t, "N", locale).slice(3)}` })) : []),
      ]
    : [];
  const right = Math.max(freeX, Fp === undefined ? 0 : Fp.x + r) + 150;
  const W0 = Math.ceil(right + M);
  const figH = Math.max(pTip, redirect ? endY + fLen : 0) + 30;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  // The ceiling, wide enough for every anchor.
  const anchors = [...C.map((c) => c.x - r), ...(Fp === undefined ? [] : [Fp.x])];
  hatchLine(b, Math.min(...anchors) - 40, Math.max(...anchors) + 40, ceil, -1, "teto");
  // Wheels first; the rope is drawn over their rims.
  if (Fp !== undefined) {
    b.poly([{ x: Fp.x, y: ceil }, { x: Fp.x, y: Fp.y }], { stroke: INK, width: 2.4, id: "haste" });
    b.circle(Fp, r, { stroke: INK, width: 2.2, fill: WHEEL, id: "polia-fixa" });
  }
  C.forEach((c, i) => b.circle(c, r, { stroke: INK, width: 2.2, fill: WHEEL, id: `polia-movel-${i + 1}` }));
  // Ropes.
  for (let i = 0; i < n; i += 1) {
    const c = C[i]!;
    const pts: Point[] = [{ x: c.x - r, y: ceil }, ...arcPts(c, r, Math.PI, 0)];
    if (i < n - 1) {
      const up = C[i + 1]!;
      pts.push({ x: c.x + r, y: up.y + r + 14 });
      b.poly([up, { x: up.x, y: up.y + r + 14 }], { stroke: INK, width: 2, id: `alca-${i + 2}` });
    } else if (redirect) {
      pts.push(...arcPts(Fp!, r, Math.PI, 2 * Math.PI), { x: freeX, y: endY });
    } else {
      pts.push({ x: freeX, y: endY });
    }
    b.poly(pts, { stroke: RUST, width: 2.4, id: `corda-${i + 1}` });
  }
  if (n === 0) b.poly([{ x: hangX, y: blockTop }, ...arcPts(Fp!, r, Math.PI, 2 * Math.PI), { x: freeX, y: endY }], { stroke: RUST, width: 2.4, id: "corda-1" });
  if (Fp !== undefined) b.circle(Fp, 3, { stroke: INK, width: 1, fill: INK, id: "eixo-fixa" });
  C.forEach((c, i) => b.circle(c, 3, { stroke: INK, width: 1, fill: INK, id: `eixo-movel-${i + 1}` }));
  // The block on its hook.
  if (n > 0) b.poly([{ x: hangX, y: hookY }, { x: hangX, y: blockTop }], { stroke: INK, width: 2, id: "gancho" });
  b.poly([{ x: hangX - 34, y: blockTop }, { x: hangX + 34, y: blockTop }, { x: hangX + 34, y: blockTop + blockH }, { x: hangX - 34, y: blockTop + blockH }],
    { stroke: INK, width: 2.2, fill: BLOCK, close: true, id: "bloco" });
  b.label(`${formatNumber(mass, locale)} kg`, hangX, blockTop + blockH / 2, { size: 15, weight: 700, colour: INK, annotates: "bloco" });
  // Forces, to one scale.
  arrow(b, { x: hangX, y: blockTop + blockH }, { x: hangX, y: pTip }, KEY, "peso");
  arrowLabel(b, "P", { x: hangX, y: pTip - 10 }, { x: 1, y: 0 }, KEY, "peso");
  const fTip = { x: freeX, y: redirect ? endY + fLen : endY - fLen };
  arrow(b, { x: freeX, y: endY }, fTip, RUST, "forca");
  arrowLabel(b, "F", { x: fTip.x, y: fTip.y + (redirect ? -10 : 10) }, { x: 1, y: 0 }, RUST, "forca");
  // Tensions, beside each rope's anchored run.
  if (tensions) {
    s.tensions.forEach((t, i) => {
      const c = C[i]!;
      // Between the two runs of its own rope, above its wheel: the one gap no other rope crosses.
      void t;
      const runs = rich(`T_{${i + 1}}`);
      const plain = runsText(runs);
      const top = i < n - 1 ? C[i + 1]!.y + r + 14 : redirect ? Fp!.y : ceil;
      const block = b.label(plain, c.x, (top + c.y - r) / 2, { size: 14, weight: 700, colour: RUST, annotates: `corda-${i + 1}` });
      if (hasScripts(runs)) block.runs = runs.map((q) => ({ ...q }));
    });
  }
  if (Fp !== undefined) b.place("polia fixa", Fp.x + r + 50, Fp.y - 4, [{ x: 1, y: 0 }], { size: 13, colour: SOFT, annotates: "polia-fixa", steps: 6 });
  if (n === 1 && !tensions) b.place("polia móvel", C[0]!.x - r - 52, C[0]!.y + 4, [{ x: -1, y: 0 }], { size: 13, colour: SOFT, annotates: "polia-movel-1", steps: 6 });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? (n === 0 ? "polia fixa" : `${n} polia(s) móvel(is)`)));
}

export const pulleys: Kind = { id: "pulleys", fields: ["mass", "movable", "redirect", "tensions"], validate, draw };
