/**
 * The design system. About thirty lines of constants that decide whether
 * output looks considered or looks generated.
 *
 * M0 uses only what the walking skeleton needs. The full palette lands in M2.
 * M5 (decision 0007) adds named theme VARIANTS -- dark, light, print --
 * without touching a single existing export. Everything below this comment,
 * up to `THEMES`, is unchanged and IS the "dark" variant; `theme`, `palette`,
 * `roles`, `connector` and `typeScale` keep meaning exactly what they meant
 * before, so every caller that imports them directly keeps working, and
 * every existing fixture renders byte-identical SVG. Variant selection is
 * additive: `resolveTheme()` and `THEMES` are the only new surface.
 */

export const theme = {
  canvas: {
    background: "#0F1115",
    padding: 32,
  },

  block: {
    fill: "#171A21",
    stroke: "#3D4757",
    strokeWidth: 2,
    radius: 6,
    padding: 14,
  },

  text: {
    /**
     * Named identically in the HTML mirror and in the exported SVG, so the
     * measured font is the drawn font. A renderer without these faces falls
     * back and metrics shift — that is a known M0 limitation, recorded in the
     * manifest rather than hidden.
     */
    family: '"Segoe UI", "Noto Sans", system-ui, sans-serif',
    size: 15,
    /** Unitless, so it scales with font-size. */
    lineHeight: 1.45,
    color: "#E6E9EF",
  },
} as const;

/** Ink colours. Small and saturated; never more than a handful in one figure. */
export const palette = {
  blue: "#5B8DEF",
  yellow: "#E9C46A",
  red: "#E76F51",
  green: "#4CAF7D",
  /**
   * `magenta`, not `teal` (`#48A9A6`, removed by decision 0007). Teal sat
   * only 27.7-30.4 apart from `green` under simulated deuteranopia and
   * protanopia -- below the 40 this project treats as distinguishable (see
   * colour/colourblind.ts) -- which `categorical-colours-distinguishable`
   * caught the first time it ran against the chart preset's own legend.
   * Renamed rather than kept-but-recoloured: a constant called `teal` that
   * is actually magenta is its own kind of bug.
   */
  magenta: "#D6558C",
} as const;

/**
 * Roles, not colours.
 *
 * A spec says what a block *is* — the primary thing, a warning, an aside — and
 * the design system decides how that looks. Specs that name hex codes cannot be
 * restyled, cannot be made accessible later, and drift apart figure by figure.
 */
export const roles = {
  default: { fill: theme.block.fill, stroke: theme.block.stroke, text: theme.text.color },
  primary: { fill: "#16243D", stroke: palette.blue, text: "#DCE8FF" },
  accent: { fill: "#2A2418", stroke: palette.yellow, text: "#F6ECD2" },
  warning: { fill: "#2E1B16", stroke: palette.red, text: "#FBDDD3" },
  muted: { fill: "#14161B", stroke: "#2A313D", text: "#9AA4B2" },
  /** Callouts sit on top of a figure, so they carry no fill of their own. */
  callout: { fill: "transparent", stroke: "transparent", text: "#E6E9EF" },
} as const;

export type Role = keyof typeof roles;

/** Connectors are ink, not furniture: thinner than a block edge, and quieter. */
export const connector = {
  stroke: "#6B7789",
  strokeWidth: 1.75,
  /** Arrowhead length along the line; width is 60% of it. */
  arrowSize: 9,
  /** Gap left between a box edge and the line that touches it. */
  gap: 3,
} as const;

/** Type scale. One step up for titles, one down for annotations. */
export const typeScale = {
  title: 19,
  body: theme.text.size,
  annotation: 13,
} as const;

