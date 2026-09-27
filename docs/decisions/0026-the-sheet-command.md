# 0026 — An exercise sheet is one document, and `sheet` builds it

## Status

Accepted.

## The defect

The Cálculo 1 list was five artefacts held together by hand: `lista.html` (edited directly, then patched by `rewrite.py`, `patch23.py`, `patchfig.py`, `fixgab.py`, `edit_text.py`), `figs.mjs` for the figures, `render.sh` to render them, `pdf.mjs` for the PDF, and `pdftoppm` for page images. What drifted between them:

- the answer key was typed a second time, and the worked solutions ended with a *third* copy of each answer ("Resposta: 4" beside the key's "4");
- coordinates in the text — "P = (2; 5)", "(4; 8)" — were typed separately from the labels on the figures;
- KaTeX errors were only caught if someone ran `pdf.mjs` and read its JSON;
- page images needed poppler, which a stock Windows machine does not have;
- the whole thing lived in a temporary folder.

## The decision

**A sheet is one JSON document**: title, sections, and per exercise `level`, `statement`, `figure` (a function-graph input), `answer`, `solution`, `solutionFigure`. Text is HTML with KaTeX delimiters, because that is what the list was already written in and HTML is what Playwright prints.

**`sheet` builds everything from it** (`src/sheet/sheet.ts`, exposed on the CLI and MCP from the one command table):

1. every placeholder resolved first, so a bad reference fails before anything is drawn;
2. every figure rendered through the full pipeline — its checks are the sheet's checks;
3. HTML with KaTeX (inline formulas `white-space: nowrap`), rendered with `throwOnError: false` so an error becomes a `.katex-error` element the build can find;
4. an A4 PDF via Playwright, with the footer and page numbers;
5. a PNG per page via **PyMuPDF** (`src/sheet/pages.py`) — one `pip install`, a second renderer independent of the Chromium that wrote the PDF;
6. the source JSON copied beside its PDF.

It returns, and fails on, every KaTeX error, broken image, page error and figure that failed a check.

**The answer is written once.** The key is generated from `answer`, and the same field closes each worked solution as "Resposta: …". The converted list therefore reads slightly differently from the original: where the old solution ended "S: TMV 200 e 200 (ritmo constante)" and the key said something longer, both now say the key's text.

**Numbers in text come from the figure.** `{{fig.P}}` prints point P of the exercise's figure, `{{sol.P}}` of its solution figure, through the formatter of ADR 0023 — TeX inside math, plain text outside. `{{num:2073.6:2}}` and `{{pt:2.5,7.25}}` format literal values.

**Sheets live in `ProjectHub/Listas/<name>/`** by default — beside the repository, not inside it and not in a temp folder (task 9). `--out` or `PRANCHETA_SHEETS_DIR` moves it.

## What was refused

**Markdown or YAML as the source.** Markdown cannot carry per-exercise structure without a convention the parser would have to guess, and YAML needs a dependency. The content was HTML already.

**Bundling KaTeX.** It is loaded from the same CDN the original used. A failed load is reported as a problem and no PDF is written — a PDF of raw TeX is worse than none. Tests run offline against a stand-in in `tests/fixtures/katex-stub` that produces the same `.katex-error` elements.

**Typing the table of contents.** It is generated from the sections, so the exercise ranges cannot go stale.

## The cost, stated

The HTML fragments are trusted: a sheet is authored, not user input, and nothing sanitises it. The level names (fácil, médio, difícil) and part titles are Portuguese; a second language would make them a table.

## Acceptance, as measured

The converted `experiments/exercises/calculo1/lista.json` (30 exercises, 14 figures) builds to a 29-page A4 PDF — the same page count as the hand-built one — with no KaTeX error, no broken image and every figure passing every check — including the checks of ADR 0024, which five of the original figures failed.
