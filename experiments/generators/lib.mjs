/*
 * Shared scaffolding for the mathematical poster series.
 *
 * Everything here exists because of one constraint: `boxes-do-not-overlap`
 * lets blocks nest or stand apart but never partially overlap. So every
 * figure in this series is built from discrete, separated marks -- and any
 * curve that crosses itself has to be quantised onto a lattice first, which
 * is what `Lattice` is for. The same constraint is why `carve` exists: a grid
 * line cannot simply be drawn through an axis label, it has to stop short of
 * it and start again on the far side.
 *
 * TWO IDIOMS, ON PURPOSE. The free functions below (`text`, `disc`, `rect`,
 * `poster`) take the accumulator array as their first argument and are what
 * the first six generators were written against; they still work exactly as
 * they did. Everything new hangs off `page()`, which closes over its own
 * accumulator and its own theme. Prefer `page()` for new work -- see the
 * README for why the kids-threading idiom is the one being retired.
 */
import { writeFileSync } from "node:fs";
import { contrastRatio, WCAG_AA_NORMAL } from "../../src/colour/contrast.ts";

export const W = 880;
export const H = 1120;
export const BG = "#0A0A12";

export const INK_TITLE = "#F4E7CA";
export const INK_EYEBROW = "#9BA0CC";
export const INK_BODY = "#8E92BC";
export const INK_FAINT = "#8A8FB8";
export const INK_RULE = "#332F58";

let uid = 0;
export const nid = (p) => `${p}${uid++}`;

/** One rendered line box, matching the theme's 1.45 line-height. */
export const lineHeight = (fs) => fs * 1.45;
/** Slack for the ink that overshoots the line boxes (ascenders, descenders). */
const INK_SLACK = 2.6;

const hexOf = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

/** Piecewise-linear colour ramp through `stops` of [t, "#rrggbb"], t in [0,1]. */
export function makeRamp(stops) {
  return (t) => {
    const u = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < stops.length - 2 && u > stops[i + 1][0]) i += 1;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    const k = (u - t0) / (t1 - t0);
    const a = hexOf(c0);
    const b = hexOf(c1);
    return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
  };
}

/** Blend `c` towards `bg` by `k` (0 = c, 1 = bg). */
export function fade(c, k, bg = BG) {
  const a = hexOf(c);
  const b = hexOf(bg);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
}

/** A label anchored at its top-left. Newlines are hard breaks. */
export function text(kids, x, y, w, label, fs, fill, align = "center") {
  const lines = label.split("\n").length;
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: lines * lineHeight(fs) + INK_SLACK,
    label, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}

/** A filled disc of diameter `d` centred on (cx, cy). */
export function disc(kids, cx, cy, d, fill, effect) {
  kids.push({
    type: "block", id: nid("d"), x: cx - d / 2, y: cy - d / 2,
    width: d, height: d, shape: "circle",
    fill, stroke: "transparent", strokeWidth: 0, padding: 0,
    ...(effect ? { effect } : {}),
  });
}

/** An axis-aligned ink rectangle. */
export function rect(kids, x, y, w, h, fill) {
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });
}

/**
 * Snaps points onto a square lattice and keeps one per cell.
 *
 * A parametric curve that crosses itself would otherwise place two marks at
 * the same spot -- a partial overlap, and a real check failure. Quantising
 * collapses every crossing to a single mark, which is also what rastering
 * the curve would do anyway.
 */
export class Lattice {
  constructor(pitch) {
    this.pitch = pitch;
    this.cells = new Map();
  }

  /** Returns true if this point claimed a previously empty cell. */
  add(x, y, meta) {
    const i = Math.round(x / this.pitch);
    const j = Math.round(y / this.pitch);
    const key = `${i},${j}`;
    if (this.cells.has(key)) return false;
    this.cells.set(key, { x: i * this.pitch, y: j * this.pitch, meta });
    return true;
  }

  get size() {
    return this.cells.size;
  }

  *[Symbol.iterator]() {
    yield* this.cells.values();
  }
}

/**
 * The common poster frame: eyebrow above, title / rule / caption / footnote
 * below, over whatever `kids` the figure has already pushed.
 */
