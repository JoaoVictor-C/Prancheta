/**
 * unit-circle -- the "ciclo trigonométrico" a Brazilian student meets before
 * trig derivatives: a circle of radius 1 on axes, with one or more angles
 * marked on it.
 *
 * An angle is TEXT ("π/6", "5π/4", "150°", "-π/3"), parsed once into radians.
 * Everything else -- the point's (cos θ, sin θ), the angle arc's sweep, the
 * projections onto each axis, the tangent segment, the symmetric angles
 * (π − θ, π + θ, 2π − θ) -- is COMPUTED from that one number. Nothing about
 * position is typed twice, per ADR 0019 and ADR 0031.
 *
 * The one place a number IS typed independently of geometry is the arc's own
 * printed degree label, so it is the one place a check earns its keep:
 * `sweep-matches-its-label` (ADR 0019) guards it. Because that check reads
 * the label with a plain ASCII-digit regex (`statedDegrees` in checks.ts,
 * which never learned the pt-BR comma), the arc's own label is always
 * printed as a whole number of degrees in plain digits, independent of
 * `locale` -- everything else in the figure (cos/sin values, point labels)
 * goes through the pt-BR formatter as usual.
 *
 * `sweep-matches-its-label` also only ever measures the SHORTER arc between
 * two arms (0..180°, `sweptDegrees` in layout/connectors.ts) because a
 * two-endpoint sweep connector cannot draw a reflex angle. So `arc: true` is
 * refused outright for |θ| ≥ 180° -- see ADR 0031, "what was refused".
 */

import type { Connector, FigureSpec, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, MINUS, asFraction, formatNumber } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";

// ---- input ------------------------------------------------------------------

/** The three angles a given θ is classically compared against, all derived. */
export type SymmetricKind = "pi-minus-theta" | "pi-plus-theta" | "two-pi-minus-theta";

export const SYMMETRIC_KINDS: readonly SymmetricKind[] = [
  "pi-minus-theta",
  "pi-plus-theta",
  "two-pi-minus-theta",
];

export type UnitCircleAngleInput = {
  /** The angle, as text: a multiple of π ("π/6", "5π/4", "-π/3", "π"), degrees ("150°"), or plain radians ("1.2"). */
  angle: string;
  /** Label for the point. Default: the angle itself, formatted (a π-fraction when it is one, else degrees or radians). */
  label?: string;
  /** Draw the arc from the positive x axis to this point, with its degree value printed on it. Refused for |θ| ≥ 180°. */
  arc?: boolean;
  /** Draw dashed projections onto both axes, with cos θ and sin θ printed. */
  projection?: boolean;
  /** Draw the tangent segment on the line x = 1 (the "eixo das tangentes"), from (1, 0) to (1, tan θ). Refused where tan θ is undefined or too steep to draw legibly. */
  tangent?: boolean;
  /** Also mark the symmetric angles of this one -- π − θ, π + θ, 2π − θ -- each a point computed from its own value, never reflected by hand. `true` draws all three. */
  symmetric?: boolean | SymmetricKind[];
};

export type UnitCircleInput = {
  title?: string;
  locale?: Locale;
  /** Circle radius in px. Default 150. */
  radius?: number;
  /** The angles to mark. A bare string is shorthand for `{ angle: <string> }`. */
  angles: (string | UnitCircleAngleInput)[];
  /** Print I, II, III, IV in each quadrant. Default false. */
  quadrantLabels?: boolean;
  /**
   * Default true. With false the figure is the exercise's QUESTION: the circle, the axes, each given angle with
   * its name, its radius OP, its arc and the arc's degree value stay; every computed result goes -- the printed
   * cos and sin at the feet of a projection, the tangent segment with its extension and "tg θ = …", and the
   * symmetric points (finding π − θ, π + θ, 2π − θ is the question). The dashed projection guides stay: they
   * are the construction, not a value.
   */
  answers?: boolean;
};

// ---- angle parsing ------------------------------------------------------------

const DEGREE_RE = /^([+-]?\d+(?:[.,]\d+)?)\s*°$/;
const PI_RE = /^([+-]?)\s*(\d+)?\s*(?:π|pi)\s*(?:\/\s*(\d+))?$/i;
const PLAIN_RE = /^([+-]?\d+(?:[.,]\d+)?)$/;

/** An angle written as text -- a multiple of π, degrees, or plain radians -- read as radians. */
export function parseAngle(text: string): number {
  const t = text.trim();
  let m = DEGREE_RE.exec(t);
  if (m !== null) return (Number(m[1]!.replace(",", ".")) * Math.PI) / 180;
  m = PI_RE.exec(t);
  if (m !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    const num = m[2] !== undefined ? Number(m[2]) : 1;
    const den = m[3] !== undefined ? Number(m[3]) : 1;
    if (den === 0) throw new SpecError(`angle ${JSON.stringify(text)} has a zero denominator`);
    return sign * (num / den) * Math.PI;
  }
  m = PLAIN_RE.exec(t);
  if (m !== null) return Number(m[1]!.replace(",", "."));
  throw new SpecError(
    `angle ${JSON.stringify(text)} is not understood -- write it as a multiple of π ` +
      `("π/6", "5π/4", "-π/3", "π"), in degrees ("150°", "-60°"), or as a plain number of radians.`,
  );
}

