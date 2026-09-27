/**
 * Variant sheets and the separate gabarito (ADR 0042): `sheet --variants N`
 * and `--answers separate`. Built with `pdf: false` -- every figure is still
 * rendered and checked, which is what admission is about; printing is the
 * plain build's business and is tested there.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { commandByName } from "../src/commands.ts";
import { buildSheet, resolveSheet } from "../src/sheet/sheet.ts";
import type { SheetInput } from "../src/sheet/sheet.ts";
import { toNumbers } from "../src/sheet/variants.ts";
import { buildVariantSheets, variantFailures } from "../src/sheet/versions.ts";

const STUB = pathToFileURL(fileURLToPath(new URL("./fixtures/katex-stub", import.meta.url))).href;
const PARAMS = fileURLToPath(new URL("../experiments/exercises/parametros/lista.json", import.meta.url));
const demo = (): unknown => JSON.parse(readFileSync(PARAMS, "utf8"));
const tmp = (): string => mkdtempSync(join(tmpdir(), "prancheta-variants-"));
const read = (path: string): string => readFileSync(path, "utf8");

/** The part of a sheet after its cover: sections, exercises and figures. */
const exercisesOf = (html: string): string => html.slice(html.indexOf("\n<h2>"), html.indexOf("<script>\n  window.__mathDone"));

/** A one-exercise sheet whose figure's x range is fixed while the area's bound b is sampled. */
function areaSheet(domain: { int: [number, number] }): SheetInput {
  return {
    name: "area",
    title: "Área",
    sections: [
      {
        title: "1. Áreas",
        exercises: [
          {
            id: "1.1",
            level: "easy",
            params: { b: 2, "f(x)": "x", A: "integral(f(x), x, 0, b)" },
            variants: { domains: { b: domain }, maxTries: 40 },
            statement: "<p>Calcule a área sob \\(y = x\\) de \\(0\\) a \\({{b}}\\).</p>{{figure}}",
            figure: {
              graph: {
                x: { range: [-0.5, 3.5], unit: 60 },
                y: { range: [-0.5, 3.5], unit: 60 },
                functions: [{ id: "f", expr: "{{f}}", label: { text: "y = {expr}", at: 0.8, towards: ["L", "U"] } }],
                areas: [{ id: "A", of: "f", from: 0, to: "{{= b}}" }],
              },
            },
            answer: "\\(A = {{A}}\\)",
            solution: "<p>\\(A = \\frac{ {{b}}^2 }{2} = {{A}}\\).</p>",
          },
        ],
      },
    ],
  } as unknown as SheetInput;
}

test("same seed, same set: manifest and every HTML byte-identical; another seed differs", { timeout: 240000 }, async () => {
  const [a, b, c] = [tmp(), tmp(), tmp()];
  const one = await buildVariantSheets(demo(), { count: 3, out: a, katex: STUB, pdf: false });
  const two = await buildVariantSheets(demo(), { count: 3, out: b, katex: STUB, pdf: false });
  assert.deepEqual(variantFailures(one), []);
  assert.equal(one.seed, "parametros", "the seed defaults to the sheet's name");
  assert.equal(read(one.manifest), read(two.manifest));
  for (let k = 0; k < 3; k += 1) assert.equal(read(one.versions[k]!.html), read(two.versions[k]!.html), `v${k + 1}`);
  assert.equal(read(one.gabarito!.html), read(two.gabarito!.html));

  const other = await buildVariantSheets(demo(), { count: 3, out: c, katex: STUB, pdf: false, seed: "outra semente" });
  const sampled = (r: typeof one): string => JSON.stringify(r.versions.map((v) => Object.values(v.exercises).map((e) => e.sampled)));
  assert.notEqual(sampled(other), sampled(one));
  assert.match(read(other.versions[1]!.html), /semente “outra semente”/, "the seed is printed on the sheet");

  // Each version's numbers differ from the others' for every exercise with variants.
  for (const id of ["1.1", "2.1", "2.2"]) {
    const seen = new Set(one.versions.map((v) => JSON.stringify(v.exercises[id]!.sampled)));
    assert.equal(seen.size, 3, id);
  }
  // An exercise without variants is the same in every version.
  assert.deepEqual(one.versions.map((v) => v.exercises["1.2"]!.sampled), [undefined, undefined, undefined]);
});

test("version 1 is the author's own list: same exercises, same figures, as the plain build", { timeout: 240000 }, async () => {
  const [a, b] = [tmp(), tmp()];
  const variants = await buildVariantSheets(demo(), { count: 2, out: a, katex: STUB, pdf: false });
  const plain = await buildSheet(demo(), { out: b, katex: STUB, pdf: false, answers: "separate" });
  const v1 = exercisesOf(read(variants.versions[0]!.html)).replaceAll("figures/v1/", "figures/");
  assert.equal(v1, exercisesOf(read(plain.html)));
  for (const f of plain.figures) {
    const name = f.slice(f.lastIndexOf("figures") + "figures".length + 1);
    assert.equal(read(join(a, "figures", "v1", name)), read(f), name);
  }
  // And the values the manifest records are the author's.
  const author = resolveSheet(demo()).params.exercises;
  for (const [id, entry] of Object.entries(variants.versions[0]!.exercises)) {
    assert.deepEqual(entry.values, Object.fromEntries(author.get(id)!.values), id);
  }
});