export function poster({ kids, name, title, eyebrow, caption, footnote, textTop = 916, vignette = 0.4 }) {
  text(kids, 140, 52, 600, eyebrow, 12, INK_EYEBROW);
  text(kids, 100, textTop, 680, title, 42, INK_TITLE);
  rect(kids, W / 2 - 60, textTop + 84, 120, 1, INK_RULE);
  text(kids, 110, textTop + 110, 660, caption, 13.5, INK_BODY);
  const lines = caption.split("\n").length;
  text(kids, 110, textTop + 110 + lines * lineHeight(13.5) + 12, 660, footnote, 11.5, INK_FAINT);

  const spec = {
    version: 1,
    title,
    canvas: { padding: 0, background: BG, theme: "dark", vignette },
    root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
  };
  writeFileSync(`out/${name}.json`, JSON.stringify(spec, null, 2));
  console.log(`wrote out/${name}.json -- ${kids.length} blocks`);
}

// ===========================================================================
// Themes.
//
// A theme is a plain record of named roles, not a DSL. Its value is that the
// roles can be run through the project's own `contrastRatio` -- the same
// function `contrast-sufficient` uses on every render -- so the series' look
// is stated and checked rather than being five constants someone chose.
//
// STATED LIMIT, because it would be easy to overclaim: only the NAMED ROLES
// are checkable this way. The dominant ink in most of these posters is ramp
// output, a continuum of data-driven mark colour, and a continuum has no
// single ratio. `rampFloor` reports the worst sample against the background;
// it is a weaker claim than the role ratios and is labelled as such.
// ===========================================================================

export const THEMES = {
  /** The original series palette: near-black, warm title, cool body. */
  midnight: {
    name: "midnight",
    bg: "#0A0A12",
    title: "#F4E7CA",
    eyebrow: "#9BA0CC",
    body: "#8E92BC",
    faint: "#8A8FB8",
    rule: "#332F58",
    furniture: "#3A3560",
    furnitureFaint: "#241F42",
    vignette: 0.4,
  },
  /** Warm paper. For a poster meant to be printed rather than glowed at. */
  bone: {
    name: "bone",
    bg: "#F2EEE3",
    title: "#1E1A14",
    eyebrow: "#6A5F4B",
    body: "#3D3730",
    faint: "#5C544A",
    rule: "#C6BCA6",
    furniture: "#BDB3A0",
    furnitureFaint: "#DCD5C6",
    vignette: 0,
  },
  /** Deep cyanotype blue, for figures that read as drawings rather than data. */
  blueprint: {
    name: "blueprint",
    bg: "#0B2540",
    title: "#EAF2FA",
    eyebrow: "#7FA8CC",
    body: "#B6CEE4",
    faint: "#9BB8D2",
    rule: "#2A4C70",
    furniture: "#31577E",
    furnitureFaint: "#183754",
    vignette: 0.3,
  },
};

// Text roles carry a WCAG AA verdict. `rule` and the furniture greys are
// hairlines and gridwork, not text -- AA is a legibility threshold for reading,
// and applying it to a 1px divider would report a failure that means nothing.
// They get a ratio and no verdict, the same treatment as a ramp sample.
const TEXT_ROLES = ["title", "eyebrow", "body", "faint"];
const MARK_ROLES = ["rule", "furniture", "furnitureFaint"];

/**
 * Every named role's contrast against its own background, plus the worst
 * sample of an optional ramp. Roles carry a pass/fail against WCAG AA; the
 * ramp floor carries a number and no verdict, because a mark is not text.
 */
export function themeContrast(theme, ramp) {
  // contrastRatio returns null for anything it cannot read as a flat colour
  // (a gradient, a bad hex). A role that cannot be measured is reported as
  // unmeasured rather than silently scored, since a missing number and a bad
  // number are different findings.
  const roles = TEXT_ROLES.map((role) => {
    const ratio = contrastRatio(theme[role], theme.bg);
    return {
      role,
      colour: theme[role],
      ratio,
      passesAA: ratio === null ? null : ratio >= WCAG_AA_NORMAL,
    };
  });
  const marks = MARK_ROLES.filter((role) => theme[role] !== undefined).map((role) => ({
    role,
    colour: theme[role],
    ratio: contrastRatio(theme[role], theme.bg),
  }));
  let rampFloor;
  if (ramp !== undefined) {
    let worst = Infinity;
    let at = 0;
    for (let i = 0; i <= 64; i += 1) {
      const t = i / 64;
      const ratio = contrastRatio(ramp(t), theme.bg);
      if (ratio !== null && ratio < worst) {
        worst = ratio;
        at = t;
      }
    }
    if (Number.isFinite(worst)) rampFloor = { ratio: worst, at };
  }
  return { theme: theme.name, roles, marks, rampFloor };
}

