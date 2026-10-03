/**
 * An exercise sheet from one structured file (ADR 0026).
 *
 * The Cálculo 1 list was an HTML file edited by hand, a figure script, a PDF
 * script and a shell loop, and three things drifted between them: the
 * answer key was typed a second time and disagreed with the worked
 * solutions, coordinates in the text disagreed with the labels on the
 * figures, and nothing checked the KaTeX until a student saw raw TeX.
 *
 * Here a sheet is ONE document: per exercise a level, a statement, a
 * function-graph figure, an answer and a worked solution. From it this module
 * renders every figure through the pipeline (so every check runs on it),
 * writes HTML + KaTeX, prints an A4 PDF with Playwright, and rasterises each
 * page with PyMuPDF. The answer key is generated from the `answer` fields and
 * the same field closes each worked solution -- there is no second copy to
 * disagree. Numbers in the text can be placeholders resolved through the
 * locale formatter the figures use (`{{fig.P}}` prints P's coordinates in
 * the figure's spelling). An exercise's `params` are the one source of its
 * numbers: `{{= …}}` computes text from them and figures are substituted
 * from them before they are parsed (ADR 0040, `calc.ts`).
 *
 * Every error a reader would see is returned rather than printed and
 * forgotten: a KaTeX parse error, an image that did not load, a figure that
 * failed a check, a console error on the page.
 */

import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

import { SpecError } from "../ir/types.ts";
import type { FigureSpec, Readings, TextRun } from "../ir/types.ts";
import { formatNumber, formatNumberTex, formatPoint, formatPointTex, LOCALES } from "../locale/format.ts";
import type { Locale } from "../locale/format.ts";
import { ANSWER_AWARE, parseFigureInput } from "../presets/index.ts";
import { functionGraphPoints } from "../presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../presets/function-graph/preset.ts";
import { render } from "../pipeline.ts";
import { BUNDLED_FONT_STACK, bundledFontFaceCssSync } from "../export/fonts.ts";
import * as v from "../presets/validate.ts";
import { EMPTY_ENV, calcPlaceholder, evaluateParams, substituteFigure, validateParams } from "./calc.ts";
import type { ParamEnv, ParamSpec } from "./calc.ts";
import { VariantsError, mulberry32, predicateName, sampleDomain } from "./variants.ts";
import type { Domains, Predicate } from "./variants.ts";

// ---- input ---------------------------------------------------------------

export type SheetLevel = "easy" | "mid" | "hard";

export type SheetFigure = {
  /** A function-graph input (without "preset"). */
  graph?: FunctionGraphInput;
  /** Or any figure input the render command accepts: raw IR or another preset. */
  spec?: unknown;
  /**
   * Or a figure module (modules/README.md), run and verified exactly as the
   * `module` command runs it: a molecule, a reaction scheme, a map. Its
   * drawing is the module's own SVG; its module checks are the sheet's.
   */
  module?: SheetModuleFigure;
  /** HTML; placeholders allowed. */
  caption?: string;
  /** Wider on the page. */
  wide?: boolean;
  /**
   * Where the figure's reading panel goes (ADR 0062). "page" (the default,
   * unless the sheet says otherwise): lifted out of the drawing and set as
   * page text under the image, at the page's own size. "drawing": left in
   * the drawing, scaled with it.
   */
  readings?: ReadingsPlacement;
};

export type ReadingsPlacement = "page" | "drawing";

export type SheetModuleFigure = {
  /** The interpreter. Default "python". */
  command?: string;
  /** Script path and flags, one argument each, e.g. ["modules/reaction/render.py", "--reaction=N.O>>[NH4+].[OH-]"]. */
  args: string[];
  width?: number;
  height?: number;
};

export type SheetExercise = {
  /** "1.2" */
  id: string;
  level: SheetLevel;
  /** Shown after the level tag: "(juros simples × compostos)". */
  note?: string;
  /**
   * HTML with KaTeX. `{{figure}}` marks where the first figure goes,
   * `{{figure2}}` the second, and so on; unmarked figures follow the text.
   */
  statement: string;
  /** One figure, or several -- a graph and its sign table, say. */
  figure?: SheetFigure | SheetFigure[];
  /** HTML. Printed in the answer key AND at the end of the worked solution -- written once. */
  answer: string;
  /** HTML. `{{figure}}`, `{{figure2}}`... mark where the solution's figures go. */
  solution?: string;
  solutionFigure?: SheetFigure | SheetFigure[];
  /**
   * Numbers and expressions every other field derives from (ADR 0040):
   * `{"a": 2, "b": "a + 1", "f(x)": "a*x^2"}`. Printed with `{{= …}}` or
   * `{{a}}`, used in figures as `"{{= b}}"`.
   */
  params?: ParamSpec;
  /**
   * Which number params a fresh version of this exercise samples, and which
   * draws are kept (ADR 0041, 0042). Absent: the exercise is the same in
   * every version.
   */
  variants?: ExerciseVariants;
};

/** Sampled params: each a key of the exercise's own `params`. */
export type ExerciseVariants = {
  domains: Domains;
  predicates?: Predicate[];
  /** Draws to attempt before reporting a shortfall. Default 50 per version, at least 200. */
  maxTries?: number;
};

export type SheetSection = {
  /** "1. Limites" */
  title: string;
  /** Heading in the solutions part, if it differs. */
  solutionsTitle?: string;
  /** HTML under the heading in the exercises part. */
  lead?: string;
  /** HTML box at the top of this section's solutions. */
  solutionsIntro?: string;
  exercises: SheetExercise[];
};

export type SheetInput = {
  /** Folder and file name: "calculo1". */
  name: string;
  title: string;
  subtitle?: string;
  locale?: Locale;
  /** Page footer text; the page number is appended. */
  footer?: string;
  /** HTML inside the contents box, after the generated list of sections. */
  contentsNote?: string;
  /** HTML blocks on the cover, after the contents box. */
  cover?: string[];
  /** HTML leads for the three parts. */
  exercisesLead?: string;
  answersLead?: string;
  solutionsLead?: string;
  /** HTML box closing the solutions. */
  closing?: string;
  /** Params shared by every exercise (and usable in the sheet's own texts). */
  params?: ParamSpec;
  /** The default for every figure's `readings` (ADR 0062). Default "page". */
  readings?: ReadingsPlacement;
  sections: SheetSection[];
};

const LEVELS: Record<SheetLevel, string> = { easy: "fácil", mid: "médio", hard: "difícil" };

// ---- validation ------------------------------------------------------------