/** The simplest p/q with p/q · π = radians, denominator at most 12 (the family 30°/45°/60°/90° needs no more), or null. */
function piFraction(radians: number): { p: number; q: number } | null {
  const frac = asFraction(radians / Math.PI);
  return frac !== null && frac.q <= 12 ? frac : null;
}

/** An angle as a reader writes it: "π/6", "5π/6", "150°", or a plain radian value as a last resort. */
export function formatAngle(radians: number, locale: Locale = "pt-BR"): string {
  const frac = piFraction(radians);
  if (frac !== null) {
    if (frac.p === 0) return "0";
    const sign = frac.p < 0 ? MINUS : "";
    const ap = Math.abs(frac.p);
    const num = ap === 1 ? "π" : `${ap}π`;
    return frac.q === 1 ? `${sign}${num}` : `${sign}${num}/${frac.q}`;
  }
  const deg = (radians * 180) / Math.PI;
  const rounded = Math.round(deg);
  if (Math.abs(deg - rounded) < 1e-6) return `${formatNumber(rounded, locale)}°`;
  return `${formatNumber(radians, locale)} rad`;
}

// ---- exact trig values --------------------------------------------------------

const NOTABLE: { v: number; text: string }[] = [
  { v: 0, text: "0" },
  { v: 0.5, text: "1/2" },
  { v: Math.SQRT2 / 2, text: "√2/2" },
  { v: Math.sqrt(3) / 2, text: "√3/2" },
  { v: 1, text: "1" },
];
const TRIG_TOLERANCE = 1e-6;

/**
 * cos θ or sin θ, written the way a pt-BR (or en) reader expects: the exact
 * notable value -- 0, ½, √2/2, √3/2, 1, and their negatives -- when the
 * computed float is (within float noise) one of them, and the ordinary
 * pt-BR/en decimal formatter otherwise. The same discipline sign-chart uses
 * for roots that are fractions or √n (ADR 0027, `exactLabel`).
 */
export function formatTrigValue(value: number, locale: Locale = "pt-BR"): string {
  for (const { v: candidate, text } of NOTABLE) {
    if (Math.abs(value - candidate) < TRIG_TOLERANCE) return text;
    if (candidate !== 0 && Math.abs(value + candidate) < TRIG_TOLERANCE) return `${MINUS}${text}`;
  }
  return formatNumber(value, locale);
}

// ---- palette and geometry constants --------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const RULE = "#8A93A3";
const FAINT = "#C7CDD5";
const PRIMARY = "#1D4E89";
const DERIVED = "#8A5A00";
const COS_COLOUR = "#B3400C";
const SIN_COLOUR = "#1D4E89";
const QUADRANT_COLOUR = SOFT;

const MARGIN = 92;
/** tan θ is refused past this magnitude -- steeper and the segment stops being legible (ADR 0031). */
const TAN_MAX = 2;
const ARC_BASE = 30;
const ARC_STEP = 14;
const DOT_R = 4;

// ---- the arc's degree label: inside the wedge, clear of every line ------------
//
// The label names the arc, so it sits inside the angle, beyond the arc, and
// clear of EVERY line through the origin that crosses the wedge: the x axis
// the angle is measured from, OP where it ends, and the y axis when the angle
// passes 90°. An earlier version cleared only OP, reasoning that the axes are
// grid furniture the checks exempt -- and its paper backing then cut visible
// gaps into the axes instead. Exempt from a check is not the same as
// invisible to a reader.
//
// Those lines split the wedge into sub-wedges; the label goes on the bisector
// of the widest one, at angular gap `gap` from the lines on either side. At
// radius `labelR` its centre is `labelR * sin(gap)` from the nearer of them,
// which must be at least `M` (the label's half-diagonal with slack) to clear
// it. And it must be nearer its own arc than those lines, which
// `annotation-nearest-its-owner` requires: the arc is `labelR - arcR` away
// (straight down the radius), so `labelR - arcR < labelR * sin(gap)`, kept
// with a 10% margin. The arc radius is grown, up to a cap, until both hold.
//
// A narrow angle (15°) has no such spot short of an arc nearly the size of
// the circle. Then the label goes just outside the wedge on the x axis's far
// side, under the arc's foot: the arc starts ON the x axis, so that spot is
// nearer the arc than it is to OP, and it crosses no line. (A spot past the
// arc's other end, beyond OP, can never work: that end sits on OP itself.)
const ARC_LABEL_OP_SLACK = 1.12;
const ARC_LABEL_NEAR_MARGIN = 0.9;

