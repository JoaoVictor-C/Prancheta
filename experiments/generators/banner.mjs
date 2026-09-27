/*
 * LinkedIn banner (1584 x 396) -- "Still Water", cut to a strip.
 *
 * The same surface as stillwater.mjs:
 *
 *   psi(p) = sum_i  cos(k |p - s_i|) / sqrt(1 + |p - s_i| / r0)
 *
 * with size carrying |psi| and hue carrying its sign. The stones sit at the
 * far left, where LinkedIn lays the profile photo over the banner, so the
 * densest ink is the part the photo covers.
 *
 * The field ends in a soft vertical aperture well before the text. That gap is
 * not taste: a label partially over a grain fails boxes-do-not-overlap and
 * text-clear-of-other-boxes, so the checker refuses any encroachment.
 *
 * Text is placed directly rather than through poster(), whose frame is laid
 * out for a tall portrait plate.
 */
import { writeFileSync } from "node:fs";
import { page } from "./lib.mjs";

const W = 1584;
const H = 396;

const p = page({ theme: "midnight", width: W, height: H });

const PITCH = 4.6;
const DMAX = PITCH - 0.15;       // never wider than the pitch, so no two grains touch
const LAMBDA = 52;               // 11.3 samples per wavelength -- clear of aliasing
const K = (2 * Math.PI) / LAMBDA;
const R0 = 130;
const GAIN = 1.75;

const FIELD_END = 560;           // the aperture closes here
const FADE = 150;                // over this many px

const SOURCES = [
  { x: 118, y: 112 },
  { x: 62, y: 286 },
  { x: 268, y: 238 },
];

const height = (x, y) => {
  let sum = 0;
  for (const s of SOURCES) {
    const r = Math.hypot(x - s.x, y - s.y);
    sum += Math.cos(K * r) / Math.sqrt(1 + r / R0);
  }
  return Math.max(-1, Math.min(1, sum / GAIN));
};

const ramp = p.ramp([
  [0.00, "#9FF2EC"],
  [0.14, "#5EC8DC"],
  [0.30, "#2F7FB4"],
  [0.42, "#1E4270"],
  [0.50, "#141C30"],
  [0.58, "#4A3457"],
  [0.70, "#9A5A66"],
  [0.86, "#E5A85E"],
  [1.00, "#FFF3DA"],
]);

let drawn = 0;
for (let x = PITCH; x <= FIELD_END; x += PITCH) {
  for (let y = PITCH; y <= H - PITCH; y += PITCH) {
    if (SOURCES.some((s) => Math.hypot(x - s.x, y - s.y) < 10)) continue;

    const edge = Math.min(1, Math.max(0, (FIELD_END - x) / FADE));
    const a = height(x, y) * edge;
    const d = DMAX * Math.pow(Math.abs(a), 0.42);
    if (d < 0.85) continue;

    p.disc(x, y, d, ramp((a + 1) / 2));
    drawn += 1;
  }
}

for (const s of SOURCES) {
  p.disc(s.x, s.y, 8, "#0A0A12");
  p.disc(s.x, s.y, 3.4, "#FFF3DA");
}

// Text block: x 650..1300, vertically centred on the canvas.
const TX = 650;
const TW = 650;
p.text(TX, 118, TW, "D E S E N V O L V E D O R  B A C K E N D", 17, "eyebrow", "left");
p.text(TX, 150, TW, "Python · C#/.NET · TypeScript", 40, "title", "left");
p.rect(TX, 222, 72, 1.5, "rule");
p.text(TX, 236, TW, "desenhado pelo Prancheta", 20, "body", "left");

const spec = {
  version: 1,
  title: "LinkedIn banner",
  canvas: { padding: 0, background: p.ink.bg, theme: "dark" },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: p.kids },
};
writeFileSync("out/linkedin-banner.json", JSON.stringify(spec, null, 2));
console.log(`wrote out/linkedin-banner.json -- ${p.kids.length} blocks (${drawn} grains)`);