// ===========================================================================
// The page builder.
//
// Why this exists at all: every free function above takes `kids` as its first
// argument, and a generator that wanted one local helper wrote its own
// closure-based `text` instead of passing the array everywhere -- and having
// left the import, then re-derived `nid`, `hex`, `pad` and `ramp` too. That
// cascade, not a missing feature, is what produced most of the duplication in
// this directory. A page closes over its own accumulator AND its own theme,
// so a call site carries neither.
// ===========================================================================

export function page({ theme = "midnight", width = W, height = H } = {}) {
  const ink = typeof theme === "string" ? THEMES[theme] : theme;
  if (ink === undefined) {
    throw new Error(`no theme named "${theme}". Known: ${Object.keys(THEMES).join(", ")}`);
  }

  const kids = [];
  /** Rectangles later carving must route around. */
  const reserved = [];

  const colourOf = (fill) => (ink[fill] !== undefined ? ink[fill] : fill);

  const self = {
    kids,
    reserved,
    ink,
    width,
    height,
    /** Blend towards THIS page's background rather than a module constant. */
    fade: (c, k) => fade(c, k, ink.bg),
    ramp: makeRamp,

    text(x, y, w, label, fs, fill = "body", align = "center") {
      text(kids, x, y, w, label, fs, colourOf(fill), align);
      return self;
    },
    disc(cx, cy, d, fill, effect) {
      disc(kids, cx, cy, d, colourOf(fill), effect);
      return self;
    },
    rect(x, y, w, h, fill) {
      rect(kids, x, y, w, h, colourOf(fill));
      return self;
    },

    /**
     * Claim a rectangle so `carve` routes around it. `slack` widens the claim,
     * which is what gives a printed label the small clearing it wants anyway.
     */
    reserve(x, y, w, h, slack = 2) {
      reserved.push({ x: x - slack, y: y - slack, x2: x + w + slack, y2: y + h + slack });
      return self;
    },

    /**
     * A straight rule, emitted as segments that stop short of everything
     * already reserved.
     *
     * Extracted from zeta-conformal, which discovered it the hard way: a grid
     * drawn as whole rects runs straight through its own axis labels, and
     * `text-clear-of-other-boxes` fails. This is the same discipline `Lattice`
     * applies to self-crossing curves -- the overlap constraint is not an
     * obstacle to route around, it is what the series looks like.
     */
    carve(along, from, to, thickness, fill, vertical) {
      const colour = colourOf(fill);
      const cuts = reserved
        .filter((r) => (vertical ? along >= r.x && along <= r.x2 : along >= r.y && along <= r.y2))
        .map((r) => (vertical ? [r.y, r.y2] : [r.x, r.x2]))
        .sort((a, b) => a[0] - b[0]);
      let cursor = from;
      for (const [lo, hi] of cuts) {
        if (hi <= cursor) continue;
        if (lo > cursor) {
          const end = Math.min(lo, to);
          if (end > cursor) {
            if (vertical) rect(kids, along, cursor, thickness, end - cursor, colour);
            else rect(kids, cursor, along, end - cursor, thickness, colour);
          }
        }
        cursor = Math.max(cursor, hi);
        if (cursor >= to) return self;
      }
      if (cursor < to) {
        if (vertical) rect(kids, along, cursor, thickness, to - cursor, colour);
        else rect(kids, cursor, along, to - cursor, thickness, colour);
      }
      return self;
    },

    /**
     * A sub-region with its own data-space-to-page-space map.
     *
     * Earns its place only when the data space is NOT already normalised.
     * chladni lays four plates out in a 2x2 grid with two lines of arithmetic
     * because its domain is the unit square; a complex plane or a log scale is
     * where a panel starts paying for itself.
     */
    panel({ x, y, width: pw, height: ph, xDomain = [0, 1], yDomain = [0, 1], pitch }) {
      const [x0, x1] = xDomain;
      const [y0, y1] = yDomain;
      const sx = (v) => x + ((v - x0) / (x1 - x0)) * pw;
      const sy = (v) => y + ph - ((v - y0) / (y1 - y0)) * ph;
      // Give a panel a `pitch` and its dots are quantised onto that lattice,
      // one mark per cell. Two data points that map to the same pixel are the
      // normal case in any dense scatter, and two discs at the same spot are a
      // real `boxes-do-not-overlap` failure -- so the panel makes the safe
      // thing the short thing. Set pitch >= the diameter you draw.
      const lattice = pitch === undefined ? undefined : new Lattice(pitch);
      const panel = {
        page: self, x, y, width: pw, height: ph, sx, sy, lattice,
        contains: (v, w) => sx(v) >= x && sx(v) <= x + pw && sy(w) >= y && sy(w) <= y + ph,
        dot(v, w, d, fill) {
          let px = sx(v);
          let py = sy(w);
          if (lattice !== undefined) {
            if (!lattice.add(px, py)) return panel;
            // Draw ON the lattice, not merely deduplicated BY it. Keeping the
            // unsnapped position leaves two marks in adjacent cells free to sit
            // arbitrarily close across the shared boundary, which still fails
            // `boxes-do-not-overlap` -- the dedup was doing half the job. Once
            // snapped, the minimum separation is the pitch, so a pitch at least
            // the diameter you draw is sufficient by construction.
            px = Math.round(px / pitch) * pitch;
            py = Math.round(py / pitch) * pitch;
          }
          self.disc(px, py, d, fill);
          return panel;
        },

        /**
         * Tick labels first (reserved), then carved grid lines. That order is
         * the whole point -- reserve before you draw, or the grid runs through
         * the labels.
         */
        ticks({ x: xs = [], y: ys = [], format = String, fs = 11, grid = false }) {
          // The x band sits BELOW the y labels' own band. The origin labels
          // ("0" on each axis) otherwise clip each other at the corner, which
          // `boxes-do-not-overlap` correctly refuses -- found by rendering.
          for (const v of xs) {
            const px = sx(v);
            if (px < x - 1 || px > x + pw + 1) continue;
            const lw = 46;
            self.text(px - lw / 2, y + ph + 14, lw, format(v), fs, "faint");
            self.reserve(px - lw / 2, y + ph + 14, lw, lineHeight(fs));
          }
          for (const w of ys) {
            const py = sy(w);
            if (py < y - 1 || py > y + ph + 1) continue;
            const lw = 46;
            self.text(x - lw - 8, py - lineHeight(fs) / 2, lw, format(w), fs, "faint", "end");
            self.reserve(x - lw - 8, py - lineHeight(fs) / 2, lw, lineHeight(fs));
          }
          // Gridlines are OFF by default, and that is a considered refusal
          // rather than an omission. A rule drawn across a field of marks
          // partially overlaps them, which is a real `boxes-do-not-overlap`
          // failure and not a cosmetic one -- `carve` can route a rule around
          // reserved LABELS, but not around a thousand data points. The chart
          // preset states the same restraint for the same reason: two end
          // labels say what a ruled line would. Ask for a grid only on a panel
          // whose marks are sparse, and expect to have to prove it.
          if (!grid) return panel;
          for (const v of xs) {
            const px = sx(v);
            if (px < x - 1 || px > x + pw + 1) continue;
            self.carve(px, y, y + ph, 1, "furnitureFaint", true);
          }
          for (const w of ys) {
            const py = sy(w);
            if (py < y - 1 || py > y + ph + 1) continue;
            self.carve(py, x, x + pw, 1, "furnitureFaint", false);
          }
          return panel;
        },

        /** A caption under the panel, in the faint role. */
        caption(label, fs = 11.5) {
          self.text(x, y + ph + 44, pw, label, fs, "faint");
          return panel;
        },
      };
      return panel;
    },

    /**
     * The poster frame, positioned relative to THIS page rather than a fixed
     * 880x1120. Writes out/<name>.json and returns the contrast report, so a
     * generator prints what it can prove about its own palette.
     */
    poster({ name, title, eyebrow, caption, footnote, textTop = height - 204, ramp }) {
      self.text(140, 52, width - 280, eyebrow, 12, "eyebrow");
      self.text(100, textTop, width - 200, title, 42, "title");
      self.rect(width / 2 - 60, textTop + 84, 120, 1, "rule");
      self.text(110, textTop + 110, width - 220, caption, 13.5, "body");
      const lines = caption.split("\n").length;
      self.text(110, textTop + 110 + lines * lineHeight(13.5) + 12, width - 220, footnote, 11.5, "faint");

      const spec = {
        version: 1,
        title,
        canvas: { padding: 0, background: ink.bg, theme: ink.bg === "#F2EEE3" ? "light" : "dark", vignette: ink.vignette },
        root: { type: "scene", layout: "absolute", width, height, children: kids },
      };
      writeFileSync(`out/${name}.json`, JSON.stringify(spec, null, 2));

      const report = themeContrast(ink, ramp);
      const measured = report.roles.filter((r) => r.ratio !== null);
      const worst = measured.reduce((a, b) => (a.ratio < b.ratio ? a : b), measured[0]);
      console.log(
        `wrote out/${name}.json -- ${kids.length} blocks, ${width}x${height}, theme ${ink.name}`,
      );
      console.log(
        `  text roles: worst ${worst.role} ${worst.ratio.toFixed(2)}:1 ` +
          `${measured.every((r) => r.passesAA) ? "(all pass AA)" : "(FAILS AA)"}` +
          (report.rampFloor
            ? `  ·  ramp floor ${report.rampFloor.ratio.toFixed(2)}:1 at t=${report.rampFloor.at.toFixed(2)} (a mark, not text -- no AA verdict)`
            : ""),
      );
      return report;
    },
  };

  return self;
}

