/**
 * free-fall: a body dropped or thrown vertically, shown as a strobe photo:
 * its position at equal time steps, to scale, with its velocity at each. A
 * throw upward is drawn as two columns side by side, the rise and the fall,
 * so the positions do not overlap.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveFreeFall } from "../physics.ts";
import type { FallSample } from "../physics.ts";
import { common } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, RUST, SOFT, arrow, dimension, eq, hatchLine, name, panelBelow, quantity } from "../draw.ts";

const STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2];

function validate(raw: Record<string, unknown>, path: string): void {
  const v0 = v.optionalNumber(raw, "speed", path) ?? 0;
  const h = v.optionalNumber(raw, "height", path) ?? 0;
  if (h < 0) throw new SpecError(`${path}.height must not be negative, got ${h}`);
  if (v0 <= 0 && h === 0) throw new SpecError(`${path}: dropped or thrown down from the ground, it never moves -- give a height or an upward speed`);
  const dt = v.optionalNumber(raw, "interval", path);
  if (dt !== undefined && !(dt > 0)) throw new SpecError(`${path}.interval must be positive, got ${dt}`);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const v0 = (input.speed as number | undefined) ?? 0;
  const h0 = (input.height as number | undefined) ?? 0;
  const tGround0 = (v0 + Math.sqrt(v0 * v0 + 2 * g * h0)) / g;
  // Positions must stand apart: the first step of a fall from rest is the shortest, g·Δt²/2,
  // and it must be at least 24 px. The interval is given, or the first round step that
  // keeps that and at most 6 steps per column.
  const Hmax = h0 + (v0 > 0 ? (v0 * v0) / (2 * g) : 0);
  const sy0 = 300 / Hmax;
  const apart = (d: number): boolean => ((g * d * d) / 2) * sy0 >= 24;
  const given = input.interval as number | undefined;
  if (given !== undefined && !apart(given)) throw new SpecError(`mechanics: at ${formatNumber(given, locale)} s apart the positions near the top would overlap; give a longer interval`);
  const dt = given ?? STEPS.find((d) => apart(d) && Math.max(v0 / g, tGround0 - Math.max(0, v0 / g)) / d <= 6) ?? 2;
  const s = solveFreeFall(v0, h0, g, dt);
  if (s.up.length + s.down.length > 16) throw new SpecError(`mechanics: ${s.up.length + s.down.length} positions are too many to read; give a longer interval`);
  const sy = 300 / s.H; // px per metre
  const ground = M + 50 + 300;
  const Y = (y: number): number => ground - y * sy;
  const vmax = Math.max(...[...s.up, ...s.down].map((p) => Math.abs(p.v)), 1e-9);
  const kv = 60 / vmax;
  const cols = s.up.length > 0 ? [{ title: "subida", samples: s.up }, { title: "descida", samples: s.down }] : [{ title: "queda", samples: s.down }];
  const left = M + 130;
  const colW = 230;
  const lines: PanelLineInput[] = [];
  if (answers) {
    if (v0 > 0) lines.push({ text: `${eq("t_{s}", s.tTop, "s", locale).replace(/^t_\{s\} /, "subida: t_{s} = v_{0}/g ")}   ·   ${eq("H", s.H, "m", locale).replace(/^H /, h0 > 0 ? "H = h_{0} + v_{0}²/2g " : "H = v_{0}²/2g ")}` });
    lines.push({ text: `${eq("t", s.tGround, "s", locale).replace(/^t /, "chega ao solo em t ")}   ·   ${eq("v", s.vGround, "m/s", locale).replace(/^v /, "com v ")}` });
    lines.push({ text: `posições a cada Δt = ${formatNumber(dt, locale)} s (t_{k} = k·Δt); a cada intervalo a velocidade muda g·Δt = ${quantity(g * dt, locale).text} m/s` });
  }
  const W0 = Math.ceil(left + cols.length * colW + M);
  const figH = ground + 40;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, left - 100, left + cols.length * colW - 40, ground, 1, "solo");
  dimension(b, left - 80, Y(s.H), ground, "altura");
  name(b, "H", left - 96, (Y(s.H) + ground) / 2, "altura", SOFT, 14);
  cols.forEach((col, c) => {
    const x = left + c * colW + 40;
    b.label(col.title, x, M + 18, { size: 14, weight: 700, colour: SOFT, freeStanding: true });
    col.samples.forEach((p: FallSample, i) => {
      const at = { x, y: Y(p.y) - 8 };
      const id = `c${c + 1}-p${i + 1}`;
      b.circle(at, 8, { fill: KEY, stroke: INK, width: 1.1, id });
      // Each position named t_k, close beside it; the one on the ground is named above the ground.
      const k = Math.round(p.t / dt);
      const onGround = p.y < 1e-9;
      name(b, `t_{${k}}`, x - 24, onGround ? at.y - 10 : at.y, id, INK, 13);
      if (Math.abs(p.v) > 1e-9) {
        // Downward near the ground, the arrow arrives at its ball rather than going through the ground.
        const len = p.v * kv;
        const through = at.y - len > ground - 4;
        const from = through ? { x: x + 18, y: at.y + len } : { x: x + 18, y: at.y };
        const to = through ? { x: x + 18, y: at.y } : { x: x + 18, y: at.y - len };
        arrow(b, from, to, p.v > 0 ? GREEN : RUST, `v-${id}`, { width: 2 });
      }
    });
  });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? (v0 > 0 ? "lançamento vertical" : "queda livre")));
}

export const freeFall: Kind = { id: "free-fall", fields: ["speed", "height", "interval"], validate, draw };
