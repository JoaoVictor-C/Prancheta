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
 * the figure's spelling).
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
import type { FigureSpec } from "../ir/types.ts";
import { formatNumber, formatNumberTex, formatPoint, formatPointTex, LOCALES } from "../locale/format.ts";
import type { Locale } from "../locale/format.ts";
import { parseFigureInput } from "../presets/index.ts";
import { functionGraphPoints } from "../presets/function-graph/preset.ts";
import type { FunctionGraphInput } from "../presets/function-graph/preset.ts";
import { render } from "../pipeline.ts";
import * as v from "../presets/validate.ts";

// ---- input ---------------------------------------------------------------

export type SheetLevel = "easy" | "mid" | "hard";

export type SheetFigure = {
  /** A function-graph input (without "preset"). */
  graph?: FunctionGraphInput;
  /** Or any figure input the render command accepts: raw IR or another preset. */
  spec?: unknown;
  /** HTML; placeholders allowed. */
  caption?: string;
  /** Wider on the page. */
  wide?: boolean;
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
  sections: SheetSection[];
};

const LEVELS: Record<SheetLevel, string> = { easy: "fácil", mid: "médio", hard: "difícil" };

// ---- validation ------------------------------------------------------------

function figure(value: unknown, path: string): void {
  const f = v.object(value, path);
  if ((f.graph === undefined) === (f.spec === undefined)) {
    throw new SpecError(`${path} needs exactly one of "graph" (a function-graph input) or "spec"`);
  }
  v.optionalString(f, "caption", path);
  v.optionalBoolean(f, "wide", path);
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
  for (const key of ["subtitle", "footer", "contentsNote", "exercisesLead", "answersLead", "solutionsLead", "closing"]) {
    v.optionalString(s, key, "sheet");
  }
  if (s.cover !== undefined) {
    v.array(s, "cover", "sheet", "HTML blocks").forEach((b, i) => {
      if (typeof b !== "string") throw new SpecError(`sheet.cover[${i}] must be an HTML string`);
    });
  }
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
 */
export function fillText(html: string, points: Points, locale: Locale, where: string): string {
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
      out += /^figure\d*$/.test(body) ? `{{${body}}}` : placeholder(body, points, locale, math, where);
      i = end + 2;
      continue;
    }
    out += html[i];
    i += 1;
  }
  return out;
}

function placeholder(body: string, points: Points, locale: Locale, math: boolean, where: string): string {
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
  throw new SpecError(
    `${where}: unknown placeholder {{${body}}}. Available: {{fig.P}} {{fig.P.x}} {{sol.P}}, {{num:2.5}}, ` +
      `{{num:2073.6:2}}, {{pt:2.5,7.25}}, and {{figure}} for where the figure goes.`,
  );
}

// ---- HTML --------------------------------------------------------------------

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `
  @page { size: A4; margin: 18mm 17mm 20mm 17mm; }
  :root {
    --ink: #1b1f27; --soft: #4e5763; --rule: #d5dae1; --key: #1d4e89;
    --easy: #0f7360; --mid: #9a6200; --hard: #b3400c; --paper: #fcfbf7;
  }
  html { background: white; }
  body { font-family: "Segoe UI", "Noto Sans", system-ui, sans-serif; color: var(--ink);
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
  figure img { width: 84%; max-width: 510px; }
  figure.wide img { width: 96%; max-width: 640px; }
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

type Figures = Map<string, { src: string; caption?: string; wide?: boolean }>;

function figureHtml(key: string, figures: Figures): string {
  const f = figures.get(key);
  if (f === undefined) return "";
  return (
    `<figure${f.wide ? ' class="wide"' : ""}><img src="${f.src}">` +
    (f.caption === undefined ? "" : `<figcaption>${f.caption}</figcaption>`) +
    `</figure>`
  );
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

/** The whole document. Figures are referenced by the relative paths in `figures`. */
export function sheetHtml(sheet: SheetInput, texts: Map<string, string>, figures: Figures, katex = KATEX): string {
  const t = (key: string): string => texts.get(key) ?? "";
  const tag = (level: SheetLevel): string => `<span class="tag ${level}">${LEVELS[level]}</span>`;
  const out: string[] = [];
  out.push(`<!DOCTYPE html>
