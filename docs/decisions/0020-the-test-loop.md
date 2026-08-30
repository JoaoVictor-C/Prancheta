# 0020 — One browser per process, and a loop you do not dread

## Status

Accepted.

## The defect

The suite took 72 seconds and every change was checked by running all of it. That is a minute of waiting to learn something about one file, repeated all day, and the cost is not the minute — it is that a loop this slow stops being run.

The obvious reading was that the suite needed parallelising. **It was already parallel**: `node --test` uses `availableParallelism() - 1` workers, which is 11 here, and the run accumulated 600s of test time in 72s of wall clock — an 8.3× speedup with no flag left to add. Scheduling was not the problem.

Instrumenting the launches found the real one. A full run launched **195 separate Chromium browsers, costing 90.5s of pure launch time**, because `render()` called `chromium.launch()` on entry and `browser.close()` in its `finally`. Every render paid for a whole browser to draw one figure.

## The decision

**A browser is a batch resource, so let the batch own it.** `PRANCHETA_REUSE_BROWSER=1` makes `render()` reuse one Chromium for the life of the process. It is opt-in and internal: with the flag unset, behaviour is byte-identical to before, so the CLI and the long-lived MCP server are untouched. `scripts/test-browser.ts` sets it for test runs via `--import`, which is why **no test file had to be edited to get the win**.

Reuse is safe because `browser.newPage()` opens its own `BrowserContext`. Renders share the process, not cookies, storage or cache.

**Rasterising is optional, because for most callers it is waste.** `RenderOptions.raster` defaults true; `PRANCHETA_SKIP_RASTER=1` flips that default for a process. A PNG costs a second page at `scale` device pixels over the whole canvas, and **exactly one test of 83 reads it**. `test:fast` uses this; `tests/render.test.ts` passes `raster: true` explicitly so the flag cannot hollow it out.

**The loop is a ladder, not a command.** `test:one` (~2s), `test:fast` (~51s), `npm test` (~61s). Documented in AGENTS.md and CONTRIBUTING.md, because the largest available saving was never in the suite — it was in not running the suite.

> Amended by [ADR 0021](0021-opening-the-repository.md): `npm test` is now the **core** suite and the fifteen Python-spawning files moved to `npm run test:modules`, with `test:all` above both. The ladder is unchanged in spirit — one more rung, and the top rung is what `check:all` and CI run.

## What was refused

**Threading a browser through the tests.** The first design added an optional `browser` to `RenderOptions` for callers to create, pass and close. That is 55+ call sites of new lifecycle code in tests that currently pass — the highest-risk part of the change, buying nothing an internal cache does not.

**`process.on("beforeExit")` for teardown.** It never fires: a live browser is an active handle, so the event loop never empties. This is not a deduction — it hung a run past ten minutes and left 142 `chrome-headless-shell` processes alive. Teardown is now an explicit `after()` hook in the preload.

**Intra-file concurrency, and splitting the slow file.** `describe(..., { concurrency: 2 })` on the three slow anim files measured 65.4s against 57.0–62.5s for reuse alone. With 83 files already filling 11 worker slots, subdividing one file creates no capacity; it only adds overhead. File-splitting proper was never measured — it is argued unlikely, which is weaker, and is recorded as such.

**Lowering the worker count.** Sweeping `--test-concurrency` produced 155s/193s/230s and looked decisive. It was measuring orphaned processes, not concurrency. The sweep is discarded entirely.

## The cost, stated

**The suite win is modest and the estimate is thin.** Four runs, both orderings: OFF 68.68s and 69.03s, ON 57.04s and 62.49s. That is roughly 10–15%, consistently positive — but the ON arm's own spread is 9.6%, comparable to the effect. Two samples per arm cannot support a tighter claim, and a single derived percentage would overstate what was measured.

**The file-level win is the one that matters day to day**, and it is much larger: `tests/anim-sequence.test.ts` goes 44.99s → 21.12s, because each `animate.run` over N states launched and tore down a browser per state, serially. The gap between 53% at file level and 10–15% at suite level is Amdahl, not contradiction — across 11 workers, launches in different files already overlap.

**`test:fast` trades real coverage for speed.** A rasterisation regression passes it. That is why it is a separate script with the trade in its header, and why `npm test` remains the gate.

**`test:watch` ships unverified end to end.** Watch mode never exits, and killing it is precisely how the orphan problem below was created.

## Found while building it

**`render()` leaked its layout page.** It called `browser.newPage()` and never closed it, relying on `browser.close()` to reap. Harmless when every render owned its browser; under reuse it leaks a page and context per call. Now closed in a `finally`, mirroring `rasterise()`, which had it right all along. This is a real defect independent of the speed work.

**The measurements were poisoned by the measuring.** Interrupting a `node --test` run leaves its 11 workers alive on Windows. Successive aborted runs accumulated **21 orphaned workers holding 2.6GB**, dragging the baseline 72s → 265s → past a 600s timeout, and inverting the apparent sign of the reuse change mid-investigation. Diagnosis came from a Task Manager screenshot showing **37% CPU** — the box was never CPU-saturated, only memory-pressured.

That falsified the premise the whole investigation opened with. It also explains four `Page.captureScreenshot: Unable to capture screenshot` failures blamed on Chromium exhaustion: a clean rerun of the same mechanism produced **zero**. There was never a resource limit; there were orphans.

**The generalisation is the part worth keeping.** A performance number is a claim about a machine, and this machine was being changed by the act of measuring it. Contemporaneous controls, both orderings, and host state captured alongside — otherwise the number describes the session, not the code.
