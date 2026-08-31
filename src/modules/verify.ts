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
import { WCAG_AA_NORMAL, compositeOver, contrastRatio, parseColour } from "../colour/contrast.ts";
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
  /**
   * Of the strokes this element CLAIMED to lie on (`ModuleElement.on`), the
   * ones it actually does. A claimed id missing from here is a relation the
   * drawing refutes.
   */
  onClaimed?: string[];
  /** This element's own computed fill, when it has one. A label's ink colour. */
  ink?: string;
  /**
   * The filled surfaces beneath this label, one stack per sample point,
   * ordered BOTTOM TO TOP so the caller can composite in paint order.
   *
   * Measured rather than declared, and gathered from every filled shape in the
   * document rather than only the ones the manifest names -- an undeclared
   * background rect covers a label exactly as thoroughly as a declared one,
   * and scoring against a surface that is not there is the failure this check
   * exists to catch.
   */
  substrates?: string[][];
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
      // Any kind may claim a relation, not only labels: the marker on a curve
      // is a feature, and the whole point of the claim is that the module's
      // own arithmetic put it there.
      claimedOn: element.on ?? [],
      measureContrast: element.kind === "label",
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
  requests: {
    id: string;
    owner: string | null;
    testStrokes: string[];
    claimedOn: string[];
    measureContrast: boolean;
  }[],
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

  // Every fillable shape in the document, in PAINT ORDER (document order is
  // paint order in SVG). Not the declared ones: a label sits on whatever is
  // actually painted beneath it, and a module that draws an undeclared
  // background rect covers its labels exactly as thoroughly as a declared one.
  // Text is excluded -- it is ink over a surface, never the surface itself.
  const surfaces = Array.from(
    svg.querySelectorAll<SVGGraphicsElement>(
      "rect, circle, ellipse, polygon, path",
    ),
  ).filter((node) => typeof (node as unknown as SVGGeometryElement).isPointInFill === "function");

  /** A CSS opacity string as a number, defaulting to fully opaque. */
  const opacityOf = (value: string): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  };

  /**
   * `colour` carrying `alpha`, as an rgba() string the caller can composite.
   *
   * Only the element's OWN fill-opacity and opacity are folded in. Opacity on
   * an ancestor <g> applies to the group as a rendered whole and is not
   * recoverable per element; a module that dims a whole layer that way will
   * have its labels scored against the undimmed colours underneath.
   */
  const withAlpha = (colour: string, alpha: number): string => {
    if (alpha >= 1) return colour;
    const parts = /^rgba?\(([^)]+)\)$/.exec(colour.trim());
    if (!parts) return colour;
    const nums = parts[1]!.split(/[,\s/]+/).filter((t) => t !== "").map(Number);
    const [r, g, b, a = 1] = nums;
    if (![r, g, b].every((n) => Number.isFinite(n))) return colour;
    return `rgba(${r}, ${g}, ${b}, ${a * alpha})`;
  };

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

    // A bounding-box test is useless here: a curve's bbox covers the whole
    // plot, so every label would "overlap" it. What matters is whether the
    // element sits on the drawn INK, and the browser can answer that exactly —
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

    /**
     * Ids from `candidates` whose drawn stroke any sample point lands on.
     *
     * `descend` decides what happens when a declared id names a <g> rather
     * than a drawable -- which both the map's movement arrows and the
     * reaction module's arrow do, because the id has to name the whole arrow.
     * A <g> has no isPointInStroke.
     *
     * KNOWN GAP, recorded rather than quietly fixed: with descend=false a
     * grouped decoration is silently exempt from module-labels-clear-of-
     * strokes, which is the not-applicable-never-pass rule broken inside a
     * check that goes on reporting "pass". Turning the descent on for that
     * check surfaces two real collisions (campaign arrows crossing the
     * nordland and Polvia names) and two artefacts of sampling a glyph box's
     * empty corners (a hashed stereo wedge clipping the corner of an "OH").
     * Separating those needs a sampling policy decision for strokes and a
     * reroute in the map's arrow data; it is its own change, not a rider on
     * this one. The relational check below is new and has no legacy
     * behaviour to preserve, so it descends.
     */
    const strokesUnder = (candidates: string[], descend: boolean): string[] => {
      const on: string[] = [];
      for (const strokeId of candidates) {
        const target = find(strokeId);
        if (!target) continue;
        const self = target as unknown as SVGGeometryElement;
        const drawable = typeof self.isPointInStroke === "function";
        if (!drawable && !descend) continue;
        const parts: SVGGeometryElement[] = drawable
          ? [self]
          : Array.from(
              target.querySelectorAll<SVGGraphicsElement>("path, line, polyline, polygon, rect, circle, ellipse"),
            ).map((node) => node as unknown as SVGGeometryElement);
        const hit = parts.some((geo) => {
          if (typeof geo.isPointInStroke !== "function") return false;
          const partCTM = (geo as unknown as SVGGraphicsElement).getScreenCTM();
          const toTarget = partCTM ? partCTM.inverse().multiply(rootCTM) : null;
          return samples.some(([x, y]) => {
            const point = toTarget
              ? new DOMPoint(x, y).matrixTransform(toTarget)
              : new DOMPoint(x, y);
            return geo.isPointInStroke(point);
          });
        });
        if (hit) on.push(strokeId);
      }
      return on;
    };

    if (request.testStrokes.length > 0) {
      const on = strokesUnder(request.testStrokes, false);
      if (on.length > 0) entry.onStrokes = on;
    }

    // The same instrument with its sense inverted: here a hit is what the
    // module CLAIMED, and a miss is the failure.
    if (request.claimedOn.length > 0) {
      entry.onClaimed = strokesUnder(request.claimedOn, true);
    }

    if (request.measureContrast) {
      const own = window.getComputedStyle(element).fill;
      if (own && own !== "none") entry.ink = own;

      // Five points along the label's HORIZONTAL MIDLINE, not its bounding-box
      // corners. A glyph box is mostly empty at the corners -- ascenders and
      // descenders leave the four corners bare -- so a shape clipping one
      // corner is not a surface under any ink, and sampling there fails
      // legible figures. A molecule's stereo wedge, filled in the same colour
      // as the atom labels, is exactly that: it grazed one corner of "OH" and
      // reported a flawless-looking 1.00:1 for a label sitting on a dark
      // background it was perfectly readable against.
      //
      // Horizontally the probes stay inside the middle half of the advance
      // width. The extreme ends of a text bbox are side bearings -- blank by
      // construction -- so a neighbouring shape clipping the last few pixels
      // of the box is not under any glyph, and scoring a label against it
      // fails figures a reader has no trouble with. The stated cost: a label
      // whose OUTERMOST character alone strays onto an illegible surface is
      // not caught here. That is a smaller error than the alternative, and it
      // is the same overhang module-label-within-feature already reports.
      const midY = box.y + box.height / 2;
      const probes: [number, number][] = [0.25, 0.375, 0.5, 0.625, 0.75].map((t) => [
        box.x + box.width * t,
        midY,
      ]);
      entry.substrates = probes.map(([x, y]) => {
        const stack: string[] = [];
        for (const surface of surfaces) {
          // A label is never its own substrate. This is not a corner case:
          // RDKit draws atom labels as glyph OUTLINES, so "O" is a <path> that
          // sits in the surface list and hit-tests true against its own ink,
          // reporting a flawless 1.00:1 against itself. The element and
          // anything inside it are excluded, in both directions -- a label
          // wrapped in its own <g> would otherwise do the same thing.
          if (surface === element || element.contains(surface) || surface.contains(element)) {
            continue;
          }
          // Substrate means painted UNDER. Document order is paint order, so
          // anything after the label is drawn on top of it and is not what
          // the label sits on. The campaign map draws its movement arrows
          // after the territory names: scoring a label against an arrow that
          // covers it read as a 1.71:1 contrast failure for a label whose
          // own ground is a pale blue territory. An arrow over a name is a
          // real problem and a different one -- it is occlusion, which
          // module-labels-clear-of-strokes is the check for.
          if (
            (element.compareDocumentPosition(surface) & Node.DOCUMENT_POSITION_PRECEDING) === 0
          ) {
            continue;
          }
          const geo = surface as unknown as SVGGeometryElement;
          const surfaceCTM = surface.getScreenCTM();
          const toSurface = surfaceCTM ? surfaceCTM.inverse().multiply(rootCTM) : null;
          const point = toSurface
            ? new DOMPoint(x, y).matrixTransform(toSurface)
            : new DOMPoint(x, y);
          if (!geo.isPointInFill(point)) continue;
          const style = window.getComputedStyle(surface);
          const fill = style.fill;
          if (!fill || fill === "none") continue;
          // `fill` alone is a lie about what is painted. An arrowhead drawn
          // fill="#0F1115" opacity="0.75" reports its fill as fully opaque
          // near-black, and treating it as the ground put the campaign map's
          // Polvia label at 1.00:1 against a surface that is in fact a
          // three-quarter wash over a pale blue territory. Both opacities
          // fold into the alpha so the layer composites the way it paints.
          const alpha = opacityOf(style.fillOpacity) * opacityOf(style.opacity);
          stack.push(withAlpha(fill, alpha));
        }
        return stack;
      });
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

  // --- module-feature-on-its-stroke ----------------------------------------
  // The only check here that is about MEANING. Everything above asks whether
  // the figure is well formed; this asks whether a relation the module
  // asserted about its own arithmetic survives measurement of what it drew.
  const claiming = output.elements.filter(
    (element) => element.on !== undefined && element.on.length > 0,
  );
  coverage["module-feature-on-its-stroke"] = claiming.length;
  const broken: string[] = [];
  const unresolved: string[] = [];
  for (const element of claiming) {
    const measured = byId.get(element.id);
    // A claim about an element that never resolved is already reported by
    // module-ids-resolve; saying it twice would double-count one defect.
    if (!measured?.found) continue;
    const held = new Set(measured.onClaimed ?? []);
    for (const strokeId of element.on!) {
      if (held.has(strokeId)) continue;
      if (!elementById.has(strokeId)) {
        unresolved.push(`${element.id} claims to lie on ${strokeId}, which is not a declared element`);
      } else {
        broken.push(`${element.id} does not lie on ${strokeId}`);
      }
    }
  }
  const failures = [...broken, ...unresolved];
  checks.push(
    claiming.length === 0
      ? note("module-feature-on-its-stroke", "figure", "not-applicable", 0)
      : failures.length === 0
        ? note("module-feature-on-its-stroke", "figure", "pass", claiming.length)
        : {
            id: "module-feature-on-its-stroke",
            target: "figure",
            status: "fail",
            examined: claiming.length,
            detail:
              `${failures.join("; ")}. ` +
              "The drawing refutes a relation the module asserted about it.",
          },
  );

  // --- module-contrast-sufficient ------------------------------------------
  // Decision 0005 excluded the content-box checks because a bare SVG has no
  // box model. Contrast was never excluded on that ground, and once the
  // substrate is resolved geometrically it needs only two things a foreign
  // SVG has: where the ink is, and what is painted under it.
  const contrastLabels = output.elements.filter((element) => element.kind === "label");
  const scored: { id: string; ratio: number; against: string }[] = [];
  const unaccounted: string[] = [];
  for (const label of contrastLabels) {
    const measured = byId.get(label.id);
    if (!measured?.found || measured.ink === undefined || measured.substrates === undefined) {
      continue;
    }
    let worst: { ratio: number; against: string } | null = null;
    let accountable = false;
    for (const stack of measured.substrates) {
      const substrate = compositeStack(stack);
      // No opaque ground anywhere under this point: the label is over the
      // page, not over anything the module drew, and any ratio computed here
      // would be a guess dressed as a measurement.
      if (substrate === null) continue;
      accountable = true;
      const ratio = contrastRatio(measured.ink, substrate);
      if (ratio === null) continue;
      if (worst === null || ratio < worst.ratio) worst = { ratio, against: substrate };
    }
    if (!accountable || worst === null) {
      unaccounted.push(label.id);
      continue;
    }
    scored.push({ id: label.id, ratio: worst.ratio, against: worst.against });
  }
  coverage["module-contrast-sufficient"] = scored.length;
  const illegible = scored.filter((entry) => entry.ratio < WCAG_AA_NORMAL);
  const unaccountedNote =
    unaccounted.length === 0
      ? ""
      : ` ${unaccounted.length} label(s) sit over no surface this module drew and were not scored: ${unaccounted.join(", ")}.`;
  checks.push(
    scored.length === 0
      ? note("module-contrast-sufficient", "figure", "not-applicable", 0)
      : illegible.length === 0
        ? {
            id: "module-contrast-sufficient",
            target: "figure",
            status: "pass",
            examined: scored.length,
            detail: `examined ${scored.length} label(s); worst ${Math.min(...scored.map((e) => e.ratio)).toFixed(2)}:1.${unaccountedNote}`,
          }
        : {
            id: "module-contrast-sufficient",
            target: "figure",
            status: "fail",
            examined: scored.length,
            detail:
              illegible
                .map((e) => `${e.id} is ${e.ratio.toFixed(2)}:1 against ${e.against}`)
                .join("; ") + `, below ${WCAG_AA_NORMAL}:1.${unaccountedNote}`,
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

  return { checks, coverage };
}

/**
 * One sample point's painted stack, resolved to the single colour a reader
 * actually sees there. `stack` is bottom-to-top, so this walks it in paint
 * order.
 *
 * Returns null when the stack never reaches an OPAQUE layer. That is the
 * honest answer, not a defect to paper over: the label is sitting on the page
 * rather than on anything the module drew, and this project has been here
 * before -- two checks stood down on one figure and the render came back
 * green. A ratio invented against an assumed white is exactly that failure
 * with better manners.
 */
function compositeStack(stack: string[]): string | null {
  let base: string | null = null;
  for (const layer of stack) {
    const parsed = parseColour(layer);
    if (parsed === null) continue;
    if (base === null) {
      // Nothing opaque underneath yet, so a translucent layer has nothing to
      // blend with and cannot establish the ground.
      if (parsed.a >= 1) base = layer;
      continue;
    }
    base = compositeOver(layer, base) ?? base;
  }
  return base;
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
