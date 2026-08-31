/**
 * The figure-module protocol (decision 0005).
 *
 * A module is a separate process, in any language, that renders a figure whose
 * geometry the core cannot compute — a map needs Shapely and pyproj inside its
 * layout loop, which is Python-native work.
 *
 * The split: THE MODULE DECLARES SEMANTICS, THE CORE MEASURES GEOMETRY.
 *
 * Semantics are not recoverable from rendered output. No amount of measurement
 * tells you that a given text is the label FOR a given region rather than a
 * title that happens to sit nearby — and ownership is exactly what the
 * interesting checks need. Geometry, conversely, is knowable by measurement,
 * and the core has the better instrument: the browser it already trusts.
 *
 * So a module may state what it drew and what each element means. It may not
 * certify that what it drew is correct. Nobody certifies their own work — the
 * same reason M0 re-rendered its SVG in resvg rather than trusting Chromium
 * about Chromium.
 */

export type ModuleElementKind = "feature" | "label" | "connector" | "decoration";

export type ModuleElement = {
  /** Must match a `data-pr-id` attribute in the returned SVG. */
  id: string;
  kind: ModuleElementKind;
  /** For a label: the id of the feature it names. */
  owner?: string;
  /** For a connector: the two element ids it joins. */
  joins?: [string, string];
  /** Free prose: what this element asserts. Recorded, never machine-checked. */
  claim?: string;
  /**
   * What the module BELIEVES it drew, in canvas coordinates. Optional, and
   * never used as input — it is checked against measurement. A module whose
   * internal model has drifted from its own output is a real and nasty bug,
   * and this is the only thing that catches it.
   */
  declaredBox?: { x: number; y: number; width: number; height: number };
  /**
   * Ids of drawn strokes this element claims to LIE ON.
   *
   * Every other claim in this protocol is about malformation: is the thing
   * where the module said it is, does a label escape its region, do two
   * labels collide. This one is about MEANING, and it is the only one that
   * is — because "the marker labelled `root` sits on the curve" is a claim
   * the module's own arithmetic can get wrong, and measuring the drawing
   * falsifies it.
   *
   * The instrument is the one `module-labels-clear-of-strokes` already uses,
   * with its sense inverted: `isPointInStroke` against the real stroke width,
   * in the target's own user space. Nothing new is measured; what changes is
   * which answer counts as a failure.
   *
   * STATE THE CONJUNCTION, NOT HALF OF IT. A root is on the curve AND on the
   * x axis; an LCL is on the parcel trace AND on the mixing line; a merge
   * crossbar meets both of its children. Declare one of a pair and a module
   * that computes wrongly, then draws consistently with its own error, still
   * passes: a bisection that returns the wrong x, plotted at f(x) rather than
   * at 0, sits exactly on the curve. Both relations together have no such
   * hiding place.
   *
   * What this cannot reach is unchanged and worth naming: a relation the
   * module never states is never checked, and a figure whose every stated
   * relation holds can still misrepresent its data. This narrows decision
   * 0005's malformation limit; it does not remove it.
   */
  on?: string[];
};

/**
 * An adjustable parameter the module exposes for repair.
 *
 * Stage 4 (M9): modules can be repaired, not merely inspected. A module
 * declares what can be adjusted (spacing, padding, label offsets) with bounds,
 * and the repair loop can re-invoke the module with amended values to resolve
 * collisions or other failures.
 */
export type ModuleParameter = {
  /** Parameter name (e.g., "row_gap", "padding", "min_label_offset"). */
  name: string;
  /** Current value. */
  value: number;
  /** Minimum allowed value (inclusive). */
  min: number;
  /** Maximum allowed value (inclusive). */
  max: number;
  /** Unit for human display (e.g., "px", "pt", "%"). Not interpreted by core. */
  unit?: string;
  /** Human-readable description of what this parameter controls. */
  description?: string;
};

export type ModuleOutput = {
  svg: string;
  elements: ModuleElement[];
  notes?: string[];
  /**
   * Adjustable parameters this module exposes. The core can re-invoke the
   * module with amended values (within declared bounds) to repair failed checks.
   * Optional — modules that don't support repair omit this.
   */
  parameters?: ModuleParameter[];
};

export type ModuleInput = {
  /** Whatever the module understands. The core does not interpret this. */
  spec: unknown;
  width: number;
  height: number;
  /**
   * Amended parameter values for repair. Keys are parameter names from a prior
   * invocation's `output.parameters[]`. The module applies these overrides,
   * within their declared bounds, and renders again.
   */
  parameterOverrides?: Record<string, number>;
};

/** Tolerance for module-geometry-agrees: relative, with an absolute floor. */
export function geometryTolerance(box: { width: number; height: number }): number {
  return Math.max(1, 0.02 * Math.max(box.width, box.height));
}

export function parseModuleOutput(value: unknown): ModuleOutput {
  if (typeof value !== "object" || value === null) {
    throw new Error("module output must be an object");
  }
  const output = value as Record<string, unknown>;
  if (typeof output.svg !== "string" || output.svg.trim() === "") {
    throw new Error("module output.svg must be a non-empty string");
  }
  if (!Array.isArray(output.elements)) {
    throw new Error("module output.elements must be an array");
  }
  for (const [index, raw] of output.elements.entries()) {
    const element = raw as Record<string, unknown>;
    if (typeof element.id !== "string" || element.id === "") {
      throw new Error(`module output.elements[${index}].id must be a non-empty string`);
    }
    const kinds: ModuleElementKind[] = ["feature", "label", "connector", "decoration"];
    if (!kinds.includes(element.kind as ModuleElementKind)) {
      throw new Error(
        `module output.elements[${index}].kind must be one of ${kinds.join(", ")}`,
      );
    }
    if (element.on !== undefined) {
      // Refused at the boundary rather than ignored downstream: an `on` that
      // is not a list of ids is a claim nobody can check, and a claim nobody
      // can check must not be able to reach a manifest that says "pass".
      if (!Array.isArray(element.on) || element.on.some((id) => typeof id !== "string" || id === "")) {
        throw new Error(
          `module output.elements[${index}].on must be an array of non-empty element ids`,
        );
      }
      if ((element.on as string[]).includes(element.id as string)) {
        throw new Error(
          `module output.elements[${index}].on names itself; an element lies on something else`,
        );
      }
    }
  }
  return output as unknown as ModuleOutput;
}
