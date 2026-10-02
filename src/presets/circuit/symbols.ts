/**
 * Circuit symbols as geometry: each symbol is a set of paths in canvas
 * space, built about a centre `c` on a straight run with unit direction `d`
 * (along the run, from the component's `from` toward its `to`) and normal
 * `n` (d turned a quarter). Nothing here draws; `preset.ts` turns a path
 * into a Mark and records its ink.
 *
 * Every symbol keeps to the conventions of the Brazilian physics textbook
 * (Halliday, Ramalho): a zigzag resistor (or the IEC rectangle on request),
 * a battery as a long thin plate (+) and a short thick one (−), circled
 * sources, meters and lamp, and a switch drawn as a lever between two
 * terminals. The sign "+" is DRAWN (two strokes), not typeset, so it is
 * never text sitting on ink.
 */

import type { Point } from "../../ir/types.ts";

export type Op = { line: Point } | { arc: Point; centre: Point };

/** One stroked path: a start point and a run of lines and minor arcs. */
export type Path = {
  /** Suffix of the component id, "" for the part a value label names. */
  part: string;
  start: Point;
  ops: Op[];
  width: number;
  fill?: string;
  close?: boolean;
  /** A dashed outline (the box round a non-ideal source). */
  dashed?: boolean;
};

export type SymbolKind =
  | "resistor"
  | "lamp"
  | "battery"
  | "voltage-source"
  | "current-source"
  | "ammeter"
  | "voltmeter"
  | "switch"
  | "led"
  | "diode"
  | "load";

/** What a symbol's size depends on beyond its kind. */
export type SymbolExtras = {
  /** A battery drawn with its internal resistance r in series, inside a dashed box. */
  internal?: boolean;
  /** A load box: half its length along the run, half its width across it. */
  load?: { al: number; ac: number };
};

/** How far the body runs along the axis, each side of its centre. */
export function halfLength(kind: SymbolKind, extras: SymbolExtras = {}): number {
  switch (kind) {
    case "led":
    case "diode":
      return DIODE_H;
    case "load":
      return extras.load?.al ?? 30;
    case "resistor":
      return 24;
    case "battery":
      return extras.internal === true ? INTERNAL_BOX_HALF : 4;
    case "lamp":
      return LAMP_R;
    case "ammeter":
    case "voltmeter":
      return METER_R;
    case "voltage-source":
    case "current-source":
      return SOURCE_R;
    case "switch":
      return SWITCH_HALF + TERMINAL_R;
  }
}

/** How far the symbol's ink reaches from the run, across it (either side). */
export function halfWidth(kind: SymbolKind, open: boolean, extras: SymbolExtras = {}): number {
  switch (kind) {
    case "led":
      return LED_REACH;
    case "diode":
      return DIODE_H;
    case "load":
      return extras.load?.ac ?? 14;
    case "resistor":
      return ZIG_A;
    case "battery":
      return extras.internal === true ? INTERNAL_BOX_ACROSS : LONG_PLATE;
    case "lamp":
      return LAMP_R;
    case "ammeter":
    case "voltmeter":
      return METER_R;
    case "voltage-source":
    case "current-source":
      return SOURCE_R;
    case "switch":
      return open ? SWITCH_BLADE * Math.sin(SWITCH_ANGLE) + 2 : TERMINAL_R + 1;
  }
}

export const ZIG_A = 8;
export const LONG_PLATE = 14;
export const SHORT_PLATE = 7;
export const PLATE_GAP = 4;
export const LAMP_R = 13;
export const METER_R = 14;
export const SOURCE_R = 15;
export const TERMINAL_R = 2.8;
export const SWITCH_HALF = 14;
export const SWITCH_BLADE = 30;
export const SWITCH_ANGLE = Math.PI / 6;
export const DIODE_H = 9;
export const LED_REACH = 19;
/** A battery with its internal resistance: the box's half-length and half-width, and where each part sits along the run (from the centre). */
export const INTERNAL_BOX_HALF = 44;
export const INTERNAL_BOX_ACROSS = 20;
export const INTERNAL_BATTERY_AT = -34;
export const INTERNAL_R_AT = 14;
export const INTERNAL_R_HALF = 24;

const add = (p: Point, d: Point, k: number): Point => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const at = (c: Point, d: Point, n: Point, along: number, across: number): Point => ({
  x: c.x + d.x * along + n.x * across,
  y: c.y + d.y * along + n.y * across,
});

