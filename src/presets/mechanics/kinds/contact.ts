/**
 * contact: blocks A and B side by side on a floor, pushed by F on A. Both move
 * with a = (F − f_A − f_B)/(m_A + m_B), and the force A exerts on B is
 * F_AB = m_B·a + f_B; B pushes back on A with the same F_BA (action and
 * reaction), drawn as the pair at the face they share.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveContact } from "../physics.ts";
import { common, friction, positive, twoMasses } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, M, PAPER, RUST, SOFT, TENSION, arrow, arrowLabel, eq, hatchLine, name, panelBelow, quantity, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  twoMasses(raw, path);
  positive(raw, "force", path);
  friction(raw, path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const [mA, mB] = input.masses as [number, number];
  const F = input.force as number;
  const mu = input.friction as number | undefined;
  const s = solveContact(mA, mB, F, g, mu ?? 0);
  const k = 110 / Math.max(F, s.contact, s.fA, s.fB);
  const bw = 120;
  const bh = 92;
  const floor = M + 190;
  const xc = M + 140 + F * k + bw; // the shared face
  const top = floor - bh;
  const lines: PanelLineInput[] = [];
  if (answers) {
    if (mu !== undefined) lines.push({ text: `atritos: f_{A} = μ·m_{A}·g = ${quantity(s.fA, locale).text} N   ·   f_{B} = μ·m_{B}·g = ${quantity(s.fB, locale).text} N` });
    lines.push(s.moving
      ? { text: eq("a", s.a, "m/s²", locale).replace(/^a /, mu === undefined ? "a = F/(m_{A} + m_{B}) " : "a = (F − f_{A} − f_{B})/(m_{A} + m_{B}) ") }
      : { text: "F não vence o atrito: os blocos ficam em repouso, a = 0" });
    lines.push({ text: `${eq("F_{AB}", s.contact, "N", locale).replace(/^F_\{AB\} /, s.moving ? (mu === undefined ? "A empurra B com F_{AB} = m_{B}·a " : "A empurra B com F_{AB} = m_{B}·a + f_{B} ") : "A empurra B com F_{AB} ")}` });
    lines.push({ text: "B empurra A com F_{BA} = F_{AB}, em sentido oposto (ação e reação)" });
  }
  const W0 = Math.ceil(xc + bw + 120 + M);
  const figH = floor + 60;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, M + 20, xc + bw + 80, floor, 1, "solo");
  rect(b, xc - bw / 2, top, bw, bh, "bloco-a", "#CFE0F3");
  rect(b, xc + bw / 2, top, bw, bh, "bloco-b", "#F3E6B8");
  name(b, `A: ${formatNumber(mA, locale)} kg`, xc - bw / 2, top + 20, "bloco-a", INK, 13);
  name(b, `B: ${formatNumber(mB, locale)} kg`, xc + bw / 2, top + 20, "bloco-b", INK, 13);
  // F pushes A's free face.
  const fTo = { x: xc - bw, y: top + bh / 2 };
  arrow(b, { x: fTo.x - F * k, y: fTo.y }, fTo, GREEN, "forca");
  // Its name above its shaft: A's corner sits right by its head.
  name(b, "F", fTo.x - (F * k) / 2, fTo.y - 16, "forca", GREEN, 15);
  // The action–reaction pair above the blocks, from one tail over the shared face:
  // A pushes B to the right, B pushes A to the left, equal.
  const c = s.contact * k;
  if (c > 1) {
    const y = top - 26;
    b.poly([{ x: xc, y: top - 4 }, { x: xc, y: y + 8 }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: "face" });
    arrow(b, { x: xc, y }, { x: xc + c, y }, TENSION, "fab");
    arrow(b, { x: xc, y }, { x: xc - c, y }, TENSION, "fba");
    arrowLabel(b, "F_{AB}", { x: xc + c, y }, { x: 0, y: -1 }, TENSION, "fab");
    arrowLabel(b, "F_{BA}", { x: xc - c, y }, { x: 0, y: -1 }, TENSION, "fba");
  }
  // Friction on each block, along its floor face, against the push.
  if (mu !== undefined) {
    for (const [cx, f, id, nm] of [[xc - bw / 2, s.fA, "fat-a", "f_{A}"], [xc + bw / 2, s.fB, "fat-b", "f_{B}"]] as const) {
      if (f * k < 1) continue;
      const y = floor - 12;
      const from = { x: cx + Math.min(bw / 2 - 6, (f * k) / 2), y };
      const to = { x: from.x - f * k, y };
      arrow(b, from, to, "#9A3412", id, { width: 2 });
      arrowLabel(b, nm, to, { x: 0, y: -1 }, "#9A3412", id);
    }
  }  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "blocos em contato"));
}

export const contact: Kind = { id: "contact", fields: ["masses", "force", "friction"], validate, draw };
