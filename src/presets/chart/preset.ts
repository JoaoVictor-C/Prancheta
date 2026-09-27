/**
 * chart — bar charts, built entirely from Stack/Block. No new IR, no new
 * layout engine, no new checks: bar height/width IS the encoded value,
 * computed here as plain arithmetic, and CSS flexbox's own bottom/left
 * alignment (`align: "end"`) does the one piece of layout a bar chart
 * actually needs — every bar in a group, and every category label, on a
 * common baseline — for free.
 *
 * Why this belongs in the core rather than a Python module (contrast
 * modules/plot's line curves, or a future pie/donut module): nothing here
 * is geometry the core cannot compute. A bar's length is a linear scale, one
 * multiplication; that is arithmetic, not domain science, and expressing it
 * as an ordinary Block means the whole pipeline (text measurement, the
 * repair loop, every existing check) applies with zero new code. See
 * docs/research/candidate-modules.md's logic-gates note for the identical
 * reasoning the other way: reach for a module only when the core truly
 * cannot express the shape.
 */

import type { Block, Connector, FigureSpec, FigureNode, Mark, Scene } from "../../ir/types.ts";
import { palette, theme } from "../../theme.ts";
import { mostReadableOn } from "../../colour/contrast.ts";
import * as v from "../validate.ts";
import { SpecError } from "../../ir/types.ts";

export type ChartCategory = {
  label: string;
  /** One value per series, same order as `series`. */
  values: number[];
};

export type ChartInput = {
  title?: string;
  /**
   * "bar" (default): categories laid out with Stack/Block, per `orientation`
   * and `stacking` below. "line"/"scatter": categories become x positions in
   * a Scene{layout:"absolute"}, values become y positions, connected by
   * Connectors when "line" and left bare when "scatter". A genuinely
   * different code path, not a variant of the bar arithmetic -- a Block has
   * no way to be "a point joined to another point", only a Scene's
   * Connector does.
   *
   * "pie"/"donut": a THIRD path, for the same reason there is a second. A
   * wedge is not a rectangle under any transform and not a point joined to
   * another point; it is a region bounded by two radii and an arc, which is
   * what a Mark states. This preset's own documentation used to say a pie was
   * out of reach, and it was, until the Mark arrived. The restraint that note
   * was defending is against STRETCHING one path to cover a shape it cannot
   * hold -- writing a genuinely different path is the thing it asks for.
   *
   * Pie and donut take one series: a pie of several series is not a chart,
   * it is two claims sharing a circle. `categories` are the slices.
   */
  chartType?: "bar" | "line" | "scatter" | "pie" | "donut";
  /** "vertical": bars grow upward, categories along the x axis (the default).
   *  "horizontal": bars grow rightward, categories stacked top to bottom.
   *  Ignored by chartType "line"/"scatter", which always plot left-to-right. */
  orientation?: "vertical" | "horizontal";
  /**
   * "grouped" (default): each series gets its own bar, side by side.
   * "stacked": series segments stack end to end, bar length is their sum.
   * "stacked100": stacked, but every bar is rescaled to the same total
   * length -- segment length is the series' SHARE of the category, not its
   * absolute value. Composition, not magnitude.
   * Ignored by chartType "line"/"scatter".
   */
  stacking?: "grouped" | "stacked" | "stacked100";
  categories: ChartCategory[];
  /** Series names, same order as each category's `values`. Defaults to a single unnamed series. */
  series?: string[];
  /** Appended to every value label, e.g. "%" or " units". */
  valueSuffix?: string;
  /** The longest bar's length in px. Every other bar is scaled relative to it. Bar only. */
  maxBarLength?: number;
  barThickness?: number;
  barGap?: number;
  groupGap?: number;
  /** Horizontal orientation only: fixed width of the category-label column. Bar only. */
  labelWidth?: number;
  showValues?: boolean;
  /** chartType "line"/"scatter" only: the plotted area's size in px, axis labels excluded. */
  plotWidth?: number;
  plotHeight?: number;
  /** chartType "pie"/"donut" only: the pie's outer radius in px. Default 150. */
  radius?: number;
  /** chartType "donut" only: the hole's radius as a fraction of `radius`. Default 0.55. */
  holeRatio?: number;
};

