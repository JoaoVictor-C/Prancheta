/* Generates the Saturn V "Navigation, Guidance & Control" block diagram spec. */
import { writeFileSync } from "node:fs";

const PINK = "#F5A2A2";
const CYAN = "#CDF0F5";
const INK = "#000000";
const T = 1.6;          // wire thickness
const H = T / 2;
const ARR = 14;         // length of the arrowhead stub carried by a real connector

const kids = [];
const cons = [];
let uid = 0;
const nid = (p) => `${p}${uid++}`;

/** Height a run of `n` lines at `fs` occupies, ink overshoot included. */
const textHeight = (n, fs) => n * fs * 1.45 + 2.6;

/** A titled schematic box. */
function boxNode(id, x, y, w, h, label, fill, fs = 12, extra = {}) {
  kids.push({
    type: "block", id, x, y, width: w, height: h, label,
    fill, stroke: INK, strokeWidth: 1.2, radius: 0, padding: 5,
    textColor: INK, fontSize: fs,
    textAlign: "center", verticalAlign: "center",
    ...extra,
  });
}

/** Free-standing text, anchored at its top-left. Newlines are hard breaks. */
function text(x, y, w, label, fs = 12, textAlign = "center") {
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: textHeight(label.split("\n").length, fs),
    label, role: "callout", textColor: INK, fontSize: fs,
    padding: 0, textAlign,
  });
}

/** A raw ink rectangle, used for every wire segment. */
function ink(x, y, w, h) {
  kids.push({
    type: "block", id: nid("k"), x, y, width: w, height: h,
    fill: INK, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });
}
const hseg = (y, x1, x2) => ink(Math.min(x1, x2), y - H, Math.abs(x2 - x1), T);
const vseg = (x, y1, y2) => ink(x - H, Math.min(y1, y2), T, Math.abs(y2 - y1));

function dot(x, y, r = 4) {
  kids.push({
    type: "block", id: nid("d"), x: x - r, y: y - r, width: r * 2, height: r * 2,
    shape: "circle", fill: INK, stroke: "transparent", strokeWidth: 0, padding: 0,
  });
}

/**
 * An orthogonal wire through `pts`. Horizontal runs own the corners and
 * vertical runs are trimmed back to meet them, so segments butt exactly and
 * never partially overlap -- which `boxes-do-not-overlap` would report.
 * The final `ARR` px are drawn by a real connector so the arrowhead is real.
 */
function wire(pts, arrow = true) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i += 1) segs.push([pts[i], pts[i + 1]]);
  const last = segs.length - 1;

  segs.forEach(([a, b], i) => {
    const horiz = Math.abs(a.y - b.y) < 0.001;
    const p = { ...a };
    const q = { ...b };
    if (horiz) {
      const dir = Math.sign(q.x - p.x);
      if (i > 0) p.x -= dir * H;
      if (i < last) q.x += dir * H;
      if (i === last && arrow) q.x -= dir * (ARR - 4);
      hseg(a.y, p.x, q.x);
    } else {
      const dir = Math.sign(q.y - p.y);
      if (i > 0) p.y += dir * H;
      if (i < last) q.y -= dir * H;
      if (i === last && arrow) q.y -= dir * (ARR - 4);
      vseg(a.x, p.y, q.y);
    }
  });

  if (!arrow) return;
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const wpt = nid("w");
  kids.push({
    type: "block", id: wpt, x: b.x - ux * ARR - 1, y: b.y - uy * ARR - 1,
    width: 2, height: 2,
    fill: "transparent", stroke: "transparent", strokeWidth: 0, padding: 0,
  });
  cons.push({ from: wpt, to: { x: b.x, y: b.y }, arrow: "end", stroke: INK, strokeWidth: 1.5 });
}

/** A dashed run, drawn wholly by a connector since blocks cannot dash. */
function dashed(from, to, arrow) {
  const wpt = nid("w");
  kids.push({
    type: "block", id: wpt, x: from.x - 1, y: from.y - 1, width: 2, height: 2,
    fill: "transparent", stroke: "transparent", strokeWidth: 0, padding: 0,
  });
  cons.push({
    from: wpt, to, arrow: arrow ? "end" : "none",
    lineStyle: "dashed", stroke: INK, strokeWidth: 1.4,
  });
}

