/**
 * Versions of an exercise sheet: the same list N times with fresh numbers,
 * and the answers in a document of their own (ADR 0042).
 *
 * A student revising from a list wants the same exercises again with other
 * numbers, and wants to check their work afterwards without the answers
 * sitting on the page they are working from. So `sheet --variants N` writes
 * N sheets of exercises only and ONE gabarito holding, per version, the
 * answer key and the worked solutions.
 *
 * Every number still derives from one place. An exercise's `variants` names
 * which of its number `params` are sampled (`variants.ts`); a draw is handed
 * to `calc.evaluateParams` as overrides -- the one evaluator of params --
 * and the environment it returns is what the predicates see, what the text
 * prints and what the figures are substituted from. A draw is admitted only
 * when that environment passes the predicates, every text placeholder
 * resolves, and every figure of the exercise renders with every check
 * passing: a figure that fails its checks is never handed to a student.
 *
 * Version 1 is the author's own numbers (`pinFirst`). The seed defaults to
 * the sheet's name and is printed on every page, so the same set can be
 * regenerated to check a printed version against its answers.
 */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { SpecError } from "../ir/types.ts";
import { evaluateParams } from "./calc.ts";
import {
  KATEX,
  defaultSheetDir,
  gabaritoHtml,
  printDocuments,
  renderSheetFigure,
  resolveSheet,
  sheetHtml,
  validateSheet,
  writeFigures,
} from "./sheet.ts";
import type {
  FigureCache,
  GabaritoEntry,
  PrintJob,
  SheetExercise,
  SheetInput,
  SheetOptions,
  SheetResult,
} from "./sheet.ts";
import { VariantsError, generateVariants, toNumbers } from "./variants.ts";
import type { Env, ParamValue, Refusal } from "./variants.ts";

export type VariantSheetOptions = SheetOptions & {
  /** How many versions of the list. */
  count: number;
  /** Replay key; default the sheet's name. Each exercise draws from `<seed>/<id>`. */
  seed?: string;
  /** Build even when an exercise could not reach `count` distinct admitted variants. */
  allowShortfall?: boolean;
};

/** What the sampler did for one exercise with `variants`. */
export type ExerciseVariantReport = {
  exercise: string;
  seed: string;
  sampled: string[];
  requested: number;
  admitted: number;
  triesUsed: number;
  /** Rejected draws by reason: a predicate's name, "duplicate", or what refused / which check failed. */
  rejections: Record<string, number>;
  /** The first full message behind each rejection reason, numbers and all. */
  rejectionExamples: Record<string, string>;
  shortfall?: string;
};

export type VersionReport = {
  version: number;
  html: string;
  pdf?: string;
  pages: string[];
  /** Per exercise: the sampled values (absent when the exercise has no `variants`) and every value param. */
  exercises: Record<string, { sampled?: Record<string, ParamValue>; values: Record<string, number>; repeatsVersion?: number }>;
};

export type VariantSheetResult = Pick<
  SheetResult,
  "outDir" | "figures" | "figureFailures" | "katexErrors" | "brokenImages" | "pageErrors" | "problems"
> & {
  seed: string;
  count: number;
  versions: VersionReport[];
  /** Absent with `answers: "inline"`: each version carries its own answers. */
  gabarito?: { html: string; pdf?: string; pages: string[] };
  exercises: ExerciseVariantReport[];
  /** One line per exercise that fell short; a failure unless `allowShortfall`. */
  shortfalls: string[];
  manifest: string;
};