function figure(value: unknown, path: string): void {
  const f = v.object(value, path);
  const kinds = [f.graph, f.spec, f.module].filter((k) => k !== undefined).length;
  if (kinds !== 1) {
    throw new SpecError(`${path} needs exactly one of "graph" (a function-graph input), "spec" (any figure input) or "module" (a figure module)`);
  }
  if (f.module !== undefined) {
    const m = v.object(f.module, `${path}.module`);
    v.optionalString(m, "command", `${path}.module`);
    if (!Array.isArray(m.args) || m.args.length === 0 || m.args.some((a) => typeof a !== "string")) {
      throw new SpecError(`${path}.module.args must be a non-empty list of strings: the script, then its flags`);
    }
    for (const k of ["width", "height"] as const) {
      if (m[k] !== undefined && (typeof m[k] !== "number" || !((m[k] as number) > 0))) throw new SpecError(`${path}.module.${k} must be a positive number`);
    }
  }
  v.optionalString(f, "caption", path);
  v.optionalBoolean(f, "wide", path);
  v.optionalEnum(f, "readings", path, ["page", "drawing"] as const);
}

/** A `variants` block: domains over the exercise's own number params, known predicate kinds. */
function validateVariants(raw: unknown, params: ParamSpec | undefined, path: string): void {
  const o = v.object(raw, path);
  const domains = v.object(o.domains, `${path}.domains`);
  const names = Object.keys(domains);
  if (names.length === 0) throw new SpecError(`${path}.domains must name at least one param to sample`);
  const own = Object.keys(params ?? {});
  for (const name of names) {
    if (!own.includes(name)) {
      const hint = own.some((k) => k.startsWith(`${name}(`))
        ? "it is a function; only number params are sampled"
        : own.length === 0 ? "the exercise has no params" : `the exercise's params are ${own.join(", ")}`;
      throw new SpecError(`${path}.domains.${name} names no param of the exercise (${hint})`);
    }
    try {
      sampleDomain(name, domains[name] as Domains[string], mulberry32(0));
    } catch (error) {
      throw new SpecError(`${path}.domains.${name}: ${(error as Error).message}`);
    }
  }
  if (o.predicates !== undefined) {
    v.array(o, "predicates", path, "predicates").forEach((p, i) => {
      try {
        predicateName(v.object(p, `${path}.predicates[${i}]`) as Predicate);
      } catch (error) {
        if (!(error instanceof VariantsError)) throw error;
        throw new SpecError(`${path}.predicates[${i}]: ${error.message}`);
      }
    });
  }
  if (o.maxTries !== undefined && !(Number.isInteger(o.maxTries) && (o.maxTries as number) > 0)) {
    throw new SpecError(`${path}.maxTries must be a positive integer`);
  }
}

/** Structure only; figures are validated when they are expanded. */
export function validateSheet(raw: unknown): SheetInput {
  const s = v.object(raw, "sheet");
  const name = v.requiredString(s, "name", "sheet");
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new SpecError(`sheet.name must be a folder-safe name (letters, digits, . _ -), got ${JSON.stringify(name)}`);
  }
  v.requiredString(s, "title", "sheet");
  v.optionalEnum(s, "locale", "sheet", LOCALES);
  v.optionalEnum(s, "readings", "sheet", ["page", "drawing"] as const);
  for (const key of ["subtitle", "footer", "contentsNote", "exercisesLead", "answersLead", "solutionsLead", "closing"]) {
    v.optionalString(s, key, "sheet");
  }
  if (s.cover !== undefined) {
    v.array(s, "cover", "sheet", "HTML blocks").forEach((b, i) => {
      if (typeof b !== "string") throw new SpecError(`sheet.cover[${i}] must be an HTML string`);
    });
  }
  validateParams(s.params, "sheet.params");
  const ids: { id: string; at: string }[] = [];
  v.nonEmptyArray(s, "sections", "sheet", "sections").forEach((section, i) => {
    const at = `sheet.sections[${i}]`;
    const o = v.object(section, at);
    v.requiredString(o, "title", at);
    v.optionalString(o, "solutionsTitle", at);
    v.optionalString(o, "lead", at);
    v.optionalString(o, "solutionsIntro", at);
    v.nonEmptyArray(o, "exercises", at, "exercises").forEach((exercise, j) => {
      const where = `${at}.exercises[${j}]`;
      const e = v.object(exercise, where);
      ids.push({ id: v.requiredString(e, "id", where), at: where });
      const level = v.optionalEnum(e, "level", where, ["easy", "mid", "hard"]);
      if (level === undefined) v.requiredString(e, "level", where);
      v.optionalString(e, "note", where);
      validateParams(e.params, `${where}.params`);
      if (e.variants !== undefined) validateVariants(e.variants, e.params as ParamSpec | undefined, `${where}.variants`);
      const statement = v.requiredString(e, "statement", where);
      v.requiredString(e, "answer", where);
      const solution = v.optionalString(e, "solution", where);
      const own = listOf(e.figure as SheetFigure | SheetFigure[] | undefined);
      const sol = listOf(e.solutionFigure as SheetFigure | SheetFigure[] | undefined);
      own.forEach((f, k) => figure(f, `${where}.figure${Array.isArray(e.figure) ? `[${k}]` : ""}`));
      sol.forEach((f, k) => figure(f, `${where}.solutionFigure${Array.isArray(e.solutionFigure) ? `[${k}]` : ""}`));
      if (sol.length > 0 && solution === undefined) {
        throw new SpecError(`${where}.solutionFigure needs a "solution" to sit in`);
      }
      // Every marker names a figure that exists: {{figure3}} over two figures
      // would silently print nothing.
      for (const [text, count, field] of [
        [statement, own.length, "statement"],
        [solution ?? "", sol.length, "solution"],
      ] as const) {
        for (const m of text.matchAll(/\{\{figure(\d*)\}\}/g)) {
          const n = m[1] === "" ? 1 : Number(m[1]);
          if (n > count) {
            const noun = field === "statement" ? "figure" : "solution figure";
            const has = count === 0 ? `no ${noun}` : `${count} ${noun}${count === 1 ? "" : "s"}`;
            throw new SpecError(`${where}.${field} marks ${m[0]} but the exercise has ${has}`);
          }
        }
      }
    });
  });
  v.unique(ids, "exercise");
  return raw as SheetInput;
}

// ---- placeholders ------------------------------------------------------------

type Points = { fig: Map<string, { x: number; y: number }>; sol: Map<string, { x: number; y: number }> };

/**
 * Resolve `{{...}}` in HTML that KaTeX will later typeset.
 *
 * Inside `\( \)` or `$$ $$` a value is written as TeX (`2{,}5`,
 * `\left(2;\,5\right)`); outside, as text (`2,5`, `(2; 5)`). Same number,
 * same formatter, two spellings -- which is what the figure label and the
 * sentence citing it need to agree.
 *
 *   {{fig.P}} {{fig.P.x}} {{sol.P}}  a figure point, or one coordinate
 *   {{fig.P.y:1}}                     one coordinate with fixed decimals
 *   {{num:2.5}} {{num:2073.6:2}}      a number, optionally with fixed decimals
 *   {{pt:2.5,7.25}}                   an ordered pair
 *   {{= integral(f(x), x, 0, b)}}     a computed value, exact when it is one (ADR 0040)
 *   {{= b/3 : 2}}                     the same with fixed decimals
 *   {{a}}                             a param, shorthand for {{= a}}
 */
