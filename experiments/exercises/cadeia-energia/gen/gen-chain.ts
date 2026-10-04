import { writeFileSync } from "node:fs";
// usage: gen-chain.ts <out.json> [answers|statement] [print|screen]
const answers = process.argv[3] === "answers";
const print = process.argv[4] === "print";
// ---- physics: one source for the drawing and the answers ----
const g = 9.8, m = 0.5, q = 2e-3, E = 1500, r = 0.4, fall = 0.6;
const vb = Math.sqrt((0.7 * m * g * r + m * g * 2 * r) / (0.7 * m));
const t = Math.sqrt((2 * fall) / g), ax = (q * E) / m, xl = vb * t + 0.5 * ax * t * t;
// ---- layout in metres (floor y = 0), one scale; label offsets in px ----
const S = print ? 105 : 165, ox = print ? 30 : 50, FL = 55 + 1.98 * S, FS = print ? 19 : 17;
const px = (n: number) => n / S;
const P = (x: number, y: number) => ({ x: +(ox + x * S).toFixed(2), y: +(FL - y * S).toFixed(2) });
const ledge = 3.4, track = 0.9, top = 1.5, loopC = { x: 2.6, y: track + r }, rimY = 0.28, plL = ledge + 0.025, plR = 5.47;
const cart = { x0: ledge + xl - 0.32, w: 0.62 };
const coil = { x0: cart.x0 + cart.w - 0.17, y0: 0.12, s: 0.1 };
const Bx = 5.78, Bw = 0.3, Bh = print ? 0.6 : 0.34, wallX = 6.68, springFree = 6.34, springY = 0.17;
const ink = "#d8d8d0", soft = "#9a9a94", gold = "#f0d080";
type Pt = { x: number; y: number };
type Seg = { line: Pt };
const ramp: Seg[] = [];
for (let i = 1; i <= 24; i++) {
  const s = i / 24, e = s * s * (3 - 2 * s);
  ramp.push({ line: P(1.0 + s, top - (top - track) * e) });
}
const rect = (x0: number, y0: number, w: number, hh: number): Seg[] => [{ line: P(x0 + w, y0) }, { line: P(x0 + w, y0 + hh) }, { line: P(x0, y0 + hh) }];
const widthOf = (label: string, fs = FS) => Math.ceil([...label].length * fs * 0.56 + 10);
const lbl = (id: string, c: Pt, label: string, extra: object = {}, fs = FS) => {
  const W = widthOf(label, fs), H = fs + 11;
  return { type: "block", id, x: c.x - W / 2, y: c.y - H / 2, width: W, height: H, padding: 0, fill: "none", stroke: "none", wrap: "none", textAlign: "center", fontSize: fs, label, ...extra };
};
const zig: Seg[] = [{ line: P(wallX - 0.05, springY) }];
for (let i = 1; i <= 6; i++) zig.push({ line: P(wallX - 0.05 - ((i - 0.5) * (wallX - springFree - 0.1)) / 6, springY + (i % 2 ? 0.045 : -0.045)) });
zig.push({ line: P(springFree + 0.05, springY) }, { line: P(springFree, springY) });
const traj: Seg[] = [];
for (let i = 1; i <= 30; i++) {
  const tt = (t * i) / 30;
  traj.push({ line: P(ledge + vb * tt + 0.5 * ax * tt * tt, track + 0.07 - 0.5 * g * tt * tt) });
}
const marks: object[] = [
  { id: "ground", from: P(-0.1, 0), segments: [{ line: P(6.8, 0) }], close: false, stroke: ink, strokeWidth: 2 },
  { id: "structure", from: P(0, 0), segments: [{ line: P(0, top) }, { line: P(1.0, top) }, ...ramp, { line: P(ledge, track) }, { line: P(ledge, 0) }], close: true, fill: "#34342f", stroke: ink, strokeWidth: 1.5 },
  {
    id: "loop", from: P(loopC.x, track),
    segments: [
      { arc: P(loopC.x + r, loopC.y), centre: P(loopC.x, loopC.y) },
      { arc: P(loopC.x, loopC.y + r), centre: P(loopC.x, loopC.y) },
      { arc: P(loopC.x - r, loopC.y), centre: P(loopC.x, loopC.y) },
      { arc: P(loopC.x, track), centre: P(loopC.x, loopC.y) },
    ],
    close: false, stroke: ink, strokeWidth: 2.5,
  },
  { id: "plate-l", from: P(plL - 0.02, track - fall), segments: rect(plL - 0.02, track - fall, 0.04, fall), close: true, fill: "#b8742a", stroke: "#e0a860", strokeWidth: 1 },
  { id: "plate-r", from: P(plR - 0.02, track - fall), segments: rect(plR - 0.02, track - fall, 0.04, fall), close: true, fill: "#b8742a", stroke: "#e0a860", strokeWidth: 1 },
  { id: "cart-body", from: P(cart.x0, 0.07), segments: rect(cart.x0, 0.07, cart.w, rimY - 0.07), close: true, fill: "#245c48", stroke: "none" },
  { id: "cart", from: P(cart.x0, rimY), segments: [{ line: P(cart.x0, 0.07) }, { line: P(cart.x0 + cart.w, 0.07) }, { line: P(cart.x0 + cart.w, rimY) }], close: false, stroke: "#8fd3b6", strokeWidth: 2.5 },
  { id: "coil", from: P(coil.x0, coil.y0), segments: rect(coil.x0, coil.y0, coil.s, coil.s), close: true, stroke: "#f0e0a0", strokeWidth: 2 },
  { id: "coil-2", from: P(coil.x0 + 0.014, coil.y0 + 0.014), segments: rect(coil.x0 + 0.014, coil.y0 + 0.014, coil.s - 0.028, coil.s - 0.028), close: true, stroke: "#f0e0a0", strokeWidth: 1.2 },
  { id: "field", from: P(Bx, 0.01), segments: rect(Bx, 0.01, Bw, Bh), close: true, stroke: soft, strokeWidth: 1.2, lineStyle: "dashed" },
  { id: "wall", from: P(wallX, 0), segments: rect(wallX, 0, 0.06, 0.42), close: true, fill: "#55554f", stroke: ink, strokeWidth: 1 },
  { id: "spring", from: P(wallX, springY), segments: zig, close: false, stroke: ink, strokeWidth: 2 },
  { id: "spring-cap", from: P(springFree, springY - 0.06), segments: [{ line: P(springFree, springY + 0.06) }], close: false, stroke: ink, strokeWidth: 3 },
  { id: "cyl", from: P(0.56, 1.88), segments: [{ line: P(0.06, 1.88) }, { line: P(0.06, 1.62) }, { line: P(0.56, 1.62) }], close: false, stroke: "#9cc0f0", strokeWidth: 2.5 },
  ...[0.14, 0.31, 0.48].map((x, i) => ({ id: `flame${i}`, from: P(x - 0.07, 1.5), segments: [{ line: P(x + 0.07, 1.5) }, { line: P(x, 1.6) }], close: true, fill: "#7a3020", stroke: "#e08a60", strokeWidth: 1 })),
];
if (answers) marks.push({ id: "path", from: P(ledge, track + 0.07), segments: traj, close: false, stroke: soft, strokeWidth: 1.5, lineStyle: "dashed" });
const crosses: [number, number][] = print
  ? [[Bx + Bw / 2, 0.01 + Bh * 0.28], [Bx + Bw / 2, 0.01 + Bh * 0.72]]
  : [[Bx + 0.07, 0.085], [Bx + 0.07, 0.27], [Bx + 0.23, 0.085], [Bx + 0.23, 0.27]];
