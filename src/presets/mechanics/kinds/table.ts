/**
 * table: block A on a table, joined over a pulley at its edge to block B
 * hanging. With P_B > μN the system moves, a = (P_B − μN)/(m_A + m_B) and
 * T = m_B(g − a); otherwise static friction holds it and T = P_B.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveTable } from "../physics.ts";
import { common, friction, twoMasses } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, RUST, SLOPE, TENSION, WHEEL, arcPts, arrow, arrowLabel, eq, name, panelBelow, quantity, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  twoMasses(raw, path);
  friction(raw, path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const [mA, mB] = input.masses as [number, number];
  const mu = input.friction as number | undefined;
  const s = solveTable(mA, mB, g, mu);
  const k = 100 / Math.max(s.PA, s.PB, s.N);
  const yt = M + 40 + s.N * k + 26 + 30; // room above A for N and its name
  const x0 = M + 20;
  const x1 = x0 + 360;
  const bw = 120; // wide enough for the mass and the name on either side of P and N
  const bh = 52;
  const GA = { x: x0 + 170, y: yt - bh / 2 };
  const r = 20;
  const C = { x: x1 + 26, y: GA.y + r }; // the rope leaves A level and meets the wheel at its top
  const bx = C.x + r;
  const bTop = yt + 112;
  const bwB = 60;
  const pATip = { x: GA.x, y: GA.y + s.PA * k };
  const pBTip = { x: bx, y: bTop + bh + s.PB * k };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P_{A} = m_{A}·g = ${quantity(s.PA, locale).text} N   ·   P_{B} = m_{B}·g = ${quantity(s.PB, locale).text} N   ·   N = P_{A}` });
    if (mu !== undefined) {
      lines.push(s.sliding
        ? { text: `P_{B} > μ·N: o sistema se move; F_{at} = μ·N = ${quantity(s.friction, locale).text} N` }
        : { text: `P_{B} ≤ μ·N: o sistema fica em repouso; o atrito estático equilibra P_{B}: F_{at} = ${quantity(s.friction, locale).text} N` });
    }
    if (s.sliding) {
      lines.push({ text: `${eq("a", s.a, "m/s²", locale).replace(/^a /, mu === undefined ? "a = P_{B}/(m_{A} + m_{B}) " : "a = (P_{B} − F_{at})/(m_{A} + m_{B}) ")}` });
      lines.push({ text: `${eq("T", s.T, "N", locale).replace(/^T /, "T = m_{B}(g − a) ")}` });
    } else {
      lines.push({ text: `a = 0   ·   T = P_{B} = ${quantity(s.T, locale).text} N` });
    }
  }
  const W0 = Math.ceil(bx + bwB / 2 + 110 + M);
  const figH = Math.max(pBTip.y + 34, pATip.y + 34, yt + 170);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);

  // The table: a slab on two legs, and the pulley's bracket at its edge.
  b.poly([{ x: x0, y: yt }, { x: x1, y: yt }, { x: x1, y: yt + 12 }, { x: x0, y: yt + 12 }], { fill: SLOPE, stroke: INK, width: 2, close: true, id: "mesa" });
  for (const lx of [x0 + 24, x1 - 24]) b.poly([{ x: lx, y: yt + 12 }, { x: lx, y: yt + 170 }], { stroke: INK, width: 3, id: `perna-${lx}` });
  b.poly([{ x: x1, y: yt + 6 }, C], { stroke: INK, width: 2.4, id: "suporte" });
  b.circle(C, r, { stroke: INK, width: 2.2, fill: WHEEL, id: "polia" });
  // The rope: level from A, over the wheel's top-right quarter, straight down to B.
  b.poly([{ x: GA.x + bw / 2, y: GA.y }, { x: C.x, y: C.y - r }, ...arcPts(C, r, -Math.PI / 2, 0, 10), { x: bx, y: bTop }], { stroke: INK, width: 1.8, id: "fio" });
  b.circle(C, 3, { stroke: INK, width: 1, fill: INK, id: "eixo" });
  rect(b, GA.x, yt - bh, bw, bh, "bloco-a");
  rect(b, bx, bTop, bwB, bh, "bloco-b");
  name(b, `${formatNumber(mA, locale)} kg`, GA.x - bw / 4 - 2, GA.y, "bloco-a", INK, 13);
  name(b, "A", GA.x + bw / 4 + 2, GA.y, "bloco-a", INK, 15);
  name(b, `B: ${formatNumber(mB, locale)} kg`, bx + bwB / 2 + 52, bTop + bh / 2, "bloco-b", INK, 14);
  // Forces on A.
  arrow(b, GA, pATip, KEY, "peso-a");
  arrow(b, GA, { x: GA.x, y: GA.y - s.N * k }, GREEN, "normal");
  const tA0 = { x: GA.x + bw / 2 + 4, y: GA.y - 10 }; // beside the rope, not on it
  const tA1 = { x: tA0.x + s.T * k, y: tA0.y };
  arrow(b, tA0, tA1, TENSION, "tracao-a");
  let fTip: Point | undefined;
  if (mu !== undefined && s.friction > 1e-9) {
    const f0 = { x: GA.x - bw / 2, y: GA.y };
    fTip = { x: f0.x - Math.max(s.friction * k, 16), y: f0.y };
    arrow(b, f0, fTip, RUST, "atrito");
  }
  // Forces on B.
  const tB0 = { x: bx - 10, y: bTop - 3 };
  const tB1 = { x: tB0.x, y: tB0.y - s.T * k };
  arrow(b, tB0, tB1, TENSION, "tracao-b");
  arrow(b, { x: bx, y: bTop + bh }, pBTip, KEY, "peso-b");
  arrowLabel(b, "P_{A}", pATip, { x: 0, y: 1 }, KEY, "peso-a");
  arrowLabel(b, "N", { x: GA.x, y: GA.y - s.N * k }, { x: 0, y: -1 }, GREEN, "normal");
  arrowLabel(b, "T", tA1, { x: 0, y: -1 }, TENSION, "tracao-a");
  if (fTip !== undefined) arrowLabel(b, "F_{at}", fTip, { x: -1, y: 0 }, RUST, "atrito");
  arrowLabel(b, "T", tB1, { x: -1, y: 0 }, TENSION, "tracao-b");
  arrowLabel(b, "P_{B}", pBTip, { x: 0, y: 1 }, KEY, "peso-b");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "bloco sobre a mesa ligado a um bloco suspenso"));
}

export const table: Kind = { id: "table", fields: ["masses", "friction"], validate, draw };