export function fillText(html: string, points: Points, locale: Locale, where: string, env: ParamEnv = EMPTY_ENV): string {
  let out = "";
  let math = false;
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("$$", i)) {
      math = !math;
      out += "$$";
      i += 2;
      continue;
    }
    if (html.startsWith("\\(", i) || html.startsWith("\\)", i)) {
      math = html[i + 1] === "(";
      out += html.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (html.startsWith("{{", i)) {
      const end = html.indexOf("}}", i);
      if (end < 0) throw new SpecError(`${where}: "{{" without a closing "}}"`);
      const body = html.slice(i + 2, end).trim();
      out += /^figure\d*$/.test(body) ? `{{${body}}}` : placeholder(body, points, locale, math, where, env);
      i = end + 2;
      continue;
    }
    out += html[i];
    i += 1;
  }
  return out;
}

function placeholder(body: string, points: Points, locale: Locale, math: boolean, where: string, env: ParamEnv): string {
  const num = (value: number, decimals?: number): string =>
    math
      ? formatNumberTex(value, locale, decimals === undefined ? {} : { decimals })
      : formatNumber(value, locale, decimals === undefined ? {} : { decimals });
  const pt = (x: number, y: number): string => (math ? formatPointTex(x, y, locale) : formatPoint(x, y, locale));
  const figureRef = /^(fig|sol)\.([A-Za-z0-9_-]+)(?:\.(x|y))?(?::(\d))?$/.exec(body);
  if (figureRef !== null) {
    const [, which, id, axis, places] = figureRef;
    const table = which === "fig" ? points.fig : points.sol;
    const p = table.get(id!);
    if (p === undefined) {
      const known = [...table.keys()];
      throw new SpecError(
        `${where}: {{${body}}} names point "${id}", which the ${which === "fig" ? "exercise" : "solution"} figure ` +
          `does not declare` + (known.length === 0 ? "" : ` (it declares ${known.join(", ")})`),
      );
    }
    const decimals = places === undefined ? undefined : Number(places);
    return axis === undefined ? pt(p.x, p.y) : num(p[axis as "x" | "y"], decimals);
  }
  const numRef = /^num:\s*(-?[\d.]+)(?::(\d))?$/.exec(body);
  if (numRef !== null) return num(Number(numRef[1]), numRef[2] === undefined ? undefined : Number(numRef[2]));
  const ptRef = /^pt:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(body);
  if (ptRef !== null) return pt(Number(ptRef[1]), Number(ptRef[2]));
  const computed = calcPlaceholder(body, env, locale, math, where);
  if (computed !== undefined) return computed;
  const params = [...env.values.keys()];
  throw new SpecError(
    `${where}: unknown placeholder {{${body}}}. Available: {{fig.P}} {{fig.P.x}} {{sol.P}}, {{num:2.5}}, ` +
      `{{num:2073.6:2}}, {{pt:2.5,7.25}}, {{= expression}}, ` +
      (params.length === 0 ? "{{a}} for a param (none is declared here)" : `{{a}} for a param (${params.join(", ")})`) +
      `, and {{figure}} for where the figure goes.`,
  );
}

// ---- HTML --------------------------------------------------------------------

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The page's own text is set in the bundled face too (ADR 0063): the same
// face as the figures and the readings lifted out of them, and pagination
// that does not depend on which sans the printing machine has. Inlined, not
// linked: Chromium refuses a font from a file:// URL as a cross-origin load.
// The headings keep their serif -- page design, not measured figure text.
const STYLE = `
  ${bundledFontFaceCssSync()}
  @page { size: A4; margin: 18mm 17mm 20mm 17mm; }
  :root {
    --ink: #1b1f27; --soft: #4e5763; --rule: #d5dae1; --key: #1d4e89;
    --easy: #0f7360; --mid: #9a6200; --hard: #b3400c; --paper: #fcfbf7;
  }
  html { background: white; }
  body { font-family: ${BUNDLED_FONT_STACK}; color: var(--ink);
         font-size: 10.6pt; line-height: 1.5; margin: 0; }
  h1 { font-family: Georgia, "Palatino Linotype", serif; font-size: 27pt; margin: 0 0 4pt; color: var(--key); }
  h2 { font-family: Georgia, "Palatino Linotype", serif; font-size: 17pt; color: var(--key);
       border-bottom: 2px solid var(--key); padding-bottom: 3pt; margin: 20pt 0 8pt; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14pt 0 5pt; break-after: avoid; }
  .part { break-before: page; }
  .part-title { font-family: Georgia, serif; font-size: 22pt; color: var(--ink); margin: 0 0 4pt; }
  .lead { color: var(--soft); margin-top: 0; }
  .cover { padding-top: 30pt; }
  .cover .sub { font-size: 13pt; color: var(--soft); margin: 0 0 18pt; }
  .toc { border: 1px solid var(--rule); border-radius: 8px; padding: 10pt 14pt; margin: 14pt 0; background: var(--paper); }
  .toc ol { margin: 4pt 0; padding-left: 18pt; }
  .q { border: 1px solid var(--rule); border-left: 4px solid var(--rule); border-radius: 6px;
       padding: 7pt 11pt 8pt; margin: 8pt 0; break-inside: avoid; background: #fff; }
  .q.easy { border-left-color: var(--easy); }
  .q.mid  { border-left-color: var(--mid); }
  .q.hard { border-left-color: var(--hard); }
  .qh { font-weight: 700; margin-bottom: 2pt; }
  .qh .note { font-weight: 400; color: var(--soft); }
  .tag { display: inline-block; font-size: 8pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
         border-radius: 10px; padding: 0 7pt; margin-left: 6pt; color: white; vertical-align: 1px; }
  .tag.easy { background: var(--easy); } .tag.mid { background: var(--mid); } .tag.hard { background: var(--hard); }
  .q p { margin: 3pt 0; }
  ol.items { margin: 3pt 0; padding-left: 20pt; }
  ol.items li { margin: 1.5pt 0; }
  figure { margin: 7pt auto 3pt; text-align: center; break-inside: avoid; }
  /* A figure is shrunk to the column, never enlarged past its own size: a
     small molecule stretched to 84% of the column filled a page. */
  figure img { width: auto; height: auto; max-width: min(84%, 510px); }
  figure.wide img { max-width: min(96%, 640px); }
  figcaption { font-size: 9pt; color: var(--soft); margin-top: 2pt; }
  .box { background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; padding: 8pt 12pt; margin: 8pt 0; break-inside: avoid; }
  .box h3 { margin-top: 2pt; }
  table.ref { border-collapse: collapse; width: 100%; font-size: 10pt; }
  table.ref td, table.ref th { border-bottom: 1px solid var(--rule); padding: 4pt 6pt; text-align: left; vertical-align: middle; }
  table.ref th { color: var(--soft); font-weight: 600; }
  .sol { margin: 10pt 0 14pt; }
  .sol > .qh { color: var(--key); border-top: 1px solid var(--rule); padding-top: 8pt; }
  .sol p { margin: 4pt 0; }
  .ans { display: inline-block; background: #eef4fb; border: 1px solid #c6d7ec; border-radius: 6px; padding: 2pt 8pt; margin-top: 3pt; font-weight: 600; }
  .tip { color: var(--soft); font-size: 9.8pt; border-left: 3px solid var(--rule); padding-left: 8pt; margin: 5pt 0; }
  .katex-display { margin: 5pt 0; break-inside: avoid; }
  .sol > .qh { break-after: avoid; }
  .sol p:has(+ .katex-display), .sol p:has(+ span > .katex-display) { break-after: avoid; }
  /* An inline formula never breaks across lines: a fraction split in two is unreadable. */
  .katex { font-size: 1.06em; white-space: nowrap; }
  .gab td:first-child { width: 42pt; font-weight: 700; }
`;

