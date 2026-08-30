/**
 * The pipeline:
 *
 *   spec -> HTML mirror -> Chromium lays out -> measure boxes and text lines
 *        -> checks -> [repair -> lay out again] -> SVG -> rasterise -> manifest
 *
 * The bracketed part is M1. It runs at most `maxPasses` times and is
 * guaranteed to terminate: every edit strictly grows one bounded quantity, so
 * no state can recur (see repair.ts).
 *
 * One browser and one page serve the whole run, re-laid-out per pass.
 */

import { chromium } from "playwright";
import type { Page } from "playwright";
import type { FigureSpec, LaidOutFigure, PlacedBox, PlacedElement, Point } from "./ir/types.ts";
import { normalise } from "./ir/normalise.ts";
import { applyStyle } from "./effects/styles.ts";
import { applyType } from "./typography-apply.ts";
import { buildHtml } from "./layout/html.ts";
import type { FontEmbedMode, HtmlOptions } from "./layout/html.ts";
import { lineNeedsTextFallback, loadOutlineFont } from "./export/fonts.ts";
import { rasterisePdf } from "./export/pdf.ts";
import type { PdfOptions } from "./export/pdf.ts";
import { buildConnectors, collectScenes, placeScenes } from "./layout/place.ts";
import { measureInPage } from "./layout/measure.ts";
import type { PageMeasurement } from "./layout/measure.ts";
import { quoteFamily, resolvePlatformFonts } from "./layout/fonts.ts";
import type { ResolvedFont } from "./layout/fonts.ts";
import { runChecks } from "./checks.ts";
import type { Check } from "./checks.ts";
import {
  applyEdits,
  isMonotone,
  newBudget,
  planCanvasRepairs,
  planRepairs,
  planWrapFallback,
} from "./repair.ts";
import type { RepairEdit } from "./repair.ts";
import { toSvg } from "./render/svg.ts";
import { rasterise } from "./render/raster.ts";
import { attachEffects } from "./effects/apply.ts";
import { attachCategoryGroups } from "./colour/apply.ts";
import { attachMotionWindows } from "./anim/apply.ts";
import { attachShapes } from "./geometry/apply.ts";
import { attachRotations, attachBoxRotation } from "./geometry/rotate.ts";
import { attachPaints } from "./paint/apply.ts";
import { buildManifest } from "./manifest.ts";
import type { Manifest } from "./manifest.ts";
import { resolveTheme } from "./theme.ts";

export type RenderResult = {
  figure: LaidOutFigure;
  svg: string;
  png: Buffer;
  /** Present only when `options.pdf` was set (decision 0008). */
  pdf?: Buffer;
  manifest: Manifest;
  /** The spec actually rendered — the input plus any repairs. */
  effectiveSpec: FigureSpec;
};

export type RenderOptions = {
  /** PNG pixel density. The SVG is resolution-independent regardless. */
  scale?: number;
  /** Set false to see the figure exactly as authored, defects included. */
  repair?: boolean;
  /** Layout passes, including the first. Default 3. */
  maxPasses?: number;
  /** How far a node may grow, as a multiple of its original size. Default 3. */
  maxScale?: number;
  /**
   * "embed" inlines the bundled font as a base64 @font-face; "outline"
   * converts every glyph to a filled path with zero runtime font dependency.
   * Default "none": renders exactly as before this option existed. See
   * decision 0008 for why the mirror measures against the bundled font too.
   */
  fontEmbed?: FontEmbedMode;
  /** Also produce a PDF alongside the SVG and PNG. Unset: no PDF is built. */
  pdf?: PdfOptions;
};