// ---------------------------------------------------------------------------
// Named theme variants (decision 0007).
//
// `dark` below is not a new palette -- it is the constants above, reassembled
// into one object so a variant can be selected by name. Its values are the
// exact same references as `theme`, `palette`, `roles`, `connector` and
// `typeScale`, so `resolveTheme("dark")` (the default whenever a spec is
// silent) produces output identical to every fixture rendered before this
// decision existed.
//
// `light` and `print` are new palettes, not derived by inverting `dark`.
// Inverting a palette preserves its *relationships* (still N roles, still one
// ink colour per role) but not its *legibility* -- a mechanically inverted
// dark palette routinely fails contrast on saturated fills, which is exactly
// the defect this decision exists to make checkable. Every text/fill and
// ink/canvas pair in both new palettes was verified against WCAG AA
// (>=4.5:1) before being committed here; `contrast-sufficient` in checks.ts
// re-verifies it on every render, so this comment is documentation, not the
// source of truth.
// ---------------------------------------------------------------------------

export type ThemeName = "dark" | "light" | "print";

export type RoleColours = { fill: string; stroke: string; text: string };

export type ThemeDefinition = {
  name: ThemeName;
  canvas: { background: string; padding: number };
  text: { family: string; size: number; lineHeight: number; color: string };
  roles: Record<Role, RoleColours>;
  connector: { stroke: string; strokeWidth: number; arrowSize: number; gap: number };
  typeScale: { title: number; body: number; annotation: number };
};

const lightPalette = {
  blue: "#3966C9",
  yellow: "#A9790A",
  red: "#C23B21",
  green: "#2E8B57",
  teal: "#2C7A78",
} as const;

const lightRoles: Record<Role, RoleColours> = {
  default: { fill: "#FFFFFF", stroke: "#C7CCD6", text: "#1A1D23" },
  primary: { fill: "#E8EEFC", stroke: lightPalette.blue, text: "#1B2A4A" },
  accent: { fill: "#FBF3DC", stroke: lightPalette.yellow, text: "#4A3600" },
  warning: { fill: "#FCE7E2", stroke: lightPalette.red, text: "#5C160A" },
  muted: { fill: "#F0F1F4", stroke: "#C7CCD6", text: "#5B6472" },
  callout: { fill: "transparent", stroke: "transparent", text: "#1A1D23" },
};

/**
 * Print keeps every role's stroke and text ink but drops the tinted fills:
 * ink-economical is a real print convention, not an aesthetic default, and it
 * happens to make every text/fill pair near-black-on-white, which is the
 * highest-margin contrast this design system can produce.
 */
const printRoles: Record<Role, RoleColours> = {
  default: { fill: "#FFFFFF", stroke: "#444444", text: "#111111" },
  primary: { fill: "#FFFFFF", stroke: "#1B4F9C", text: "#0B2C5C" },
  accent: { fill: "#FFFFFF", stroke: "#8A6100", text: "#4A3600" },
  warning: { fill: "#FFFFFF", stroke: "#A32F17", text: "#5C160A" },
  muted: { fill: "#FFFFFF", stroke: "#6B7280", text: "#3F444C" },
  callout: { fill: "transparent", stroke: "transparent", text: "#111111" },
};

export const THEMES: Record<ThemeName, ThemeDefinition> = {
  dark: {
    name: "dark",
    canvas: theme.canvas,
    text: theme.text,
    roles,
    connector,
    typeScale,
  },
  light: {
    name: "light",
    canvas: { background: "#F7F8FA", padding: theme.canvas.padding },
    text: { ...theme.text, color: "#1A1D23" },
    roles: lightRoles,
    connector: { ...connector, stroke: "#6B7280" },
    typeScale,
  },
  print: {
    name: "print",
    canvas: { background: "#FFFFFF", padding: theme.canvas.padding },
    text: { ...theme.text, color: "#111111" },
    roles: printRoles,
    connector: { ...connector, stroke: "#444444" },
    typeScale,
  },
};

/** The active theme for a render. Unset or unknown resolves to `dark`. */
export function resolveTheme(name?: ThemeName): ThemeDefinition {
  return THEMES[name ?? "dark"] ?? THEMES.dark;
}