/** The widest sub-wedge between lines through the origin: its bisector's angle and its half-width. */
function widestSubWedge(absTheta: number): { phi: number; gap: number } {
  const cuts = [0, ...(absTheta > Math.PI / 2 + 1e-9 ? [Math.PI / 2] : []), absTheta];
  let best = { phi: absTheta / 2, gap: absTheta / 2 };
  for (let k = 0; k + 1 < cuts.length; k += 1) {
    const half = (cuts[k + 1]! - cuts[k]!) / 2;
    if (half > best.gap || k === 0) best = { phi: cuts[k]! + half, gap: half };
  }
  return best;
}

/** The smallest arc radius that admits a spot inside the wedge for a label of half-diagonal `halfDiag`. */
function minArcRadiusForLabel(absTheta: number, halfDiag: number): number {
  const s = Math.sin(widestSubWedge(absTheta).gap);
  if (s <= 1e-6) return Infinity;
  const M = halfDiag * ARC_LABEL_OP_SLACK;
  return Math.max(halfDiag / (ARC_LABEL_NEAR_MARGIN * s) - halfDiag, M / s - ARC_LABEL_NEAR_MARGIN * M) + 2;
}

/** Where, inside the wedge, the degree label's centre sits (angle from the x axis, radius); `null` when this arc radius admits no spot. */
function arcLabelSpot(absTheta: number, arcR: number, halfDiag: number): { phi: number; labelR: number } | null {
  const { phi, gap } = widestSubWedge(absTheta);
  const s = Math.sin(gap);
  if (s <= 1e-6) return null;
  const M = halfDiag * ARC_LABEL_OP_SLACK;
  const labelR = Math.max(M / s, arcR + halfDiag);
  if (labelR - arcR >= ARC_LABEL_NEAR_MARGIN * labelR * s) return null;
  return { phi, labelR };
}

type Entry = UnitCircleAngleInput;

function normalizeEntry(raw: string | Entry): Entry {
  return typeof raw === "string" ? { angle: raw } : raw;
}

type PlacedAngle = {
  id: string;
  theta: number;
  label: string;
  colour: string;
  primary: boolean;
  arc: boolean;
  projection: boolean;
  tangent: boolean;
};

function symmetricKindsOf(e: Entry): SymmetricKind[] {
  if (e.symmetric === true) return [...SYMMETRIC_KINDS];
  if (Array.isArray(e.symmetric)) return e.symmetric;
  return [];
}

function derivedTheta(kind: SymmetricKind, theta: number): number {
  switch (kind) {
    case "pi-minus-theta":
      return Math.PI - theta;
    case "pi-plus-theta":
      return Math.PI + theta;
    case "two-pi-minus-theta":
      return 2 * Math.PI - theta;
  }
}

// ---- the build ----------------------------------------------------------------