/** A reason key that counts one kind of failure, not one per number: "the pole at x = 2" → "x = #". */
function reasonKey(message: string): string {
  const flat = message.replace(/\s+/g, " ").replace(/[−-]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/g, "#");
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The sheet with only this exercise in it: what admission resolves and draws. */
function onlyExercise(sheet: SheetInput, id: string): SheetInput {
  for (const section of sheet.sections) {
    const e = section.exercises.find((x) => x.id === id);
    if (e !== undefined) return { ...sheet, sections: [{ ...section, exercises: [e] }] };
  }
  throw new SpecError(`no exercise "${id}"`);
}

export async function buildVariantSheets(raw: unknown, options: VariantSheetOptions): Promise<VariantSheetResult> {
  const { count } = options;
  if (!Number.isInteger(count) || count < 1) throw new SpecError(`--variants must be a positive integer, got ${count}`);
  const sheet = validateSheet(raw);
  const seed = options.seed ?? sheet.name;
  const answers = options.answers ?? "separate";
  const katex = options.katex ?? KATEX;
  // The author's own values: every error an author made surfaces here, not as a rejected draw.
  const base = resolveSheet(raw);
  const cache: FigureCache = new Map();

  // ---- sampling, per exercise --------------------------------------------------------
  const exercises: SheetExercise[] = sheet.sections.flatMap((s) => s.exercises);
  const reports: ExerciseVariantReport[] = [];
  const admitted = new Map<string, { params: Record<string, ParamValue> }[]>();
  for (const e of exercises) {
    if (e.variants === undefined) continue;
    const names = Object.keys(e.variants.domains);
    const own = base.params.exercises.get(e.id)!;
    const pinFirst = Object.fromEntries(names.map((n) => [n, own.values.get(n)!]));
    const examples: Record<string, string> = {};
    const note = (key: string, full: string): string => {
      examples[key] ??= full;
      return key;
    };
    const evaluate = (sampled: Readonly<Record<string, ParamValue>>): Env | Refusal => {
      try {
        const env = evaluateParams(e.params, toNumbers(sampled), base.params.sheet, `${e.id}.params`);
        return Object.fromEntries(env.values);
      } catch (error) {
        if (!(error instanceof SpecError)) throw error;
        return { refused: note(`params refused: ${reasonKey(error.message)}`, error.message) };
      }
    };
    const admit = async (sampled: Readonly<Record<string, ParamValue>>) => {
      let resolved;
      try {
        resolved = resolveSheet(onlyExercise(sheet, e.id), { exercises: { [e.id]: toNumbers(sampled) } });
      } catch (error) {
        if (!(error instanceof SpecError)) throw error;
        return { ok: false, reasons: [note(`text refused: ${reasonKey(error.message)}`, error.message)] };
      }
      const reasons: string[] = [];
      for (const r of resolved.figures) {
        try {
          const drawn = await renderSheetFigure(r, cache);
          drawn.checkIds.forEach((id, i) => reasons.push(note(`figure ${r.key}: check ${id}`, drawn.failing[i]!)));
        } catch (error) {
          if (!(error instanceof SpecError)) throw error;
          reasons.push(note(`figure ${r.key} refused: ${reasonKey(error.message)}`, error.message));
        }
      }
      return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
    };
    const exSeed = `${seed}/${e.id}`;
    let generated;
    try {
      generated = await generateVariants({
        domains: e.variants.domains,
        predicates: e.variants.predicates ?? [],
        count,
        seed: exSeed,
        ...(e.variants.maxTries === undefined ? {} : { maxTries: e.variants.maxTries }),
        evaluate,
        admit,
        pinFirst,
      });
    } catch (error) {
      if (!(error instanceof VariantsError)) throw error;
      throw new SpecError(`exercise ${e.id}: ${error.message}`);
    }
    admitted.set(e.id, generated.variants);
    reports.push({
      exercise: e.id,
      seed: exSeed,
      sampled: names,
      requested: count,
      admitted: generated.variants.length,
      triesUsed: generated.triesUsed,
      rejections: generated.rejections,
      rejectionExamples: Object.fromEntries(Object.keys(generated.rejections).filter((k) => k in examples).map((k) => [k, examples[k]!])),
      ...(generated.shortfall === undefined ? {} : { shortfall: generated.shortfall.message }),
    });
  }
  const shortfalls = reports.filter((r) => r.shortfall !== undefined).map((r) => `exercise ${r.exercise}: ${r.shortfall}`);

  // ---- the versions --------------------------------------------------------------------
  const outDir = resolve(options.out ?? defaultSheetDir(sheet.name));
  await mkdir(outDir, { recursive: true });
  // Only what a variant build owns: a plain build's figures/ and pages/ beside it stay intact.
  for (const folder of ["figures", "pages"]) {
    const entries = await readdir(join(outDir, folder)).catch(() => [] as string[]);
    for (const name of entries) {
      if (/^(v\d+|gabarito)$/.test(name)) await rm(join(outDir, folder, name), { recursive: true, force: true });
    }
  }
  const footer = sheet.footer ?? sheet.title;
  const result: VariantSheetResult = {
    outDir,
    seed,
    count,
    versions: [],
    exercises: reports,
    shortfalls,
    manifest: join(outDir, `${sheet.name}-variants.json`),
    figures: [],
    figureFailures: [],
    katexErrors: [],
    brokenImages: [],
    pageErrors: [],
    problems: [],
  };
  const entries: GabaritoEntry[] = [];
  const jobs: PrintJob[] = [];
  for (let k = 1; k <= count; k += 1) {
    const overrides: Record<string, Record<string, number>> = {};
    const picks = new Map<string, { sampled: Record<string, ParamValue>; repeatsVersion?: number }>();
    for (const e of exercises) {
      const list = admitted.get(e.id);
      if (list === undefined) continue;
      const pick = list[(k - 1) % list.length]!;
      overrides[e.id] = toNumbers(pick.params);
      picks.set(e.id, { sampled: pick.params, ...(k > list.length ? { repeatsVersion: ((k - 1) % list.length) + 1 } : {}) });
    }
    const resolved = resolveSheet(raw, { exercises: overrides });
    const report: VersionReport = { version: k, html: "", pages: [], exercises: {} };
    for (const e of exercises) {
      const values = Object.fromEntries(resolved.params.exercises.get(e.id)!.values);
      const pick = picks.get(e.id);
      report.exercises[e.id] = pick === undefined ? { values } : { ...pick, values };
    }
    const drawn = await writeFigures(resolved, outDir, `figures/v${k}`, cache);
    result.figures.push(...drawn.written);
    result.figureFailures.push(...drawn.failures);
    const label = `versão ${k} de ${count}`;
    const html = join(outDir, `${sheet.name}-v${k}.html`);
    await writeFile(
      html,
      sheetHtml(sheet, resolved.texts, drawn.figures, katex, {
        parts: answers === "separate" ? "exercises" : "all",
        stamp: { label, line: `Versão ${k} de ${count} · semente “${seed}”` },
      }),
      "utf8",
    );
    report.html = html;
    result.versions.push(report);
    entries.push({ label: `Versão ${k}`, texts: resolved.texts, figures: drawn.figures });
    jobs.push({
      html,
      pdf: join(outDir, `${sheet.name}-v${k}.pdf`),
      pagesDir: join(outDir, "pages", `v${k}`),
      footer: `${footer} · versão ${k}/${count} · semente “${seed}”`,
      tag: `${basename(html)}: `,
    });
  }
  if (answers === "separate") {
    const html = join(outDir, `${sheet.name}-gabarito.html`);
    await writeFile(
      html,
      gabaritoHtml(sheet, entries, katex, {
        label: "gabarito",
        line: `Versões 1 a ${count} · semente “${seed}”`,
      }),
      "utf8",
    );
    result.gabarito = { html, pages: [] };
    jobs.push({
      html,
      pdf: join(outDir, `${sheet.name}-gabarito.pdf`),
      pagesDir: join(outDir, "pages", "gabarito"),
      footer: `${footer} · gabarito · semente “${seed}”`,
      tag: `${basename(html)}: `,
    });
  }
  if (options.source !== undefined) await writeFile(join(outDir, `${sheet.name}.json`), options.source, "utf8");

  if (options.pdf !== false) {
    const printed = await printDocuments(jobs, options, result);
    printed.forEach((p, i) => {
      const target = i < count ? result.versions[i]! : result.gabarito!;
      if (p.pdf !== undefined) target.pdf = p.pdf;
      target.pages = p.pages;
    });
  }

  await writeFile(result.manifest, manifestJson(sheet, result, answers, outDir), "utf8");
  return result;
}

/** The manifest: everything needed to regenerate or audit the set, paths relative, nothing time-dependent. */
function manifestJson(sheet: SheetInput, r: VariantSheetResult, answers: string, outDir: string): string {
  const rel = (p: string | undefined): string | undefined => (p === undefined ? undefined : relative(outDir, p).replace(/\\/g, "/"));
  const byId = new Map(sheet.sections.flatMap((s) => s.exercises).map((e) => [e.id, e]));
  return (
    JSON.stringify(
      {
        sheet: sheet.name,
        seed: r.seed,
        versions: r.count,
        answers,
        exercises: r.exercises.map((x) => ({
          ...x,
          domains: byId.get(x.exercise)!.variants!.domains,
          predicates: byId.get(x.exercise)!.variants!.predicates ?? [],
        })),
        shortfalls: r.shortfalls,
        builds: r.versions.map((v) => ({
          version: v.version,
          html: rel(v.html),
          ...(v.pdf === undefined ? {} : { pdf: rel(v.pdf) }),
          exercises: v.exercises,
        })),
        ...(r.gabarito === undefined
          ? {}
          : { gabarito: { html: rel(r.gabarito.html), ...(r.gabarito.pdf === undefined ? {} : { pdf: rel(r.gabarito.pdf) }) } }),
      },
      null,
      2,
    ) + "\n"
  );
}

/** Everything that makes a variant build fail: what a reader would see go wrong, and (unless allowed) a shortfall. */
export function variantFailures(result: VariantSheetResult, allowShortfall = false): string[] {
  return [
    ...(allowShortfall ? [] : result.shortfalls.map((s) => `shortfall: ${s}`)),
    ...result.figureFailures.flatMap((f) => f.checks.map((c) => `figure ${f.figure}: ${c}`)),
    ...result.katexErrors.map((e) => `KaTeX: ${e}`),
    ...result.brokenImages.map((src) => `broken image: ${src}`),
    ...result.pageErrors.map((e) => `page error: ${e}`),
    ...result.problems,
  ];
}