/** A point on a circle about c, at angle φ measured from d toward n. */
function onCircle(c: Point, d: Point, n: Point, r: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return at(c, d, n, r * Math.cos(a), r * Math.sin(a));
}

/** Arcs about c from angle `from` to `to` in 45° steps (every step minor). */
function arcs(c: Point, d: Point, n: Point, r: number, from: number, to: number): Op[] {
  const out: Op[] = [];
  const step = to > from ? 45 : -45;
  for (let a = from + step; step > 0 ? a <= to : a >= to; a += step) out.push({ arc: onCircle(c, d, n, r, a), centre: c });
  return out;
}

/**
 * The symbol's paths. `lead` is the component's path from its `from` node to
 * the body's near end (polyline points, possibly with a corner, ending ON
 * the body's near end), `tail` the points AFTER the body's far end up to its
 * `to` node. `outside` is +1 or −1: which side of
 * the run (along n) a value label will prefer, so marks that must sit on the
 * OTHER side (the battery's "+") keep clear of it.
 */
export function symbolPaths(
  kind: SymbolKind,
  c: Point,
  d: Point,
  lead: Point[],
  tail: Point[],
  opts: { iec: boolean; closed: boolean; outside: 1 | -1; internal?: boolean; load?: { al: number; ac: number }; lit?: boolean },
): Path[] {
  const n = { x: -d.y, y: d.x };
  const W = 2;
  const leadOps = (pts: Point[]): Op[] => pts.slice(1).map((p) => ({ line: p }));
  const tailOps = (pts: Point[]): Op[] => pts.map((p) => ({ line: p }));
  switch (kind) {
    case "resistor": {
      const body = resistorBody(c, d, n, opts.iec);
      return [{ part: "", start: lead[0]!, ops: [...leadOps(lead), ...body, ...tailOps(tail)], width: W }];
    }
    case "load": {
      const { al, ac } = opts.load ?? { al: 30, ac: 14 };
      return [
        { part: "", start: at(c, d, n, -al, ac), ops: [{ line: at(c, d, n, al, ac) }, { line: at(c, d, n, al, -ac) }, { line: at(c, d, n, -al, -ac) }], width: W, close: true, fill: "paper" },
        { part: "-lead-from", start: lead[0]!, ops: leadOps(lead), width: W },
        { part: "-lead-to", start: at(c, d, n, al, 0), ops: tailOps(tail), width: W },
      ];
    }
    case "diode":
    case "led": {
      const h = DIODE_H;
      const out: Path[] = [
        { part: "", start: at(c, d, n, -h, h), ops: [{ line: at(c, d, n, h, 0) }, { line: at(c, d, n, -h, -h) }], width: W, close: true, fill: opts.lit === true ? "lit" : "paper" },
        { part: "-bar", start: at(c, d, n, h, h), ops: [{ line: at(c, d, n, h, -h) }], width: W + 0.5 },
        { part: "-lead-from", start: lead[0]!, ops: leadOps(lead), width: W },
        { part: "-lead-to", start: at(c, d, n, h, 0), ops: tailOps(tail), width: W },
      ];
      if (kind === "led") {
        // Two arrows leaving the body, on the side opposite the value label: light is emitted.
        const side = -opts.outside;
        for (const [i, a0] of [-5, 2].entries()) {
          const from = at(c, d, n, a0, side * 10);
          const tip = at(c, d, n, a0 + 7, side * 17);
          const len = Math.hypot(tip.x - from.x, tip.y - from.y);
          const u = { x: (tip.x - from.x) / len, y: (tip.y - from.y) / len };
          const nn = { x: -u.y, y: u.x };
          const base = { x: tip.x - u.x * 4.5, y: tip.y - u.y * 4.5 };
          out.push({ part: `-ray${i + 1}`, start: from, ops: [{ line: base }], width: 1.4 });
          out.push({ part: `-ray${i + 1}-head`, start: tip, ops: [{ line: { x: base.x + nn.x * 2.4, y: base.y + nn.y * 2.4 } }, { line: { x: base.x - nn.x * 2.4, y: base.y - nn.y * 2.4 } }], width: 1, fill: "ink", close: true });
        }
      }
      return out;
    }
    case "battery": {
      if (opts.internal === true) return internalBattery(c, d, n, lead, tail, opts);
      const plus = add(c, d, PLATE_GAP);
      const minus = add(c, d, -PLATE_GAP);
      const out: Path[] = [
        { part: "", start: at(plus, d, n, 0, LONG_PLATE), ops: [{ line: at(plus, d, n, 0, -LONG_PLATE) }], width: 2 },
        { part: "-short", start: at(minus, d, n, 0, SHORT_PLATE), ops: [{ line: at(minus, d, n, 0, -SHORT_PLATE) }], width: 4.5 },
        { part: "-lead-from", start: lead[0]!, ops: leadOps(lead), width: W },
        { part: "-lead-to", start: plus, ops: tailOps(tail), width: W },
      ];
      // "+" beside the long plate, on the side away from the value label.
      const p = at(c, d, n, PLATE_GAP + 8, -opts.outside * (LONG_PLATE - 3));
      out.push(plusSign(p, 3.5, "-plus"));
      return out;
    }
    case "lamp":
    case "ammeter":
    case "voltmeter":
    case "voltage-source":
    case "current-source": {
      const r = kind === "lamp" ? LAMP_R : kind === "ammeter" || kind === "voltmeter" ? METER_R : SOURCE_R;
      const P = (deg: number): Point => onCircle(c, d, n, r, deg);
      // Upper half (L at 180° to R at 0°), the lower half back, the upper
      // half again: one pen stroke around the circle and on to the tail,
      // without a chord across it. A lamp's ⊗ is drawn on the first pass.
      const upper: Op[] =
        kind === "lamp"
          ? [
              { arc: P(135), centre: c },
              { line: P(-45) },
              { line: P(135) },
              { arc: P(90), centre: c },
              { arc: P(45), centre: c },
              { line: P(-135) },
              { line: P(45) },
              { arc: P(0), centre: c },
            ]
          : arcs(c, d, n, r, 180, 0);
      const ops: Op[] = [...leadOps(lead), ...upper, ...arcs(c, d, n, r, 0, -180), ...arcs(c, d, n, r, 180, 0), ...tailOps(tail)];
      const out: Path[] = [{ part: "", start: lead[0]!, ops, width: W }];
      if (kind === "current-source") {
        const tip = add(c, d, 9);
        out.push({ part: "-shaft", start: add(c, d, -9), ops: [{ line: add(c, d, 3) }], width: 1.8 });
        out.push({ part: "-head", start: tip, ops: [{ line: at(c, d, n, 2, 4.5) }, { line: at(c, d, n, 2, -4.5) }], width: 1, fill: "ink", close: true });
      }
      if (kind === "voltage-source") {
        out.push(plusSign(add(c, d, 6.5), 3.5, "-plus"));
        // The minus is level on the page whichever way the run goes.
        const m = add(c, d, -6.5);
        out.push({ part: "-minus", start: { x: m.x - 3.5, y: m.y }, ops: [{ line: { x: m.x + 3.5, y: m.y } }], width: 1.6 });
      }
      return out;
    }
    case "switch": {
      const a = add(c, d, -SWITCH_HALF);
      const b = add(c, d, SWITCH_HALF);
      const out: Path[] = [
        { part: "-lead-from", start: lead[0]!, ops: leadOps(lead), width: W },
        { part: "-lead-to", start: add(b, d, TERMINAL_R), ops: tailOps(tail), width: W },
      ];
      const side = opts.outside;
      if (opts.closed) {
        const s = at(a, d, n, TERMINAL_R * 0.6, side * TERMINAL_R * 0.8);
        out.push({ part: "", start: s, ops: [{ line: at(b, d, n, -TERMINAL_R * 0.6, side * TERMINAL_R * 0.8) }], width: W });
      } else {
        const u = { x: d.x * Math.cos(SWITCH_ANGLE) + n.x * side * Math.sin(SWITCH_ANGLE), y: d.y * Math.cos(SWITCH_ANGLE) + n.y * side * Math.sin(SWITCH_ANGLE) };
        out.push({ part: "", start: add(a, u, TERMINAL_R), ops: [{ line: add(a, u, SWITCH_BLADE) }], width: W });
      }
      return out;
    }
  }
}