<html lang="${sheet.locale ?? "pt-BR"}">
<head>
<meta charset="utf-8">
<title>${escape(sheet.title)}</title>
<link rel="stylesheet" href="${katex}/katex.min.css">
<script src="${katex}/katex.min.js"></script>
<script src="${katex}/contrib/auto-render.min.js"></script>
<style>${STYLE}</style>
</head>
<body>
<section class="cover">
  <h1>${escape(sheet.title)}</h1>`);
  if (sheet.subtitle !== undefined) out.push(`  <p class="sub">${escape(sheet.subtitle)}</p>`);
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
  out.push(`</section>

<section class="part">
<p class="part-title">Parte I: Exercícios</p>`);
  if (sheet.exercisesLead !== undefined) out.push(`<p class="lead">${t("exercisesLead")}</p>`);
  for (const [i, section] of sheet.sections.entries()) {
    out.push(`\n<h2>${escape(section.title)}</h2>`);
    if (section.lead !== undefined) out.push(`<p class="lead">${t(`s${i}.lead`)}</p>`);
    for (const e of section.exercises) {
      const note = e.note === undefined ? "" : ` <span class="note">${escape(e.note)}</span>`;
      out.push(
        `<div class="q ${e.level}"><div class="qh">${escape(e.id)} ${tag(e.level)}${note}</div>\n` +
          place(t(`${e.id}.statement`), keysOf("q", e).map((k) => figureHtml(k, figures))) +
          `\n</div>`,
      );
    }
  }
  out.push(`</section>

<section class="part">
<p class="part-title">Gabarito rápido</p>`);
  if (sheet.answersLead !== undefined) out.push(`<p class="lead">${t("answersLead")}</p>`);
  out.push(`<table class="ref gab">`);
  for (const section of sheet.sections) {
    for (const e of section.exercises) out.push(`  <tr><td>${escape(e.id)}</td><td>${t(`${e.id}.answer`)}</td></tr>`);
  }
  out.push(`</table>
</section>

<section class="part">
<p class="part-title">Parte II: Resoluções comentadas</p>`);
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
  if (sheet.closing !== undefined) out.push(`<div class="box">${t("closing")}</div>`);
  out.push(`</section>

<script>
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
  return out.join("\n");
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
};

/** Where sheets go unless told otherwise: ProjectHub/Listas/<name>, beside this repository. */
export function defaultSheetDir(name: string): string {
  const base =
    process.env.PRANCHETA_SHEETS_DIR ??
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "Listas");
  return join(base, name);
}

function figureSpec(f: SheetFigure, where: string): FigureSpec {
  try {
    return f.graph !== undefined ? parseFigureInput({ preset: "function-graph", ...f.graph }) : parseFigureInput(f.spec);
  } catch (error) {
    throw new SpecError(`${where}: ${(error as Error).message}`);
  }
}

export type SheetOptions = {
  out?: string;
  pdf?: boolean;
  pages?: boolean;
  /** Page raster resolution. */
  dpi?: number;
  katex?: string;
  /** The source document, copied into the output folder verbatim. */
  source?: string;
};

