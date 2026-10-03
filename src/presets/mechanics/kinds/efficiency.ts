/**
 * efficiency: where the energy (or power) goes. A band as wide as the input
 * splits into the useful output, which runs on, and each loss, which turns
 * down; every band's width is its value, to one scale. Losses not named are
 * gathered as "outras perdas". The efficiency is η = útil/entrada.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveEfficiency } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { INK, M, PAPER, freeName, name, panelBelow, quantity } from "../draw.ts";

type Loss = { name: string; value: number };

function validate(raw: Record<string, unknown>, path: string): void {
  const input = positive(raw, "input", path);
  const useful = positive(raw, "useful", path);
  if (useful > input) throw new SpecError(`${path}.useful cannot exceed the input`);
  let named = 0;
  if (raw.losses !== undefined) {
    const ls = v.array(raw, "losses", path, "losses [{ name, value }]");
    if (ls.length > 3) throw new SpecError(`${path}.losses: at most 3 named losses`);
    ls.forEach((l, i) => {
      const o = v.object(l, `${path}.losses[${i}]`);
      v.requiredString(o, "name", `${path}.losses[${i}]`);
      named += positive(o, "value", `${path}.losses[${i}]`);
    });
  }
  if (useful + named > input + 1e-9) throw new SpecError(`${path}: the useful part and the losses add to more than the input`);
  v.optionalEnum(raw, "unit", path, ["J", "W", "kWh"]);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const E = input.input as number;
  const U = input.useful as number;
  const unit = (input.unit as string | undefined) ?? "J";
  const losses = ((input.losses as Loss[] | undefined) ?? []).slice();
  const s = solveEfficiency(E, U, losses);
  if (s.rest > 1e-9 * E) losses.push({ name: "outras perdas", value: s.rest });
  const scale = 200 / E; // px per unit
  const x0 = M + 40;
  const top = M + 60;
  const split = x0 + 160;
  const uW = U * scale;
  // Each loss turns down at its own place: the lowest band first (leftmost),
  // so no band crosses another.
  const turn: number[] = [];
  let at = split + 60;
  for (let i = losses.length - 1; i >= 0; i -= 1) { turn[i] = at; at += losses[i]!.value * scale + 50; }
  const end = Math.max(at + 40, split + 240);
  const col = ["#9A3412", "#7A5410", "#6B3FA0", "#4E5763"];
  const lines: PanelLineInput[] = [];
  if (answers) lines.push({ text: `η = útil/entrada = ${formatNumber(U, locale)}/${formatNumber(E, locale)} = ${quantity(s.eta, locale).text} = ${quantity(s.eta * 100, locale).text} %` });
  const W0 = Math.ceil(end + 150 + M);
  const lossDepth = 170;
  const figH = top + E * scale + lossDepth + 40 + losses.length * 22;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  // The input band, as wide as the input.
  b.poly([{ x: x0, y: top }, { x: split, y: top }, { x: split, y: top + E * scale }, { x: x0, y: top + E * scale }], { fill: "#CFE0F3", stroke: "none", close: true, id: "entrada" });
  freeName(b, `entrada: ${formatNumber(E, locale)} ${unit}`, (x0 + split) / 2, top - 18, INK, 13);
  // The useful band runs on, at the top, and ends in an arrow.
  const useful: Point[] = [{ x: split, y: top }, { x: end, y: top }, { x: end + 30, y: top + uW / 2 }, { x: end, y: top + uW }, { x: split, y: top + uW }];
  b.poly(useful, { fill: "#2E6B3A", stroke: "none", close: true, id: "util" });
  name(b, `útil: ${formatNumber(U, locale)} ${unit}`, end + 90, top + uW / 2, "util", "#2E6B3A", 13);
  let y = top + uW;
  losses.forEach((l, i) => {
    const w = l.value * scale;
    const xl = turn[i]!;
    const band: Point[] = [{ x: split, y }, { x: xl + w, y }, { x: xl + w, y: top + E * scale + lossDepth - 30 }, { x: xl + w / 2, y: top + E * scale + lossDepth }, { x: xl, y: top + E * scale + lossDepth - 30 }, { x: xl, y: y + w }, { x: split, y: y + w }];
    b.poly(band, { fill: col[i % col.length]!, stroke: "none", close: true, id: `perda-${i}` });
    const value = answers || l.name !== "outras perdas" ? `: ${formatNumber(Math.round(l.value * 100) / 100, locale)} ${unit}` : "";
    // Named under its own tip, staggered so neighbours never meet.
    name(b, `${l.name}${value}`, xl + w / 2, top + E * scale + lossDepth + 18 + i * 22, `perda-${i}`, col[i % col.length]!, 12);
    y += w;
  });
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "rendimento: para onde vai a energia"));
}

export const efficiency: Kind = { id: "efficiency", fields: ["input", "useful", "losses", "unit"], validate, draw };
