/**
 * angled-pull: a block on a floor pulled by F at θ above the horizontal. F's
 * vertical part lightens the block: N = P − F·sen θ, so friction μN is less
 * than μP; the horizontal part F·cos θ drives it. A pull that would lift the
 * block off the floor is refused.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveAngledPull } from "../physics.ts";
import { common, friction, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, RUST, SOFT, arcPts, arrow, arrowLabel, eq, hatchLine, name, panelBelow, quantity, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  positive(raw, "force", path);
  const angle = v.requiredNumber(raw, "angle", path);
  if (angle < 10 || angle > 70) throw new SpecError(`${path}.angle must be from 10 to 70 degrees, got ${angle}`);
  friction(raw, path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const F = input.force as number;
  const theta = input.angle as number;
  const t = (theta * Math.PI) / 180;
  const mu = input.friction as number | undefined;
  const s = solveAngledPull(mass, g, F, theta, mu ?? 0);
  if (s.lifts) throw new SpecError(`mechanics: F·sen θ = ${quantity(s.Fy, locale).text} N is more than the weight ${quantity(s.P, locale).text} N -- the pull would lift the block off the floor`);
  // One scale for all forces, with F at least 90 px so its decomposition reads.
  const k = Math.max(100 / Math.max(s.P, F, s.N), 90 / F);
  const bw = 140;
  const bh = 76;
  const floor = M + 60 + Math.max(s.N * k - bh / 2, F * Math.sin(t) * k + 20) + bh + 20;
  const G = { x: M + 210, y: floor - bh / 2 };
  // F pulls where a rope is tied: the top-right corner, so both components lie in open space.
  const A = { x: G.x + bw / 2, y: floor - bh };
  const fTip = { x: A.x + F * Math.cos(t) * k, y: A.y - F * Math.sin(t) * k };
  const xTip = { x: fTip.x, y: A.y };
  const yTip = { x: A.x, y: fTip.y };
  const pTip = { x: G.x, y: G.y + s.P * k };
  const nTip = { x: G.x, y: G.y - s.N * k };  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `${eq("F_{x}", s.Fx, "N", locale).replace(/^F_\{x\} /, "F_{x} = F·cos θ ")}   ·   ${eq("F_{y}", s.Fy, "N", locale).replace(/^F_\{y\} /, "F_{y} = F·sen θ ")}` });
    lines.push({ text: `${eq("N", s.N, "N", locale).replace(/^N /, "N = P − F_{y} ")}: o bloco fica mais leve sobre o chão` });
    if (mu !== undefined) {
      lines.push(s.moving
        ? { text: `F_{x} > μ·N: o bloco se move; ${eq("F_{at}", s.friction, "N", locale).replace(/^F_\{at\} /, "F_{at} = μ·N ")}` }
        : { text: `F_{x} ≤ μ·N: o bloco fica em repouso; o atrito estático equilibra F_{x}` });
    }
    lines.push({ text: s.moving ? eq("a", s.a, "m/s²", locale).replace(/^a /, mu === undefined ? "a = F_{x}/m " : "a = (F_{x} − F_{at})/m ") : "a = 0" });
  }
  const W0 = Math.ceil(Math.max(fTip.x + 90, A.x + 140) + M);
  const figH = Math.max(pTip.y + 40, floor + 40);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, G.x - bw / 2 - 120, Math.max(fTip.x, A.x) + 60, floor, 1, "solo");
  rect(b, G.x, floor - bh, bw, bh, "bloco");
  name(b, `${formatNumber(mass, locale)} kg`, G.x - bw / 4 - 6, G.y + 18, "bloco", INK, 13);
  // F at the face, its components dashed with the parallelogram, the angle beyond them.
  b.poly([fTip, xTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-x" });
  b.poly([fTip, yTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-y" });
  arrow(b, A, xTip, SOFT, "fx", { width: 1.8, dashed: true });
  arrow(b, A, yTip, SOFT, "fy", { width: 1.8, dashed: true });
  arrow(b, A, fTip, GREEN, "forca");
  const half = Math.sin(t / 2);
  const d = 15;
  const R = Math.max(30, Math.ceil((d * (1 - half)) / half) + 6);
  b.poly(arcPts(A, R, -t, 0, 20), { stroke: INK, width: 1.3, id: "angulo" });
  b.label(`${formatNumber(theta, locale)}°`, A.x + (R + d) * Math.cos(-t / 2), A.y + (R + d) * Math.sin(-t / 2), { size: 13, weight: 700, colour: INK, annotates: "angulo" });
  // P and N from the centre, to the same scale.
  arrow(b, G, pTip, KEY, "peso");
  arrow(b, G, nTip, "#2E6B3A", "normal");
  b.circle(G, 3, { fill: INK, stroke: INK, width: 1, id: "cg" });
  arrowLabel(b, "F", fTip, { x: Math.cos(t), y: -Math.sin(t) }, GREEN, "forca");
  arrowLabel(b, "F_{x}", { x: xTip.x, y: xTip.y + 6 }, { x: 0, y: 1 }, SOFT, "fx");
  arrowLabel(b, "F_{y}", yTip, { x: 0, y: -1 }, SOFT, "fy");
  arrowLabel(b, "P", pTip, { x: 1, y: 0 }, KEY, "peso");
  arrowLabel(b, "N", nTip, { x: -1, y: 0 }, "#2E6B3A", "normal");  if (mu !== undefined && s.friction > 1e-9) {
    // Friction along the floor face, against the motion, starting at the left edge.
    const f0 = { x: G.x - bw / 2, y: floor - 14 };
    const f1 = { x: f0.x - Math.max(s.friction * k, 16), y: f0.y };
    arrow(b, f0, f1, RUST, "atrito");
    arrowLabel(b, "F_{at}", f1, { x: 0, y: -1 }, RUST, "atrito");
  }
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? `bloco puxado a ${theta}°`));
}

export const angledPull: Kind = { id: "angled-pull", fields: ["mass", "force", "angle", "friction"], validate, draw };