// Drawn from the same canonical palette every other preset uses (theme.ts) —
// applied categorically here rather than semantically, which a qualitative
// data series genuinely needs and a fixed six-value role enum cannot give:
// there is no "green" or "teal" role, only what a data series is allowed to
// be coloured, not what it MEANS.
const SERIES_COLOURS = [palette.blue, palette.red, palette.green, palette.yellow, palette.magenta];

function formatValue(value: number, suffix: string): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text}${suffix}`;
}

export function expandChart(input: ChartInput): FigureSpec {
  if (input.categories.length === 0) {
    throw new Error("chart needs at least one category");
  }
  const seriesCount = input.categories[0]!.values.length;
  for (const category of input.categories) {
    if (category.values.length !== seriesCount) {
      throw new Error(`every category must have ${seriesCount} value(s); "${category.label}" has ${category.values.length}`);
    }
  }
  const series = input.series ?? (seriesCount === 1 ? [""] : Array.from({ length: seriesCount }, (_, i) => `Series ${i + 1}`));
  const chartType = input.chartType ?? "bar";
  const orientation = input.orientation ?? "vertical";
  const maxBarLength = input.maxBarLength ?? 260;
  const barThickness = input.barThickness ?? (orientation === "vertical" ? 34 : 22);
  const barGap = input.barGap ?? 5;
  const groupGap = input.groupGap ?? 26;
  const labelWidth = input.labelWidth ?? 110;
  const suffix = input.valueSuffix ?? "";
  const showValues = input.showValues ?? true;

  const stacking = input.stacking ?? "grouped";
  const categoryTotals = input.categories.map((c) => c.values.reduce((a, b) => a + b, 0));

  // Grouped: each bar's own value against the largest single value anywhere.
  // Stacked: a bar's length is now the SUM of its segments, so the scale
  // reference is the largest category TOTAL, not the largest single value --
  // using the single-value max would make every stacked bar overflow
  // maxBarLength except the one with a single dominant segment.
  const maxValue =
    stacking === "grouped"
      ? Math.max(1e-9, ...input.categories.flatMap((c) => c.values))
      : Math.max(1e-9, ...categoryTotals);
  const scale = maxBarLength / maxValue;

  const legend: FigureNode | null =
    series.length > 1
      ? {
          type: "stack",
          id: "legend",
          direction: "row",
          gap: 18,
          align: "center",
          children: series.map((name, i) => ({
            type: "stack",
            direction: "row",
            gap: 6,
            align: "center",
            children: [
              {
                type: "block",
                width: 14,
                height: 14,
                padding: 0,
                fill: SERIES_COLOURS[i % SERIES_COLOURS.length],
                strokeWidth: 0,
                radius: 3,
                // The legend swatch is the one place a series' colour is
                // declared exactly once, so it is what categorical-colours-
                // distinguishable checks -- tagging every bar/point too would
                // just repeat the same comparison per category for no gain.
                categoryGroup: "series",
              },
              // A legend entry: free-standing (ADR 0035). It names its swatch by
              // sharing a row with it, which no proximity check models.
              { type: "block", label: name, role: "muted", fill: "transparent", strokeWidth: 0, padding: 0, wrap: "none", freeStanding: true },
            ],
          })),
        }
      : null;

  if (chartType === "line" || chartType === "scatter") {
    return buildSeriesChart(input, series, chartType, legend);
  }
  if (chartType === "pie" || chartType === "donut") {
    return buildPieChart(input, chartType);
  }

  let columns: FigureNode[];
  if (stacking === "grouped") {
    columns =
    orientation === "vertical"
      ? input.categories.map((category, ci) => {
          const bars: Block[] = category.values.map((value, si) => ({
            type: "block",
            id: `bar-${ci}-${si}`,
            height: Math.max(1, value * scale),
            width: barThickness,
            fill: SERIES_COLOURS[si % SERIES_COLOURS.length],
            strokeWidth: 0,
            radius: 3,
            // A bar is pure geometry: its size IS the datum, so it must not
            // carry the block default padding, which sets a floor of padding
            // plus border and silently drew every short bar at that floor.
            padding: 0,
          }));
          const barUnits: FigureNode[] = bars.map((bar, si) => ({
            type: "stack",
            direction: "column",
            gap: 3,
            align: "center",
            children: showValues
              ? [
                  {
                    type: "block",
                    label: formatValue(category.values[si]!, suffix),
                    // It names its bar (ADR 0035), and is held beside it by
                    // `annotation-nearest-its-owner`.
                    annotates: `bar-${ci}-${si}`,
                    role: "muted",
                    fill: "transparent",
                    strokeWidth: 0,
                    padding: 0,
                    wrap: "none",
                    fontSize: 12,
                  },
                  bar,
                ]
              : [bar],
          }));
          return {
            type: "stack",
            direction: "column",
            gap: 8,
            align: "stretch",
            children: [
              { type: "stack", direction: "row", gap: barGap, align: "end", children: barUnits },
              {
                type: "block",
                label: category.label,
                // A category name is read by its column of bars, as a table
                // header is: free-standing (ADR 0035).
                freeStanding: true,
                role: "muted",
                fill: "transparent",
                strokeWidth: 0,
                padding: 0,
                textAlign: "center",
                fontSize: 13,
              },
            ],
          };
        })
      : input.categories.map((category, ci) => {
          const barUnits: FigureNode[] = category.values.map((value, si) => ({
            type: "stack",
            direction: "row",
            gap: 8,
            align: "center",
            children: [
              {
                type: "block",
                id: `bar-${ci}-${si}`,
                width: Math.max(1, value * scale),
                height: barThickness,
                fill: SERIES_COLOURS[si % SERIES_COLOURS.length],
                strokeWidth: 0,
                radius: 3,
                padding: 0,
              },
              ...(showValues
                ? [
                    {
                      type: "block" as const,
                      label: formatValue(value, suffix),
                      annotates: `bar-${ci}-${si}`,
                      role: "muted" as const,
                      fill: "transparent",
                      strokeWidth: 0,
                      padding: 0,
                      wrap: "none" as const,
                      fontSize: 12,
                    },
                  ]
                : []),
            ],
          }));
          return {
            type: "stack",
            direction: "row",
            gap: 10,
            align: "start",
            children: [
              {
                type: "block",
                label: category.label,
                // A category name is read by its column of bars, as a table
                // header is: free-standing (ADR 0035).
                freeStanding: true,
                role: "muted",
                fill: "transparent",
                strokeWidth: 0,
                padding: 0,
                width: labelWidth,
                textAlign: "end",
                fontSize: 13,
              },
              { type: "stack", direction: "column", gap: barGap, align: "start", children: barUnits },
            ],
          };
        });
  } else {
    // Stacked / stacked100: one Stack per category, segments touching
    // (gap: 0) so the bar's total length is exactly the sum of its parts --
    // any gap would make the bar longer than the value it encodes. Per-
    // segment value labels are deliberately omitted: an inline label the
    // repair loop grows to fit would inflate that segment's box past its
    // true value, breaking the one invariant a bar chart exists to keep
    // (length IS the data). The legend names every series instead.
    columns = input.categories.map((category, ci) => {
      const total = categoryTotals[ci]!;
      const segmentLength = (value: number): number =>
        stacking === "stacked100"
          ? Math.max(1, total > 0 ? (value / total) * maxBarLength : 0)
          : Math.max(1, value * scale);

      const segments: Block[] = category.values.map((value, si) => ({
        type: "block",
        id: `bar-${ci}-${si}`,
        ...(orientation === "vertical"
          ? { height: segmentLength(value), width: barThickness }
          : { width: segmentLength(value), height: barThickness }),
        fill: SERIES_COLOURS[si % SERIES_COLOURS.length],
        strokeWidth: 0,
        radius: 0,
        padding: 0,
      }));

      // Vertical: CSS stacks a column top-to-bottom, but series[0] belongs
      // at the BOTTOM of the bar by convention, so its segment must be the
      // LAST child. Horizontal: a row stacks left-to-right, and series[0]
      // belongs at the START (left), which is already the natural order.
      const orderedSegments = orientation === "vertical" ? [...segments].reverse() : segments;

      const bar: FigureNode = {
        type: "stack",
        direction: orientation === "vertical" ? "column" : "row",
        gap: 0,
        align: "stretch",
        children: orderedSegments,
      };

      const totalLabel: FigureNode | null = showValues
        ? {
            type: "block",
            label: formatValue(stacking === "stacked100" ? 100 : total, stacking === "stacked100" ? "%" : suffix),
            // The total names the whole stack of segments, which is no one
            // element: free-standing (ADR 0035), read by its position at the
            // bar's end.
            freeStanding: true,
            role: "muted",
            fill: "transparent",
            strokeWidth: 0,
            padding: 0,
            wrap: "none",
            fontSize: 12,
            textAlign: orientation === "vertical" ? "center" : "start",
          }
        : null;

      if (orientation === "vertical") {
        return {
          type: "stack",
          direction: "column",
          gap: 8,
          align: "stretch",
          children: [
            ...(totalLabel ? [totalLabel] : []),
            bar,
            {
              type: "block",
              label: category.label,
              freeStanding: true,
              role: "muted",
              fill: "transparent",
              strokeWidth: 0,
              padding: 0,
              textAlign: "center",
              fontSize: 13,
            },
          ],
        };
      }
      return {
        type: "stack",
        direction: "row",
        gap: 10,
        align: "center",
        children: [
          {
            type: "block",
            label: category.label,
            freeStanding: true,
            role: "muted",
            fill: "transparent",
            strokeWidth: 0,
            padding: 0,
            width: labelWidth,
            textAlign: "end",
            fontSize: 13,
          },
          bar,
          ...(totalLabel ? [totalLabel] : []),
        ],
      };
    });
  }

  const plot: FigureNode = {
    type: "stack",
    id: "plot",
    direction: orientation === "vertical" ? "row" : "column",
    gap: groupGap,
    align: orientation === "vertical" ? "end" : "stretch",
    children: columns,
  };

  const rootChildren: FigureNode[] = legend ? [legend, plot] : [plot];

  const root: FigureNode = {
    type: "stack",
    id: "chart",
    direction: "column",
    gap: 20,
    align: orientation === "vertical" ? "center" : "stretch",
    children: rootChildren,
  };

  return { version: 1, title: input.title, root };
}

/**
 * Line and scatter series: a genuinely different code path from bar mode.
 * A bar's length is one multiplication on an ordinary Block; a point joined
 * to another point is not expressible as a Block at all, only a Scene's
 * Connector can do it -- so this builds a Scene{layout:"absolute"} directly,
 * the same shape `annotated-figure` and `graph` already use, rather than
 * stretching the Stack/Block arithmetic to cover something it structurally
 * cannot.
 *
 * Deliberately minimal: no axis rule, no gridlines. The bar chart makes the
 * identical choice (no baseline drawn, values labelled instead) and states it
 * as a stated convention, not an oversight -- the two end labels on the y
 * axis (0 and the largest value) say the same thing a ruled line would, with
 * one fewer shape that could collide with a data point sitting exactly on
 * the axis.
 *
 * Known, stated limit: two series with near-identical values at the same
 * category place two markers close enough to partially overlap, which
 * `boxes-do-not-overlap` will genuinely fail on -- an honest collision, not a
 * false positive. Real scatter data can do this; keeping markers small
 * narrows the range of values where it happens, it does not remove it.
 */
function buildSeriesChart(
  input: ChartInput,
  series: string[],
  chartType: "line" | "scatter",
  legend: FigureNode | null,
): FigureSpec {
  const suffix = input.valueSuffix ?? "";
  const plotWidth = input.plotWidth ?? 480;
  const plotHeight = input.plotHeight ?? 280;
  const marginLeft = 54;
  const marginBottom = 34;
  const marginTop = 16;
  const marginRight = 34;
  const markerSize = chartType === "scatter" ? 10 : 8;

  const categories = input.categories;
  const maxValue = Math.max(1e-9, ...categories.flatMap((c) => c.values));
  const yScale = plotHeight / maxValue;
  const xStep = categories.length > 1 ? plotWidth / (categories.length - 1) : 0;
  const xOf = (ci: number): number =>
    categories.length > 1 ? marginLeft + ci * xStep : marginLeft + plotWidth / 2;
  const yOf = (value: number): number => marginTop + plotHeight - value * yScale;
  // Dense categories would make a fixed 60px tick label collide with its
  // neighbour; shrink to fit the actual spacing instead; see the bar chart's
  // own category label for the equivalent concern in flow layout.
  const tickLabelWidth = categories.length > 1 ? Math.min(60, Math.max(24, xStep - 6)) : 60;

  const children: Block[] = [
    {
      type: "block",
      id: "y-axis-max-label",
      label: formatValue(maxValue, suffix),
      // An axis number with no drawn axis: free-standing, like a tick (ADR 0035).
      freeStanding: true,
      role: "muted",
      fill: "transparent",
      strokeWidth: 0,
      padding: 0,
      wrap: "none",
      fontSize: 12,
      textAlign: "end",
      x: 0,
      y: marginTop - 7,
      width: marginLeft - 8,
    },
    {
      type: "block",
      id: "y-axis-zero-label",
      label: formatValue(0, suffix),
      freeStanding: true,
      role: "muted",
      fill: "transparent",
      strokeWidth: 0,
      padding: 0,
      wrap: "none",
      fontSize: 12,
      textAlign: "end",
      x: 0,
      y: marginTop + plotHeight - 7,
      width: marginLeft - 8,
    },
  ];

  categories.forEach((category, ci) => {
    // The leftmost tick sits exactly under the y-axis value labels; centring
    // it would overhang left into that column (the collision an early render
    // of this fixture actually caught). Left-align the first tick and
    // right-align the last instead, the same edge convention an axis with
    // real tick marks would use, rather than a special case bolted on after
    // the fact.
    const isFirst = ci === 0 && categories.length > 1;
    const isLast = ci === categories.length - 1 && categories.length > 1;
    const textAlign = isFirst ? "start" : isLast ? "end" : "center";
    const x = isFirst ? xOf(ci) : isLast ? xOf(ci) - tickLabelWidth : xOf(ci) - tickLabelWidth / 2;
    children.push({
      type: "block",
      id: `x-axis-label-${ci}`,
      label: category.label,
      freeStanding: true,
      role: "muted",
      fill: "transparent",
      strokeWidth: 0,
      padding: 0,
      wrap: "none",
      fontSize: 12,
      textAlign,
      x,
      y: marginTop + plotHeight + 8,
      width: tickLabelWidth,
    });
  });

  const connectors: Connector[] = [];
  for (let si = 0; si < series.length; si += 1) {
    let previousId: string | null = null;
    categories.forEach((category, ci) => {
      const value = category.values[si]!;
      const id = `point-${ci}-${si}`;
      children.push({
        type: "block",
        id,
        x: xOf(ci) - markerSize / 2,
        y: yOf(value) - markerSize / 2,
        width: markerSize,
        height: markerSize,
        radius: markerSize / 2,
        padding: 0,
        fill: SERIES_COLOURS[si % SERIES_COLOURS.length],
        strokeWidth: 0,
      });
      if (chartType === "line" && previousId !== null) {
        connectors.push({
          id: `line-${si}-${ci}`,
          from: previousId,
          to: id,
          stroke: SERIES_COLOURS[si % SERIES_COLOURS.length],
          strokeWidth: 2,
          arrow: "none",
        });
      }
      previousId = id;
    });
  }

  const scene: Scene = {
    type: "scene",
    id: "plot",
    layout: "absolute",
    width: marginLeft + plotWidth + marginRight,
    height: marginTop + plotHeight + marginBottom,
    children,
    connectors,
  };

  const rootChildren: FigureNode[] = legend ? [legend, scene] : [scene];
  const root: FigureNode = {
    type: "stack",
    id: "chart",
    direction: "column",
    gap: 20,
    align: "center",
    children: rootChildren,
  };

  return { version: 1, title: input.title, root };
}


/**
 * A pie or donut: every slice a Mark whose angle IS its share.
 *
 * The one claim a pie makes is that a slice's angle is proportional to its
 * value, so that is the claim the figure has to be unable to break. The angle
 * is computed once, from the value, and the percentage printed on the slice is
 * computed from the same fraction -- and then `sweep-matches-its-label`
 * measures the drawn arc and compares it back against the printed number.
 * Two numbers that agree because one was derived from the other, checked
 * against the ink that was actually laid down.
 *
 * A slice narrower than INLINE_SHARE_FLOOR gets no percentage on it: there is
 * no room to set one legibly, and a label the repair loop grows to fit would
 * be a box bigger than the wedge it names. The legend carries every category's
 * share regardless, so nothing is lost to an unlabelled sliver -- which is
 * also why the legend here lists shares and the bar chart's does not.
 */
const INLINE_SHARE_FLOOR = 0.06;

/**
 * The two inks a slice label may be set in: the canvas ground and the text
 * colour the theme already uses everywhere else. Deliberately only two --
 * this is a legibility decision, not a licence to tint a label to taste.
 */
const SLICE_INKS = [theme.canvas.background, theme.text.color] as const;

function buildPieChart(input: ChartInput, chartType: "pie" | "donut"): FigureSpec {
  const radius = input.radius ?? 150;
  const holeRatio = chartType === "donut" ? (input.holeRatio ?? 0.55) : 0;
  const innerRadius = radius * holeRatio;
  const pad = 8;
  const size = radius * 2 + pad * 2;
  const centre = { x: radius + pad, y: radius + pad };

  const values = input.categories.map((category) => category.values[0] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) {
    throw new SpecError("chart: a pie needs at least one category with a value above zero");
  }

  // Degrees clockwise from twelve o'clock, which is where a reader expects a
  // pie to start and the direction they expect it to run.
  const pointAt = (degrees: number, r: number): { x: number; y: number } => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return { x: centre.x + r * Math.cos(radians), y: centre.y + r * Math.sin(radians) };
  };

  const marks: Mark[] = [];
  const children: Block[] = [];
  const shares: number[] = [];
  let cursor = 0;

  for (const [i, value] of values.entries()) {
    const fraction = value / total;
    shares.push(fraction);
    const start = cursor * 360;
    const end = (cursor + fraction) * 360;
    cursor += fraction;
    if (fraction <= 0) continue;

    const id = `slice-${i}`;
    const fill = SERIES_COLOURS[i % SERIES_COLOURS.length]!;
    // AN ARC PAST A HALF TURN CANNOT BE DRAWN AS ONE SEGMENT. Two points and
    // a centre name two arcs, the minor one and the major one, and the IR's
    // convention is the minor one -- so a 58% slice asked for 208.8 degrees
    // and was drawn as the 151.2 degrees left over, with its own label then
    // sitting outside the wedge it named. Both the renderer and the check
    // caught it, which is the system working; the fix is to say it in pieces
    // small enough to be unambiguous.
    //
    // The pieces are 120 degrees, not 180. At exactly 180 the two candidate
    // arcs are the same length and the ambiguity is total: a full circle cut
    // into two half-arcs came back as an outline that ran round and then
    // retraced itself, enclosing nothing -- so the 100% label was measured
    // against the canvas rather than against the disc it sits in the middle
    // of. Below a half turn the minor arc is strictly shorter and therefore
    // unique. `sweep-matches-its-label` adds a sector's rim arcs back up.
    const spans: [number, number][] = [];
    for (let from = start; from < end - 1e-9; ) {
      const to = Math.min(end, from + 120);
      spans.push([from, to]);
      from = to;
    }
    const outerArcs = spans.map(([from, to]) => ({ arc: pointAt(to, radius), centre }));
    marks.push(
      holeRatio > 0
        ? {
            id,
            from: pointAt(start, innerRadius),
            segments: [
              { line: pointAt(start, radius) },
              ...outerArcs,
              { line: pointAt(end, innerRadius) },
              // Back along the hole, in reverse, in the same size pieces.
              ...spans
                .slice()
                .reverse()
                .map(([from]) => ({ arc: pointAt(from, innerRadius), centre })),
            ],
            close: true,
            fill,
            stroke: "none",
          }
        : {
            id,
            from: centre,
            segments: [{ line: pointAt(start, radius) }, ...outerArcs],
            close: true,
            fill,
            stroke: "none",
          },
    );

    if (fraction >= INLINE_SHARE_FLOOR) {
      const mid = (start + end) / 2;
      const labelRadius = holeRatio > 0 ? (radius + innerRadius) / 2 : radius * 0.64;
      const at = pointAt(mid, labelRadius);
      const width = 46;
      const height = 18;
      children.push({
        type: "block",
        id: `${id}-share`,
        x: at.x - width / 2,
        y: at.y - height / 2,
        width,
        height,
        padding: 0,
        fill: "transparent",
        strokeWidth: 0,
        wrap: "none",
        textAlign: "center",
        fontSize: 12,
        // The ink is chosen from the wedge it sits on, not fixed once for the
        // whole chart. A categorical palette runs from pale yellow to deep
        // blue, and one ink cannot serve both: with the theme default, four
        // of five slices in a five-category pie came back between 1.37:1 and
        // 2.66:1 -- legible nowhere, and reported by contrast-sufficient
        // because the label sits on the Mark and the Mark is a surface.
        textColor: mostReadableOn(fill, SLICE_INKS),
        label: `${Math.round(fraction * 1000) / 10}%`,
        // The obligation, and the point: this names the slice, so it is
        // allowed to sit on it -- and having said so, its printed share is
        // measured against the angle the slice actually sweeps.
        annotates: id,
      });
    }
  }

  const scene: Scene = {
    type: "scene",
    id: "pie",
    layout: "absolute",
    width: size,
    height: size,
    children,
    marks,
  };

  // Every category appears here with its real share, including the slivers
  // too narrow to carry one inline. This is the pie's category axis; without
  // it a small slice is a coloured wedge naming nothing.
  const legend: FigureNode = {
    type: "stack",
    id: "legend",
    direction: "column",
    gap: 8,
    align: "start",
    children: input.categories.map((category, i) => ({
      type: "stack",
      direction: "row",
      gap: 8,
      align: "center",
      children: [
        {
          type: "block",
          width: 14,
          height: 14,
          padding: 0,
          fill: SERIES_COLOURS[i % SERIES_COLOURS.length],
          strokeWidth: 0,
          radius: 3,
          categoryGroup: "slice",
        },
        {
          type: "block",
          label: `${category.label} — ${Math.round((shares[i] ?? 0) * 1000) / 10}%`,
          // A legend entry: free-standing (ADR 0035).
          freeStanding: true,
          role: "muted",
          fill: "transparent",
          strokeWidth: 0,
          padding: 0,
          wrap: "none",
        },
      ],
    })),
  };

  const root: FigureNode = {
    type: "stack",
    id: "chart",
    direction: "row",
    gap: 28,
    align: "center",
    children: [scene, legend],
  };

  return { version: 1, title: input.title, root };
}

/**
 * Preconditions expandChart relies on.
 *
 * Two of these guard arithmetic rather than shape, which is the whole reason
 * this layer's remit is "what the expander presupposes" and not "is this
 * well-formed". A category whose values sum to zero is perfectly well-formed
 * and, in stacked100, has no shares to express -- the existing `total > 0`
 * guard keeps it from dividing by zero by drawing empty segments under a label
 * that says 100%, which is a quieter failure than a crash and a worse one. And
 * values that are individually finite can sum past Number.MAX_VALUE, so the
 * derived total is checked, not just the numbers as written.
 */
export function validateChartInput(input: Record<string, unknown>, path = "chart"): void {
  v.optionalString(input, "title", path);
  v.optionalEnum(input, "chartType", path, ["bar", "line", "scatter", "pie", "donut"] as const);
  v.optionalEnum(input, "orientation", path, ["vertical", "horizontal"] as const);
  const stacking = v.optionalEnum(input, "stacking", path, [
    "grouped",
    "stacked",
    "stacked100",
  ] as const);
  v.optionalString(input, "valueSuffix", path);
  for (const key of [
    "maxBarLength",
    "barThickness",
    "barGap",
    "groupGap",
    "labelWidth",
    "plotWidth",
    "plotHeight",
    "radius",
    "holeRatio",
  ]) {
    v.optionalNumber(input, key, path);
  }
  v.optionalBoolean(input, "showValues", path);

  const categories = v.nonEmptyArray(input, "categories", path, "categories");
  const first = v.object(categories[0], `${path}.categories[0]`);
  const seriesCount = v.nonEmptyArray(first, "values", `${path}.categories[0]`, "numbers").length;

  for (const [i, raw] of categories.entries()) {
    const at = `${path}.categories[${i}]`;
    const category = v.object(raw, at);
    v.requiredString(category, "label", at);
    const values = v.nonEmptyArray(category, "values", at, "numbers");
    if (values.length !== seriesCount) {
      throw new SpecError(
        `${at}.values has ${values.length} value(s), but ` +
          `${path}.categories[0].values has ${seriesCount}. Every category must carry one ` +
          `value per series, in the same order.`,
      );
    }
    let total = 0;
    for (const [j, value] of values.entries()) total += v.finite(value, `${at}.values[${j}]`);
    v.finite(total, `${at}.values summed`);
    if (stacking === "stacked100" && total === 0) {
      throw new SpecError(
        `${at}.values sums to 0, and stacked100 draws each segment as its share of the ` +
          `category total. There are no shares of nothing -- the bar would render empty ` +
          `under a label reading 100%.`,
      );
    }
  }

  if (input.series !== undefined) {
    const series = v.array(input, "series", path, "series names");
    for (const [i, name] of series.entries()) {
      if (typeof name !== "string") {
        throw new SpecError(
          `${path}.series[${i}] must be a string, got ${JSON.stringify(name)}`,
        );
      }
    }
    if (series.length !== seriesCount) {
      throw new SpecError(
        `${path}.series names ${series.length} series, but each category carries ` +
          `${seriesCount} value(s). A series without a value, or a value without a series, ` +
          `has nothing to draw.`,
      );
    }
  }
}
