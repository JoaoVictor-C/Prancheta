/**
 * Data binding for chart preset (M8, stage 5, step 27).
 *
 * Maps a dataset + encoding specifications to chart input, deriving axes,
 * scales, and legend automatically from the data. This is the "highest-value
 * comparative gap after primitives" — the founding failure was an agent doing
 * scale arithmetic in its head rather than declaring data and letting the
 * toolkit compute the mapping.
 */

import type { ChartInput, ChartCategory } from "./preset.ts";
import type { Scale } from "../../scales.ts";
import { createLinearScale, createBandScale, createLogScale, createTimeScale } from "../../scales.ts";

export type DataRow = Record<string, number | string | Date>;

export type Encoding = {
  /** Field name for x-axis (categories or continuous values). */
  x: string;
  /** Field name(s) for y-axis values. Can be a single field or array for multiple series. */
  y: string | string[];
  /** Optional: field for color encoding (categorical). */
  color?: string;
  /** Optional: field for grouping (creates multiple series). */
  series?: string;
};

export type DataBindingSpec = {
  /** Raw dataset: array of row objects. */
  data: DataRow[];
  /** Encoding specification: which fields map to which visual channels. */
  encoding: Encoding;
  /** Chart type. */
  chartType?: "bar" | "line" | "scatter";
  /** Optional title. */
  title?: string;
  /** Optional value suffix (%, units, etc.). */
  valueSuffix?: string;
  /** Optional: x-axis scale type (default: inferred from data). */
  xScale?: "linear" | "log" | "band" | "time";
  /** Optional: y-axis scale type (default: linear). */
  yScale?: "linear" | "log";
};

/**
 * Transform a dataset + encoding into ChartInput that the chart preset understands.
 */
export function bindData(spec: DataBindingSpec): ChartInput {
  const { data, encoding, chartType = "bar", title, valueSuffix } = spec;

  if (data.length === 0) {
    throw new Error("dataset cannot be empty");
  }

  // Determine x-axis scale type from data if not specified
  const xField = encoding.x;
  const firstXValue = data[0]![xField];
  const xScaleType = spec.xScale ?? inferScaleType(firstXValue);

  // Handle multiple y fields (multiple series)
  const yFields = Array.isArray(encoding.y) ? encoding.y : [encoding.y];

  // Extract categories (x-axis values)
  const xValues = data.map((row) => row[xField]);
  const uniqueX = [...new Set(xValues.map(String))];

  // Build categories
  const categories: ChartCategory[] = uniqueX.map((xVal) => {
    const categoryRows = data.filter((row) => String(row[xField]) === xVal);

    // For each y field, aggregate values (sum if multiple rows per category)
    const values = yFields.map((yField) => {
      const rowValues = categoryRows.map((row) => {
        const val = row[yField];
        return typeof val === "number" ? val : 0;
      });
      return rowValues.reduce((sum, v) => sum + v, 0);
    });

    return {
      label: xVal,
      values,
    };
  });

  // Series names from y field names
  const series = yFields.length > 1 ? yFields : undefined;

  return {
    title,
    chartType,
    categories,
    series,
    valueSuffix,
  };
}

/**
 * Infer scale type from a data value.
 */
function inferScaleType(value: unknown): "band" | "linear" | "time" {
  if (value instanceof Date) return "time";
  if (typeof value === "number") return "linear";
  return "band"; // String values become categorical band scale
}

/**
 * Create a scale from a dataset and encoding.
 */
export function createScaleFromData(
  data: DataRow[],
  field: string,
  range: [number, number],
  scaleType?: "linear" | "log" | "band" | "time",
): Scale {
  const values = data.map((row) => row[field]);
  const firstValue = values[0];

  // Infer scale type if not provided
  const type = scaleType ?? inferScaleType(firstValue);

  if (type === "band") {
    const categories = [...new Set(values.map(String))];
    return createBandScale(categories, range);
  }

  if (type === "time") {
    const dates = values.map((v) => (v instanceof Date ? v : new Date(String(v))));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    return createTimeScale([minDate, maxDate], range);
  }

  if (type === "log") {
    const numbers = values.map((v) => (typeof v === "number" ? v : parseFloat(String(v)))).filter((n) => n > 0);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    return createLogScale([min, max], range);
  }

  // Linear (default)
  const numbers = values.map((v) => (typeof v === "number" ? v : parseFloat(String(v))));
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return createLinearScale([min, max], range);
}