test("a draw whose figure the pipeline refuses is rejected and counted, never handed out", { timeout: 240000 }, async () => {
  // x is plotted up to 3.5: every b from 4 to 9 puts the shaded area outside the drawing.
  const result = await buildVariantSheets(areaSheet({ int: [4, 9] }), { count: 2, out: tmp(), katex: STUB, pdf: false });
  const report = result.exercises[0]!;
  assert.equal(report.admitted, 1, "only the author's own b = 2");
  const refused = Object.entries(report.rejections).filter(([k]) => k.startsWith("figure q1-1"));
  assert.ok(refused.length > 0, `rejections: ${JSON.stringify(report.rejections)}`);
  const counted = Object.values(report.rejections).reduce((sum, n) => sum + n, 0);
  assert.equal(counted, report.triesUsed - 1, "every draw but the pinned one is counted under a reason");
  assert.ok(refused.every(([k]) => k in report.rejectionExamples), "every reason keeps a full example message");
  assert.match(Object.values(report.rejectionExamples).join("\n"), /\d/, "the example keeps the numbers the key drops");
  for (const v of result.versions) assert.equal(v.exercises["1.1"]!.sampled!.b, 2, "a refused figure never reaches a version");
  const manifest = JSON.parse(read(result.manifest));
  assert.deepEqual(manifest.exercises[0].rejections, report.rejections, "the counts reach the manifest");
});

test("a shortfall is reported, fails the command, and --allowShortfall repeats versions instead", { timeout: 240000 }, async () => {
  // Only b = 1, 2, 3 draw inside the figure: four versions cannot all differ.
  const result = await buildVariantSheets(areaSheet({ int: [1, 6] }), { count: 4, out: tmp(), katex: STUB, pdf: false });
  assert.equal(result.shortfalls.length, 1);
  assert.match(result.shortfalls[0]!, /exercise 1\.1: requested 4 variant\(s\), admitted 3/);
  assert.match(variantFailures(result).join("\n"), /^shortfall: exercise 1\.1/m);
  assert.deepEqual(variantFailures(result, true), []);
  assert.equal(result.versions[3]!.exercises["1.1"]!.repeatsVersion, 1);
  assert.match(JSON.parse(read(result.manifest)).exercises[0].shortfall, /admitted 3/);

  const dir = tmp();
  const file = join(dir, "area.json");
  writeFileSync(file, JSON.stringify(areaSheet({ int: [1, 6] })), "utf8");
  const sheet = commandByName("sheet")!;
  const args = { sheet: file, out: join(dir, "out"), pdf: false, katex: STUB, variants: 4 };
  const failed = await sheet.run(args);
  assert.equal(failed.exitCode, 2);
  assert.match(failed.text, /FAIL shortfall: exercise 1\.1/);
  const allowed = await sheet.run({ ...args, allowShortfall: true });
  assert.equal(allowed.exitCode, 0, allowed.text);
  assert.match(allowed.text, /WARN shortfall \(allowed\)/);
});

test("the gabarito holds every version's answers and solutions, and no statement", { timeout: 240000 }, async () => {
  const out = tmp();
  const result = await buildVariantSheets(demo(), { count: 3, out, katex: STUB, pdf: false });
  const gabarito = read(result.gabarito!.html);
  assert.doesNotMatch(gabarito, /class="q /, "no exercise box");
  assert.doesNotMatch(gabarito, /Calcule a área da região|Encontre a equação da reta tangente/, "no statement text");
  assert.doesNotMatch(gabarito, /\{\{(?!figure)/, "no raw placeholder");
  for (const [k, v] of result.versions.entries()) {
    const overrides = Object.fromEntries(
      Object.entries(v.exercises)
        .filter(([, e]) => e.sampled !== undefined)
        .map(([id, e]) => [id, toNumbers(e.sampled!)]),
    );
    const texts = resolveSheet(demo(), { exercises: overrides }).texts;
    const part = gabarito.slice(gabarito.indexOf(`Versão ${k + 1}</p>`), k < 2 ? gabarito.indexOf(`Versão ${k + 2}</p>`) : undefined);
    assert.ok(part.length > 0, `Versão ${k + 1}`);
    for (const id of ["1.1", "1.2", "2.1", "2.2"]) {
      assert.ok(part.includes(`<td>${id}</td><td>${texts.get(`${id}.answer`)}</td>`), `v${k + 1} key ${id}`);
      assert.ok(part.includes(`Resposta: ${texts.get(`${id}.answer`)}`), `v${k + 1} solution ${id}`);
    }
    assert.ok(part.includes(`figures/v${k + 1}/s2-1.svg`), "each version's solution figures are its own");
    // And the version's own sheet has its statements and no answers.
    const sheet = read(v.html);
    assert.ok(sheet.includes(texts.get("2.2.statement")!.slice(0, 40)));
    assert.doesNotMatch(sheet, /Gabarito rápido|Resposta:/);
  }
  assert.equal(result.versions[1]!.html, join(out, "parametros-v2.html"));
  assert.equal(result.gabarito!.html, join(out, "parametros-gabarito.html"));
});

test("--answers separate splits a plain build into the exercises and a gabarito", { timeout: 240000 }, async () => {
  const out = tmp();
  const result = await buildSheet(demo(), { out, katex: STUB, pdf: false, answers: "separate" });
  const sheet = read(result.html);
  const gabarito = read(result.gabarito!.html);
  assert.match(sheet, /class="q easy"/);
  assert.doesNotMatch(sheet, /Gabarito rápido|Resposta:/);
  assert.doesNotMatch(gabarito, /class="q /);
  assert.match(gabarito, /Gabarito rápido/);
  assert.match(gabarito, /Resposta: \\\(A = 4\{,\}5\\\)/);
  assert.equal(result.gabarito!.html, join(out, "parametros-gabarito.html"));
  // Inline stays the default: one document with everything.
  const inline = await buildSheet(demo(), { out: tmp(), katex: STUB, pdf: false });
  assert.equal(inline.gabarito, undefined);
  assert.match(read(inline.html), /Gabarito rápido[\s\S]*Resposta:/);
});
