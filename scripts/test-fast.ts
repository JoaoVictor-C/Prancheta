/**
 * The inner-loop test run: everything `test-browser.ts` does, plus PNGs
 * turned off.
 *
 * Rasterising is most of a render, and exactly one test reads the pixels --
 * render.test.ts, which asks for them explicitly via `raster: true` and so is
 * unaffected by this flag. Every other test asserts on the manifest, the SVG
 * or the check verdicts, none of which the PNG contributes to.
 *
 * This trades real coverage for speed: it does NOT prove the figure a reader
 * receives can be produced. Use it while iterating; use `npm test` before you
 * commit and in CI.
 */

process.env.PRANCHETA_SKIP_RASTER = "1";

// Sets PRANCHETA_REUSE_BROWSER and registers the browser teardown. Hoisting is
// harmless: pipeline.ts reads the skip flag per render, not at import.
import "./test-browser.ts";