// ===========================================================================
// Placement helpers.
//
// Packs decide what things LOOK like; these decide WHERE things go, and that
// is where a generator's length actually accumulates. Every one of these was
// re-derived by hand in at least two generators before it was extracted:
// phyllotaxis rolled its own golden-angle loop, chladni its own serpentine
// grid arithmetic, the Memphis probe its own glyph-by-glyph tracking.
//
// They all return POSITIONS and draw nothing. A helper that also drew would
// have to know about roles, themes and effects, and then it would be a preset
// wearing a false moustache.
// ===========================================================================

/** The golden angle, in radians. The one that fills a disc most evenly. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Vogel's phyllotaxis: the nth point at angle n*GOLDEN_ANGLE, radius c*sqrt(n).
 * `t` runs 0..1 across the set, so a ramp can be sampled straight from it.
 */
export function spiral(count, { cx, cy, scale = 17, angle = GOLDEN_ANGLE } = {}) {
  const out = [];
  for (let n = 0; n < count; n += 1) {
    const r = scale * Math.sqrt(n);
    out.push({
      x: cx + Math.cos(n * angle) * r,
      y: cy + Math.sin(n * angle) * r,
      n,
      r,
      t: count < 2 ? 0 : n / (count - 1),
    });
  }
  return out;
}

