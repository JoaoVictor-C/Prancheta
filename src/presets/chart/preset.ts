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

import type { Block, Connector, FigureSpec, FigureNode, Scene } from "../../ir/types.ts";
import { palette } from "../../theme.ts";
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
   */
  chartType?: "bar" | "line" | "scatter";
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
                fill: SERIES_COLOURS[i % SERIES_COLOURS.length],
                strokeWidth: 0,
                radius: 3,
                // The legend swatch is the one place a series' colour is
                // declared exactly once, so it is what categorical-colours-
                // distinguishable checks -- tagging every bar/point too would
                // just repeat the same comparison per category for no gain.
                categoryGroup: "series",
              },
              { type: "block", label: name, role: "muted", fill: "transparent", strokeWidth: 0, padding: 0, wrap: "none" },
            ],
          })),
        }
      : null;

  if (chartType === "line" || chartType === "scatter") {
    return buildSeriesChart(input, series, chartType, legend);
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
              },
              ...(showValues
                ? [
                    {
                      type: "block" as const,
                      label: formatValue(value, suffix),
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
  v.optionalEnum(input, "chartType", path, ["bar", "line", "scatter"] as const);
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
