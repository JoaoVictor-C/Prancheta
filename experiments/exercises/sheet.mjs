/*
 * The shared sheet for the exercise plates.
 *
 * Eight plates were planned and the dominant risk was never that one of them
 * would be wrong -- it was that eight bespoke builds would each be rushed, and
 * nothing in the pipeline can detect a rushed plate: eight hurried figures
 * would each still pass their own checks. So the mitigation is structural.
 * Everything a plate does NOT need to think about lives here: the sheet, the
 * heading, the question block, the "?" convention, the coordinate plane, and
 * one collision-aware label placer. A generator contributes its derivation and
 * its marks, and nothing else.
 *
 * THE ONE AUTHORING RULE, which every plate follows:
 *
 *   The geometry is always TRUE. The answer is withheld only by not printing
 *   it.
 *
 * Drawing an unknown at a false value -- a ray at a slope the stated focal
 * length does not produce -- would be this project's founding defect committed
 * on purpose, and every check that makes the plate worth anything would have
 * to be switched off for it to pass. So a quantity the exercise asks for is
 * drawn where it really is and carries a "?" instead of a number.
 */
import { writeFileSync } from "node:fs";

export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

export const PAPER = "#FCFBF7";
export const INK = "#181B21";
export const SOFT = "#4E5763";
export const FAINT = "#5E6773";   // dark enough to clear AA on PAPER; #78828F did not
export const RULE = "#C7CDD5";
export const GRID = "#E4E8ED";
export const ASK = "#B3400C";      // the colour of a "?" and of what it marks
export const KEY = "#1D4E89";      // the one accent: the derived thing
export const WARM = "#0F7360";

const NL = String.fromCharCode(10);
const SANS = "Segoe UI, Noto Sans, system-ui, sans-serif";
const SERIF = "Palatino Linotype, Book Antiqua, Georgia, Times New Roman, serif";

/** One rendered line box at the theme's 1.45 line-height, plus ink slack. */
export const lineBox = (fs, lines = 1) => lines * fs * 1.45 + 3;

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
  return true;
}

export class Plate {
  constructor({ subject, title, width = 1180, height = 900 }) {
    this.W = width;
    this.H = height;
    this.subject = subject;
    this.titleText = title;
    this.marks = [];
    this.kids = [];
    this.connectors = [];
    this.frames = [];
    this.constraints = [];
    this.taken = [];
    this.ink = [];
    this.inkGrid = null;
    // Every `place()` call is queued here rather than resolved on the spot --
    // see `_flush`.
    this.pending = [];
    this.relaxations = {};
    this.n = 0;
    this.heading();
  }

  id(p) {
    this.n += 1;
    return `${p}${this.n}`;
  }

  // ---- ink -------------------------------------------------------------
  //
  // Every stroked run is also recorded as a list of plain segments, indexed
  // into a coarse grid, so `place` can keep a label off a LINE and not merely
  // off other labels.
  //
  // This exists because nothing in the pipeline can catch it. `text-fits-box`,
  // `text-clear-of-other-boxes` and `boxes-do-not-overlap` all reason about
  // BOXES; a caption set straight across a curve passes every one of them. So
  // eight plates rendered green while an angle label sat on the arrow it was
  // measuring. The checks were not wrong -- there is no check for this -- and
  // the fix has to live where the labels are placed.

  mark(m) {
    const id = m.id ?? this.id("m");
    const rec = { ...m, id };
    this.marks.push(rec);
    return rec;
  }