export const KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist";

type Figures = Map<string, { src: string; caption?: string; wide?: boolean; readings?: Readings }>;

function figureHtml(key: string, figures: Figures): string {
  const f = figures.get(key);
  if (f === undefined) return "";
  return (
    `<figure${f.wide ? ' class="wide"' : ""}><img src="${f.src}">` +
    (f.readings === undefined ? "" : readingsHtml(f.readings)) +
    (f.caption === undefined ? "" : `<figcaption>${f.caption}</figcaption>`) +
    `</figure>`
  );
}

/**
 * The style of lifted readings (ADR 0062), added to a document's stylesheet
 * only when one of its figures has them: a sheet without panels is the same
 * document, byte for byte, that it was before panels could be lifted.
 */
const READINGS_CSS = `
  /* A figure's reading panel, lifted out of the drawing (ADR 0062): page text, the image's width. */
  .readings { display: grid; column-gap: 8pt; row-gap: 1.5pt; width: 84%; max-width: 510px; margin: 3pt auto 0;
              text-align: left; font-size: 9.6pt; line-height: 1.35; }
  figure.wide .readings { width: 96%; max-width: 640px; }
  .readings .r.normal { color: #181B21; }
  .readings .r.strong { color: #181B21; font-weight: 700; }
  .readings .r.soft { color: #4E5763; }
  .readings .r.accent { font-weight: 700; }
  .readings .lead { font-weight: 700; white-space: nowrap; }
  .readings .span { grid-column-end: span 2; }
  .readings .sw { display: flex; align-items: center; }
  .readings .sw i { display: block; width: 16pt; height: 2.6pt; border-radius: 1pt; }
  .readings sub, .readings sup { font-size: 0.72em; line-height: 0; }
`;

function withReadingsCss(html: string, figures: Figures[]): string {
  if (!figures.some((map) => [...map.values()].some((f) => f.readings !== undefined))) return html;
  return html.replace("</style>", `${READINGS_CSS}</style>`);
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, "&quot;");

/** Runs as HTML: a subscript is <sub>, a superscript <sup> -- the same markup the figure's mirror measured. */
export function runsHtml(runs: readonly TextRun[]): string {
  return runs.map((r) => (r.script === undefined ? escapeHtml(r.text) : `<${r.script}>${escapeHtml(r.text)}</${r.script}>`)).join("");
}

/**
 * A figure's reading panel as page text (ADR 0062): the same lines, the same
 * emphasis and colours, at the page's size, wrapped by the page. Every line
 * sits in the grid's text column; a lead takes the column before it, and a
 * swatch the one before that, so a panel of leads reads as a table.
 */
export function readingsHtml(readings: Readings): string {
  const leads = readings.lines.some((l) => l.lead !== undefined);
  const swatches = readings.lines.some((l) => l.swatch !== undefined);
  const columns = [swatches ? "auto" : "", leads ? "auto" : "", "1fr"].filter((c) => c !== "").join(" ");
  const rows = readings.lines.map((l) => {
    const style = [l.colour === undefined ? "" : `color: ${l.colour}`, l.gap === undefined ? "" : `margin-top: ${(l.gap * 0.75).toFixed(1)}pt`].filter(Boolean).join("; ");
    const cls = `r ${l.emphasis}`;
    const attr = style === "" ? "" : ` style="${escapeAttr(style)}"`;
    const cells: string[] = [];
    if (swatches) cells.push(l.swatch === undefined ? `<span class="sw"${attr}></span>` : `<span class="sw"${attr}><i style="background: ${escapeAttr(l.swatch)}"></i></span>`);
    if (leads && l.lead !== undefined) cells.push(`<span class="${cls} lead"${attr}>${runsHtml(l.lead)}</span>`);
    const span = leads && l.lead === undefined ? " span" : "";
    cells.push(`<span class="${cls}${span}"${attr}>${runsHtml(l.runs)}</span>`);
    return cells.join("");
  });
  return `<div class="readings" style="grid-template-columns: ${columns}">${rows.join("")}</div>`;
}

/** A single figure or several, as a list. */
function listOf(f: SheetFigure | SheetFigure[] | undefined): SheetFigure[] {
  return f === undefined ? [] : Array.isArray(f) ? f : [f];
}

/** Put each figure at its marker -- {{figure}} or {{figure1}} for the first, {{figure2}}... -- or after the text. */
function place(html: string, figs: string[]): string {
  let out = html;
  let trailing = "";
  figs.forEach((fig, i) => {
    const markers = i === 0 ? ["{{figure}}", "{{figure1}}"] : [`{{figure${i + 1}}}`];
    const marker = markers.find((m) => out.includes(m));
    if (marker === undefined) trailing += fig;
    else out = out.replace(marker, fig);
  });
  return out + trailing;
}

const figureKey = (kind: "q" | "s", id: string, index = 0): string =>
  `${kind}${id.replace(/[^A-Za-z0-9]+/g, "-")}${index === 0 ? "" : `-${index + 1}`}`;

const keysOf = (kind: "q" | "s", e: SheetExercise): string[] =>
  listOf(kind === "q" ? e.figure : e.solutionFigure).map((_, i) => figureKey(kind, e.id, i));

/** What one printed document shows besides its content: which version, which seed. */
export type SheetStamp = {
  /** Appended to the title in <title>: "versão 2 de 3". */
  label?: string;
  /** A line under the subtitle on the cover. */
  line?: string;
};