export async function render(spec: FigureSpec, options: RenderOptions = {}): Promise<RenderResult> {
  const repairEnabled = options.repair !== false;
  const maxPasses = repairEnabled ? Math.max(1, options.maxPasses ?? 3) : 1;
  const budget = newBudget(options.maxScale ?? 3);
  const fontEmbed = options.fontEmbed ?? "none";

  const browser = await chromium.launch({
    args: [
      // Subpixel (LCD) antialiasing paints colour fringes on monochrome glyphs,
      // and those fringes survive into the PNG the reader judges.
      "--disable-lcd-text",
      // Same colours on every machine that renders the same figure.
      "--force-color-profile=srgb",
    ],
  });

  try {
    const page = await browser.newPage({
      // Wide enough that nothing wraps for want of room and no scrollbar
      // appears; the figure shrink-wraps its own content.
      viewport: { width: 2400, height: 2400 },
      deviceScaleFactor: 1,
    });

    // The style pack lands before anything measures or checks: from here down
    // a packed effect is indistinguishable from a hand-written one, which is
    // exactly the point -- it goes through the same bleed arithmetic and the
    // same effect-within-canvas check.
    let working = normalise(applyType(applyStyle(spec))).spec;
    const repairs: RepairEdit[] = [];
    let unrepaired: { check: Check; why: string }[] = [];
    let pass = 0;
    let figure: LaidOutFigure | undefined;
    let warnings: string[] = [];

    while (pass < maxPasses) {
      pass += 1;
      const laid = await layOut(page, working, fontEmbed);
      figure = laid.figure;
      warnings = laid.warnings;

      const checks = runChecks(figure);
      const failing = checks.filter((check) => check.status === "fail");
      if (failing.length === 0) {
        unrepaired = [];
        break;
      }
      if (pass >= maxPasses) {
        unrepaired = failing.map((check) => ({
          check,
          why: repairEnabled
            ? `still failing after ${pass} pass(es); the pass budget was exhausted`
            : "repair was disabled",
        }));
        break;
      }

      const plan = planRepairs(checks, figure, pass + 1, budget);
      let edits = plan.edits.filter(isMonotone);
      if (edits.length === 0) edits = planWrapFallback(plan, working, pass + 1);
      // Framing is independent of any node repair — the canvas can be short of
      // room for a halo whether or not a label also overflowed — so canvas
      // edits are added to whatever the node planners produced rather than
      // competing with them for the pass.
      const framing = planCanvasRepairs(checks, working, pass + 1);
      edits = [...edits, ...framing.edits.filter(isMonotone)];
      if (edits.length === 0) {
        const blocked = [...plan.unrepairable, ...framing.unrepairable];
        unrepaired =
          blocked.length > 0
            ? blocked
            : failing.map((check) => ({ check, why: "no repair strategy produced an edit" }));
        break;
      }

      repairs.push(...edits);
      working = applyEdits(working, edits);
    }

    if (figure === undefined) throw new Error("layout produced nothing");

    warnings = [...warnings, ...outlineFallbackWarnings(figure, fontEmbed)];

    const svg = toSvg(figure, working.title, { fontEmbed });
    const png = await rasterise(browser, svg, figure, options.scale ?? 2);
    const pdf =
      options.pdf === undefined ? undefined : await rasterisePdf(browser, svg, figure, options.pdf);
    const manifest = buildManifest(figure, {
      title: working.title,
      warnings,
      repairs,
      passes: pass,
      unrepaired,
    });

    return { figure, svg, png, pdf, manifest, effectiveSpec: working };
  } finally {
    await browser.close();
  }
}

async function layOut(
  page: Page,
  spec: FigureSpec,
  fontEmbed: FontEmbedMode,
): Promise<{ figure: LaidOutFigure; warnings: string[] }> {
  const scenes = collectScenes(spec);

  // Pass one measures intrinsic sizes. With no scenes this is the only pass.
  let measured = await measurePass(page, spec, { fontEmbed });
  let routes: Record<string, Point[]> = {};

  if (scenes.length > 0) {
    const placement = await placeScenes(scenes, measured);
    routes = placement.routes;
    // Pass two measures the figure as it will actually be drawn.
    measured = await measurePass(page, spec, { ...placement.htmlOptions, fontEmbed });
  }

  const fonts = await resolvePlatformFonts(
    page,
    measured.texts.map((text) => text.ownerId),
  );

  const warnings = [...measured.fontWarnings];
  for (const [ownerId, font] of fonts) {
    if (font.alsoUsed.length > 0) {
      warnings.push(
        `${ownerId}: label drawn with more than one face (${[font.family, ...font.alsoUsed].join(
          ", ",
        )}); another renderer may space it differently`,
      );
    }
  }

  let figure = toLaidOutFigure(measured, spec, fonts);

  if (scenes.length > 0) {
    const boxes = figure.elements.filter((element) => element.kind === "box");
    const rest = figure.elements.filter((element) => element.kind !== "box");
    const connectors = buildConnectors(scenes, measured, routes, boxes);
    // Painter's order: boxes, then connectors over them, then text over both.
    // A connector under a box would vanish; a label under a connector would be
    // crossed out by it.
    figure.elements = [...boxes, ...connectors, ...rest];
  }

  // Last, and only now: layout is finished, so nothing an effect records can
  // move anything. See effects/apply.ts for why the ordering is the argument.
  figure = attachEffects(figure, spec);
  figure = attachCategoryGroups(figure, spec);
  figure = attachMotionWindows(figure, spec);
  figure = attachShapes(figure, spec);
  figure = attachPaints(figure, spec);
  // Box rotation before label rotation: a label whose owner also rotates
  // needs to turn around the BOX's own centre, not its own text-bbox centre,
  // so the two stay rigidly aligned -- attachRotations reads that centre back
  // off the already-attached PlacedBox.
  figure = attachBoxRotation(figure, spec);
  figure = attachRotations(figure, spec);

  return { figure, warnings };
}