  /**
   * Remember a stroked run so labels can be kept off it.
   *
   * `owner`, when given, is the id of the mark or connector this run belongs
   * to -- the same id a label's own `annotates` can name. `inkThrough` uses
   * it to exclude exactly that ink when scoring a label that is ALLOWED to
   * sit on it, which is what lets an angle label sit on its own arc without
   * the search pushing it away from the very thing it is naming.
   */
  trace(pts, stroke, width, owner) {
    if (stroke === "none" || stroke === undefined || (width ?? 0) <= 0) return;
    for (let i = 0; i < pts.length - 1; i += 1) {
      this.ink.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y, owner });
    }
    this.inkGrid = null;
  }

  poly(pts, { stroke = INK, width = 1.4, fill = "none", close = false, lineStyle } = {}) {
    if (pts.length < 2) return null;
    const id = this.id("m");
    this.trace(close ? [...pts, pts[0]] : pts, stroke, width, id);
    return this.mark({
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

  seg(a, b, o) {
    return this.poly([a, b], o);
  }

  /** An arc about `c`, cut into spans of at most 90 degrees so each is minor. */
  arc(c, r, a0, a1, o = {}) {
    const span = a1 - a0;
    const steps = Math.max(1, Math.ceil(Math.abs(span) / 90));
    const at = (a) => ({ x: c.x + r * Math.cos(rad(a)), y: c.y - r * Math.sin(rad(a)) });
    const id = this.id("m");
    // Traced at a finer step than it is drawn: the IR keeps the arc exact, but
    // the placer needs a polyline it can test a box against.
    const fine = Math.max(8, Math.ceil(Math.abs(span) / 6));
    this.trace(
      Array.from({ length: fine + 1 }, (_, i) => at(a0 + (span * i) / fine)),
      o.stroke ?? INK,
      o.width ?? 1.4,
      id,
    );
    return this.mark({
      id,
      from: at(a0),
      segments: Array.from({ length: steps }, (_, i) => ({
        arc: at(a0 + (span * (i + 1)) / steps),
        centre: c,
      })),
      close: o.close ?? false,
      fill: o.fill ?? "none",
      stroke: o.stroke ?? INK,
      strokeWidth: o.width ?? 1.4,
    });
  }

  circle(c, r, o) {
    return this.arc(c, r, 0, 360, o);
  }

  disc(c, r, fill) {
    return this.arc(c, r, 0, 360, { fill, stroke: "none", width: 0, close: true });
  }

  /** An arrow. `from`/`to` are canvas points; both ends are bare, so it is a free vector. */
  vector(from, to, { stroke = INK, width = 2, arrow = "end", style, dashed } = {}) {
    this.trace([from, to], stroke, width);
    this.connectors.push({
      id: this.id("v"),
      from,
      to,
      arrow,
      ...(style ? { arrowStyle: style } : {}),
      ...(dashed ? { lineStyle: "dashed" } : {}),
      stroke,
      strokeWidth: width,
    });
  }

  /**
   * An arrow drawn as INK rather than as a Connector.
   *
   * A Connector between two bare points joins no box, so it earns no exemption
   * from `connector-clear-of-boxes` -- and an arrow that has to land exactly on
   * a marker block (an image tip, a vector head) would be reported as crossing
   * it. Drawing the shaft and the head as marks keeps that check strict for
   * every connector that really is joining two things.
   */
  arrowMark(from, to, { stroke = INK, width = 2.2, head = 9, fill } = {}) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const L = Math.hypot(dx, dy) || 1;
    const u = { x: dx / L, y: dy / L };
    const n = { x: -u.y, y: u.x };
    const base = { x: to.x - u.x * head, y: to.y - u.y * head };
    this.seg(from, base, { stroke, width });
    this.poly(
      [
        to,
        { x: base.x + n.x * head * 0.42, y: base.y + n.y * head * 0.42 },
        { x: base.x - n.x * head * 0.42, y: base.y - n.y * head * 0.42 },
      ],
      { fill: fill ?? stroke, stroke: fill ?? stroke, width: 0.6, close: true },
    );
  }

  /**
   * A dimension: two witness lines, a double-headed rule between them, and a
   * label under it. Drawn as ink for the same reason `arrowMark` is -- a
   * dimension joins no boxes, so as a Connector it would be reported crossing
   * its own label.
   */
  dimension(a, b, { text, colour = SOFT, drop = 0, gap = 6, size = 12.5, weight = 400 } = {}) {
    const yy = a.y + drop;
    this.seg({ x: a.x, y: a.y + gap }, { x: a.x, y: yy + gap }, { stroke: colour, width: 0.8 });
    this.seg({ x: b.x, y: b.y + gap }, { x: b.x, y: yy + gap }, { stroke: colour, width: 0.8 });
    this.arrowMark({ x: (a.x + b.x) / 2, y: yy }, { x: a.x, y: yy }, { stroke: colour, width: 1, head: 7 });
    this.arrowMark({ x: (a.x + b.x) / 2, y: yy }, { x: b.x, y: yy }, { stroke: colour, width: 1, head: 7 });
    if (text !== undefined) {
      this.place(text, (a.x + b.x) / 2, yy + 16, [{ x: 0, y: 1 }, { x: 1, y: 0.5 }, { x: -1, y: 0.5 }], {
        size, colour, weight,
      });
    }
  }

  // ---- coordinate planes ------------------------------------------------

  /**
   * A plane whose origin, units and lattice are stated ONCE. `pt` returns a
   * framed point for the IR, `at` the same point in canvas pixels for this
   * file's own collision bookkeeping -- both from the same four numbers, so
   * the drawing and the placer cannot disagree about where a coordinate is.
   */
  plane(id, { x, y, xUnit, yUnit = xUnit, grid }) {
    this.frames.push({
      id,
      origin: { x, y },
      xUnit,
      yUnit,
      ...(grid
        ? {
            grid: {
              stroke: GRID,
              axisStroke: "#9AA3AE",
              labelColor: FAINT,
              lineStyle: "dashed",
              ...grid,
            },
          }
        : {}),
    });
    return {
      id,
      pt: (u, v) => ({ frame: id, x: u, y: v }),
      at: (u, v) => ({ x: x + u * xUnit, y: y - v * yUnit }),
      xUnit,
      yUnit,
    };
  }

  // ---- text -------------------------------------------------------------

  box(cx, cy, w, h, rotation) {
    const c = Math.abs(Math.cos(rad(rotation ?? 0)));
    const s = Math.abs(Math.sin(rad(rotation ?? 0)));
    return { x: cx, y: cy, hw: (w * c + h * s) / 2, hh: (w * s + h * c) / 2 };
  }

  hits(a, b, pad = 3) {
    return Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.y - b.y) < a.hh + b.hh + pad;
  }

  /**
   * How many recorded strokes pass through this box.
   *
   * Indexed into 24px cells because a contour map carries tens of thousands of
   * segments and a label tries dozens of candidate positions; without the grid
   * this is the slowest thing on the sheet by two orders of magnitude.
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

  /** A region no label may enter. */
  reserve(cx, cy, w, h) {
    this.taken.push(this.box(cx, cy, w, h));
  }

  /** A generous guess at a set line, so a declared box is never too narrow. */
  measure(text, fs, tracking = 0.1) {
    const longest = Math.max(...text.split("\n").map((l) => l.length));
    return Math.ceil(longest * (fs * 0.56 + tracking) + 10);
  }

  /**
   * A label centred on (cx, cy). `anchor: "center"` is resolved during FRAME
   * resolution only, so a block that states no frame never sees it -- the half
   * box comes off here instead.
   */
  label(text, cx, cy, o = {}) {
    const {
      size = 13,
      colour = INK,
      align = "center",
      weight = 400,
      tracking = 0.1,
      serif = false,
      rotation,
      annotates,
      width,
      claim = true,
    } = o;
    // A rotated label keeps an UPRIGHT box (see the `rotateBox` note below), so
    // the box has to be the rotated text's own bounding rectangle -- big enough
    // that `text-fits-box` sees the turned line inside it. Sizing it to the
    // unrotated text is why a 90-degree axis title overflows by its own length.
    const tw = width ?? this.measure(text, size, tracking);
    const th = lineBox(size, text.split(NL).length);
    const cosR = Math.abs(Math.cos(rad(rotation ?? 0)));
    const sinR = Math.abs(Math.sin(rad(rotation ?? 0)));
    const w = Math.ceil(tw * cosR + th * sinR);
    const h = Math.ceil(tw * sinR + th * cosR);
    this.kids.push({
      type: "block",
      id: o.id ?? this.id("t"),
      label: text,
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      padding: 0,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      wrap: text.includes("\n") ? "normal" : "none",
      textAlign: align,
      verticalAlign: "center",
      textColor: colour,
      fontFamily: serif ? SERIF : SANS,
      fontSize: size,
      fontWeight: weight,
      letterSpacing: tracking,
      ...(annotates ? { annotates } : {}),
      // `rotation` turns the glyphs; `rotateBox` is deliberately NOT set,
      // because a rotated box makes the collision test back-rotate every other
      // label's rect into this box's frame and re-bound it, which for a wide
      // caption against a steep label is generous by an order of magnitude.
      ...(rotation === undefined ? {} : { rotation }),
    });
    if (claim) this.taken.push(this.box(cx, cy, w, h));
    return this.kids[this.kids.length - 1].id;
  }

  /**
   * A label that walks out along each escape direction in turn until its box
   * is clear of everything already claimed -- other labels AND ink, so a
   * caption set across a curve or an arrow shaft is a search failure here,
   * not a defect only `text-clear-of-ink` finds after the fact. Falls back to
   * the least bad spot rather than the starting one: a label that cannot be
   * placed perfectly should still be placed as well as the sheet allows, and
   * the checks will report it either way.
   *
   * DEFERRED, not resolved on the spot: a script draws its ink in whatever
   * order reads best on the page, and a label placed before the ray or the
   * dimension that would later cross it searched a board that did not yet
   * carry that ink -- which is exactly how "F′" ended up sitting on a ray
   * drawn eleven lines further down the file. Queuing every call and
   * resolving them once, after the whole sheet has been drawn, makes the
   * search see the finished page regardless of the order it was written in.
   * `_flush` runs the queue in the order `place` was called, so label-vs-label
   * spacing keeps the same first-come-first-served behaviour it always had.
   */
  place(text, cx, cy, dirs, o = {}) {
    const id = o.id ?? this.id("t");
    this.pending.push({ text, cx, cy, dirs: Array.isArray(dirs) ? dirs : [dirs], o: { ...o, id } });
    return id;
  }

  /** Run every queued `place()` call. See `place` for why this is deferred. */
  _flush() {
    for (const item of this.pending) this._resolvePlacement(item);
    this.pending = [];
  }

  _resolvePlacement({ text, cx, cy, dirs, o }) {
    const size = o.size ?? 13;
    const tw = o.width ?? this.measure(text, size, o.tracking ?? 0.1);
    const th = lineBox(size, text.split(NL).length);
    const cosR = Math.abs(Math.cos(rad(o.rotation ?? 0)));
    const sinR = Math.abs(Math.sin(rad(o.rotation ?? 0)));
    const w = Math.ceil(tw * cosR + th * sinR);
    const h = Math.ceil(tw * sinR + th * cosR);
    let best = null;
    outer: for (const d of dirs) {
      for (let k = 0; k <= (o.steps ?? 26); k += 1) {
        const px = cx + d.x * 6 * k;
        const py = cy + d.y * 6 * k;
        const b = this.box(px, py, w, h);
        if (px - b.hw < 16 || px + b.hw > this.W - 16 || py - b.hh < 10 || py + b.hh > this.H - 10) break;
        // Landing on another label and landing on a line are both defects.
        // `o.annotates` excludes the one line this label is ALLOWED to sit on
        // -- the same relief the core grants a box that names what it labels
        // -- so an angle label is never pushed off its own arc.
        const boxes = this.taken.filter((t) => this.hits(b, t)).length;
        const lines = o.avoidInk === false ? 0 : Math.min(this.inkThrough(b, 2, o.annotates), 4);
        const n = boxes * 3 + lines;
        if (best === null || n < best.n) best = { x: px, y: py, n };
        if (n === 0) break outer;
      }
    }
    const at = best ?? { x: cx, y: cy };
    this.label(text, at.x, at.y, { ...o, width: tw });
  }

  /** The convention: a quantity the exercise asks for, drawn where it is. */
  ask(text, cx, cy, dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }], o = {}) {
    return this.place(text, cx, cy, dirs, { colour: ASK, weight: 600, size: 13.5, ...o });
  }

  /** A tiny invisible block, so a constraint has something to name. */
  marker(id, p, size = 7) {
    this.kids.push({
      type: "block",
      id,
      x: p.x - size / 2,
      y: p.y - size / 2,
      width: size,
      height: size,
      padding: 0,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
    });
    return id;
  }

  /**
   * Assert that these markers sit at the same point.
   *
   * There is no `coincident` predicate -- the vocabulary is align, distribute,
   * keepClear, sameSize and anchor. But two aligns on orthogonal axes ARE
   * coincidence, checked by `constraints-satisfied` at a 0.1px tolerance, and
   * that is the strongest claim any of these plates can make about itself.
   */
  coincident(ids) {
    this.constraints.push({ kind: "align", elements: ids, axis: "center-x" });
    this.constraints.push({ kind: "align", elements: ids, axis: "center-y" });
  }

  // ---- furniture --------------------------------------------------------

  heading() {
    this.label(this.subject.toUpperCase(), 46 + 200, 30, {
      size: 11.5, colour: FAINT, weight: 600, tracking: 2.6, align: "start", width: 400,
    });
    this.label(this.titleText, 46 + 340, 66, {
      size: 24, colour: INK, weight: 600, tracking: -0.2, align: "start", width: 680, serif: true,
    });
    this.seg({ x: 46, y: 88 }, { x: this.W - 46, y: 88 }, { stroke: RULE, width: 1 });
    this.reserve(this.W / 2, 50, this.W, 90);
  }

  /**
   * The question, and the promise the sheet makes. Reserved before any figure
   * places a label, so nothing can wander into it.
   */
  question(lines, { top } = {}) {
    // Sized from the number of lines, not fixed: a five-line question in a
    // four-line slot walks off the bottom of the sheet, and content-within-canvas
    // is right to say so.
    const y = top ?? this.H - (48 + lineBox(14, lines.length));
    this.seg({ x: 46, y }, { x: this.W - 46, y }, { stroke: RULE, width: 1 });
    this.label("THE QUESTION", 46 + 90, y + 24, {
      size: 11, colour: FAINT, weight: 600, tracking: 2.2, align: "start", width: 180,
    });
    const body = lines.join("\n");
    const h = lineBox(14, lines.length);
    this.label(body, 46 + 520, y + 34 + h / 2, {
      size: 14, colour: SOFT, align: "start", width: 1040,
    });
    this.label("Everything drawn is true. Nothing marked ? is answered here.", this.W - 46 - 200, y + 12, {
      size: 11, colour: ASK, align: "end", width: 400, tracking: 0.2,
    });
    this.reserve(this.W / 2, (y + this.H) / 2, this.W, this.H - y);
  }

  /** A named check stood down, and the plate had better say why in its header. */
  relax(toggles) {
    Object.assign(this.relaxations, toggles);
  }

  /**
   * An angle mark whose sweep is DERIVED from its two arms and their shared
   * vertex, plus the label that states it. `sweep-matches-its-label` then
   * measures the arc actually drawn against the number actually printed --
   * which is the check this whole project was built around.
   */
  angle(vertex, aFrom, aTo, r, text, { colour = INK, width = 1.4, out = 22 } = {}) {
    const at = (a) => ({ x: vertex.x + r * Math.cos(rad(a)), y: vertex.y - r * Math.sin(rad(a)) });
    const id = this.id("ang");
    this.connectors.push({
      id,
      from: at(aFrom),
      to: at(aTo),
      curve: { kind: "sweep", centre: vertex },
      arrow: "none",
      stroke: colour,
      strokeWidth: width,
    });
    const mid = (aFrom + aTo) / 2;
    const dir = { x: Math.cos(rad(mid)), y: -Math.sin(rad(mid)) };
    const q = { x: vertex.x + (r + out) * dir.x, y: vertex.y + (r + out) * dir.y };
    // `annotates: id` exempts exactly this arc's own ink from the search (see
    // `_resolvePlacement`'s use of `inkThrough`'s exclusion), so the label is
    // free to sit near it without being pushed away by the thing it names.
    // Stepped out only a little regardless, because `annotation-nearest-its-
    // owner` needs the arc to stay the closest thing to the label, and the two
    // arms close in as fast as the arc recedes.
    this.place(text, q.x, q.y, [dir], { size: 13, colour, weight: 600, annotates: id, steps: 3 });
    const fine = Math.max(8, Math.ceil(Math.abs(aTo - aFrom) / 6));
    this.trace(
      Array.from({ length: fine + 1 }, (_, i) => at(aFrom + ((aTo - aFrom) * i) / fine)),
      colour,
      width,
      id,
    );
    return id;
  }

  spec() {
    // Every deferred `place()` call is resolved here, once, against the
    // finished sheet -- see `place` for why that has to wait until now.
    this._flush();
    return {
      version: 1,
      title: `${this.subject}: ${this.titleText}`,
      canvas: {
        padding: 0,
        background: PAPER,
        theme: "print",
        ...(Object.keys(this.relaxations).length > 0 ? { constraints: this.relaxations } : {}),
      },
      ...(this.constraints.length > 0 ? { layoutConstraints: this.constraints } : {}),
      root: {
        type: "scene",
        layout: "absolute",
        width: this.W,
        height: this.H,
        ...(this.frames.length > 0 ? { frames: this.frames } : {}),
        children: this.kids,
        connectors: this.connectors,
        marks: this.marks,
      },
    };
  }

  write(path) {
    writeFileSync(path, `${JSON.stringify(this.spec(), null, 2)}\n`);
    console.log(`${path}  ${this.marks.length} marks, ${this.kids.length} blocks, ${this.constraints.length} constraints`);
    return path;
  }
}

/** Sample a function over [a, b] into n+1 points. */
export const sample = (a, b, n, f) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = a + ((b - a) * i) / n;
    return { t, v: f(t) };
  });
