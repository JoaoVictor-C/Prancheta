/**
 * Independent-renderer check.
 *
 * The pipeline measures in Chromium and rasterises in Chromium. That proves
 * the SVG is self-consistent; it proves nothing about whether the file
 * survives outside a browser. resvg is a Rust renderer with no browser and no
 * system-library dependencies — if a figure looks right here too, the export
 * is genuinely portable rather than merely round-tripping through the engine
 * that produced it.
 *
 * Extended by decision 0008 to accept `.pdf` inputs too, answering a
 * different question for a different artefact: not "does this look right in
 * another renderer", but "is this genuinely a vector PDF, or did page.pdf()
 * silently hand back a full-page raster wrapped in a PDF envelope". Chromium
 * could in principle do either; only inspecting the file's own content
 * streams tells them apart.
 *
 *   node scripts/check-independent.ts [out/labelled-blocks.svg ...]
 *   node scripts/check-independent.ts out/labelled-blocks.pdf
 */

import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";

const inputs = process.argv.slice(2);
if (inputs.length === 0) inputs.push("out/labelled-blocks.svg");

let failures = 0;

for (const input of inputs) {
  if (input.toLowerCase().endsWith(".pdf")) {
    failures += checkPdf(await readFile(input));
    continue;
  }
  const svg = await readFile(input, "utf8");
  const resvg = new Resvg(svg, {
    background: undefined,
    font: { loadSystemFonts: true },
    // Match the browser rasteriser's density so the two PNGs are comparable.
    fitTo: { mode: "zoom", value: 2 },
  });
  const rendered = resvg.render();
  const output = join(dirname(input), `${basename(input, extname(input))}.resvg.png`);
  await writeFile(output, rendered.asPng());
  console.log(`${input} -> ${output}  (${rendered.width} x ${rendered.height})`);
}

if (failures > 0) process.exit(1);

/**
 * A structural sniff, not a full PDF parser: confirms the header is real PDF,
 * then decompresses every FlateDecode content stream it can find and looks
 * for real PAINT operators (a path actually filled or stroked, `f`/`f*`/`S`/
 * `s`/`B`/`B*`/`b`/`b*`) or text-show operators (`Tj`/`TJ`).
 *
 * `re`/`m`/`l`/`c` alone are NOT enough, on purpose, and the first version of
 * this check used exactly them and was wrong: `page.pdf()` of a page holding
 * nothing but a full-page `<img>` still emits a `re` rectangle in its content
 * stream, used only as a CLIP path around the embedded image (`re W* n`,
 * paint the clip, then `Do` the image) -- confirmed by constructing exactly
 * that PDF and finding the original check reported it "ok". A clip path is
 * not drawing; only a paint operator on a constructed path, or real text,
 * proves the page is more than an image in an envelope.
 */
function checkPdf(bytes: Buffer): number {
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    console.error(`FAIL  not a PDF file (missing %PDF- header)`);
    return 1;
  }

  const raw = bytes.toString("latin1");
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  // Standalone paint operators: whitespace on both sides, so "re" inside
  // "Square" or the "S" in "RGB" can never match.
  const paintPattern = /\s(f\*?|S|s|B\*?|b\*?|Tj|TJ)\s/;
  let sawImageDraw = false;

  let foundPaint = false;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    const streamBytes = Buffer.from(match[1]!, "latin1");
    let decoded: Buffer;
    try {
      decoded = inflateSync(streamBytes);
    } catch {
      continue; // not FlateDecode, or not a content stream (an embedded font, etc.)
    }
    const text = decoded.toString("latin1");
    if (/\sDo\s/.test(text)) sawImageDraw = true;
    if (paintPattern.test(text)) {
      foundPaint = true;
      break;
    }
  }

  if (!foundPaint) {
    console.error(
      `FAIL  no real paint or text-show operator found in any decompressed content stream${
        sawImageDraw ? " (an image XObject IS drawn -- this looks like a raster wrapped in PDF)" : ""
      }`,
    );
    return 1;
  }

  console.log(`ok    ${bytes.length} bytes, real vector/text content streams found`);
  return 0;
}