/** An antenna: the lower half of a diamond, its upper half masked out. */
function antenna(cx, apex, w, h) {
  const bx = cx - w / 2;
  const by = apex - h;
  kids.push({
    type: "block", id: nid("a"), x: bx, y: by, width: w, height: h, shape: "diamond",
    fill: "transparent", stroke: INK, strokeWidth: 1.2, padding: 0,
  });
  // Masks the upper half, leaving the V. It has to stay *contained* in the
  // diamond's box, so the apex keeps a sub-pixel sliver of its own stroke.
  kids.push({
    type: "block", id: nid("m"), x: bx, y: by,
    width: w, height: h / 2,
    fill: "#FFFFFF", stroke: "transparent", strokeWidth: 0, padding: 0,
  });
}

/** A thin brace: spine, two arms turned towards the boxes, one nub away from them. */
function brace(x, y1, y2, arm = 11) {
  vseg(x, y1 - H, y2 + H);
  hseg(y1, x - arm, x - H);
  hseg(y2, x - arm, x - H);
  hseg((y1 + y2) / 2, x + H, x + arm);
}

// ---------------------------------------------------------------- the figure

text(46, 14, 620, 'BLOCK DIAGRAM  "NAVIGATION, GUIDANCE & CONTROL"', 17, "start");

// --- guidance chain -------------------------------------------------------
boxNode("inertial", 10, 140, 145, 152, "", PINK);
text(20, 147, 125, "INERTIAL\nPLATFORM", 13);
boxNode("accels", 22, 196, 120, 50, "Integrating\naccelerometers", "#FFFFFF", 12);

boxNode("lvdc", 267, 83, 78, 57, "LVDC", PINK, 14);
boxNode("lvda", 267, 185, 83, 112, "LVDA", PINK, 14);
boxNode("decoder", 268, 355, 80, 42, "Decoder", CYAN, 13);
boxNode("fcc", 437, 190, 75, 78, "FCC", PINK, 14);
boxNode("gyros", 437, 320, 72, 70, "Control-\nEDS Rate\ngyros", PINK, 12);
boxNode("accel", 437, 420, 75, 72, "Control-\nAccelero\nmeters", PINK, 12, { stroke: "transparent" });

boxNode("rx", 37, 425, 118, 60, "IU command\nReceiver", CYAN, 12);
boxNode("tx", 37, 600, 118, 60, "IU telemetry\nTransmitter", CYAN, 12);

// --- right-hand stacks ----------------------------------------------------
const acts = [
  ["act1", 113, "S-IC stage\nEngine actuators"],
  ["act2", 206, "S-II stage\nEngine actuators"],
  ["act3", 300, "S-IVB stage\nEngine actuators"],
  ["act4", 390, "S-IVB stage auxilary\nPropulsion system"],
];
acts.forEach(([id, y, label]) => boxNode(id, 645, y, 125, 45, label, CYAN, 11));

const sels = [
  ["sw1", 533, "S-IC stage\nswitch selector"],
  ["sw2", 625, "S-II stage\nswitch selector"],
  ["sw3", 715, "S-IVB stage\nswitch selector"],
  ["sw4", 805, "IU\nswitch selector"],
];
sels.forEach(([id, y, label]) => boxNode(id, 555, y, 125, 45, label, CYAN, 11));

// --- antennas -------------------------------------------------------------
antenna(53, 372, 42, 56);
antenna(53, 555, 42, 56);

// --- wiring ---------------------------------------------------------------
wire([{ x: 155, y: 222 }, { x: 267, y: 222 }]);                       // platform -> LVDA
wire([{ x: 290, y: 185 }, { x: 290, y: 140 }]);                       // LVDA -> LVDC
wire([{ x: 322, y: 140 }, { x: 322, y: 185 }]);                       // LVDC -> LVDA
wire([{ x: 350, y: 210 }, { x: 437, y: 210 }]);                       // LVDA -> FCC
wire([{ x: 437, y: 258 }, { x: 350, y: 258 }]);                       // FCC -> LVDA
wire([{ x: 474, y: 140 }, { x: 474, y: 190 }]);                       // spacecraft -> FCC
wire([{ x: 322, y: 297 }, { x: 322, y: 355 }]);                       // LVDA -> decoder
wire([{ x: 290, y: 355 }, { x: 290, y: 297 }]);                       // decoder -> LVDA
wire([{ x: 155, y: 445 }, { x: 290, y: 445 }, { x: 290, y: 397 }]);   // receiver -> decoder
wire([{ x: 322, y: 397 }, { x: 322, y: 632 }, { x: 155, y: 632 }]);   // decoder -> transmitter
wire([{ x: 53, y: 372 }, { x: 53, y: 425 }]);                         // antenna -> receiver
wire([{ x: 53, y: 600 }, { x: 53, y: 555 }]);                       // transmitter -> antenna