/** The zigzag (or IEC rectangle) body of a resistor centred at c, 48 px long. */
function resistorBody(c: Point, d: Point, n: Point, iec: boolean): Op[] {
  const body: Op[] = [];
  if (iec) {
    const h = 8;
    const L = 24;
    body.push(
      { line: at(c, d, n, -L, h) },
      { line: at(c, d, n, L, h) },
      { line: at(c, d, n, L, -h) },
      { line: at(c, d, n, -L, -h) },
      { line: at(c, d, n, -L, 0) },
      { line: at(c, d, n, -L, h) },
      { line: at(c, d, n, L, h) },
      { line: at(c, d, n, L, 0) },
    );
  } else {
    const alongs = [-24, -20, -12, -4, 4, 12, 20, 24];
    alongs.forEach((s, i) => {
      if (i > 0) body.push({ line: at(c, d, n, s, i === alongs.length - 1 ? 0 : i % 2 === 1 ? ZIG_A : -ZIG_A) });
    });
  }
  return body;
}

/**
 * A real source: the battery, then its internal resistance r in series
 * towards the + terminal, both inside a dashed box. The box is the textbook
 * way to say "this is ONE source, its r is part of it". Part names: "" is the
 * long plate (what the EMF label names), "-r" the resistor (what r's label
 * names).
 */