type Texts = (key: string) => string;

const tagHtml = (level: SheetLevel): string => `<span class="tag ${level}">${LEVELS[level]}</span>`;

function pushHead(out: string[], sheet: SheetInput, katex: string, title: string): void {
  out.push(`<!DOCTYPE html>
<html lang="${sheet.locale ?? "pt-BR"}">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<link rel="stylesheet" href="${katex}/katex.min.css">
<script src="${katex}/katex.min.js"></script>
<script src="${katex}/contrib/mhchem.min.js"></script>
<script src="${katex}/contrib/auto-render.min.js"></script>
<style>${STYLE}</style>
</head>
<body>`);
}

/** Opens a page-breaking part; `first` suppresses the break when nothing precedes it. */
function pushPart(out: string[], title: string, first = false): void {
  out.push(`<section class="part"${first ? ' style="break-before:auto"' : ""}>
<p class="part-title">${title}</p>`);
}

function pushTail(out: string[]): void {
  out.push(`<script>
  window.__mathDone = false;
  document.addEventListener("DOMContentLoaded", () => {
    // throwOnError: false so a bad formula becomes a .katex-error element the
    // build can find and report, instead of one console line and raw TeX.
    renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\\\(", right: "\\\\)", display: false },
      ],
      throwOnError: false,
    });
    window.__mathDone = true;
  });
</script>
</body>
</html>
`);
}

function pushExercises(out: string[], sheet: SheetInput, t: Texts, figures: Figures): void {
  if (sheet.exercisesLead !== undefined) out.push(`<p class="lead">${t("exercisesLead")}</p>`);
  for (const [i, section] of sheet.sections.entries()) {
    out.push(`\n<h2>${escape(section.title)}</h2>`);
    if (section.lead !== undefined) out.push(`<p class="lead">${t(`s${i}.lead`)}</p>`);
    for (const e of section.exercises) {
      const note = e.note === undefined ? "" : ` <span class="note">${escape(e.note)}</span>`;
      out.push(
        `<div class="q ${e.level}"><div class="qh">${escape(e.id)} ${tagHtml(e.level)}${note}</div>\n` +
          place(t(`${e.id}.statement`), keysOf("q", e).map((k) => figureHtml(k, figures))) +
          `\n</div>`,
      );
    }
  }
}

function pushAnswers(out: string[], sheet: SheetInput, t: Texts): void {
  if (sheet.answersLead !== undefined) out.push(`<p class="lead">${t("answersLead")}</p>`);
  out.push(`<table class="ref gab">`);
  for (const section of sheet.sections) {
    for (const e of section.exercises) out.push(`  <tr><td>${escape(e.id)}</td><td>${t(`${e.id}.answer`)}</td></tr>`);
  }
  out.push(`</table>`);
}

function pushSolutions(out: string[], sheet: SheetInput, t: Texts, figures: Figures): void {
  if (sheet.solutionsLead !== undefined) out.push(`<p class="lead">${t("solutionsLead")}</p>`);
  for (const [i, section] of sheet.sections.entries()) {
    out.push(`\n<h2>${escape(section.solutionsTitle ?? section.title)}</h2>`);
    if (section.solutionsIntro !== undefined) out.push(`<div class="box">${t(`s${i}.solutionsIntro`)}</div>`);
    for (const e of section.exercises) {
      if (e.solution === undefined) continue;
      const note = e.note === undefined ? "" : ` ${escape(e.note)}`;
      out.push(
        `<div class="sol"><div class="qh">${escape(e.id)}${note}</div>\n` +
          place(t(`${e.id}.solution`), keysOf("s", e).map((k) => figureHtml(k, figures))) +
          // The answer key's own field, so the two cannot disagree.
          `\n  <span class="ans">Resposta: ${t(`${e.id}.answer`)}</span>\n</div>`,
      );
    }
  }
}

export type SheetHtmlOptions = {
  /** "all" (default): exercises, answer key and worked solutions. "exercises": the statements only. */
  parts?: "all" | "exercises";
  stamp?: SheetStamp;
};

/** The whole document. Figures are referenced by the relative paths in `figures`. */
export function sheetHtml(
  sheet: SheetInput,
  texts: Map<string, string>,
  figures: Figures,
  katex = KATEX,
  options: SheetHtmlOptions = {},
): string {
  const t: Texts = (key) => texts.get(key) ?? "";
  const { parts = "all", stamp = {} } = options;
  const out: string[] = [];
  pushHead(out, sheet, katex, stamp.label === undefined ? sheet.title : `${sheet.title} — ${stamp.label}`);
  out.push(`<section class="cover">
  <h1>${escape(sheet.title)}</h1>`);
  if (sheet.subtitle !== undefined) out.push(`  <p class="sub">${escape(sheet.subtitle)}</p>`);
  if (stamp.line !== undefined) out.push(`  <p class="sub">${escape(stamp.line)}</p>`);
  const range = (s: SheetSection): string => {
    const ids = s.exercises.map((e) => e.id);
    return ids.length === 1 ? `exercício ${ids[0]}` : `exercícios ${ids[0]} a ${ids[ids.length - 1]}`;
  };
  out.push(`  <div class="toc">
    <b>Como a lista está organizada</b>
    <ol>
${sheet.sections.map((s) => `      <li><b>${escape(s.title.replace(/^\d+\.\s*/, ""))}</b>: ${range(s)}</li>`).join("\n")}
    </ol>
    ${t("contentsNote")}
  </div>`);
  for (const [i] of (sheet.cover ?? []).entries()) out.push(`  <div class="box">${t(`cover.${i}`)}</div>`);
  out.push(`</section>\n`);
  // An exercises-only sheet has one part: it starts on the cover page, with
  // no part title to strand at a page's foot above a figure that did not fit.
  if (parts === "exercises") out.push(`<section class="part" style="break-before:auto">`);
  else pushPart(out, "Parte I: Exercícios");
  pushExercises(out, sheet, t, figures);
  if (parts === "all") {
    out.push(`</section>\n`);
    pushPart(out, "Gabarito rápido");
    pushAnswers(out, sheet, t);
    out.push(`</section>\n`);
    pushPart(out, "Parte II: Resoluções comentadas");
    pushSolutions(out, sheet, t, figures);
    if (sheet.closing !== undefined) out.push(`<div class="box">${t("closing")}</div>`);
  }
  out.push(`</section>\n`);
  pushTail(out);
  return withReadingsCss(out.join("\n"), [figures]);
}

/** One set of answers in a gabarito: a version's texts and solution figures. */
export type GabaritoEntry = {
  /** "Versão 2"; absent for a single (non-variant) build. */
  label?: string;
  texts: Map<string, string>;
  figures: Figures;
};

