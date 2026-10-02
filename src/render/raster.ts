/**
 * SVG -> PNG.
 *
 * Deliberately rasterises the *exported* SVG rather than the HTML mirror used
 * for measurement. If the SVG is wrong — a bad baseline, a missing glyph, an
 * unsupported construct — the PNG shows it. Rasterising the mirror would prove
 * nothing about the artefact anyone actually receives.
 */

import type { Browser } from "playwright";

export async function rasterise(
  browser: Browser,
  svg: string,
  size: { width: number; height: number },
  scale = 2,
  /**
   * An `@font-face` rule for the page, when the SVG names a face it does not
   * carry ("none" mode). An SVG that embeds its font, or outlines it, is drawn
   * with nothing added, so the PNG still proves what the file itself holds.
   */
  fontFace = "",
): Promise<Buffer> {
  const width = Math.max(1, Math.ceil(size.width));
  const height = Math.max(1, Math.ceil(size.height));
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
         ${fontFace}
         html, body { margin: 0; padding: 0; }
         /* Greyscale AA: subpixel rendering would put colour fringes on glyphs
            that are meant to be monochrome, and those fringes survive into the
            PNG a reader judges the figure by. */
         body { -webkit-font-smoothing: antialiased; }
         svg { display: block; }
       </style></head><body>${svg}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({
      clip: { x: 0, y: 0, width, height },
      type: "png",
    });
  } finally {
    await page.close();
  }
}
