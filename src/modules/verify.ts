/**
 * Verifying a figure whose geometry the core did not compute.
 *
 * Everything measured here is normalised into ONE canvas space before any
 * check runs. That is not tidiness — it is correctness. `getBBox` and
 * `isPointInFill` both work in an element's OWN user space, and a projected
 * map is exactly the figure where transforms are everywhere: a group wraps the
 * paths, labels may sit in a different chain. Compare two boxes from different
 * spaces and the answer is not an error, it is a confident wrong boolean.
 *
 * Containment is answered by the browser, not by us. `isPointInFill` hit-tests
 * a concave coastline with holes using the same rasteriser that draws it.
 * Parsing path data instead would mean writing a bezier flattener and
 * maintaining a second geometry engine that can disagree with the one that
 * renders — the exact divergence this protocol exists to prevent.
 */

import type { Browser } from "playwright";
import type { Check, CheckId } from "../checks.ts";
import { EPSILON } from "../checks.ts";
import type { Rect } from "../ir/types.ts";
import { geometryTolerance } from "./protocol.ts";
import type { ModuleElement, ModuleOutput } from "./protocol.ts";

export type MeasuredModuleElement = {
  id: string;
  found: boolean;
  /** Canvas-space rect. Absent when the id did not resolve. */
  box?: Rect;
  /** Hit-test results against the owner named in the manifest. */
  centreInOwner?: boolean;
  cornersInOwner?: boolean;
  /** Ids of drawn strokes this element's box sits on top of. */
  onStrokes?: string[];
};

export type ModuleVerification = {
  canvas: { width: number; height: number };
  measured: MeasuredModuleElement[];
  checks: Check[];
  /** Elements each check actually examined. Zero means not-applicable. */
  coverage: Record<string, number>;
};

export async function verifyModuleFigure(
  browser: Browser,
  output: ModuleOutput,
): Promise<ModuleVerification> {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
         html, body { margin: 0; padding: 0; }
         svg { display: block; }
       </style></head><body>${output.svg}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);

    const strokeIds = output.elements
      .filter((element) => element.kind === "feature" || element.kind === "decoration")
      .map((element) => element.id);
    const requests = output.elements.map((element) => ({
      id: element.id,
      owner: element.kind === "label" ? (element.owner ?? null) : null,
      testStrokes: element.kind === "label" ? strokeIds : [],
    }));

    const result = await page.evaluate(measureModuleInPage, requests);
    const checks = runModuleChecks(output, result);
    return {
      canvas: result.canvas,
      measured: result.measured,
      checks: checks.checks,
      coverage: checks.coverage,
    };
  } finally {
    await page.close();
  }
}

/** Runs in the page. Self-contained: no imports, no closure. */
export function measureModuleInPage(
  requests: { id: string; owner: string | null; testStrokes: string[] }[],
): { canvas: { width: number; height: number }; measured: MeasuredModuleElement[] } {
  const round = (n: number): number => Math.round(n * 100) / 100;
  const svg = document.querySelector("svg");
  if (!svg) throw new Error("module output contains no <svg> element");

  const rootRect = svg.getBoundingClientRect();
  const rootCTM = svg.getScreenCTM();
  if (!rootCTM) throw new Error("root svg has no screen CTM");
  const toCanvas = rootCTM.inverse();

  /** Screen point -> canvas space. One conversion, at the boundary. */
  const screenToCanvas = (x: number, y: number): DOMPoint =>
    new DOMPoint(x, y).matrixTransform(toCanvas);

  const find = (id: string): SVGGraphicsElement | null =>
    svg.querySelector<SVGGraphicsElement>(`[data-pr-id="${CSS.escape(id)}"]`);

  const measured: MeasuredModuleElement[] = [];
  for (const request of requests) {
    const element = find(request.id);
    if (!element) {
      measured.push({ id: request.id, found: false });
      continue;
    }

    const rect = element.getBoundingClientRect();
    const topLeft = screenToCanvas(rect.left, rect.top);
    const bottomRight = screenToCanvas(rect.right, rect.bottom);
    const box = {
      x: round(Math.min(topLeft.x, bottomRight.x)),
      y: round(Math.min(topLeft.y, bottomRight.y)),
      width: round(Math.abs(bottomRight.x - topLeft.x)),
      height: round(Math.abs(bottomRight.y - topLeft.y)),
    };

    const entry: MeasuredModuleElement = { id: request.id, found: true, box };

    if (request.owner !== null) {
      const owner = find(request.owner);
      const geometry = owner as unknown as SVGGeometryElement | null;
      if (geometry && typeof geometry.isPointInFill === "function") {
        // The owner hit-tests in ITS user space, so convert back out of canvas
        // space through the owner's own CTM rather than assuming they match.
        const ownerCTM = owner!.getScreenCTM();
        const canvasToOwner = ownerCTM ? ownerCTM.inverse().multiply(rootCTM) : null;
        const toOwner = (x: number, y: number): DOMPoint =>
          canvasToOwner ? new DOMPoint(x, y).matrixTransform(canvasToOwner) : new DOMPoint(x, y);

        const centre = toOwner(box.x + box.width / 2, box.y + box.height / 2);
        entry.centreInOwner = geometry.isPointInFill(centre);

        const corners: [number, number][] = [
          [box.x, box.y],
          [box.x + box.width, box.y],
          [box.x, box.y + box.height],
          [box.x + box.width, box.y + box.height],
        ];
        entry.cornersInOwner = corners.every(([x, y]) => geometry.isPointInFill(toOwner(x, y)));
      }
    }

    if (request.testStrokes.length > 0) {
      // A bounding-box test is useless here: a curve's bbox covers the whole
      // plot, so every label would "overlap" it. What matters is whether the
      // label sits on the drawn INK, and the browser can answer that exactly —
      // isPointInStroke, using the element's real stroke width.
      const samples: [number, number][] = [
        [box.x + box.width / 2, box.y + box.height / 2],
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
        [box.x + box.width / 2, box.y],
        [box.x + box.width / 2, box.y + box.height],
        [box.x, box.y + box.height / 2],
        [box.x + box.width, box.y + box.height / 2],
      ];
      const on: string[] = [];
      for (const strokeId of request.testStrokes) {
        const target = find(strokeId);
        const geo = target as unknown as SVGGeometryElement | null;
        if (!geo || typeof geo.isPointInStroke !== "function") continue;
        const targetCTM = target!.getScreenCTM();
        const toTarget = targetCTM ? targetCTM.inverse().multiply(rootCTM) : null;
        const hit = samples.some(([x, y]) => {
          const point = toTarget
            ? new DOMPoint(x, y).matrixTransform(toTarget)
            : new DOMPoint(x, y);
          return geo.isPointInStroke(point);
        });
        if (hit) on.push(strokeId);
      }
      if (on.length > 0) entry.onStrokes = on;
    }

    measured.push(entry);
  }

  return {
    canvas: { width: round(rootRect.width), height: round(rootRect.height) },
    measured,
  };
}