/**
 * The answer document, apart from the exercises: per entry (per version),
 * the quick answer key and the worked solutions -- never a statement, so a
 * student can print the exercises alone and check themselves afterwards.
 */
export function gabaritoHtml(sheet: SheetInput, entries: GabaritoEntry[], katex = KATEX, stamp: SheetStamp = {}): string {
  const out: string[] = [];
  pushHead(out, sheet, katex, `${sheet.title} — ${stamp.label ?? "gabarito"}`);
  out.push(`<section class="cover" style="padding-top:0">
  <h1>${escape(sheet.title)}</h1>
  <p class="sub">Gabarito e resoluções comentadas</p>`);
  if (stamp.line !== undefined) out.push(`  <p class="sub">${escape(stamp.line)}</p>`);
  out.push(`</section>\n`);
  entries.forEach((entry, i) => {
    const t: Texts = (key) => entry.texts.get(key) ?? "";
    if (entry.label === undefined) {
      // One set of answers: the key and the solutions as the inline sheet prints them.
      pushPart(out, "Gabarito rápido", i === 0);
      pushAnswers(out, sheet, t);
      out.push(`</section>
`);
      pushPart(out, "Resoluções comentadas");
    } else {
      // Per version: one part, the key on top of its own solutions.
      pushPart(out, escape(entry.label), i === 0);
      out.push(`<h3>Gabarito rápido</h3>`);
      pushAnswers(out, sheet, t);
    }
    pushSolutions(out, sheet, t, entry.figures);
    if (i === entries.length - 1 && sheet.closing !== undefined) out.push(`<div class="box">${t("closing")}</div>`);
    out.push(`</section>\n`);
  });
  pushTail(out);
  return withReadingsCss(out.join("\n"), entries.map((e) => e.figures));
}

// ---- build -----------------------------------------------------------------

export type SheetResult = {
  outDir: string;
  html: string;
  pdf?: string;
  pages: string[];
  figures: string[];
  /** Figures whose render failed a check, with the failing checks. */
  figureFailures: { figure: string; checks: string[] }[];
  katexErrors: string[];
  brokenImages: string[];
  pageErrors: string[];
  /** Why a step could not run (no Python, no PyMuPDF, KaTeX did not load). */
  problems: string[];
  /** The separate answer document, with `answers: "separate"`. */
  gabarito?: { html: string; pdf?: string; pages: string[] };
};

/** Where sheets go unless told otherwise: ProjectHub/Listas/<name>, beside this repository. */
export function defaultSheetDir(name: string): string {
  const base =
    process.env.PRANCHETA_SHEETS_DIR ??
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "Listas");
  return join(base, name);
}

function figureSpec(f: SheetFigure, where: string, statement: boolean): FigureSpec {
  try {
    const spec = f.graph !== undefined ? { preset: "function-graph", ...f.graph } : f.spec;
    return parseFigureInput(statement ? withoutAnswers(spec) : spec);
  } catch (error) {
    throw new SpecError(`${where}: ${(error as Error).message}`);
  }
}

/**
 * A statement's figure shows what the exercise gives, never what it asks
 * (review of 2026-09-29): a circuit printing every solved current, or a
 * Venn diagram printing the 37 the question asks for, hands the reader the
 * answer. So a statement figure of a preset that can hide its answers does,
 * unless its author says `"answers": true`. A solution figure is untouched.
 */
function withoutAnswers(spec: unknown): unknown {
  if (typeof spec !== "object" || spec === null) return spec;
  const o = spec as Record<string, unknown>;
  if (typeof o.preset !== "string" || !ANSWER_AWARE.includes(o.preset) || o.answers !== undefined) return spec;
  return { ...o, answers: false };
}

/**
 * Numbers that replace some params' definitions -- a sampled variant. Keys
 * of `exercises` are exercise ids. Every param derived from an overridden one
 * is recomputed, and every text and figure follows.
 */