export function expandUnitCircle(input: UnitCircleInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const R = input.radius ?? 150;
  if (!(R > 20)) throw new SpecError(`unit-circle.radius must be greater than 20px, got ${JSON.stringify(input.radius)}`);
  if (!Array.isArray(input.angles) || input.angles.length === 0) {
    throw new SpecError("unit-circle.angles must be a non-empty array");
  }

  const showAnswers = input.answers ?? true;
  const points: PlacedAngle[] = [];
  input.angles.forEach((raw, i) => {
    const e = normalizeEntry(raw);
    let theta: number;
    try {
      theta = parseAngle(e.angle);
    } catch (error) {
      throw new SpecError(`unit-circle.angles[${i}].angle: ${(error as Error).message}`);
    }
    const id = `p${i + 1}`;
    points.push({
      id,
      theta,
      label: e.label ?? formatAngle(theta, locale),
      colour: PRIMARY,
      primary: true,
      arc: e.arc ?? false,
      projection: e.projection ?? false,
      tangent: e.tangent ?? false,
    });
    for (const kind of showAnswers ? symmetricKindsOf(e) : []) {
      const dTheta = derivedTheta(kind, theta);
      points.push({
        id: `${id}-${kind}`,
        theta: dTheta,
        label: formatAngle(dTheta, locale),
        colour: DERIVED,
        primary: false,
        arc: false,
        projection: false,
        tangent: false,
      });
    }
  });

  // Refuse what cannot be honestly drawn, per-point, before anything else runs.
  for (const p of points) {
    if (p.arc && Math.abs(p.theta) >= Math.PI - 1e-9) {
      throw new SpecError(
        `unit-circle angle ${JSON.stringify(p.label)} cannot draw "arc": a sweep connector always draws the ` +
          `SHORTER arc between its two arms (sweptDegrees in layout/connectors.ts is bounded to 0..180°), so a ` +
          `reflex angle would be drawn as its own explement while the label kept printing the angle itself. ` +
          `Ask for "arc" only on an angle whose magnitude is under 180°.`,
      );
    }
    if (p.tangent) {
      if (Math.abs(Math.cos(p.theta)) < 1e-9) {
        throw new SpecError(`unit-circle angle ${JSON.stringify(p.label)} has no tangent: cos θ = 0 there.`);
      }
      const t = Math.tan(p.theta);
      if (Math.abs(t) > TAN_MAX) {
        throw new SpecError(
          `unit-circle angle ${JSON.stringify(p.label)}: tan θ = ${formatNumber(t, locale)}, too steep to draw ` +
            `a legible tangent segment (capped at |tan θ| ≤ ${TAN_MAX}).`,
        );
      }
    }
  }

  // Canvas sized to fit the circle, its margins, and any tangent overrun.
  let vertReach = R + MARGIN;
  let horizReach = R + MARGIN;
  for (const p of points) {
    if (p.tangent) {
      vertReach = Math.max(vertReach, Math.abs(Math.tan(p.theta)) * R + 44);
      horizReach = Math.max(horizReach, R + 64);
    }
  }
  const width = Math.ceil(horizReach * 2);
  const height = Math.ceil(vertReach * 2);
  const cx = width / 2;
  const cy = height / 2;
  const at = (theta: number): Point => ({ x: cx + R * Math.cos(theta), y: cy - R * Math.sin(theta) });

  const board = new Board(width, height, PAPER);

  // Axes -- drawn as an actual Frame's grid (ir/frames.ts), not a hand-rolled
  // pair of lines, specifically so the resulting ink is tagged `gridOf`.
  // That is what a mark or a box gets EXCLUDED from `text-clear-of-ink` and
  // `annotation-nearest-its-owner` for (both check comments say so in as many
  // words: grid furniture is "what the figure is drawn ON", and "neither
  // competes to be the nearest thing to a label"). A hand-drawn line has no
  // such exemption, and for a small angle near the x axis nothing else
  // removes the axis from competing with the angle's own arc for "nearest" --
  // the axis is a full line across the canvas, the arc is a short curve
  // beside it, so a plain `board.poly` line made the axis win "nearest"
  // every time a label had to stand a legible distance off both. `step` is
  // set far outside the range so the only tick the lattice ever lands on is
  // the origin itself; `labels: false` because the axis names ("cos"/"sen")
  // are set once, below, not as a repeating numbered scale.
  //
  // Exempt from those two checks is NOT free room (ADR 0035): text on an
  // axis and a backing over one now fail. `addFrame` records the axes as ink
  // on the board, so every searched label below steps off them -- before
  // this, the search could not see them at all, and "−π/2" was printed
  // straight across the y axis.
  const halfX = width / 2 - MARGIN * 0.3;
  const halfY = height / 2 - MARGIN * 0.3;
  board.addFrame({
    id: "axes",
    origin: { x: cx, y: cy },
    grid: {
      x: { from: -halfX, to: halfX, step: 1e9, origin: 0 },
      y: { from: -halfY, to: halfY, step: 1e9, origin: 0 },
      labels: false,
      axisStroke: RULE,
    },
  });
  // A second frame, scaled to the circle's own radius (1 frame unit = R px,
  // no rotation) -- purely so a run stated in it, both ends, carries
  // `MeasuredIn` after resolution (ADR 0028) and `length-matches-its-label`
  // can read it. The tangent segment is the case: its printed "tg θ = …" is
  // a number typed on a separate label, exactly the gap that check exists
  // to close, the same way `sweep-matches-its-label` closes it for degrees.
  board.frames.push({ id: "radius", origin: { x: cx, y: cy }, xUnit: R, yUnit: R });
  const [xName, yName] = locale === "pt-BR" ? ["cos", "sen"] : ["cos", "sin"];
  // Offset well clear of the axis's own ink -- not merely PAST its end,
  // which still shares the line's y (or x) and so still sits on it.
  // Axis names: free-standing (ADR 0035). They name the axes, which are
  // grid furniture drawn after this preset returns and have no id to name.
  board.label(xName, width - MARGIN * 0.3 + 4, cy - 16, { size: 13, colour: SOFT, align: "start", freeStanding: true });
  board.label(yName, cx + 16, MARGIN * 0.3 - 12, { size: 13, colour: SOFT, align: "start", freeStanding: true });

  // The unit circle itself.
  board.circle({ x: cx, y: cy }, R, { stroke: INK, width: 1.8 });

  // Two passes, deliberately. Everything that is INK (dots, dashed guides,
  // the tangent segment) is drawn first; every LABEL is placed second, once
  // every point's ink already exists. A single interleaved pass would let
  // point 1's label be placed before point 2's dashed guide is drawn, and
  // `board.place`'s own ink-avoidance -- which is what keeps a label off a
  // line it is not naming -- only ever looks at ink that already exists.
  const connectors: Connector[] = [];
  const tangents = new Map<string, number>();
  const tangentMarkIds = new Map<string, string>();

  // Each arc's radius, decided up front rather than as it is drawn, and
  // shared by both passes below so the connector and its label always agree
  // on the same circle. Ordinarily just the stacking sequence (ARC_BASE,
  // +ARC_STEP per further arc on this figure) -- but a narrow angle's own
  // degree label may need more room than that gives it: see
  // `minArcRadiusForLabel` above for why. Grown only as far as that
  // arithmetic requires, capped well short of the circle itself.
  const arcRadii = new Map<string, number>();
  {
    let nextArcR = ARC_BASE;
    for (const p of points) {
      if (!p.arc) continue;
      const degrees = Math.round((Math.abs(p.theta) * 180) / Math.PI);
      const { w: lw, h: lh } = board.extent(`${degrees}°`, { size: 13 });
      const halfDiag = Math.max(lw, lh) / 2 + 4;
      const minForLabel = minArcRadiusForLabel(Math.abs(p.theta), halfDiag);
      const cap = R * 0.78;
      // Past the cap no arc radius gives the label a spot inside the wedge,
      // so the arc keeps its ordinary size and the label goes under its foot.
      const arcR = minForLabel > cap ? nextArcR : Math.max(nextArcR, minForLabel);
      arcRadii.set(p.id, arcR);
      nextArcR = arcR + ARC_STEP;
    }
  }

  for (const p of points) {
    const pt = at(p.theta);

    // The radius OP -- the angle's terminal side -- drawn for every PRIMARY
    // point that asks for `arc` or `tangent`: it is what makes an arc read
    // as sitting between the positive x axis and the point rather than
    // hanging disconnected near the origin (defect 1), and it is also the
    // ray the tangent construction below extends past P (defect 2). Not
    // drawn for a `projection`-only point: two symmetric angles that share
    // one sin value (30°/150°, 45°/135°, ...) place their sin labels on the
    // axis side OPPOSITE their own point -- deliberately, so each label
    // continues the direction its own guide already travels -- and that
    // opposite side is exactly where the OTHER point's OP would run. A
    // point with no arc and no tangent has nothing for OP to connect to, so
    // it is skipped rather than fought with a placement search that cannot
    // satisfy both "off this new ink" and "beside its own place" at once.
    // Not drawn for a symmetric point either: ADR 0031 already declared
    // those decoration-only (no arc, projection or tangent of their own).
    if (p.primary && (p.arc || p.tangent)) {
      board.poly([{ x: cx, y: cy }, pt], { stroke: p.colour, width: 1.4 });
    }

    if (p.arc) {
      const arcR = arcRadii.get(p.id)!;
      const from: Point = { x: cx + arcR, y: cy };
      const to: Point = { x: cx + arcR * Math.cos(p.theta), y: cy - arcR * Math.sin(p.theta) };
      const arcId = `${p.id}-arc`;
      connectors.push({
        id: arcId,
        from,
        to,
        arrow: "none",
        stroke: p.colour,
        strokeWidth: 1.5,
        curve: { kind: "sweep", centre: { x: cx, y: cy } },
      });
      // A curved CONNECTOR's ink is not tracked by Board's own ink grid the
      // way `board.poly`/`board.circle` register themselves -- it is emitted
      // straight into `connectors`, bypassing `trace()`. Sampled here so the
      // label pass (below) can still see it and route labels around it,
      // its own included: two overlapping arcs are common once several
      // angles ask for one, and a label sitting on ANOTHER angle's arc is
      // exactly the defect `text-clear-of-ink` exists to catch.
      const samples: Point[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = (p.theta * i) / 16;
        samples.push({ x: cx + arcR * Math.cos(a), y: cy - arcR * Math.sin(a) });
      }
      board.trace(samples, p.colour, 1.5, arcId);
    }

    if (p.projection) {
      const foot: Point = { x: pt.x, y: cy };
      const side: Point = { x: cx, y: pt.y };
      if (Math.abs(pt.x - cx) > 1) board.poly([pt, foot], { stroke: FAINT, width: 1.2, lineStyle: "dashed" });
      if (Math.abs(pt.y - cy) > 1) board.poly([pt, side], { stroke: FAINT, width: 1.2, lineStyle: "dashed" });
    }

    if (p.tangent && showAnswers) {
      const t = Math.tan(p.theta);
      tangents.set(p.id, t);
      const tanFoot: Point = { x: cx + R, y: cy };
      const tanTop: Point = { x: cx + R, y: cy - t * R };
      // The dashed extension of OP, from P out to where the LINE through O
      // and P meets the tangent axis at (1, tan θ) -- defect 2. O, P and
      // tanTop are collinear by construction (tanTop = O + (R/cos θ)·(cos θ,
      // −sin θ), the same ray OP is drawn on above), so a straight dashed
      // run from P to tanTop is exactly that extension: for |θ| < 90° it
      // continues outward past P; for an obtuse θ it runs back through O
      // before reaching tanTop, doubling the solid radius under a dashed
      // overlay rather than a second, clipped segment -- an honest picture
      // of "the same line, continued", not a rendering bug.
      board.poly([pt, tanTop], { stroke: p.colour, width: 1.2, lineStyle: "dashed" });
      // Built by hand rather than `board.poly`, and stated in the "radius"
      // frame at both ends -- (1, 0) is (cx+R, cy), (1, t) is (cx+R, cy−tR),
      // exactly `tanFoot`/`tanTop` -- purely so `resolveFrames` records
      // `MeasuredIn` for it. `board.trace` is called separately with the
      // already-known canvas points, so the label pass below still avoids
      // this ink exactly as it would if `poly` had drawn it.
      const markId = board.id("m");
      board.marks.push({
        id: markId,
        from: { frame: "radius", x: 1, y: 0 },
        segments: [{ line: { frame: "radius", x: 1, y: t } }],
        close: false,
        fill: "none",
        stroke: DERIVED,
        strokeWidth: 1.6,
      });
      board.trace([tanFoot, tanTop], DERIVED, 1.6, markId);
      tangentMarkIds.set(p.id, markId);
      // No endpoint dot here (unlike the circle points): a second small
      // filled mark sitting exactly where the tangent label is anchored
      // would compete with the segment itself for "nearest" under
      // `annotation-nearest-its-owner` -- the two are co-located by
      // construction, so which one measures marginally closer is a coin
      // flip the check should never have been asked to call. The line's own
      // end is already visually exact; it needs no second mark on top of it.
    }
  }

  // The dots last among the ink, so each sits ON TOP of every line that
  // meets it -- its projections, OP, the tangent extension. Drawn with the
  // lines, the dashed guides ran across the dot and it read as a point
  // behind the construction rather than the thing the construction is of.
  for (const p of points) {
    board.circle(at(p.theta), p.primary ? DOT_R : DOT_R * 0.8, { fill: p.colour });
  }

  for (const p of points) {
    const pt = at(p.theta);
    const radial = { x: Math.cos(p.theta), y: -Math.sin(p.theta) };
    const dotRadius = p.primary ? DOT_R : DOT_R * 0.8;
    const labelSize = p.primary ? 14 : 12;
    // Defect 4: the pure radial direction is also the ray OP is drawn on
    // (defect 1) and, when `tangent` is on, the ray its dashed extension
    // continues along all the way to the tangent axis (defect 2) -- so for a
    // point with `tangent` set, that one direction can stay ink-covered for
    // a long way out, and the OLD ordering (radial tried first, exhausting
    // every step before falling back) walked straight past the point and
    // out to the far end of that ink, landing on top of the tangent value's
    // own label instead of beside the point it names. Trying the two
    // tilted escapes first finds a spot a few px off the ray, beside the
    // point, well before the search would otherwise commit to following the
    // ray out past the whole tangent construction.
    // The perpendiculars to the radial ray -- tangential to the circle at P,
    // rather than towards or away from the centre.
    const perp = { x: -radial.y, y: radial.x };
    // Defect 4: when `tangent` is also on, the near-radial escapes (plain
    // radial, and the two small tilts off it) all run into the SAME
    // congested wedge -- OP (defect 1), its dashed extension to the tangent
    // axis (defect 2), and the tangent segment itself all converge exactly
    // where the radial direction points. Every one of those escapes could
    // still find ink-free ground out past all of that, which is how the
    // label used to end up parked next to the tangent's own value label
    // instead of the point (see the long-form account in PRESET.md). With
    // `tangent` on, the search tries the tangential perpendiculars FIRST --
    // sideways along the circle, away from that wedge -- and only falls
    // back to the near-radial escapes if both perpendiculars are blocked
    // too (a dense figure with several points close together).
    const dirs = p.tangent
      ? [
          { x: -perp.x, y: -perp.y },
          perp,
          { x: radial.x, y: radial.y - 0.6 },
          { x: radial.x, y: radial.y + 0.6 },
          radial,
        ]
      : [
          radial,
          { x: radial.x, y: radial.y - 0.6 },
          { x: radial.x, y: radial.y + 0.6 },
          { x: 0, y: radial.y >= 0 ? -1 : 1 },
          // Last, sideways along the circle. A point ON an axis (π/2, −π/2,
          // π) has every direction above running along that axis -- the
          // tilts only bend y, and radial.x is 0 -- so with the axis now ink
          // the label needs a way off it.
          perp,
          { x: -perp.x, y: -perp.y },
        ];
    board.place(
      p.label,
      pt.x + radial.x * (dotRadius + 14),
      pt.y + radial.y * (dotRadius + 14),
      dirs,
      // It names the point (ADR 0035). ADR 0031 refused this once because
      // the dot competed with its own label; `label-nearest-its-place` now
      // reads a marker drawn AT the place as the place itself, so the claim
      // is made and measured.
      { size: labelSize, weight: 600, colour: p.colour, steps: 12, annotatesPlace: pt },
    );

    if (p.arc) {
      const arcR = arcRadii.get(p.id)!;
      const arcId = `${p.id}-arc`;
      // Plain ASCII digits and a bare degree sign -- see the header comment:
      // `sweep-matches-its-label`'s own regex does not know the pt-BR comma.
      const degrees = Math.round((Math.abs(p.theta) * 180) / Math.PI);
      const text = `${degrees}°`;
      const absTheta = Math.abs(p.theta);
      const sign = p.theta < 0 ? -1 : 1;
      const { w: lw, h: lh } = board.extent(text, { size: 13 });
      const halfDiag = Math.max(lw, lh) / 2 + 4;
      // Placed analytically inside the wedge (see `arcLabelSpot` and the
      // big comment above it) rather than searched for: a previous fix here
      // used `avoidInk: false` because `annotates` already lets this label
      // overlap the arc it names (ADR 0019) -- but that forgives ALL ink
      // under the search, not just the label's own arc, so it walked the
      // label onto OP itself (a straight line has no curvature to visually
      // separate "on top of it" from "beside it"), and the paper backing
      // below then cut a false gap into OP. `arcRadii` above already grew
      // this arc's own radius, if it needed to, for exactly this spot to
      // exist; `arcLabelSpot` only has to find it.
      const spot = arcLabelSpot(absTheta, arcR, halfDiag);
      // No spot inside the wedge (a narrow angle past the arc-radius cap):
      // under the arc's foot, across the x axis from the wedge -- see the
      // comment above `widestSubWedge`.
      const centre = spot
        ? { x: cx + spot.labelR * Math.cos(sign * spot.phi), y: cy - spot.labelR * Math.sin(sign * spot.phi) }
        : { x: cx + arcR + lw / 2, y: cy + sign * (lh / 2 + 6) };
      const angleLabel = board.label(text, centre.x, centre.y, {
        size: 13,
        weight: 600,
        colour: p.colour,
        // No paper backing: the spot is clear of every line and beyond the
        // arc, so a backing could only ever cut a gap into something.
      });
      angleLabel.annotates = arcId;
    }

    if (p.projection && showAnswers) {
      const cosV = Math.cos(p.theta);
      const sinV = Math.sin(p.theta);
      const foot: Point = { x: pt.x, y: cy };
      const side: Point = { x: cx, y: pt.y };
      const cosText = formatTrigValue(cosV, locale);
      const sinText = formatTrigValue(sinV, locale);
      const belowAxis = sinV >= 0 ? 1 : -1;
      // Defect 3: these two labels name a PLACE -- the foot of the point's
      // own projection on its own axis -- not any element with extent, so
      // they take `annotatesPlace` (ADR 0028), the same mechanism `vectors`
      // uses for a named point. `steps` is kept small (2, ≤12px of search)
      // so the collision search that keeps a label off another point's ink
      // can nudge it a little without ever walking it away from the foot it
      // names and toward some OTHER point's dot or label -- which is exactly
      // how this label used to end up parked beside a symmetric point's
      // label instead of its own axis foot (see PRESET.md/ADR 0031 for why
      // neither existing check caught that).
      // Two symmetric points (30°/150°, 45°/135°, ...) share one sin value,
      // so their horizontal projection guides sit at the SAME height and
      // each one's guide reaches right across to near the far point's own
      // foot on the y axis -- exactly where that point's sin label anchors.
      // A pure horizontal escape never clears it (the guide is horizontal
      // too, and wide); the diagonal tilts are tried first for that reason,
      // pure horizontal only as the last resort.
      const cosBlock = board.place(
        cosText,
        foot.x,
        cy + belowAxis * 16,
        [{ x: 1, y: belowAxis }, { x: -1, y: belowAxis }, { x: 0, y: belowAxis }],
        { size: 13, weight: 600, colour: COS_COLOUR, steps: 3 },
      );
      cosBlock.annotatesPlace = foot;
      const leftOfAxis = cosV >= 0 ? -1 : 1;
      const sinBlock = board.place(
        sinText,
        cx + leftOfAxis * 18,
        side.y,
        [{ x: leftOfAxis, y: belowAxis }, { x: leftOfAxis, y: -belowAxis }, { x: leftOfAxis, y: 0 }],
        { size: 13, weight: 600, colour: SIN_COLOUR, align: leftOfAxis < 0 ? "end" : "start", steps: 3 },
      );
      sinBlock.annotatesPlace = side;
    }

    if (p.tangent && showAnswers) {
      const t = tangents.get(p.id)!;
      const tanTop: Point = { x: cx + R, y: cy - t * R };
      const tanText = formatTrigValue(t, locale);
      // The tangent axis (x = cx + R) touches the unit circle itself at
      // (1, 0), and the point's own label sits just past that same edge, so
      // a short rightward nudge is not enough room to clear both. Anchored
      // well clear of the circle before the search even starts, rather than
      // counting on ink-avoidance to find its way out through a narrow gap.
      // Continuing PAST tanTop, straight out along the tangent axis itself,
      // rather than stepping sideways off it. The point's own label sits at
      // roughly the SAME radius as tanTop (R·secθ ≈ R + a label's width, for
      // a moderate θ) along the RADIAL ray, so a sideways nudge runs the
      // tangent label straight into it; continuing outward along the axis
      // diverges from that ray immediately, and `annotates` plus the paper
      // backing below already let this label sit astride the tangent
      // segment itself without penalty.
      const outward = t >= 0 ? -1 : 1;
      const tanLabel = board.place(
        `tg θ = ${tanText}`,
        tanTop.x,
        tanTop.y + outward * 22,
        [{ x: 0, y: outward }, { x: 0.5, y: outward }, { x: 1, y: outward }],
        // Paper-backed for the same reason the arc label is: `annotates`
        // lets it overlap the segment it names (ADR 0019/0028), and
        // `text-clear-of-ink` only turns that into a pass when the box is
        // opaque.
        { size: 12, weight: 600, colour: DERIVED, fill: PAPER },
      );
      // Guarded by `length-matches-its-label` (ADR 0028): the segment is
      // stated in the "radius" frame, so its length in that frame's units
      // IS tan θ, and this label is typed as a separate number beside it.
      tanLabel.annotates = tangentMarkIds.get(p.id)!;
    }
  }

  // Quadrant letters, placed only now that every point's ink (radii,
  // tangent segments and their dashed extensions) already exists. Moved
  // here from before that ink was drawn, and from a plain `board.label` to
  // a searching `board.place`: "I"'s fixed spot on the 45° bisector sat
  // exactly on the dashed extension of any primary angle whose own theta IS
  // 45°/135°/225°/315° -- a real case, not a corner one, since 45° is one of
  // the commonest angles this preset draws. A small outward-biased search
  // lets the letter step clear of ink it does not name without drifting
  // into another quadrant.
  //
  // And LAST of all the labels (ADR 0035): placed before the point labels,
  // "I" claimed the spot on the 45° bisector just outside the circle, and
  // "π/4" walked past it to 46px from its own point -- farther than
  // `label-nearest-its-place` allows, once the point label names its point.
  // A quadrant letter names a region; it yields to a label naming a point.
  if (input.quadrantLabels) {
    const roman: [string, number][] = [
      ["I", Math.PI / 4],
      ["II", (3 * Math.PI) / 4],
      ["III", (5 * Math.PI) / 4],
      ["IV", (7 * Math.PI) / 4],
    ];
    for (const [text, a] of roman) {
      const dir = { x: Math.cos(a), y: -Math.sin(a) };
      const perp = { x: -dir.y, y: dir.x };
      board.place(
        text,
        cx + (R + 24) * dir.x,
        cy + (R + 24) * dir.y,
        // Last, back into the circle: placed after every other label now,
        // the spot outside can be taken by a point's own label (a point at
        // 45° puts its label exactly where "I" would go), and a letter
        // anywhere inside its quadrant still names it.
        [dir, perp, { x: -perp.x, y: -perp.y }, { x: -dir.x, y: -dir.y }],
        // A quadrant letter names a region nothing draws: free-standing (ADR 0035).
        { size: 13, weight: 700, colour: QUADRANT_COLOUR, steps: 9, freeStanding: true },
      );
    }
  }

  const spec = board.spec(input.title ?? "ciclo trigonométrico");
  const scene = spec.root as Scene;
  scene.connectors = connectors;
  spec.canvas = {
    ...spec.canvas,
    constraints: { allowCurvedConnectors: true, allowOverlap: true },
  };
  return parseSpec(spec);
}