export async function buildSheet(raw: unknown, options: SheetOptions = {}): Promise<SheetResult> {
  const sheet = validateSheet(raw);
  const locale = sheet.locale ?? "pt-BR";
  const outDir = resolve(options.out ?? defaultSheetDir(sheet.name));
  await mkdir(join(outDir, "figures"), { recursive: true });

  // Text first: every placeholder resolved against the figure it cites,
  // before anything is drawn, so a bad reference fails fast.
  const texts = new Map<string, string>();
  const none = { fig: new Map(), sol: new Map() };
  const put = (key: string, html: string | undefined, points: Points = none): void => {
    if (html !== undefined) texts.set(key, fillText(html, points, locale, key));
  };
  put("contentsNote", sheet.contentsNote);
  (sheet.cover ?? []).forEach((b, i) => put(`cover.${i}`, b));
  put("exercisesLead", sheet.exercisesLead);
  put("answersLead", sheet.answersLead);
  put("solutionsLead", sheet.solutionsLead);
  put("closing", sheet.closing);
  // A placeholder names a point of any of the exercise's (or solution's)
  // function graphs; the first one to declare it wins.
  const pointsOf = (f: SheetFigure | SheetFigure[] | undefined): Map<string, { x: number; y: number }> => {
    const merged = new Map<string, { x: number; y: number }>();
    for (const one of listOf(f)) {
      if (one.graph === undefined) continue;
      for (const [id, p] of functionGraphPoints(one.graph)) if (!merged.has(id)) merged.set(id, p);
    }
    return merged;
  };
  for (const [i, section] of sheet.sections.entries()) {
    put(`s${i}.lead`, section.lead);
    put(`s${i}.solutionsIntro`, section.solutionsIntro);
    for (const e of section.exercises) {
      const points = { fig: pointsOf(e.figure), sol: pointsOf(e.solutionFigure) };
      put(`${e.id}.statement`, e.statement, points);
      put(`${e.id}.answer`, e.answer, points);
      put(`${e.id}.solution`, e.solution, points);
      listOf(e.figure).forEach((f, k) => put(`${e.id}.figure.${k}.caption`, f.caption, points));
      listOf(e.solutionFigure).forEach((f, k) => put(`${e.id}.solutionFigure.${k}.caption`, f.caption, points));
    }
  }

  // Figures, each through the full pipeline: its checks are the sheet's checks.
  const figures: Figures = new Map();
  const written: string[] = [];
  const figureFailures: SheetResult["figureFailures"] = [];
  for (const section of sheet.sections) {
    for (const e of section.exercises) {
      const all = [
        ...listOf(e.figure).map((f, k) => ["q", f, k, `${e.id}.figure.${k}.caption`] as const),
        ...listOf(e.solutionFigure).map((f, k) => ["s", f, k, `${e.id}.solutionFigure.${k}.caption`] as const),
      ];
      for (const [kind, f, index, captionKey] of all) {
        const key = figureKey(kind, e.id, index);
        const result = await render(figureSpec(f, `exercise ${e.id} ${kind === "q" ? "figure" : "solutionFigure"}`), {
          raster: false,
        });
        const file = join(outDir, "figures", `${key}.svg`);
        await writeFile(file, result.svg, "utf8");
        written.push(file);
        const failing = result.manifest.checks.filter((c) => c.status === "fail");
        if (failing.length > 0) {
          figureFailures.push({ figure: key, checks: failing.map((c) => `${c.id} ${c.target}: ${c.detail ?? ""}`) });
        }
        figures.set(key, { src: `figures/${key}.svg`, caption: texts.get(captionKey), wide: f.wide });
      }
    }
  }

  const htmlPath = join(outDir, `${sheet.name}.html`);
  await writeFile(htmlPath, sheetHtml(sheet, texts, figures, options.katex ?? KATEX), "utf8");
  if (options.source !== undefined) await writeFile(join(outDir, `${sheet.name}.json`), options.source, "utf8");

  const result: SheetResult = {
    outDir,
    html: htmlPath,
    pages: [],
    figures: written,
    figureFailures,
    katexErrors: [],
    brokenImages: [],
    pageErrors: [],
    problems: [],
  };
  if (options.pdf === false) return result;

  const pdfPath = join(outDir, `${sheet.name}.pdf`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => result.pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") result.pageErrors.push(message.text());
    });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    try {
      await page.waitForFunction(() => (window as unknown as { __mathDone?: boolean }).__mathDone === true, null, {
        timeout: 30000,
      });
    } catch {
      result.problems.push(
        `KaTeX did not finish loading from ${options.katex ?? KATEX} -- no network, or a wrong --katex; ` +
          `the PDF would show raw TeX, so it was not written`,
      );
      return result;
    }
    await page.evaluate(() => document.fonts.ready);
    result.katexErrors = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".katex-error")).map((e) => (e as HTMLElement).title || e.textContent || ""),
    );
    result.brokenImages = await page.evaluate(() =>
      Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src") ?? i.src),
    );
    const footer = escape(sheet.footer ?? sheet.title);
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "20mm", left: "17mm", right: "17mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        `<div style="font-size:8pt;color:#777;width:100%;text-align:center;font-family:Segoe UI">` +
        `${footer} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    });
    result.pdf = pdfPath;
  } finally {
    await browser.close();
  }

  if (options.pages !== false) {
    const pagesDir = join(outDir, "pages");
    await rm(pagesDir, { recursive: true, force: true });
    await mkdir(pagesDir, { recursive: true });
    const script = fileURLToPath(new URL("./pages.py", import.meta.url));
    const run = spawnSync(process.env.PRANCHETA_PYTHON ?? "python", [script, pdfPath, pagesDir, String(options.dpi ?? 110)], {
      encoding: "utf8",
    });
    if (run.error !== undefined || run.status !== 0) {
      result.problems.push(
        `page PNGs not written: ${run.error?.message ?? run.stderr.trim()} ` +
          `(needs Python with PyMuPDF: python -m pip install pymupdf)`,
      );
    } else {
      result.pages = (await readdir(pagesDir)).filter((f) => f.endsWith(".png")).sort().map((f) => join(pagesDir, f));
    }
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