function internalBattery(c: Point, d: Point, n: Point, lead: Point[], tail: Point[], opts: { iec: boolean; outside: 1 | -1 }): Path[] {
  const cb = add(c, d, INTERNAL_BATTERY_AT);
  const cr = add(c, d, INTERNAL_R_AT);
  const plus = add(cb, d, PLATE_GAP);
  const minus = add(cb, d, -PLATE_GAP);
  const W = 2;
  const out: Path[] = [
    { part: "", start: at(plus, d, n, 0, LONG_PLATE), ops: [{ line: at(plus, d, n, 0, -LONG_PLATE) }], width: 2 },
    { part: "-short", start: at(minus, d, n, 0, SHORT_PLATE), ops: [{ line: at(minus, d, n, 0, -SHORT_PLATE) }], width: 4.5 },
    { part: "-lead-from", start: lead[0]!, ops: [...lead.slice(1).map((p) => ({ line: p })), { line: minus }], width: W },
    {
      part: "-r",
      start: plus,
      ops: [{ line: at(cr, d, n, -INTERNAL_R_HALF, 0) }, ...resistorBody(cr, d, n, opts.iec), { line: at(c, d, n, INTERNAL_BOX_HALF, 0) }, ...tail.map((p) => ({ line: p }))],
      width: W,
    },
  ];
  out.push(plusSign(at(cb, d, n, PLATE_GAP + 8, -opts.outside * (LONG_PLATE - 3)), 3.5, "-plus"));
  out.push({
    part: "-box",
    start: at(c, d, n, -INTERNAL_BOX_HALF, INTERNAL_BOX_ACROSS),
    ops: [{ line: at(c, d, n, INTERNAL_BOX_HALF, INTERNAL_BOX_ACROSS) }, { line: at(c, d, n, INTERNAL_BOX_HALF, -INTERNAL_BOX_ACROSS) }, { line: at(c, d, n, -INTERNAL_BOX_HALF, -INTERNAL_BOX_ACROSS) }],
    width: 1.1,
    close: true,
    dashed: true,
  });
  return out;
}

/** Where the battery's plates and its internal resistance sit, for the labels that name them. */
export function internalParts(c: Point, d: Point): { battery: Point; resistor: Point } {
  return { battery: add(c, d, INTERNAL_BATTERY_AT), resistor: add(c, d, INTERNAL_R_AT) };
}

/** A drawn "+": the horizontal stroke, back to the middle, then the vertical one -- level on the page. */
function plusSign(p: Point, s: number, part: string): Path {
  return {
    part,
    start: { x: p.x - s, y: p.y },
    ops: [{ line: { x: p.x + s, y: p.y } }, { line: p }, { line: { x: p.x, y: p.y - s } }, { line: { x: p.x, y: p.y + s } }],
    width: 1.6,
  };
}

/** Terminal circles of a switch, drawn open (paper-filled) over the leads. */
export function switchTerminals(c: Point, d: Point): Point[] {
  return [add(c, d, -SWITCH_HALF), add(c, d, SWITCH_HALF)];
}

/** Sample a path's ops as a polyline, arcs every few degrees, for the ink record. */
export function samplePath(start: Point, ops: Op[]): Point[] {
  const pts: Point[] = [start];
  let cur = start;
  for (const op of ops) {
    if ("arc" in op) {
      const c = op.centre;
      const r = Math.hypot(cur.x - c.x, cur.y - c.y);
      const a0 = Math.atan2(cur.y - c.y, cur.x - c.x);
      let da = Math.atan2(op.arc.y - c.y, op.arc.x - c.x) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da <= -Math.PI) da += 2 * Math.PI;
      for (let k = 1; k <= 6; k += 1) pts.push({ x: c.x + r * Math.cos(a0 + (da * k) / 6), y: c.y + r * Math.sin(a0 + (da * k) / 6) });
      cur = op.arc;
    } else {
      pts.push(op.line);
      cur = op.line;
    }
  }
  return pts;
}
