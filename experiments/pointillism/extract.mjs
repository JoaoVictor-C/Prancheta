/*
 * Decode a source photograph into a raw RGB buffer.
 *
 * Prancheta has no image decoder of its own -- but it ships Chromium for
 * layout measurement, and Chromium decodes JPEG. So the same browser that
 * measures text is used once, here, as a pixel oracle: draw the image into a
 * canvas at the sampling resolution and read it back. Everything downstream
 * is arithmetic on that buffer.
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";

const [src, out, wArg] = process.argv.slice(2);
const W = Number(wArg ?? 640);

const browser = await chromium.launch();
const page = await browser.newPage();
// A data: URL, because a page served from about:blank may not read file://.
const url = `data:image/jpeg;base64,${readFileSync(src).toString("base64")}`;

const { w, h, data } = await page.evaluate(async ([url, W]) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const w = W;
  const h = Math.round((img.naturalHeight / img.naturalWidth) * W);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const rgb = new Array(w * h * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    rgb[j] = px[i];
    rgb[j + 1] = px[i + 1];
    rgb[j + 2] = px[i + 2];
  }
  return { w, h, data: rgb };
}, [url, W]);

await browser.close();

writeFileSync(out, Buffer.from(data));
writeFileSync(out.replace(/\.[^.]+$/, "") + ".meta.json", JSON.stringify({ w, h }));
console.log(`decoded ${src} -> ${out}  ${w}x${h}`);
