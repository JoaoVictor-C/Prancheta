/*
 * Throwaway scale probe. Emits N disjoint marks on a lattice and renders,
 * recording wall-clock, SVG bytes and PNG dimensions at each N -- because a
 * design can pass the time curve and still die on file size or rasteriser
 * memory, and both failures land after all the geometry is written.
 */
import { writeFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

const W = 1500;
const H = 2100;

for (const N of [10000, 20000, 40000, 60000]) {
  const cols = Math.ceil(Math.sqrt((N * W) / H));
  const rows = Math.ceil(N / cols);
  const px = (W - 40) / cols;
  const py = (H - 40) / rows;
  const d = Math.min(px, py) * 0.6;

  const kids = [];
  for (let i = 0; i < N; i += 1) {
    const cx = 20 + (i % cols) * px + px / 2;
    const cy = 20 + Math.floor(i / cols) * py + py / 2;
    kids.push({
      type: "block", id: `p${i}`, x: cx - d / 2, y: cy - d / 2,
      width: d, height: d, shape: "circle",
      fill: "#E0B060", stroke: "transparent", strokeWidth: 0, padding: 0,
    });
  }

  const spec = {
    version: 1,
    canvas: { padding: 0, background: "#0A0A12", theme: "dark" },
    root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
  };
  writeFileSync("out/probe.json", JSON.stringify(spec));

  const t = Date.now();
  let out = "";
  try {
    out = execSync("node src/cli.ts render out/probe.json --out out/probe --scale 2", {
      encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    console.log(`${String(N).padStart(6)}  FAILED after ${((Date.now() - t) / 1000).toFixed(1)}s`);
    console.log(String(error.stdout ?? error.message).slice(-400));
    continue;
  }
  const secs = (Date.now() - t) / 1000;
  const svg = statSync("out/probe/probe.svg").size / 1e6;
  const png = statSync("out/probe/probe.png").size / 1e6;
  const failed = (out.match(/FAIL/g) ?? []).length;

  console.log(
    `${String(N).padStart(6)} blocks  ${secs.toFixed(1).padStart(6)}s  ` +
    `${(N / secs).toFixed(0).padStart(6)} blk/s  svg ${svg.toFixed(1)}MB  png ${png.toFixed(1)}MB  ` +
    `${failed} failing check(s)`,
  );
}
