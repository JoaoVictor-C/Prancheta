/**
 * Scale abstraction layer (M8, stage 5, step 25).
 *
 * Maps data values (numbers, dates, categories) to canvas coordinates with
 * tick generation. One mechanism serves tick-label collision checks (step 26),
 * data binding for chart (step 27), and dimension annotation (step 29).
 */

export type ScaleKind = "linear" | "log" | "band" | "time";

export type TickPolicy = {
  /** Target number of ticks (actual count may differ for readability). */
  count: number;
  /** Minimum spacing between ticks in pixels. */
  minSpacing?: number;
  /** Format function for tick labels. */
  format?: (value: number | Date) => string;
};

export type Scale = {
  kind: ScaleKind;
  /** Data domain: [min, max] for continuous scales, categories for band. */
  domain: [number, number] | [Date, Date] | string[];
  /** Canvas range: [start, end] in pixels. */
  range: [number, number];
  /** Map a data value to a canvas coordinate. */
  scale: (value: number | Date | string) => number;
  /** Inverse: map a canvas coordinate back to a data value. */
  invert?: (pixel: number) => number | Date;
  /** Generate tick positions and labels. */
  ticks: (policy: TickPolicy) => Array<{ value: number | Date | string; position: number; label: string }>;
};

/**
 * Create a linear scale: maps [min, max] to [start, end] with linear interpolation.
 */
export function createLinearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const slope = (r1 - r0) / (d1 - d0);

  return {
    kind: "linear",
    domain,
    range,
    scale: (value: number | Date | string) => {
      const v = typeof value === "number" ? value : parseFloat(String(value));
      return r0 + slope * (v - d0);
    },
    invert: (pixel: number) => d0 + (pixel - r0) / slope,
    ticks: (policy: TickPolicy) => {
      const targetCount = policy.count;
      const span = d1 - d0;

      // Nice tick intervals: powers of 10 times 1, 2, or 5
      const roughInterval = span / targetCount;
      const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
      const normalized = roughInterval / magnitude;
      const niceInterval = magnitude * (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10);

      const start = Math.ceil(d0 / niceInterval) * niceInterval;
      const ticks: Array<{ value: number; position: number; label: string }> = [];

      for (let value = start; value <= d1; value += niceInterval) {
        const position = r0 + slope * (value - d0);

        // Check minimum spacing if specified
        if (policy.minSpacing && ticks.length > 0) {
          const prevPosition = ticks[ticks.length - 1].position;
          if (Math.abs(position - prevPosition) < policy.minSpacing) {
            continue;
          }
        }

        const label = policy.format ? policy.format(value) : String(value);
        ticks.push({ value, position, label });
      }

      return ticks;
    },
  };
}

/**
 * Create a logarithmic scale: maps [min, max] to [start, end] with log interpolation.
 * Domain values must be positive.
 */
export function createLogScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;

  if (d0 <= 0 || d1 <= 0) {
    throw new Error("Log scale domain must contain only positive values");
  }

  const logD0 = Math.log10(d0);
  const logD1 = Math.log10(d1);
  const slope = (r1 - r0) / (logD1 - logD0);

  return {
    kind: "log",
    domain,
    range,
    scale: (value: number | Date | string) => {
      const v = typeof value === "number" ? value : parseFloat(String(value));
      if (v <= 0) return r0; // Clamp non-positive to start
      return r0 + slope * (Math.log10(v) - logD0);
    },
    invert: (pixel: number) => Math.pow(10, logD0 + (pixel - r0) / slope),
    ticks: (policy: TickPolicy) => {
      const ticks: Array<{ value: number; position: number; label: string }> = [];
      const logMin = Math.floor(logD0);
      const logMax = Math.ceil(logD1);

      for (let exponent = logMin; exponent <= logMax; exponent++) {
        const value = Math.pow(10, exponent);
        if (value < d0 || value > d1) continue;

        const position = r0 + slope * (exponent - logD0);
        const label = policy.format ? policy.format(value) : String(value);
        ticks.push({ value, position, label });
      }

      return ticks;
    },
  };
}

/**
 * Create a band scale: maps categories to equally-spaced bands within [start, end].
 */
export function createBandScale(domain: string[], range: [number, number], padding = 0.1): Scale {
  const [r0, r1] = range;
  const n = domain.length;
  const step = (r1 - r0) / (n + padding * (n - 1));
  const bandwidth = step * (1 - padding);

  return {
    kind: "band",
    domain,
    range,
    scale: (value: number | Date | string) => {
      const index = domain.indexOf(String(value));
      if (index === -1) return r0; // Unknown category maps to start
      return r0 + index * (step + padding * step) + bandwidth / 2;
    },
    ticks: (policy: TickPolicy) => {
      return domain.map((category, index) => {
        const position = r0 + index * (step + padding * step) + bandwidth / 2;
        const label = policy.format ? policy.format(category as any) : category;
        return { value: category, position, label };
      });
    },
  };
}

/**
 * Create a time scale: maps [startDate, endDate] to [start, end] with time-aware ticks.
 */
export function createTimeScale(domain: [Date, Date], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t0 = d0.getTime();
  const t1 = d1.getTime();
  const slope = (r1 - r0) / (t1 - t0);

  return {
    kind: "time",
    domain,
    range,
    scale: (value: number | Date | string) => {
      const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
      return r0 + slope * (time - t0);
    },
    invert: (pixel: number) => new Date(t0 + (pixel - r0) / slope),
    ticks: (policy: TickPolicy) => {
      const targetCount = policy.count;
      const spanMs = t1 - t0;

      // Choose time intervals: seconds, minutes, hours, days, months, years
      const intervals = [
        { ms: 1000, format: (d: Date) => d.toLocaleTimeString() }, // 1 second
        { ms: 60 * 1000, format: (d: Date) => d.toLocaleTimeString() }, // 1 minute
        { ms: 60 * 60 * 1000, format: (d: Date) => d.toLocaleTimeString() }, // 1 hour
        { ms: 24 * 60 * 60 * 1000, format: (d: Date) => d.toLocaleDateString() }, // 1 day
        { ms: 30 * 24 * 60 * 60 * 1000, format: (d: Date) => d.toLocaleDateString() }, // ~1 month
        { ms: 365 * 24 * 60 * 60 * 1000, format: (d: Date) => String(d.getFullYear()) }, // 1 year
      ];

      const roughInterval = spanMs / targetCount;
      const chosen = intervals.find((i) => i.ms >= roughInterval) || intervals[intervals.length - 1];

      const ticks: Array<{ value: Date; position: number; label: string }> = [];
      for (let time = Math.ceil(t0 / chosen.ms) * chosen.ms; time <= t1; time += chosen.ms) {
        const date = new Date(time);
        const position = r0 + slope * (time - t0);
        const label = policy.format ? policy.format(date) : chosen.format(date);
        ticks.push({ value: date, position, label });
      }

      return ticks;
    },
  };
}