dashed({ x: 474, y: 318 }, { x: 474, y: 268 }, true);                 // rate gyros -> FCC
dashed({ x: 474, y: 417 }, { x: 474, y: 390 }, true);                 // accelerometers -> gyros

// control-command bus
hseg(228.5, 512, 608);
[208, 228.5, 250].forEach((y) => dot(612, y));
vseg(612, 134.7, 204);
vseg(612, 212, 225);
vseg(612, 233, 246);
vseg(612, 254, 413.3);
wire([{ x: 612.8, y: 135.5 }, { x: 645, y: 135.5 }]);
wire([{ x: 616, y: 228.5 }, { x: 645, y: 228.5 }]);
wire([{ x: 612.8, y: 322.5 }, { x: 645, y: 322.5 }]);
wire([{ x: 612.8, y: 412.5 }, { x: 645, y: 412.5 }]);

// actuator outputs
[135.5, 228.5, 322.5].forEach((y) => wire([{ x: 770, y }, { x: 786, y }]));
wire([{ x: 770, y: 412.5 }, { x: 828, y: 412.5 }]);
brace(798, 100, 352);

// flight-sequence bus
wire([{ x: 350, y: 287 }, { x: 375, y: 287 }, { x: 375, y: 700 }, { x: 529.2, y: 700 }], false);
vseg(530, 554.7, 828.3);
[555.5, 647.5, 737.5, 827.5].forEach((y) => wire([{ x: 530.8, y }, { x: 555, y }]));
[555.5, 647.5, 737.5, 827.5].forEach((y) => wire([{ x: 680, y }, { x: 696, y }]));
brace(706, 522, 860);

// dashed outline for the control accelerometers
const A = { x: 437, y: 420, w: 75, h: 72 };
const cTL = nid("w");
const cTR = nid("w");
const cBL = nid("w");
kids.push({ type: "block", id: cTL, x: A.x - 2, y: A.y - 1, width: 2, height: 2, fill: "transparent", stroke: "transparent", strokeWidth: 0, padding: 0 });
kids.push({ type: "block", id: cTR, x: A.x + A.w - 1, y: A.y - 3, width: 2, height: 2, fill: "transparent", stroke: "transparent", strokeWidth: 0, padding: 0 });
kids.push({ type: "block", id: cBL, x: A.x - 2, y: A.y + A.h - 1, width: 2, height: 2, fill: "transparent", stroke: "transparent", strokeWidth: 0, padding: 0 });
const dash = (from, to) => cons.push({ from, to, arrow: "none", lineStyle: "dashed", stroke: INK, strokeWidth: 1.3 });
dash(cTL, { x: A.x + A.w, y: A.y });
dash(cBL, { x: A.x + A.w, y: A.y + A.h });
dash(cTL, { x: A.x, y: A.y + A.h });
dash(cTR, { x: A.x + A.w, y: A.y + A.h });

// --- annotations ----------------------------------------------------------
text(160, 178, 102, "Attitude\nAngles", 12);
text(156, 226, 108, "Acceleration\nMeasurements", 12);
text(352, 166, 84, "Attitude\nCorrection", 12);
text(352, 212, 84, "Telemetry\nOutput", 12);
text(386, 92, 180, "Attitude control signals\nfrom Spacecraft", 13);
text(520, 184, 84, "Control\nCommands", 12);
text(486, 272, 102, "Angular\nchange rates", 12);
text(518, 404, 88, "Yaw and\nPitch lateral\nacceleration", 12);
text(183, 400, 102, "Updating\nInformation", 12);
text(200, 586, 80, "Flight\nData", 12);
text(410, 638, 104, "Flight\nsequence\nCommands", 12);
text(838, 215, 78, "To engines", 13, "start");
text(838, 402, 78, "To nozzles", 13, "start");
text(744, 681, 150, "To stage circuitry", 13, "start");

const spec = {
  version: 1,
  title: 'BLOCK DIAGRAM "NAVIGATION, GUIDANCE & CONTROL"',
  canvas: { padding: 6, background: "#FFFFFF", theme: "light" },
  root: { type: "scene", layout: "absolute", width: 920, height: 878, children: kids, connectors: cons },
};
writeFileSync("out/navguide.json", JSON.stringify(spec, null, 2));
console.log(`wrote out/navguide.json -- ${kids.length} blocks, ${cons.length} connectors`);
