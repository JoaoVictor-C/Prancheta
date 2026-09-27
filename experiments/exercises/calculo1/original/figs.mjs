// Figuras da lista de Cálculo 1, desenhadas com o Prancheta (sheet.mjs).
// Toda geometria é calculada a partir das funções do enunciado.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Plate, PAPER, INK, SOFT, FAINT, KEY, ASK, WARM } from "file:///C:/Joao/Programa%C3%A7%C3%A3o/ProjectHub/Prancheta/experiments/exercises/sheet.mjs";

const OUT = new URL("./specs/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const PURPLE = "#6B3FA0";

class Fig extends Plate {
  heading() {}
}

const U = { x: 1, y: 0 }, D = { x: 0, y: 1 }, L = { x: -1, y: 0 }, R = { x: 1, y: 0 };
const UP = { x: 0, y: -1 };
const NE = { x: 0.7, y: -0.7 }, NW = { x: -0.7, y: -0.7 }, SE = { x: 0.7, y: 0.7 }, SW = { x: -0.7, y: 0.7 };

/** A graph sheet: a plane over [x0,x1]×[y0,y1] with gridlines. */
function graph({ xr, yr, ux, uy, sx = 1, sy = 1, lx = 1, ly = 1 }) {
  const left = 46, right = 40, top = 30, bottom = 34;
  const W = Math.round(left + (xr[1] - xr[0]) * ux + right);
  const H = Math.round(top + (yr[1] - yr[0]) * uy + bottom);
  const f = new Fig({ subject: "", title: "", width: W, height: H });
  const p = f.plane("g", {
    x: left - xr[0] * ux,
    y: top + yr[1] * uy,
    xUnit: ux,
    yUnit: uy,
    grid: {
      x: { from: xr[0], to: xr[1], step: sx, labelEvery: lx },
      y: { from: yr[0], to: yr[1], step: sy, labelEvery: ly },
      axes: true,
      labels: false,
    },
  });
  const inside = (y) => y >= yr[0] && y <= yr[1];
  const g = {
    f, p, xr, yr,
    /** Plot y = fn(x) over [a,b], clipped to the y range, split where it leaves. */
    curve(fn, a, b, o = {}) {
      const n = 240;
      let run = [];
      const runs = [];
      for (let i = 0; i <= n; i += 1) {
        const x = a + ((b - a) * i) / n;
        const y = fn(x);
        if (Number.isFinite(y) && inside(y)) run.push(p.at(x, y));
        else {
          if (run.length > 1) runs.push(run);
          run = [];
        }
      }
      if (run.length > 1) runs.push(run);
      for (const r of runs) f.poly(r, { stroke: o.stroke ?? KEY, width: o.width ?? 2.6, lineStyle: o.lineStyle });
    },
    /** The straight line through (x0,y0) with slope m, drawn over [a,b]. */
    line(x0, y0, m, a, b, o = {}) {
      g.curve((x) => y0 + m * (x - x0), a, b, { width: 2, ...o });
    },
    dot(x, y, colour = INK) {
      const c = p.at(x, y);
      f.disc(c, 5, colour);
      f.reserve(c.x, c.y, 12, 12);
    },
    hole(x, y, colour = KEY) {
      const c = p.at(x, y);
      f.circle(c, 5.5, { stroke: colour, width: 2.2, fill: PAPER });
      f.reserve(c.x, c.y, 14, 14);
    },
    /**
     * Tick numbers, drawn here rather than by the grid. A number is never
     * dropped: the intercept a curve runs through is often the very number the
     * exercise is about. If the usual spot has ink, the number slides outward
     * along its own gridline -- at most half a grid step, so it always stays
     * nearer its own tick than the next one -- and only if nothing there is
     * clear does it keep the usual spot on a paper backing.
     */
    ticks() {
      const fmt = (v) => String(Math.round(v * 1000) / 1000).replace("-", "−").replace(".", ",");
      const clear = (b) => f.inkThrough(b, 1) === 0 && !f.taken.some((t) => f.hits(b, t, 1));
      const tryTick = (text, cands) => {
        const w = f.measure(text, 11) - 8, h = 13;
        const hit = cands.find(([x, y]) => clear(f.box(x, y, w, h)));
        const [x, y] = hit ?? cands[0];
        f.label(text, x, y, { size: 11, colour: FAINT, width: w });
        if (!hit) f.kids[f.kids.length - 1].fill = PAPER;
      };
      /** Positions from `at`, stepping by (dx, dy) until `max` px have been covered. */
      const walk = (x, y, dx, dy, max) => {
        const out = [];
        for (let d = 0; d <= max; d += 3) out.push([x + dx * d, y + dy * d]);
        return out;
      };
      const halfX = (sx * p.xUnit) / 2, halfY = (sy * p.yUnit) / 2;
      const o = p.at(0, 0);
      tryTick("0", [...walk(o.x - 10, o.y + 13, -0.7, 0.7, Math.min(halfX, halfY)), [o.x + 10, o.y + 13]]);
      for (let k = Math.ceil(xr[0] / sx); k * sx <= xr[1] + 1e-9; k += 1) {
        if (k === 0 || k % lx !== 0) continue;
        const c = p.at(k * sx, 0);
        tryTick(fmt(k * sx), [...walk(c.x, c.y + 14, 0, 1, halfY - 6), ...walk(c.x, c.y - 14, 0, -1, halfY - 6)]);
      }
      for (let k = Math.ceil(yr[0] / sy); k * sy <= yr[1] + 1e-9; k += 1) {
        if (k === 0 || k % ly !== 0) continue;
        const c = p.at(0, k * sy);
        const t = fmt(k * sy);
        const half = (f.measure(t, 11) - 8) / 2;
        tryTick(t, [...walk(c.x - 8 - half, c.y, -1, 0, halfX - half), ...walk(c.x + 8 + half, c.y, 1, 0, halfX - half)]);
      }
    },
    text(t, x, y, dirs, o = {}) {
      const c = p.at(x, y);
      return f.place(t, c.x, c.y, dirs, { size: 14, weight: 600, ...o });
    },
    guide(x, y, colour = SOFT) {
      f.seg(p.at(x, 0), p.at(x, y), { stroke: colour, width: 1.1, lineStyle: "dashed" });
      f.seg(p.at(0, y), p.at(x, y), { stroke: colour, width: 1.1, lineStyle: "dashed" });
    },
    /** A legend of swatch + text rows, top-left at plane point (x, y). */
    legend(items, x, y) {
      const c = p.at(x, y);
      items.forEach(([t, colour, dashed], i) => {
        const yy = c.y + i * 24;
        f.poly([{ x: c.x, y: yy }, { x: c.x + 26, y: yy }], { stroke: colour, width: 2.4, lineStyle: dashed ? "dashed" : undefined });
        const w = f.measure(t, 13.5);
        f.label(t, c.x + 34 + w / 2, yy, { size: 13.5, weight: 600, colour, width: w, align: "start" });
      });
    },
    axisNames(xn = "x", yn = "y") {
      g.ticks();
      const ex = p.at(xr[1], 0);
      f.place(xn, ex.x + 14, ex.y - 12, [R, UP], { size: 15, weight: 600, colour: SOFT, serif: true });
      const ey = p.at(0, yr[1]);
      f.place(yn, ey.x + 16, ey.y + 4, [R, D], { size: 15, weight: 600, colour: SOFT, serif: true });
    },
  };
  return g;
}

const figs = {};

// ---- 1.2: limites laterais lidos do gráfico --------------------------------
{
  const g = graph({ xr: [-1, 5], yr: [-1, 6], ux: 80, uy: 48 });
  g.curve((x) => x + 1, 0, 2);
  g.curve((x) => (x - 2) ** 2 + 3, 2, 4.5);
  g.hole(2, 3);
  g.dot(2, 1, KEY);
  g.guide(2, 3);
  g.text("y = f(x)", 3.9, 5.4, [R, D, L]);
  g.axisNames();
  figs["q1-2"] = g.f;
}

// ---- 2.1: secante de x² em [1,3] --------------------------------------------
{
  const g = graph({ xr: [-1, 4], yr: [-1, 12], ux: 100, uy: 28, ly: 2 });
  g.curve((x) => x * x, -1, 4);
  g.line(1, 1, 4, 0.2, 3.35, { stroke: ASK });
  g.guide(1, 1);
  g.guide(3, 9);
  g.dot(1, 1);
  g.dot(3, 9);
  g.text("A(1; 1)", 1, 1, [R, D, SE], { colour: INK });
  g.text("B(3; 9)", 3, 9, [L, NW, UP], { colour: INK });
  g.text("f(x) = x²", -0.6, 3.5, [UP, R, D], { colour: KEY });
  g.text("secante AB", 1.3, 4.3, [L, UP], { colour: ASK });
  g.axisNames();
  figs["q2-1"] = g.f;
}

// ---- 2.4: duas secantes de −x²+6x -------------------------------------------
{
  const g = graph({ xr: [-1, 7], yr: [-1, 10], ux: 70, uy: 34 });
  const f = (x) => -x * x + 6 * x;
  g.curve(f, -0.2, 6.2);
  g.line(1, 5, 1, 1, 4, { stroke: ASK });
  g.line(4, 8, -4, 4, 6, { stroke: WARM });
  g.dot(1, 5);
  g.dot(4, 8);
  g.dot(6, 0);
  g.text("A", 1, 5, [L, NW, UP], { colour: INK });
  g.text("B", 4, 8, [UP, NE, R], { colour: INK });
  g.text("C", 6, 0, [NE, R, UP], { colour: INK });
  g.axisNames();
  figs["q2-4"] = g.f;
}

// ---- 2.5: secantes que viram tangente ----------------------------------------
{
  const g = graph({ xr: [-1, 5], yr: [-2, 20], ux: 100, uy: 19, ly: 2 });
  const f = (x) => x * x + 1;
  g.curve(f, -1, 5);
  const cols = ["#B3400C", "#8A5A00", PURPLE];
  const hs = [2, 1, 0.5];
  hs.forEach((h, i) => {
    const m = 4 + h;
    g.line(2, 5, m, 1.1, 2 + h + 0.35, { stroke: cols[i], width: 1.8 });
    g.dot(2 + h, f(2 + h), cols[i]);
    g.text(`h = ${String(h).replace(".", ",")}`, 2 + h, f(2 + h), [R, SE, D], { colour: cols[i], size: 13 });
  });
  g.line(2, 5, 4, 0.6, 4.4, { stroke: WARM, width: 2.2, lineStyle: "dashed" });
  g.dot(2, 5);
  g.text("P(2; 5)", 2, 5, [NW, L, UP], { colour: INK });
  g.legend([
    ["secante h = 2, Q(4; 17)", cols[0]],
    ["secante h = 1, Q(3; 10)", cols[1]],
    ["secante h = 0,5, Q(2,5; 7,25)", cols[2]],
    ["tangente em P", WARM, true],
  ], 0.2, 19.3);
  g.axisNames();
  figs["q2-5"] = g.f;
}

// ---- 3.2: tangente a x² em (3,9) ---------------------------------------------
{
  const g = graph({ xr: [-1, 5], yr: [-2, 16], ux: 90, uy: 22, ly: 2 });
  g.curve((x) => x * x, -1, 5);
  g.line(3, 9, 6, 1.4, 4.4, { stroke: WARM });
  g.dot(3, 9);
  g.text("P(3; 9)", 3, 9, [L, NW, UP], { colour: INK });
  g.text("inclinação = ?", 2.65, 0.9, [R, D, SE], { colour: WARM });
  g.text("y = x²", -0.6, 1.8, [UP, R], { colour: KEY });
  g.axisNames();
  figs["q3-2"] = g.f;
}

// ---- S1.3: reta com um buraco -------------------------------------------------
{
  const g = graph({ xr: [-1, 7], yr: [-1, 12], ux: 66, uy: 28, ly: 2 });
  g.curve((x) => x + 4, -1, 7);
  g.hole(4, 8);
  g.guide(4, 8);
  g.text("(4; 8) fica de fora", 4, 8, [L, NW, UP], { colour: ASK });
  g.text("y = x + 4, x ≠ 4", 5.5, 10.2, [R, D, UP], { colour: KEY });
  g.axisNames();
  figs["s1-3"] = g.f;
}

// ---- S1.6: com k = 5/3 os dois pedaços se encontram ----------------------------
{
  const k = 5 / 3;
  const g = graph({ xr: [-1, 4], yr: [-2, 9], ux: 100, uy: 36 });
  g.curve((x) => k * x * x - 1, -1, 2);
  g.curve((x) => x + 2 + k, 2, 4, { stroke: WARM });
  g.hole(2, 4 + k, INK);
  g.guide(2, 4 + k);
  g.text("(2; 17/3)", 2, 4 + k, [UP, NW, L], { colour: INK });
  g.text("y = (5/3)x² − 1", 0.85, 4.6, [L, D], { colour: KEY });
  g.text("y = x + 2 + 5/3", 3.2, 6.5, [SE, D, R], { colour: WARM });
  g.axisNames();
  figs["s1-6"] = g.f;
}

// ---- S3.3: tangente a x²−4x+1 em x=1 -------------------------------------------
{
  const g = graph({ xr: [-1, 5], yr: [-4, 7], ux: 86, uy: 36 });
  g.curve((x) => x * x - 4 * x + 1, -1, 5);
  g.line(1, -2, -2, -1, 2, { stroke: WARM });
  g.dot(1, -2);
  g.text("(1; −2)", 1, -2, [SW, D, L], { colour: INK });
  g.text("y = −2x", 2.45, -3.7, [R, D], { colour: WARM });
  g.text("y = x² − 4x + 1", 4.3, 3.5, [R, UP], { colour: KEY });
  g.axisNames();
  figs["s3-3"] = g.f;
}

// ---- S3.6: duas tangentes paralelas a y = 12x + 1 ---------------------------------
{
  const g = graph({ xr: [-3, 3], yr: [-14, 14], ux: 100, uy: 15, sy: 2, ly: 2 });
  g.curve((x) => x ** 3, -3, 3);
  g.line(2, 8, 12, 1, 3, { stroke: WARM });
  g.line(-2, -8, 12, -3, -1, { stroke: WARM });
  g.dot(2, 8);
  g.dot(-2, -8);
  g.text("(2; 8)", 2, 8, [R, SE, D], { colour: INK });
  g.text("(−2; −8)", -2, -8, [L, NW, UP], { colour: INK });
  g.text("y = x³", 2.3, 13, [L, D], { colour: KEY });
  g.axisNames();
  figs["s3-6"] = g.f;
}

// ---- S4.4: tangente a x³−3x em x=2 --------------------------------------------------
{
  const g = graph({ xr: [-3, 3.5], yr: [-6, 10], ux: 90, uy: 24, ly: 2 });
  g.curve((x) => x ** 3 - 3 * x, -3, 3);
  g.line(2, 2, 9, 1, 3, { stroke: WARM });
  g.dot(2, 2);
  g.text("(2; 2)", 2, 2, [R, SE, D], { colour: INK });
  g.text("y = 9x − 16", 3.05, 5, [SE, R, D], { colour: WARM });
  g.text("y = x³ − 3x", -1.9, 4, [L, UP], { colour: KEY });
  g.axisNames();
  figs["s4-4"] = g.f;
}

// ---- S4.5: tangentes horizontais ---------------------------------------------------
{
  const g = graph({ xr: [-1, 5], yr: [-2, 8], ux: 86, uy: 40 });
  g.curve((x) => x ** 3 - 6 * x * x + 9 * x + 1, -1, 5);
  g.line(1, 5, 0, 0.1, 1.9, { stroke: WARM });
  g.line(3, 1, 0, 2.1, 3.9, { stroke: WARM });
  g.dot(1, 5);
  g.dot(3, 1);
  g.text("(1; 5)", 1, 5, [UP, NE, NW], { colour: INK });
  g.text("(3; 1)", 3, 1, [D, SE, SW], { colour: INK });
  g.text("f′ = 0", 1.9, 5.4, [R, UP], { colour: WARM });
  g.axisNames();
  figs["s4-5"] = g.f;
}

// ---- S4.6: x²+x e a reta y = 3x − 1 -----------------------------------------------
{
  const g = graph({ xr: [-3, 3.5], yr: [-2, 9], ux: 86, uy: 34 });
  g.curve((x) => x * x + x, -3, 3);
  g.line(1, 2, 3, -0.3, 3, { stroke: WARM });
  g.dot(1, 2);
  g.text("(1; 2)", 1, 2, [SE, R, D], { colour: INK });
  g.text("y = 3x − 1", 2.85, 5.6, [SE, R, D], { colour: WARM });
  g.text("y = x² + x", -2.2, 3.5, [L, R, UP], { colour: KEY });
  g.axisNames();
  figs["s4-6"] = g.f;
}

// ---- S5.5: a cadeia de três elos ------------------------------------------------------
{
  const f = new Fig({ subject: "", title: "", width: 900, height: 250 });
  const boxes = [
    ["x", "#EEF2F7"],
    ["u = x² + 1", "#E3ECF8"],
    ["v = u³ + 2", "#E6F3EF"],
    ["f = v⁴", "#F6ECE4"],
  ];
  const bw = [80, 150, 150, 120];
  const gap = 110;
  let x = 30;
  const cy = 70;
  const pos = [];
  boxes.forEach(([t, fill], i) => {
    f.kids.push({
      type: "block", id: `b${i}`, x, y: cy - 28, width: bw[i], height: 56, label: t,
      fill, stroke: INK, strokeWidth: 1.4, radius: 10, padding: 6,
      textColor: INK, fontSize: 18, fontWeight: 600, textAlign: "center", verticalAlign: "center", wrap: "none",
    });
    f.reserve(x + bw[i] / 2, cy, bw[i], 56);
    pos.push([x, x + bw[i]]);
    x += bw[i] + gap;
  });
  const der = ["du/dx = 2x", "dv/du = 3u²", "df/dv = 4v³"];
  for (let i = 0; i < 3; i += 1) {
    const a = pos[i][1] + 6, b = pos[i + 1][0] - 6;
    f.arrowMark({ x: a, y: cy }, { x: b, y: cy }, { stroke: SOFT, width: 1.8 });
    f.place(der[i], (a + b) / 2, cy + 30, [D], { size: 14, weight: 600, colour: WARM });
  }
  f.label("f′(x) = 4v³ · 3u² · 2x  =  24x (x² + 1)² [(x² + 1)³ + 2]³", 450, 175, {
    size: 18, weight: 600, colour: KEY, width: 700,
  });
  f.label("multiplica-se a derivada de cada elo, de fora para dentro", 450, 212, {
    size: 14, colour: SOFT, width: 620,
  });
  figs["s5-5"] = f;
}


// ---- S5.4: posição, velocidade e aceleração ------------------------------------------
{
  const g = graph({ xr: [-1, 5], yr: [-14, 14], ux: 110, uy: 16, sy: 2, ly: 2, lx: 1 });
  g.curve((t) => t ** 3 - 6 * t * t + 9 * t, 0, 4.3, { stroke: KEY });
  g.curve((t) => 3 * t * t - 12 * t + 9, 0, 4.3, { stroke: ASK });
  g.curve((t) => 6 * t - 12, 0, 4.3, { stroke: WARM });
  // Guides stop above the legend (under t = 2 and t = 3) and break around
  // the tick number under the axis, so the number stays readable.
  for (const [t, lo] of [[1, -7], [2, -4], [3, -4]]) {
    const guide = { stroke: SOFT, width: 1, lineStyle: "dashed" };
    g.f.seg(g.p.at(t, lo), g.p.at(t, -1.5), guide);
    g.f.seg(g.p.at(t, 0), g.p.at(t, 14), guide);
  }
  g.text("s", 4.3, 4.3 ** 3 - 6 * 4.3 ** 2 + 9 * 4.3, [R, D], { colour: KEY, size: 15 });
  g.text("v", 4.3, 3 * 4.3 ** 2 - 12 * 4.3 + 9, [R, D], { colour: ASK, size: 15 });
  g.text("a", 4.3, 6 * 4.3 - 12, [R, UP], { colour: WARM, size: 15 });
  g.dot(1, 0, ASK);
  g.dot(3, 0, ASK);
  g.dot(2, 0, WARM);
  g.dot(1, 4, KEY);
  g.legend([
    ["s = t³ − 6t² + 9t   (posição, em m)", KEY],
    ["v = s′ = 3t² − 12t + 9   (velocidade, em m/s)", ASK],
    ["a = s″ = 6t − 12   (aceleração, em m/s²)", WARM],
  ], 1.35, -6.5);
  g.axisNames("t", "");
  figs["s5-4"] = g.f;
}

// ---- S2.3: juros simples x compostos -------------------------------------------------
{
  const g = graph({ xr: [-1, 6], yr: [-200, 2800], ux: 90, uy: 0.15, sy: 200, ly: 2, lx: 1 });
  const S = (t) => 1000 * (1 + 0.2 * t);
  const C = (t) => 1000 * 1.2 ** t;
  g.curve(S, 0, 5.6, { stroke: KEY });
  g.curve(C, 0, 5.6, { stroke: ASK });
  for (const t of [0, 2, 4]) { g.dot(t, S(t), KEY); if (t > 0) g.dot(t, C(t), ASK); }
  g.text("1000", 0, 1000, [L, NW], { colour: INK, size: 12.5 });
  g.text("1400", 2, 1400, [SE, D, R], { colour: KEY, size: 12.5 });
  g.text("1800", 4, 1800, [SE, D, R], { colour: KEY, size: 12.5 });
  g.text("1440", 2, 1440, [NW, UP, L], { colour: ASK, size: 12.5 });
  g.text("2073,60", 4, 2073.6, [NW, UP, L], { colour: ASK, size: 12.5 });
  g.legend([
    ["juros simples: S(t) = 1000(1 + 0,2t)", KEY],
    ["juros compostos: C(t) = 1000·(1,2)ᵗ", ASK],
  ], 0.3, 2650);
  g.axisNames("t", "R$");
  figs["s2-3"] = g.f;
}

for (const [name, fig] of Object.entries(figs)) fig.write(fileURLToPath(new URL(`${name}.json`, OUT)));