export type SheetParamOverrides = {
  sheet?: Readonly<Record<string, number>>;
  exercises?: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

export type SheetOptions = {
  out?: string;
  pdf?: boolean;
  pages?: boolean;
  /** Page raster resolution. */
  dpi?: number;
  katex?: string;
  /** The source document, copied into the output folder verbatim. */
  source?: string;
  /** Override params (ADR 0040): what a variant generator passes. */
  params?: SheetParamOverrides;
  /**
   * "inline" (default): one document, answer key and solutions after the
   * exercises. "separate": the exercises in `<name>.html`, the answers and
   * solutions in `<name>-gabarito.html` (ADR 0042).
   */
  answers?: "inline" | "separate";
};

/** One figure of an exercise, with the params already substituted. */
export type ResolvedFigure = {
  key: string;
  exercise: string;
  kind: "q" | "s";
  figure: SheetFigure;
  captionKey: string;
  /** Where its reading panel goes: the figure's own choice, else the sheet's, else "page". */
  readings: ReadingsPlacement;
};

export type ResolvedSheet = {
  sheet: SheetInput;
  locale: Locale;
  /** Every text, placeholders resolved, by key ("1.2.statement", "cover.0"...). */
  texts: Map<string, string>;
  figures: ResolvedFigure[];
  /** The sheet's params, and each exercise's (the sheet's included), by exercise id. */
  params: { sheet: ParamEnv; exercises: Map<string, ParamEnv> };
};

/**
 * Everything but the drawing: params evaluated, figures substituted, every
 * placeholder resolved. Pure and fast -- what a variant generator can call
 * to inspect a candidate before paying for a render.
 */
export function resolveSheet(raw: unknown, overrides: SheetParamOverrides = {}): ResolvedSheet {
  const sheet = validateSheet(raw);
  const locale = sheet.locale ?? "pt-BR";
  const sheetEnv = evaluateParams(sheet.params, overrides.sheet, EMPTY_ENV, "sheet.params");
  const known = new Set(sheet.sections.flatMap((s) => s.exercises.map((e) => e.id)));
  for (const id of Object.keys(overrides.exercises ?? {})) {
    if (!known.has(id)) throw new SpecError(`params override names exercise "${id}", which the sheet does not have`);
  }

  // Params first, then every figure with them substituted -- the points the
  // text cites are read off the substituted figures.
  const envs = new Map<string, ParamEnv>();
  const figures: ResolvedFigure[] = [];
  const own = new Map<string, { q: SheetFigure[]; s: SheetFigure[] }>();
  for (const section of sheet.sections) {
    for (const e of section.exercises) {
      const env = evaluateParams(e.params, overrides.exercises?.[e.id], sheetEnv, `${e.id}.params`);
      envs.set(e.id, env);
      const sub = (f: SheetFigure, path: string): SheetFigure =>
        f.graph !== undefined
          ? { ...f, graph: substituteFigure(f.graph, env, `${path}.graph`) }
          : f.module !== undefined
            ? { ...f, module: substituteFigure(f.module, env, `${path}.module`) }
            : { ...f, spec: substituteFigure(f.spec, env, `${path}.spec`) };
      const q = listOf(e.figure).map((f, k) => sub(f, `${e.id}.figure[${k}]`));
      const s = listOf(e.solutionFigure).map((f, k) => sub(f, `${e.id}.solutionFigure[${k}]`));
      own.set(e.id, { q, s });
      q.forEach((f, k) =>
        figures.push({ key: figureKey("q", e.id, k), exercise: e.id, kind: "q", figure: f, captionKey: `${e.id}.figure.${k}.caption`, readings: f.readings ?? sheet.readings ?? "page" }),
      );
      s.forEach((f, k) =>
        figures.push({ key: figureKey("s", e.id, k), exercise: e.id, kind: "s", figure: f, captionKey: `${e.id}.solutionFigure.${k}.caption`, readings: f.readings ?? sheet.readings ?? "page" }),
      );
    }
  }

  // Text: every placeholder resolved against the figure it cites, before
  // anything is drawn, so a bad reference fails fast.
  const texts = new Map<string, string>();
  const none = { fig: new Map(), sol: new Map() };
  const put = (key: string, html: string | undefined, points: Points = none, env: ParamEnv = sheetEnv): void => {
    if (html !== undefined) texts.set(key, fillText(html, points, locale, key, env));
  };
  put("contentsNote", sheet.contentsNote);
  (sheet.cover ?? []).forEach((b, i) => put(`cover.${i}`, b));
  put("exercisesLead", sheet.exercisesLead);
  put("answersLead", sheet.answersLead);
  put("solutionsLead", sheet.solutionsLead);
  put("closing", sheet.closing);
  // A placeholder names a point of any of the exercise's (or solution's)
  // function graphs; the first one to declare it wins.
  const pointsOf = (list: SheetFigure[]): Map<string, { x: number; y: number }> => {
    const merged = new Map<string, { x: number; y: number }>();
    for (const one of list) {
      if (one.graph === undefined) continue;
      for (const [id, p] of functionGraphPoints(one.graph)) if (!merged.has(id)) merged.set(id, p);
    }
    return merged;
  };
  for (const [i, section] of sheet.sections.entries()) {
    put(`s${i}.lead`, section.lead);
    put(`s${i}.solutionsIntro`, section.solutionsIntro);
    for (const e of section.exercises) {
      const figs = own.get(e.id)!;
      const env = envs.get(e.id)!;
      const points = { fig: pointsOf(figs.q), sol: pointsOf(figs.s) };
      put(`${e.id}.statement`, e.statement, points, env);
      put(`${e.id}.answer`, e.answer, points, env);
      put(`${e.id}.solution`, e.solution, points, env);
      figs.q.forEach((f, k) => put(`${e.id}.figure.${k}.caption`, f.caption, points, env));
      figs.s.forEach((f, k) => put(`${e.id}.solutionFigure.${k}.caption`, f.caption, points, env));
    }
  }
  return { sheet, locale, texts, figures, params: { sheet: sheetEnv, exercises: envs } };
}

/** A figure drawn through the pipeline: its SVG and the checks it failed. */
export type RenderedFigure = {
  svg: string;
  failing: string[];
  checkIds: string[];
  /** The reading panel, when it was lifted out of the drawing to be set as page text (ADR 0062). */
  readings?: Readings;
};

/**
 * Renders by content: the same substituted figure is drawn once, however
 * many versions of a sheet (or admission attempts) ask for it.
 */
export type FigureCache = Map<string, RenderedFigure>;

/** Draw one resolved figure through the full pipeline -- its checks are the sheet's checks. */
export async function renderSheetFigure(r: ResolvedFigure, cache?: FigureCache): Promise<RenderedFigure> {
  // The kind is part of the key: one input is two figures when the statement's copy hides its answers.
  const key = `${r.kind}:${r.readings}:${JSON.stringify(r.figure.graph ?? r.figure.module ?? r.figure.spec)}`;
  const hit = cache?.get(key);
  if (hit !== undefined) return hit;
  if (r.figure.module !== undefined) {
    // A module's figure is its own SVG, verified by the module checks; it has
    // no answers to hide and no reading panel to lift.
    const m = r.figure.module;
    const { runAndVerifyModule } = await import("../modules/run.ts");
    const { entryForScript } = await import("../modules/repertoire.ts");
    // A statement's figure hides its answers here too: "complete a reação"
    // draws the products as "?". Only for scripts that declare the flag.
    const hides = r.kind === "q" && entryForScript(m.args[0] ?? "")?.answers === true && !m.args.some((a) => a.startsWith("--answers"));
    const { output, verification } = await runAndVerifyModule({
      command: m.command ?? "python",
      args: hides ? [...m.args, "--answers=false"] : m.args,
      input: { width: m.width ?? 720, height: m.height ?? 520 },
    });
    const fails = verification.checks.filter((c) => c.status === "fail");
    const drawn = { svg: output.svg, failing: fails.map((c) => `${c.id} ${c.target ?? ""}: ${c.detail ?? ""}`), checkIds: fails.map((c) => c.id) };
    cache?.set(key, drawn);
    return drawn;
  }
  const spec = figureSpec(r.figure, `exercise ${r.exercise} ${r.kind === "q" ? "figure" : "solutionFigure"}`, r.kind === "q");
  // A panel scaled down with its figure is set at whatever size the column
  // leaves it -- 7pt for an optics or circuit panel. Lifted, it is page text.
  const lift = r.readings === "page" && spec.readings !== undefined;
  const result = await render(spec, { raster: false, readings: lift ? "omit" : "draw" });
  const fails = result.manifest.checks.filter((c) => c.status === "fail");
  const drawn = {
    svg: result.svg,
    failing: fails.map((c) => `${c.id} ${c.target}: ${c.detail ?? ""}`),
    checkIds: fails.map((c) => c.id),
    ...(lift ? { readings: spec.readings } : {}),
  };
  cache?.set(key, drawn);
  return drawn;
}

/** Render every figure of a resolved sheet into `<outDir>/<folder>/`, referenced relatively. */
export async function writeFigures(
  resolved: ResolvedSheet,
  outDir: string,
  folder: string,
  cache?: FigureCache,
): Promise<{ figures: Figures; written: string[]; failures: SheetResult["figureFailures"] }> {
  await mkdir(join(outDir, folder), { recursive: true });
  const figures: Figures = new Map();
  const written: string[] = [];
  const failures: SheetResult["figureFailures"] = [];
  for (const r of resolved.figures) {
    const drawn = await renderSheetFigure(r, cache);
    const file = join(outDir, folder, `${r.key}.svg`);
    await writeFile(file, drawn.svg, "utf8");
    written.push(file);
    if (drawn.failing.length > 0) failures.push({ figure: `${folder}/${r.key}`.replace(/^figures\//, ""), checks: drawn.failing });
    figures.set(r.key, { src: `${folder}/${r.key}.svg`, caption: resolved.texts.get(r.captionKey), wide: r.figure.wide, readings: drawn.readings });
  }
  return { figures, written, failures };
}

/** One HTML file to print: where its PDF and page PNGs go, and what its footer says. */
export type PrintJob = {
  html: string;
  pdf: string;
  pagesDir: string;
  footer: string;
  /** Prefix for every problem found in this document ("parametros-v2.html: "). */
  tag?: string;
};

export type PrintResult = { pdf?: string; pages: string[] };

type Problems = Pick<SheetResult, "katexErrors" | "brokenImages" | "pageErrors" | "problems">;

/**
 * Print HTML documents to A4 PDFs in one browser, then rasterise each PDF's
 * pages. Every KaTeX error, broken image and page error is appended to
 * `problems`, tagged with its document.
 */
export async function printDocuments(jobs: PrintJob[], options: SheetOptions, problems: Problems): Promise<PrintResult[]> {
  const results: PrintResult[] = jobs.map(() => ({ pages: [] }));
  const katex = options.katex ?? KATEX;
  const browser = await chromium.launch();
  try {
    for (const [i, job] of jobs.entries()) {
      const tag = job.tag ?? "";
      const page = await browser.newPage();
      page.on("pageerror", (error) => problems.pageErrors.push(tag + String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") problems.pageErrors.push(tag + message.text());
      });
      await page.goto(pathToFileURL(job.html).href, { waitUntil: "networkidle" });
      try {
        await page.waitForFunction(() => (window as unknown as { __mathDone?: boolean }).__mathDone === true, null, {
          timeout: 30000,
        });
      } catch {
        problems.problems.push(
          `${tag}KaTeX did not finish loading from ${katex} -- no network, or a wrong --katex; ` +
            `the PDF would show raw TeX, so it was not written`,
        );
        await page.close();
        continue;
      }
      await page.evaluate(() => document.fonts.ready);
      const katexErrors = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".katex-error")).map((e) => (e as HTMLElement).title || e.textContent || ""),
      );
      const broken = await page.evaluate(() =>
        Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src") ?? i.src),
      );
      problems.katexErrors.push(...katexErrors.map((e) => tag + e));
      problems.brokenImages.push(...broken.map((e) => tag + e));
      await page.pdf({
        path: job.pdf,
        format: "A4",
        printBackground: true,
        margin: { top: "18mm", bottom: "20mm", left: "17mm", right: "17mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          `<div style="font-size:8pt;color:#777;width:100%;text-align:center;font-family:Segoe UI">` +
          `${escape(job.footer)} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
      });
      await page.close();
      results[i]!.pdf = job.pdf;
    }
  } finally {
    await browser.close();
  }

  if (options.pages !== false) {
    for (const [i, job] of jobs.entries()) {
      if (results[i]!.pdf === undefined) continue;
      await rm(job.pagesDir, { recursive: true, force: true });
      await mkdir(job.pagesDir, { recursive: true });
      const script = fileURLToPath(new URL("./pages.py", import.meta.url));
      const run = spawnSync(process.env.PRANCHETA_PYTHON ?? "python", [script, job.pdf, job.pagesDir, String(options.dpi ?? 110)], {
        encoding: "utf8",
      });
      if (run.error !== undefined || run.status !== 0) {
        problems.problems.push(
          `${job.tag ?? ""}page PNGs not written: ${run.error?.message ?? run.stderr.trim()} ` +
            `(needs Python with PyMuPDF: python -m pip install pymupdf)`,
        );
      } else {
        results[i]!.pages = (await readdir(job.pagesDir))
          .filter((f) => f.endsWith(".png"))
          .sort()
          .map((f) => join(job.pagesDir, f));
      }
    }
  }
  return results;
}

export async function buildSheet(raw: unknown, options: SheetOptions = {}): Promise<SheetResult> {
  const resolved = resolveSheet(raw, options.params);
  const { sheet, texts } = resolved;
  const outDir = resolve(options.out ?? defaultSheetDir(sheet.name));
  const katex = options.katex ?? KATEX;
  const separate = options.answers === "separate";

  const { figures, written, failures } = await writeFigures(resolved, outDir, "figures");

  const htmlPath = join(outDir, `${sheet.name}.html`);
  await writeFile(htmlPath, sheetHtml(sheet, texts, figures, katex, separate ? { parts: "exercises" } : {}), "utf8");
  const gabaritoPath = join(outDir, `${sheet.name}-gabarito.html`);
  if (separate) await writeFile(gabaritoPath, gabaritoHtml(sheet, [{ texts, figures }], katex), "utf8");
  if (options.source !== undefined) await writeFile(join(outDir, `${sheet.name}.json`), options.source, "utf8");

  const result: SheetResult = {
    outDir,
    html: htmlPath,
    pages: [],
    figures: written,
    figureFailures: failures,
    katexErrors: [],
    brokenImages: [],
    pageErrors: [],
    problems: [],
  };
  if (separate) result.gabarito = { html: gabaritoPath, pages: [] };
  if (options.pdf === false) return result;

  const footer = sheet.footer ?? sheet.title;
  const jobs: PrintJob[] = [{ html: htmlPath, pdf: join(outDir, `${sheet.name}.pdf`), pagesDir: join(outDir, "pages"), footer }];
  if (separate) {
    jobs.push({
      html: gabaritoPath,
      pdf: join(outDir, `${sheet.name}-gabarito.pdf`),
      pagesDir: join(outDir, "pages", "gabarito"),
      footer: `${footer} · gabarito`,
      tag: `${sheet.name}-gabarito.html: `,
    });
  }
  const printed = await printDocuments(jobs, options, result);
  if (printed[0]!.pdf !== undefined) result.pdf = printed[0]!.pdf;
  result.pages = printed[0]!.pages;
  if (separate) {
    if (printed[1]!.pdf !== undefined) result.gabarito!.pdf = printed[1]!.pdf;
    result.gabarito!.pages = printed[1]!.pages;
  }
  return result;
}

/** Everything a reader would see go wrong, as lines. Empty means clean. */
export function sheetFailures(result: SheetResult): string[] {
  return [
    ...result.figureFailures.flatMap((f) => f.checks.map((c) => `figure ${f.figure}: ${c}`)),
    ...result.katexErrors.map((e) => `KaTeX: ${e}`),
    ...result.brokenImages.map((src) => `broken image: ${src}`),
    ...result.pageErrors.map((e) => `page error: ${e}`),
    ...result.problems,
  ];
}
