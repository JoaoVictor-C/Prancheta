import { writeFileSync } from "node:fs";
// usage: node gen-incline-pulley-spring.ts <out.json>
// One scale for lengths (S px per metre) and one for forces (KF metres per newton).

// ---- physics: m2 descends, m1 slides up the slope, friction acts down-slope ----
const g = 9.8, m1 = 4, m2 = 6, Mp = 2, mu = 0.25, deg = Math.PI / 180, th = 30 * deg;
const a = (m2 * g - m1 * g * Math.sin(th) - mu * m1 * g * Math.cos(th)) / (m1 + m2 + Mp / 2);
const N = m1 * g * Math.cos(th), fk = mu * N, T1 = m1 * a + m1 * g * Math.sin(th) + fk, T2 = m2 * (g - a);
const F = { m1g: m1 * g, N, fk, T1, m2g: m2 * g, T2 };
console.log(`a = ${a.toFixed(3)} m/s²`, Object.entries(F).map(([k, v]) => `${k} = ${v.toFixed(2)} N`).join(", "));

// ---- layout in metres (ground y = 0, y up) ----
const S = 250, ox = 30, top = 2.3, FS = 20;
const KF = 0.01, KA = 0.08;
const P = (x: number, y: number) => ({ x: +(ox + x * S).toFixed(2), y: +((top - y) * S + 16).toFixed(2) });
const px = (n: number) => n / S;
type Pt = { x: number; y: number };
const W = 3.0, H = W * Math.tan(th);
const u = { x: Math.cos(th), y: Math.sin(th) }, n = { x: -Math.sin(th), y: Math.cos(th) };
const at = (s: number, h: number) => ({ x: s * u.x + h * n.x, y: s * u.y + h * n.y });
const polar = (c: Pt, r: number, d: number) => ({ x: c.x + r * Math.cos(d * deg), y: c.y + r * Math.sin(d * deg) });
// The pulley's radius is not given, so it is drawn large enough to carry its own R.
const R = 0.2, bh = 0.26, hs = bh / 2;                         // the rope leaves m1 at mid-height
const Cx = W + 0.4, Cy = (hs - R + Cx * Math.sin(th)) / Math.cos(th); // rope tangent over the top
const C = { x: Cx, y: Cy }, tan = { x: Cx + R * n.x, y: Cy + R * n.y };
const s0 = 1.4, s1 = 1.9, sc = (s0 + s1) / 2, c1 = at(sc, hs);
const sx = Cx + R, b2 = { w: 0.3, h: 0.3 }, springTop = 0.55, hGap = 0.5;
const b2y0 = springTop + hGap, c2 = { x: sx, y: b2y0 + b2.h / 2 };

const ink = "#111111", red = "#c62828", blue = "#1565c0", green = "#2e7d32", grey = "#555555";
const fillBlock = "#d6d6d6", fillLight = "#ececec";
const font = '"Times New Roman", "STIX Two Text", serif';
const seg = (p: Pt) => ({ line: P(p.x, p.y) });
const add = (p: Pt, d: Pt, k: number) => ({ x: p.x + d.x * k, y: p.y + d.y * k });

// ---- labels: plain letters, variables set italic by their run (ADR 0078) ----
type Run = { text: string; script?: "sub" | "sup"; fontStyle?: "italic" };
const v = (text: string): Run => ({ text, fontStyle: "italic" });
const sub = (text: string): Run => ({ text, script: "sub" });
const sup = (text: string): Run => ({ text, script: "sup" });
const t = (text: string): Run => ({ text });
const widthOf = (runs: Run[], fs: number) =>
  Math.ceil(runs.reduce((w, r) => w + [...r.text].length * fs * (r.script ? 0.4 : 0.55), 0) + 8);
const lbl = (id: string, c: Pt, runs: Run[], annotates: string, extra: object = {}, fs = FS) => {
  const Wd = widthOf(runs, fs), Ht = fs + 10, q = P(c.x, c.y);
  return {
    type: "block", id, x: +(q.x - Wd / 2).toFixed(2), y: +(q.y - Ht / 2).toFixed(2), width: Wd, height: Ht, padding: 0,
    fill: "none", stroke: "none", wrap: "none", textAlign: "center", verticalAlign: "center", fontSize: fs, fontFamily: font,
    textColor: ink, label: runs.map((r) => r.text).join(""), runs, annotates, ...extra,
  };
};
const arrow = (id: string, from: Pt, to: Pt, stroke: string, extra: object = {}) =>
  ({ id, from: P(from.x, from.y), to: P(to.x, to.y), arrow: "end", stroke, strokeWidth: 2.6, ...extra });

