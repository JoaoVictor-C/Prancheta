/*
 * Scaffolding for the recreation series: figures copied from a real,
 * photographed or lithographed original rather than invented here.
 *
 * Everything is a Mark. That is not a style choice -- a Mark takes no part in
 * layout and is never repaired, so an engraving whose every line means
 * something cannot be nudged by the repair loop into meaning something else.
 * The one Block any of these figures carries is the substrate underneath
 * (a gold disc, a sheet of paper), which is exactly the one element that MAY
 * be resized without lying.
 */
import { writeFileSync } from "node:fs";

export const rad = (d) => (d * Math.PI) / 180;

/** The hydrogen 21cm hyperfine transition period, in seconds. The plaque's clock. */
export const H_PERIOD = 1 / 1420405751.768;

/** `n` as a bit string, most significant first. */
export const bits = (n) => Math.round(n).toString(2);

/** A duration in seconds, as a bit string in hydrogen-line units. */
export const inHydrogen = (seconds) => bits(seconds / H_PERIOD);

const INK_CELL = 24;

/** Liang–Barsky: does the segment `s` pass through the rect `lo`–`hi`? */
function segmentCrossesRect(s, lo, hi) {
  let t0 = 0;
  let t1 = 1;
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  for (const [p, q] of [[-dx, s.ax - lo.x], [dx, hi.x - s.ax], [-dy, s.ay - lo.y], [dy, hi.y - s.ay]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t1 > t0;
}

export class Sheet {
  constructor({ width, height, background = "#08080C", title }) {
    this.width = width;
    this.height = height;
    this.background = background;
    this.title = title;
    this.marks = [];
    this.children = [];
    this.n = 0;
    // Every stroked run, so a script's own label placer can keep text off a
    // LINE and not merely off other boxes -- see `inkThrough`. Nothing here
    // reads this automatically; it exists for a caller like minard.mjs's
    // `placeLabel` to consult.
    this.ink = [];
    this.inkGrid = null;
  }

  id(p) {
    this.n += 1;
    return `${p}${this.n}`;
  }

  /** Remember a stroked run. `owner` is the mark id this run belongs to. */
  trace(pts, stroke, width, owner) {
    if (stroke === "none" || stroke === undefined || (width ?? 0) <= 0) return;
    for (let i = 0; i < pts.length - 1; i += 1) {
      this.ink.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y, owner });
    }
    this.inkGrid = null;
  }

  /**
   * How many recorded strokes pass through this box (`{x,y,hw,hh}`).
   *
   * Indexed into a coarse grid because a plate here can carry hundreds of
   * segments and a placer tries many candidate positions per label.
   */
  inkThrough(box, pad = 2, excludeOwner) {
    if (this.inkGrid === null) {
      const g = new Map();
      this.ink.forEach((s, i) => {
        const x0 = Math.floor(Math.min(s.ax, s.bx) / INK_CELL);
        const x1 = Math.floor(Math.max(s.ax, s.bx) / INK_CELL);
        const y0 = Math.floor(Math.min(s.ay, s.by) / INK_CELL);
        const y1 = Math.floor(Math.max(s.ay, s.by) / INK_CELL);
        for (let x = x0; x <= x1; x += 1) {
          for (let y = y0; y <= y1; y += 1) {
            const k = `${x},${y}`;
            if (!g.has(k)) g.set(k, []);
            g.get(k).push(i);
          }
        }
      });
      this.inkGrid = g;
    }
    const lo = { x: box.x - box.hw - pad, y: box.y - box.hh - pad };
    const hi = { x: box.x + box.hw + pad, y: box.y + box.hh + pad };
    const seen = new Set();
    let n = 0;
    for (let x = Math.floor(lo.x / INK_CELL); x <= Math.floor(hi.x / INK_CELL); x += 1) {
      for (let y = Math.floor(lo.y / INK_CELL); y <= Math.floor(hi.y / INK_CELL); y += 1) {
        for (const i of this.inkGrid.get(`${x},${y}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (excludeOwner !== undefined && this.ink[i].owner === excludeOwner) continue;
          if (segmentCrossesRect(this.ink[i], lo, hi)) n += 1;
        }
      }
    }
    return n;
  }

  /** A point at polar (r, deg) about (cx, cy), with degrees read counter-clockwise from +x. */
  static polar(cx, cy, r, deg) {
    return { x: cx + r * Math.cos(rad(deg)), y: cy - r * Math.sin(rad(deg)) };
  }

  push(m) {
    this.marks.push(m);
    return m;
  }

  /** A stroked polyline through `pts`. */
  poly(pts, { stroke = "#FBEBB8", width = 2, close = false, fill = "none", lineStyle } = {}) {
    if (pts.length < 2) throw new Error("a polyline needs two points");
    const id = this.id("p");
    this.trace(close ? [...pts, pts[0]] : pts, stroke, width, id);
    return this.push({
      id,
      from: pts[0],
      segments: pts.slice(1).map((p) => ({ line: p })),
      close,
      fill,
      stroke,
      strokeWidth: width,
      ...(lineStyle ? { lineStyle } : {}),
    });
  }

  seg(x1, y1, x2, y2, o) {
    return this.poly([{ x: x1, y: y1 }, { x: x2, y: y2 }], o);
  }

  /**
   * A circular arc from `a0` to `a1` degrees, cut into spans of at most 90.
   *
   * The cut is not cosmetic: two endpoints and a centre name two arcs, and a
   * renderer takes the minor one, so a span past a half turn comes back as
   * its own complement. Ninety degrees is comfortably inside that.
   */
  arc(cx, cy, r, a0, a1, o = {}) {
    const span = a1 - a0;
    const steps = Math.max(1, Math.ceil(Math.abs(span) / 90));
    const centre = { x: cx, y: cy };
    const segments = [];
    for (let i = 1; i <= steps; i += 1) {
      segments.push({ arc: Sheet.polar(cx, cy, r, a0 + (span * i) / steps), centre });
    }
    const id = this.id("a");
    const fine = Math.max(8, Math.ceil(Math.abs(span) / 6));
    this.trace(
      Array.from({ length: fine + 1 }, (_, i) => Sheet.polar(cx, cy, r, a0 + (span * i) / fine)),
      o.stroke ?? "#FBEBB8",
      o.width ?? 2,
      id,
    );
    return this.push({
      id,
      from: Sheet.polar(cx, cy, r, a0),
      segments,
      close: o.close ?? false,
      fill: o.fill ?? "none",
      stroke: o.stroke ?? "#FBEBB8",
      strokeWidth: o.width ?? 2,
    });
  }

  circle(cx, cy, r, o = {}) {
    return this.arc(cx, cy, r, 0, 360, o);
  }

  /** A filled disc, as a closed outline rather than a Block. */
  disc(cx, cy, r, fill) {
    return this.arc(cx, cy, r, 0, 360, { fill, stroke: "none", width: 0, close: true });
  }

  spec({ padding = 0, theme, vignette } = {}) {
    return {
      version: 1,
      ...(this.title ? { title: this.title } : {}),
      canvas: {
        padding,
        background: this.background,
        ...(theme ? { theme } : {}),
        ...(vignette === undefined ? {} : { vignette }),
      },
      root: {
        type: "scene",
        layout: "absolute",
        width: this.width,
        height: this.height,
        children: this.children,
        marks: this.marks,
      },
    };
  }

  write(path, opts) {
    writeFileSync(path, `${JSON.stringify(this.spec(opts), null, 2)}\n`);
    return path;
  }
}