/** `count` points on a circle, clockwise from 12 o'clock by default. */
export function ring(count, { cx, cy, radius, from = -Math.PI / 2, sweep = Math.PI * 2 } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = from + (sweep * i) / count;
    out.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, i, angle: a });
  }
  return out;
}

/**
 * A boustrophedon grid: left-to-right, then right-to-left on the next row, so
 * consecutive items stay adjacent across the wrap. Pass `snake: false` for a
 * plain raster order.
 */
export function serpentine(count, { x, y, columns, cellWidth, cellHeight, snake = true } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / columns);
    const raw = i % columns;
    const column = snake && row % 2 === 1 ? columns - 1 - raw : raw;
    out.push({ x: x + column * cellWidth, y: y + row * cellHeight, i, row, column });
  }
  return out;
}

/**
 * Glyph positions for hand-tracked text.
 *
 * The type packs set `letterSpacing` and are the right answer for ordinary
 * tracking. This is for the case they cannot serve: tracking so wide the
 * glyphs are effectively separate marks, each needing its own colour, rotation
 * or effect. Returns one entry per non-space character.
 */
export function tracked(text, { x, y, advance, skipSpaces = true } = {}) {
  const out = [];
  [...text].forEach((glyph, i) => {
    if (skipSpaces && glyph === " ") return;
    out.push({ glyph, x: x + i * advance, y, i });
  });
  return out;
}

/**
 * A deterministic PRNG (mulberry32). Seeded on purpose: a generator that used
 * Math.random would draw a different figure every run, and a figure whose
 * checks passed once and fail the next time is worse than one that never
 * passed. Returns a function yielding 0..1.
 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Poisson-ish scatter: `count` points in a rect, each at least `spacing` apart,
 * by dart-throwing with a bounded number of tries.
 *
 * The spacing is not cosmetic. Marks closer together than their own diameter
 * partially overlap, which `boxes-do-not-overlap` refuses — so a scatter that
 * ignores spacing produces a figure that renders and cannot pass. Returns
 * fewer than `count` points when the rect is too full, rather than packing
 * them in and failing later.
 */
export function scatter(count, { x, y, width, height, spacing, seed = 1, tries = 30 } = {}) {
  const random = rng(seed);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < tries && !placed; attempt += 1) {
      const px = x + random() * width;
      const py = y + random() * height;
      if (out.every((p) => Math.hypot(p.x - px, p.y - py) >= spacing)) {
        out.push({ x: px, y: py, i: out.length });
        placed = true;
      }
    }
  }
  return out;
}