// ---- validation -----------------------------------------------------------------

export function validateUnitCircleInput(raw: Record<string, unknown>): void {
  const path = "unit-circle";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalNumber(raw, "radius", path);
  v.optionalBoolean(raw, "quadrantLabels", path);
  v.optionalBoolean(raw, "answers", path);
  const angles = v.nonEmptyArray(raw, "angles", path, "angles (a string, or {angle, ...})");
  angles.forEach((a, i) => validateAngleEntry(a, `${path}.angles[${i}]`));
  expandUnitCircle(raw as unknown as UnitCircleInput);
}

function validateAngleEntry(raw: unknown, path: string): void {
  if (typeof raw === "string") {
    try {
      parseAngle(raw);
    } catch (error) {
      throw new SpecError(`${path}: ${(error as Error).message}`);
    }
    return;
  }
  const o = v.object(raw, path);
  const angleText = v.requiredString(o, "angle", path);
  try {
    parseAngle(angleText);
  } catch (error) {
    throw new SpecError(`${path}.angle: ${(error as Error).message}`);
  }
  v.optionalString(o, "label", path);
  v.optionalBoolean(o, "arc", path);
  v.optionalBoolean(o, "projection", path);
  v.optionalBoolean(o, "tangent", path);
  if (o.symmetric !== undefined && typeof o.symmetric !== "boolean") {
    if (!Array.isArray(o.symmetric) || o.symmetric.some((k) => !(SYMMETRIC_KINDS as readonly unknown[]).includes(k))) {
      throw new SpecError(`${path}.symmetric must be true, false, or an array of ${SYMMETRIC_KINDS.join(", ")}`);
    }
  }
}