// hatching drawn as one path per surface, retracing each tick
const hatch = (a0: Pt, dir: Pt, len: number, step: number, tick: Pt, size = 0.07) => {
  const segs = [] as { line: Pt }[];
  for (let d = 0; d <= len + 1e-9; d += step) {
    const p = add(a0, dir, d);
    segs.push(seg(p), seg(add(p, tick, size)), seg(p));
  }
  return segs;
};
const diag = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
const groundL = -0.12, groundR = 4.5;

// spring: straight leads, ten teeth
const zig = [seg({ x: sx, y: 0.06 })];
const teeth = 10, z0 = 0.06, z1 = springTop - 0.05;
for (let i = 1; i <= teeth; i++) zig.push(seg({ x: sx + (i % 2 ? 0.06 : -0.06), y: z0 + ((i - 0.5) * (z1 - z0)) / teeth }));
zig.push(seg({ x: sx, y: z1 }), seg({ x: sx, y: springTop }));

const rect = (pts: Pt[]) => ({ from: P(pts[0]!.x, pts[0]!.y), segments: pts.slice(1).map(seg), close: true });
const m1pts = [at(s0, 0), at(s1, 0), at(s1, bh), at(s0, bh)];
const m2pts = [{ x: sx - b2.w / 2, y: b2y0 }, { x: sx + b2.w / 2, y: b2y0 }, { x: sx + b2.w / 2, y: b2y0 + b2.h }, { x: sx - b2.w / 2, y: b2y0 + b2.h }];
const hX = sx + b2.w / 2 + 0.2, gX = 4.32;

const marks: object[] = [
  { id: "ground", from: P(groundL, 0), segments: [seg({ x: groundR, y: 0 }), ...hatch({ x: groundR - 0.02, y: 0 }, { x: -1, y: 0 }, groundR - groundL - 0.06, 0.06, diag)], close: false, stroke: ink, strokeWidth: 1.6 },
  { id: "wedge", from: P(0, 0), segments: [seg({ x: W, y: 0 }), seg({ x: W, y: H })], close: true, fill: "#ffffff", stroke: ink, strokeWidth: 2 },
  { id: "slope-hatch", from: P(at(0.66, 0).x, at(0.66, 0).y), segments: hatch(at(0.66, 0), u, 2.75, 0.06, { x: Math.cos(255 * deg), y: Math.sin(255 * deg) }, 0.05), close: false, stroke: ink, strokeWidth: 1.1 },
  // the bracket carrying the axle: a plate from the wedge's top corner
  { id: "bracket", ...rect([{ x: W, y: H }, C, { x: W + 0.1, y: H - 0.32 }, { x: W, y: H - 0.32 }]), fill: fillLight, stroke: ink, strokeWidth: 1.6 },
  { id: "m1", ...rect(m1pts), fill: fillBlock, stroke: ink, strokeWidth: 2 },
  { id: "m2", ...rect(m2pts), fill: fillBlock, stroke: ink, strokeWidth: 2 },
  { id: "spring", from: P(sx, 0), segments: zig, close: false, stroke: ink, strokeWidth: 1.8 },
  { id: "spring-base", from: P(sx - 0.1, 0.0), segments: [seg({ x: sx + 0.1, y: 0 }), seg({ x: sx + 0.1, y: 0.025 }), seg({ x: sx - 0.1, y: 0.025 })], close: true, fill: ink, stroke: ink, strokeWidth: 1 },
  { id: "spring-cap", from: P(sx - 0.08, springTop), segments: [seg({ x: sx + 0.08, y: springTop })], close: false, stroke: ink, strokeWidth: 3 },
];