// ---------------------------------------------------------------------------
// The module check set. Named apart from the core's checks WHERE THE METHOD
// DIFFERS, and only there — a bare SVG has no content boxes and no wrapped
// line boxes, so a check called text-fits-box would promise something it
// cannot deliver. content-within-canvas keeps its name: same method, same
// meaning, both worlds.
// ---------------------------------------------------------------------------

function runModuleChecks(
  output: ModuleOutput,
  result: { canvas: { width: number; height: number }; measured: MeasuredModuleElement[] },
): { checks: Check[]; coverage: Record<string, number> } {
  const checks: Check[] = [];
  const coverage: Record<string, number> = {};
  const byId = new Map(result.measured.map((entry) => [entry.id, entry]));
  const elementById = new Map(output.elements.map((element) => [element.id, element]));

  // --- module-ids-resolve --------------------------------------------------
  const missing = result.measured.filter((entry) => !entry.found).map((entry) => entry.id);
  coverage["module-ids-resolve"] = result.measured.length;
  checks.push(
    missing.length === 0
      ? note("module-ids-resolve", "figure", "pass", result.measured.length)
      : {
          id: "module-ids-resolve",
          target: "figure",
          status: "fail",
          detail:
            `${missing.length} declared id(s) have no element in the SVG: ${missing.join(", ")}. ` +
            "The module claimed something it did not draw.",
        },
  );

  // --- module-geometry-agrees ----------------------------------------------
  const declared = output.elements.filter((element) => element.declaredBox !== undefined);
  coverage["module-geometry-agrees"] = declared.length;
  const drifted: string[] = [];
  for (const element of declared) {
    const measured = byId.get(element.id);
    if (!measured?.box) continue;
    const claim = element.declaredBox!;
    const tolerance = geometryTolerance(measured.box);
    const delta = Math.max(
      Math.abs(claim.x - measured.box.x),
      Math.abs(claim.y - measured.box.y),
      Math.abs(claim.width - measured.box.width),
      Math.abs(claim.height - measured.box.height),
    );
    if (delta > tolerance) {
      drifted.push(
        `${element.id} (off by ${delta.toFixed(1)}px, tolerance ${tolerance.toFixed(1)}px)`,
      );
    }
  }
  checks.push(
    declared.length === 0
      ? note("module-geometry-agrees", "figure", "not-applicable", 0)
      : drifted.length === 0
        ? note("module-geometry-agrees", "figure", "pass", declared.length)
        : {
            id: "module-geometry-agrees",
            target: "figure",
            status: "fail",
            detail:
              `the module's own geometry disagrees with what it drew: ${drifted.join("; ")}. ` +
              "The file is the fact.",
          },
  );

  // --- module-label-within-feature ----------------------------------------
  const labels = output.elements.filter(
    (element) => element.kind === "label" && element.owner !== undefined,
  );
  coverage["module-label-within-feature"] = labels.length;
  const escaped: string[] = [];
  const overhanging: string[] = [];
  for (const label of labels) {
    const measured = byId.get(label.id);
    if (measured?.centreInOwner === false) {
      escaped.push(`${label.id} is not inside ${label.owner!}`);
    } else if (measured?.cornersInOwner === false) {
      // Centre inside, corners outside: the label belongs to its feature but
      // hangs over the edge. On a narrow region that is often unavoidable and
      // still readable, so it does not fail — but it is not the same as fitting,
      // and reporting only the pass would overstate what was verified.
      overhanging.push(label.id);
    }
  }
  const overhangNote =
    overhanging.length === 0
      ? ""
      : ` ${overhanging.length} label(s) sit inside their feature but overhang it: ${overhanging.join(", ")}.`;
  checks.push(
    labels.length === 0
      ? note("module-label-within-feature", "figure", "not-applicable", 0)
      : escaped.length === 0
        ? {
            id: "module-label-within-feature",
            target: "figure",
            status: "pass",
            examined: labels.length,
            detail: `examined ${labels.length} element(s); ${labels.length - overhanging.length} fully inside.${overhangNote}`,
          }
        : {
            id: "module-label-within-feature",
            target: "figure",
            status: "fail",
            examined: labels.length,
            detail: escaped.join("; ") + overhangNote,
          },
  );

  // --- module-labels-do-not-collide ---------------------------------------
  // EVERY label, not only owned ones. Ownership is what containment needs; a
  // collision does not care whether a label belongs to something. Scoping this
  // to owned labels left an entire figure's annotations unchecked the first
  // time a plot module declared labels that own nothing.
  const allLabels = output.elements.filter((element) => element.kind === "label");
  const boxes = allLabels
    .map((label) => ({ id: label.id, box: byId.get(label.id)?.box }))
    .filter((entry): entry is { id: string; box: Rect } => entry.box !== undefined);
  coverage["module-labels-do-not-collide"] = boxes.length;
  const collisions: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i]!.box, boxes[j]!.box)) {
        collisions.push(`${boxes[i]!.id} overlaps ${boxes[j]!.id}`);
      }
    }
  }
  checks.push(
    boxes.length === 0
      ? note("module-labels-do-not-collide", "figure", "not-applicable", 0)
      : collisions.length === 0
        ? note("module-labels-do-not-collide", "figure", "pass", boxes.length)
        : {
            id: "module-labels-do-not-collide",
            target: "figure",
            status: "fail",
            detail: collisions.join("; "),
          },
  );

  // --- module-labels-clear-of-strokes --------------------------------------
  coverage["module-labels-clear-of-strokes"] = allLabels.length;
  const sitting: string[] = [];
  for (const label of allLabels) {
    const measured = byId.get(label.id);
    const on = (measured?.onStrokes ?? []).filter((id) => id !== label.owner);
    if (on.length > 0) sitting.push(`${label.id} sits on ${on.join(", ")}`);
  }
  checks.push(
    allLabels.length === 0
      ? note("module-labels-clear-of-strokes", "figure", "not-applicable", 0)
      : sitting.length === 0
        ? note("module-labels-clear-of-strokes", "figure", "pass", allLabels.length)
        : {
            id: "module-labels-clear-of-strokes",
            target: "figure",
            status: "fail",
            examined: allLabels.length,
            detail: sitting.join("; "),
          },
  );

  // --- content-within-canvas: same method, so it keeps its name ------------
  const all = result.measured.filter((entry) => entry.box !== undefined);
  coverage["content-within-canvas"] = all.length;
  const outside = all
    .filter((entry) => {
      const box = entry.box!;
      return (
        box.x < -EPSILON ||
        box.y < -EPSILON ||
        box.x + box.width > result.canvas.width + EPSILON ||
        box.y + box.height > result.canvas.height + EPSILON
      );
    })
    .map((entry) => entry.id);
  checks.push(
    all.length === 0
      ? note("content-within-canvas", "figure", "not-applicable", 0)
      : outside.length === 0
        ? note("content-within-canvas", "figure", "pass", all.length)
        : {
            id: "content-within-canvas",
            target: "figure",
            status: "fail",
            detail: `${outside.join(", ")} extend past the canvas`,
          },
  );

  void elementById;
  return { checks, coverage };
}

/**
 * A check that examined nothing reports NOT-APPLICABLE, never "pass".
 *
 * The first version of this helper mapped both states to "pass" because the
 * Check type had nowhere else to put it — which would have made the protocol's
 * central promise a lie in its own implementation. The type gained a third
 * state instead.
 */
function note(
  id: CheckId,
  target: string,
  status: "pass" | "not-applicable",
  examined: number,
): Check {
  return {
    id,
    target,
    status,
    examined,
    detail:
      status === "not-applicable"
        ? "not applicable: no elements of this kind were declared"
        : `examined ${examined} element(s)`,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    a.x + a.width > b.x + EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    a.y + a.height > b.y + EPSILON
  );
}