const outlineFallbackWarnings = (figure: LaidOutFigure, fontEmbed: FontEmbedMode): string[] => {
  if (fontEmbed !== "outline") return [];
  const outlineFont = loadOutlineFont();
  const warnings: string[] = [];
  for (const element of figure.elements) {
    if (element.kind !== "text") continue;
    for (const line of element.lines) {
      if (lineNeedsTextFallback(outlineFont, line.text)) {
        warnings.push(
          `${element.id}: line "${line.text.slice(0, 24)}" contains a character the bundled ` +
            `outline font does not cover; drawn as <text> instead of a path`,
        );
      }
    }
  }
  return warnings;
};

async function measurePass(
  page: Page,
  spec: FigureSpec,
  options: HtmlOptions,
): Promise<PageMeasurement> {
  const { html } = buildHtml(spec, options);
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(measureInPage);
}

/** Put the resolved face first without repeating it if the stack already led with it. */
function prependFamily(family: string, stack: string): string {
  const normaliseName = (value: string): string =>
    value.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const rest = stack
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => normaliseName(entry) !== normaliseName(family));
  return [family, ...rest].join(", ");
}

export function toLaidOutFigure(
  measured: PageMeasurement,
  spec: FigureSpec,
  fonts: Map<string, ResolvedFont> = new Map(),
): LaidOutFigure {
  const elements: PlacedElement[] = [];

  // What each block asked for, so `declared-size-honoured` can compare the
  // request against the measurement. `spec` here is the spec that was
  // actually laid out -- repaired, if the loop edited it -- so a repair that
  // set a new size is the declaration this compares against, not the author's
  // superseded original.
  const { index } = normalise(spec);

  // Boxes first, then text: painter's order, so labels are never buried.
  for (const box of measured.boxes) {
    const node = index.get(box.id);
    const asked = node !== undefined && node.type === "block" ? node : undefined;
    const declared =
      asked === undefined || (asked.width === undefined && asked.height === undefined)
        ? undefined
        : {
            ...(asked.width === undefined ? {} : { width: asked.width }),
            ...(asked.height === undefined ? {} : { height: asked.height }),
          };
    elements.push({
      kind: "box",
      id: box.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      ...(declared === undefined ? {} : { declared }),
      // Carried from the same lookup rather than a second attach pass: like
      // categoryGroup it changes no layout, so it is copied onto the placed
      // figure by id once measurement has finished.
      ...(asked?.annotates === undefined ? {} : { annotates: asked.annotates }),
      fill: box.fill,
      stroke: box.stroke,
      strokeWidth: box.borderWidth,
      lineStyle: box.lineStyle as any,
      radius: box.radius,
      content: box.content,
      verticalAlign: box.verticalAlign,
    });
  }

  for (const text of measured.texts) {
    if (text.lines.length === 0) continue;
    // Name the face Chromium actually used before the declared stack, so a
    // different renderer resolves to the same glyphs we measured.
    const resolved = fonts.get(text.ownerId);
    const fontFamily =
      resolved === undefined
        ? text.fontFamily
        : prependFamily(quoteFamily(resolved.family), text.fontFamily);
    elements.push({
      kind: "text",
      id: text.id,
      ownerId: text.ownerId,
      fontFamily,
      fontSize: text.fontSize,
      fontWeight: text.fontWeight,
      letterSpacing: text.letterSpacing,
      fill: text.color,
      anchor: text.anchor,
      lines: text.lines.map((line) => ({
        text: line.text,
        x: line.x,
        y: line.y,
        box: line.box,
        baselineUncertain: line.baselineUncertain,
      })),
    });
  }

  return {
    width: measured.figure.width,
    height: measured.figure.height,
    background: spec.canvas?.background ?? resolveTheme(spec.canvas?.theme).canvas.background,
    elements,
    // Carried so the checks can see which constraints this figure stood down.
    constraints: spec.canvas?.constraints,
    // Carried so constraints-satisfied has something real to verify.
    layoutConstraints: spec.layoutConstraints,
  };
}
