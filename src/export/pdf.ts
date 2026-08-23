/**
 * Exported SVG -> PDF (decision 0008, step 6 -- only attempted after font
 * travel is proven in steps 4-5, never assumed).
 *
 * Vector output, not a rasterised page: Chromium's own `page.pdf()` walks the
 * same paint pipeline that draws the screen, so text stays text (or stays
 * real glyph outlines, in `outline` mode) and shapes stay paths, at whatever
 * resolution the PDF viewer renders at -- never a fixed-DPI raster the way a
 * PNG-to-PDF conversion would be.
 *
 * `raster.ts`'s rationale applies here almost unchanged: rasterise the
 * EXPORTED SVG, not the HTML mirror used for measurement, so a defect in the
 * SVG shows up in the PDF instead of being hidden by re-using the page that
 * already had everything positioned correctly in the DOM.
 */

import type { Browser } from "playwright";

export type PdfPageSize =
  | "figure"
  | "a4"
  | "a4-landscape"
  | "letter"
  | "letter-landscape"
  | { widthMm: number; heightMm: number };

export type PdfOptions = {
  /** "figure" (default): the PDF page IS the figure, unscaled, no margin. */
  size?: PdfPageSize;
};

const NAMED_SIZES_MM: Record<Exclude<PdfPageSize, "figure" | { widthMm: number; heightMm: number }>, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  "a4-landscape": { widthMm: 297, heightMm: 210 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
  "letter-landscape": { widthMm: 279.4, heightMm: 215.9 },
};

function resolveSizeMm(size: PdfPageSize): { widthMm: number; heightMm: number } | null {
  if (size === "figure") return null;
  if (typeof size === "string") return NAMED_SIZES_MM[size];
  return size;
}

export async function rasterisePdf(
  browser: Browser,
  svg: string,
  figureSize: { width: number; height: number },
  options: PdfOptions = {},
): Promise<Buffer> {
  const size = resolveSizeMm(options.size ?? "figure");

  const page = await browser.newPage();
  try {
    if (size === null) {
      // The page IS the figure: CSS px at 96dpi, no scaling, no margin, no
      // extra page around it. This is what "the PDF page is the figure"
      // means -- not the figure centred on a Letter page with acres of
      // white space, which is what page.pdf()'s own default would do.
      const widthPx = Math.max(1, Math.ceil(figureSize.width));
      const heightPx = Math.max(1, Math.ceil(figureSize.height));
      await page.setViewportSize({ width: widthPx, height: heightPx });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>
           html, body { margin: 0; padding: 0; }
           svg { display: block; }
         </style></head><body>${svg}</body></html>`,
        { waitUntil: "load" },
      );
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
    }

    // A named or explicit physical page: the figure is scaled to FIT within
    // it, centred, aspect ratio preserved -- never stretched, which would
    // make every measured proportion in the figure a lie on paper.
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
         html, body { margin: 0; padding: 0; height: 100%; }
         body { display: flex; align-items: center; justify-content: center; }
         svg { max-width: 100%; max-height: 100%; width: auto; height: auto; }
       </style></head><body>${svg}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      width: `${size.widthMm}mm`,
      height: `${size.heightMm}mm`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await page.close();
  }
}