const below = -px(FS / 2 + 17.5), leadEnd = -px(10);
const coilLabel = "bobina N, ℓ, ρ", mLabel = "m, +q", hLabel = "0,6 m";
const children: object[] = [
  { type: "block", id: "gas", x: P(0.07, 0).x, y: P(0, 1.87).y, width: 0.48 * S, height: 0.24 * S, padding: 0, fill: "#1f4a8a", stroke: "none", textColor: "#e8eefc", fontSize: FS, textAlign: "center", verticalAlign: "center", label: "gás" },
  { type: "block", id: "piston", x: P(0.56, 0).x, y: P(0, 1.92).y, width: 0.05 * S, height: 0.4 * S, padding: 0, fill: "#6a6a64", stroke: ink, strokeWidth: 1, label: "" },
  { type: "block", id: "sphere", shape: "circle", x: P(0.61, 0).x, y: P(0, 1.64).y, width: 0.14 * S, height: 0.14 * S, padding: 0, fill: "#4a3fa8", stroke: "#b8b0f0", strokeWidth: 1.5, label: "" },
  { type: "block", id: "wheel-a", shape: "circle", x: P(cart.x0 + 0.08, 0).x, y: P(0, 0.07).y, width: 0.07 * S, height: 0.07 * S, padding: 0, fill: "#0f1115", stroke: ink, strokeWidth: 1.5, label: "" },
  { type: "block", id: "wheel-b", shape: "circle", x: P(cart.x0 + cart.w - 0.15, 0).x, y: P(0, 0.07).y, width: 0.07 * S, height: 0.07 * S, padding: 0, fill: "#0f1115", stroke: ink, strokeWidth: 1.5, label: "" },
  ...crosses.map(([x, y], i) => lbl(`x${i}`, P(x, y), "×", { annotates: "field", textColor: soft }, 15)),
  lbl("lab-Q", P(0.31, top - px(FS / 2 + 10)), "calor Q", { annotates: "flame1" }),
  lbl("lab-m", P(0.75 + px(widthOf(mLabel) / 2 - 12), 1.64 + px(18)), mLabel, { annotates: "sphere" }),
  lbl("lab-r", P(loopC.x + r * 0.2 - px(13), loopC.y + r * 0.2 + px(13)), "r", { annotates: "r-line" }),
  lbl("lab-h", P(2.02 - px(16), 1.2), "h", { annotates: "h-dim" }),
  lbl("lab-E", P(3.86, 0.42), "E", { annotates: "E1" }),
  lbl("lab-plus", P(plL + px(14), track - px(12)), "+", { annotates: "plate-l" }),
  lbl("lab-minus", P(plR + px(14), track - px(12)), "−", { annotates: "plate-r" }),
  lbl("lab-M", P(cart.x0 - px(16), 0.17), "M", { annotates: "cart-body" }),
  lbl("lab-coil", P(coil.x0 + 0.05, below), coilLabel, { annotates: "coil-lead" }),
  lbl("lab-B", P(Bx + Bw / 2, 0.01 + Bh + px(FS / 2 + 12)), "B ⊗", { annotates: "field" }),
  lbl("lab-k", P((wallX + springFree) / 2, below), "k", { annotates: "spring-lead" }),
];
const connectors: object[] = [
  { id: "r-line", from: P(loopC.x, loopC.y), to: P(loopC.x + r * Math.SQRT1_2, loopC.y + r * Math.SQRT1_2), arrow: "none", stroke: soft, strokeWidth: 1.2, lineStyle: "dashed" },
  { id: "h-ext", from: P(1.0, top), to: P(2.06, top), arrow: "none", stroke: soft, strokeWidth: 1, lineStyle: "dotted" },
  { id: "h-dim", from: P(2.02, top), to: P(2.02, track), arrow: "both", arrowStyle: "open", stroke: soft, strokeWidth: 1.2 },
  { id: "E1", from: P(3.66, 0.42 + px(22)), to: P(4.06, 0.42 + px(22)), arrow: "end", stroke: "#e0a860", strokeWidth: 1.5 },
  { id: "E2", from: P(3.66, 0.42 - px(22)), to: P(4.06, 0.42 - px(22)), arrow: "end", stroke: "#e0a860", strokeWidth: 1.5 },
  { id: "coil-lead", from: P(coil.x0 + 0.05, leadEnd), to: P(coil.x0 + 0.05, coil.y0), arrow: "none", stroke: soft, strokeWidth: 1 },
  { id: "spring-lead", from: P((wallX + springFree) / 2, leadEnd), to: P((wallX + springFree) / 2, springY - 0.05), arrow: "none", stroke: soft, strokeWidth: 1 },
];
if (answers) {
  const dimY = track + 0.07 + px(18);
  children.push(lbl("ans-x", P(ledge + xl / 2, dimY + px(FS / 2 + 8)), `x = ${xl.toFixed(2).replace(".", ",")} m`, { annotates: "x-dim", textColor: gold }));
  connectors.push({ id: "x-dim", from: P(ledge, dimY), to: P(ledge + xl, dimY), arrow: "both", arrowStyle: "open", stroke: gold, strokeWidth: 1.2 });
}
const spec = {
  version: 1,
  title: answers ? "Cadeia de energia: resolução" : "Cadeia de energia: do gás à mola",
  canvas: { padding: 16, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } },
  root: { type: "scene", layout: "absolute", width: Math.ceil(P(6.86, 0).x + 20), height: Math.ceil(FL + FS + 40), marks, children, connectors },
};
const LIGHT: Record<string, string> = {
  "#d8d8d0": "#222222", "#9a9a94": "#666666", "#f0d080": "#9a5c00", "#34342f": "#e6e4de", "#e0a860": "#8a5010",
  "#8fd3b6": "#1f6b50", "#245c48": "#d3ebe0", "#f0e0a0": "#7a5c00", "#55554f": "#9a9a9a", "#9cc0f0": "#2a5ca8",
  "#1f4a8a": "#d3e0f5", "#e8eefc": "#1a3a70", "#7a3020": "#f3c4ac", "#e08a60": "#b04a20", "#6a6a64": "#b0b0b0",
  "#4a3fa8": "#8f86dc", "#b8b0f0": "#3d3585", "#0f1115": "#ffffff", "#b8742a": "#d89a50",
};
let out = JSON.stringify(print ? { ...spec, canvas: { ...spec.canvas, theme: "print" } } : spec, null, 2);
if (print) out = out.replace(/#[0-9a-f]{6}/g, (c) => LIGHT[c] ?? c);
writeFileSync(process.argv[2]!, out);