const children: object[] = [
  { type: "block", id: "pulley", shape: "circle", x: P(C.x - R, 0).x, y: P(0, C.y + R).y, width: 2 * R * S, height: 2 * R * S, padding: 0, fill: fillLight, stroke: ink, strokeWidth: 2, label: "" },
  { type: "block", id: "axle", shape: "circle", x: P(C.x - 0.022, 0).x, y: P(0, C.y + 0.022).y, width: 0.044 * S, height: 0.044 * S, padding: 0, fill: ink, stroke: "none", label: "" },
  ...[c1, c2].map((c, i) => ({ type: "block", id: `cm${i + 1}`, shape: "circle", x: P(c.x - 0.012, 0).x, y: P(0, c.y + 0.012).y, width: 0.024 * S, height: 0.024 * S, padding: 0, fill: ink, stroke: "none", label: "" })),
];

// forces from each block's centre, one scale; T beside its rope; f from the down-slope face
const tT1 = add(c1, n, 0.075), tT2 = { x: c2.x - 0.075, y: c2.y };
const fTail = at(s0, hs);
const a1from = at(sc + 0.09, bh + 0.08), a1to = at(sc + 0.09 + a * KA, bh + 0.08);
const a2x = sx - b2.w / 2 - 0.12, a2from = { x: a2x, y: b2y0 + b2.h - 0.03 }, a2to = { x: a2x, y: b2y0 + b2.h - 0.03 - a * KA };
const alphaR = R + 0.07, rEnd = polar(C, R, 160);
const connectors: object[] = [
  { id: "rope-1", from: P(at(s1, hs).x, at(s1, hs).y), to: P(tan.x, tan.y), arrow: "none", stroke: ink, strokeWidth: 1.6 },
  { id: "rope-wrap", from: P(tan.x, tan.y), to: P(sx, C.y), arrow: "none", stroke: ink, strokeWidth: 1.6, curve: { kind: "sweep", centre: P(C.x, C.y) } },
  { id: "rope-2", from: P(sx, C.y), to: P(sx, b2y0 + b2.h), arrow: "none", stroke: ink, strokeWidth: 1.6 },
  { id: "theta", from: P(0.55, 0), to: P(at(0.55, 0).x, at(0.55, 0).y), arrow: "none", stroke: ink, strokeWidth: 1.3, curve: { kind: "sweep", centre: P(0, 0) } },
  arrow("F-m1g", c1, { x: c1.x, y: c1.y - F.m1g * KF }, red),
  arrow("F-N", c1, add(c1, n, F.N * KF), red),
  arrow("F-T1", tT1, add(tT1, u, F.T1 * KF), red),
  arrow("F-fk", fTail, add(fTail, u, -F.fk * KF), red),
  arrow("F-m2g", c2, { x: c2.x, y: c2.y - F.m2g * KF }, red),
  arrow("F-T2", tT2, { x: tT2.x, y: tT2.y + F.T2 * KF }, red),
  arrow("a1", a1from, a1to, blue),
  arrow("a2", a2from, a2to, blue),
  // α: clockwise over the top, as m2 falls on the right
  { id: "alpha", from: P(polar(C, alphaR, 75).x, polar(C, alphaR, 75).y), to: P(polar(C, alphaR, 20).x, polar(C, alphaR, 20).y), arrow: "end", stroke: green, strokeWidth: 2.4, curve: { kind: "sweep", centre: P(C.x, C.y) } },
  { id: "R-line", from: P(C.x, C.y), to: P(rEnd.x, rEnd.y), arrow: "end", arrowStyle: "open", stroke: ink, strokeWidth: 1.3 },
  arrow("ax-x", at(0.8, 0.12), at(1.06, 0.12), grey, { strokeWidth: 1.4, arrowStyle: "open" }),
  arrow("ax-y", at(0.8, 0.12), at(0.8, 0.38), grey, { strokeWidth: 1.4, arrowStyle: "open" }),
  { id: "h-ext-top", from: P(sx + b2.w / 2 + 0.03, b2y0), to: P(hX + 0.05, b2y0), arrow: "none", stroke: grey, strokeWidth: 1, lineStyle: "dotted" },
  { id: "h-ext-bot", from: P(sx + 0.1, springTop), to: P(hX + 0.05, springTop), arrow: "none", stroke: grey, strokeWidth: 1, lineStyle: "dotted" },
  { id: "h-dim", from: P(hX, b2y0), to: P(hX, springTop), arrow: "both", arrowStyle: "open", stroke: ink, strokeWidth: 1.2 },
  { id: "k-lead", from: P(sx + 0.22, 0.27), to: P(sx + 0.07, 0.27), arrow: "none", stroke: grey, strokeWidth: 1 },
  arrow("g-ind", { x: gX, y: 2.25 }, { x: gX, y: 1.95 }, ink, { strokeWidth: 2 }),
];
const off = (p: Pt, dx: number, dy: number) => ({ x: p.x + px(dx), y: p.y + px(dy) });
children.push(
  lbl("lab-m1", off(at(s0 - 0.1, bh + 0.2), -14, 0), [v("m"), sub("1"), t(" = 4 kg")], "m1"),
  lbl("lab-m2", { x: sx + b2.w / 2 + px(62), y: b2y0 + b2.h + px(2) }, [v("m"), sub("2"), t(" = 6 kg")], "m2"),
  lbl("lab-M", { x: C.x + 0.4, y: C.y - 0.11 }, [v("M"), t(" = 2 kg")], "pulley"),
  lbl("lab-R", polar(C, 0.11, 135), [v("R")], "R-line", {}, 17),
  lbl("lab-theta", polar({ x: 0, y: 0 }, 0.55 + px(44), 13), [v("θ"), t(" = 30°")], "theta"),
  lbl("lab-mu", at(2.35, -0.33), [v("μ"), sub("k"), t(" = 0.25")], "slope-hatch"),
  lbl("lab-k", off({ x: sx + 0.22, y: 0.27 }, 58, 0), [v("k"), t(" = 200 N/m")], "k-lead"),
  lbl("lab-h", off({ x: hX, y: (springTop + b2y0) / 2 }, 46, 0), [v("h"), t(" = 0.5 m")], "h-dim"),
  lbl("lab-g", off({ x: gX, y: 2.1 }, -70, 0), [v("g"), t(" = 9.8 m/s"), sup("2")], "g-ind"),
  lbl("lab-m1g", off({ x: c1.x, y: c1.y - F.m1g * KF }, 30, -14), [v("m"), sub("1"), v("g")], "F-m1g", { textColor: red }),
  lbl("lab-N", off(add(c1, n, F.N * KF), -16, 12), [v("N")], "F-N", { textColor: red }),
  lbl("lab-T1", off(add(tT1, u, F.T1 * KF), 2, 22), [v("T"), sub("1")], "F-T1", { textColor: red }),
  lbl("lab-fk", off(add(fTail, u, -F.fk * KF), -22, 2), [v("f"), sub("k")], "F-fk", { textColor: red }),
  lbl("lab-m2g", off({ x: c2.x, y: c2.y - F.m2g * KF }, 28, 28), [v("m"), sub("2"), v("g")], "F-m2g", { textColor: red }),
  lbl("lab-T2", off({ x: tT2.x, y: tT2.y + F.T2 * KF }, -20, -6), [v("T"), sub("2")], "F-T2", { textColor: red }),
  lbl("lab-a1", off({ x: (a1from.x + a1to.x) / 2, y: (a1from.y + a1to.y) / 2 }, -8, 18), [v("a")], "a1", { textColor: blue }),
  lbl("lab-a2", off({ x: a2x, y: (a2from.y + a2to.y) / 2 }, -16, 0), [v("a")], "a2", { textColor: blue }),
  lbl("lab-alpha", polar(C, alphaR + 0.1, 60), [v("α")], "alpha", { textColor: green }),
  lbl("lab-x", off(at(1.06, 0.12), 10, -4), [v("x")], "ax-x", { textColor: grey }),
  lbl("lab-y", off(at(0.8, 0.38), -12, 6), [v("y")], "ax-y", { textColor: grey }),
);

const spec = {
  version: 1,
  title: "Bloco no plano inclinado com atrito ligado, por polia com massa, a um bloco suspenso sobre uma mola",
  canvas: { padding: 16, theme: "print", constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } },
  root: { type: "scene", layout: "absolute", width: Math.ceil(P(groundR + 0.08, 0).x), height: Math.ceil(P(0, -0.1).y), marks, children, connectors },
};
writeFileSync(process.argv[2]!, JSON.stringify(spec, null, 2));
