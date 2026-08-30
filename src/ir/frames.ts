/**
 * Frames: coordinate systems a figure states its positions in.
 *
 * The defect this exists to close is the one ADR 0019 opens with. A figure
 * whose coordinates are computed OUTSIDE the document is only true because
 * whoever computed them got it right; nothing in the spec ties the drawn slope
 * to the angle its own label prints. A frame moves that arithmetic inside, so
 * the angle appears once — as the frame's rotation — and everything positioned
 * in that frame follows from it.
 *
 * Resolved to canvas coordinates BEFORE anything measures, checks or repairs,
 * and the `frame` reference is stripped as it goes. That is deliberate on two
 * counts. It keeps every check reasoning in one space, exactly as the effects
 * layer resolves bleed after measurement and geometry/rotate.ts hands the
 * checker an axis-aligned bound. And stripping makes resolution IDEMPOTENT:
 * `normalise` runs more than once per render, and a resolution that left its
 * own input in place would transform the same coordinates twice.
 *
 * Frame axes point UP, not down. Every figure this serves — a coordinate
 * plane, an incline's normal, a vector diagram — is written by someone for
 * whom +y is up, and asking them to negate every y to suit the canvas would
 * put the arithmetic back outside the document. `rotation` is degrees
 * COUNTER-CLOCKWISE to match those axes; `Block.rotation` is clockwise, so a
 * block inheriting its frame's rotation gets the negated value. That sign flip
 * is the one sharp edge here and it is tested directly.
 */

import type { Block, FigureNode, FigureSpec, Frame, FramedPoint, GridSpec, Mark, MarkSegment, Point, Scene } from "./types.ts";
import { SpecError } from "./types.ts";

/** A point stated in a frame, or one already in canvas coordinates. */
export function isFramedPoint(value: unknown): value is FramedPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FramedPoint).frame === "string" &&
    typeof (value as FramedPoint).x === "number" &&
    typeof (value as FramedPoint).y === "number"
  );
}

/** Where `(x, y)` in this frame lands on the canvas. */
export function resolveInFrame(frame: Frame & { origin: Point }, x: number, y: number): Point {
  const xUnit = frame.xUnit ?? 1;
  const yUnit = frame.yUnit ?? xUnit;
  const radians = ((frame.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // y is negated once, here: the frame's +y is up and the canvas's is down.
  const localX = x * xUnit;
  const localY = -(y * yUnit);
  return {
    // Counter-clockwise in a y-down space is the transpose of the usual
    // matrix, which is why the sin terms read the way they do.
    x: frame.origin.x + localX * cos + localY * sin,
    y: frame.origin.y - localX * sin + localY * cos,
  };
}

/**
 * This scene's frames, each resolved to a canvas origin.
 *
 * In declaration order, so a frame may be placed in one declared before it
 * and nowhere else -- forward references would admit cycles, and a cycle here
 * is a frame defined in terms of itself with no fixed point to fall back on.
 */

/** Every value from `from` to `to` inclusive, stepping by `step`. */
function ticksOf(axis: { from: number; to: number; step?: number }): number[] {
  const step = Math.abs(axis.step ?? 1);
  if (step === 0 || !Number.isFinite(step)) return [];
  const out: number[] = [];
  // Counted rather than accumulated: adding a float repeatedly drifts, and a
  // gridline half a pixel out of true is exactly the kind of defect this
  // project spends its time removing.
  const count = Math.floor((axis.to - axis.from) / step + 1e-9);
  for (let i = 0; i <= count; i += 1) out.push(axis.from + i * step);
  return out;
}

const GRID_LINE_PX = 1;
const AXIS_LINE_PX = 2;

/**
 * A frame's `grid` as ordinary blocks: one thin rect per line, plus numbered
 * ticks along the axes.
 *
 * Blocks and not connectors, and the reason is painter's order: pipeline.ts
 * draws every box, then every connector, then every label, so a lattice built
 * from connectors would be drawn ON TOP of the figure standing on it. Blocks
 * prepended to the scene's children paint first, which is where a grid
 * belongs.
 *
 * Each line is a rect in CANVAS space spanning the two ends the frame maps,
 * which keeps a rotated frame honest: the line runs between the points the
 * frame actually puts at its ends rather than being drawn axis-aligned and
 * rotated afterwards.
 */
function expandGrid(
  frame: Frame & { origin: Point },
  grid: GridSpec,
): { blocks: Block[]; marks: Mark[] } {
  const out: Block[] = [];
  const lines: Mark[] = [];
  const stroke = grid.stroke ?? "#D8DCE3";
  const axisStroke = grid.axisStroke ?? "#8A93A3";
  const labelColor = grid.labelColor ?? "#6B7280";
  const drawAxes = grid.axes !== false;
  const drawLabels = grid.labels !== false;
  const everyOn = (axis: { labelEvery?: number }): number =>
    Math.max(1, Math.round(axis.labelEvery ?? grid.labelEvery ?? 1));
  const everyX = everyOn(grid.x);
  const everyY = everyOn(grid.y);

  const xs = ticksOf(grid.x);
  const ys = ticksOf(grid.y);

  // A stroked mark, not a filled rect: a rect can be a 1px line but it cannot
  // be a DASHED one, and dashed gridlines are the norm in a plot. Marks are
  // also what a lattice actually is -- ink, painted beneath everything, taking
  // no part in collision -- so this is the honest shape as well as the
  // capable one.
  const line = (id: string, a: Point, b: Point, width: number, colour: string, dashed: boolean) => {
    const segments: MarkSegment[] = [{ line: b }];
    lines.push({
      id,
      from: a,
      segments,
      close: false,
      fill: "none",
      stroke: colour,
      strokeWidth: width,
      ...(dashed && grid.lineStyle !== undefined ? { lineStyle: grid.lineStyle } : {}),
    });
  };

  for (const [i, x] of xs.entries()) {
    const isAxis = drawAxes && x === 0;
    line(
      `${frame.id}-grid-v-${i}`,
      resolveInFrame(frame, x, grid.y.from),
      resolveInFrame(frame, x, grid.y.to),
      isAxis ? AXIS_LINE_PX : GRID_LINE_PX,
      isAxis ? axisStroke : stroke,
      !isAxis,
    );
  }
  for (const [i, y] of ys.entries()) {
    const isAxis = drawAxes && y === 0;
    line(
      `${frame.id}-grid-h-${i}`,
      resolveInFrame(frame, grid.x.from, y),
      resolveInFrame(frame, grid.x.to, y),
      isAxis ? AXIS_LINE_PX : GRID_LINE_PX,
      isAxis ? axisStroke : stroke,
      !isAxis,
    );
  }

  if (!drawLabels) return { blocks: out, marks: lines };

  // Zero is numbered like any other tick. An earlier version skipped it to
  // avoid writing "0" twice at the origin, which was over-caution: the two
  // zeros sit in different places (one below the plot, one to its left), and
  // where they genuinely would collide `tick-labels-do-not-collide` says so
  // rather than this quietly deciding for the author.
  //
  // Ticks are numbered along the axis when there is one in range, and along
  // the low edge otherwise -- a plane showing only positive values still
  // needs its numbers somewhere.
  const yBase = ys.includes(0) ? 0 : grid.y.from;
  const xBase = xs.includes(0) ? 0 : grid.x.from;
  const tick = (id: string, at: Point, text: string, align: "center" | "end"): Block => ({
    type: "block",
    id,
    x: align === "center" ? at.x - 18 : at.x - 40,
    y: at.y - 9,
    width: align === "center" ? 36 : 34,
    height: 18,
    padding: 0,
    fill: "none",
    stroke: "none",
    strokeWidth: 0,
    wrap: "none",
    fontSize: 11,
    textAlign: align === "center" ? "center" : "end",
    textColor: labelColor,
    label: text,
    gridOf: frame.id,
  });

  const format = (value: number): string => String(Math.round(value * 1000) / 1000);
  for (const [i, x] of xs.entries()) {
    if (i % everyX !== 0) continue;
    const at = resolveInFrame(frame, x, yBase);
    out.push(tick(`${frame.id}-tick-x-${i}`, { x: at.x, y: at.y + 14 }, format(x), "center"));
  }
  for (const [i, y] of ys.entries()) {
    if (i % everyY !== 0) continue;
    const at = resolveInFrame(frame, xBase, y);
    out.push(tick(`${frame.id}-tick-y-${i}`, { x: at.x - 8, y: at.y }, format(y), "end"));
  }
  return { blocks: out, marks: lines };
}

function framesOf(
  scene: Scene,
  inherited: Map<string, Frame & { origin: Point }>,
): Map<string, Frame & { origin: Point }> {
  const frames = new Map(inherited);
  for (const frame of scene.frames ?? []) {
    const origin = isFramedPoint(frame.origin)
      ? resolveInFrame(
          frameOrThrow(frames, frame.origin.frame, `frame "${frame.id}".origin`),
          frame.origin.x,
          frame.origin.y,
        )
      : frame.origin;
    // `towards` becomes a rotation the moment both ends are known, so nothing
    // downstream has to learn about a second way of aiming a frame.
    let rotation = frame.rotation;
    if (frame.towards !== undefined) {
      const aim = isFramedPoint(frame.towards)
        ? resolveInFrame(
            frameOrThrow(frames, frame.towards.frame, `frame "${frame.id}".towards`),
            frame.towards.x,
            frame.towards.y,
          )
        : frame.towards;
      // Canvas y is down and a frame's rotation is counter-clockwise, so the
      // bearing is negated exactly once, here.
      rotation = (-Math.atan2(aim.y - origin.y, aim.x - origin.x) * 180) / Math.PI;
    }
    frames.set(frame.id, { ...frame, origin, ...(rotation === undefined ? {} : { rotation }) });
  }
  return frames;
}

function frameOrThrow(
  frames: Map<string, Frame & { origin: Point }>,
  id: string,
  where: string,
): Frame & { origin: Point } {
  const frame = frames.get(id);
  if (frame === undefined) {
    const known = [...frames.keys()];
    throw new SpecError(
      `${where} names frame "${id}", which this scene does not declare` +
        (known.length === 0 ? "" : ` (it declares ${known.join(", ")})`),
    );
  }
  return frame;
}

function resolvePoint(
  value: Point | FramedPoint,
  frames: Map<string, Frame & { origin: Point }>,
  where: string,
): Point {
  if (!isFramedPoint(value)) return value;
  return resolveInFrame(frameOrThrow(frames, value.frame, where), value.x, value.y);
}

/**
 * Every frame reference in the spec replaced by the canvas coordinate it
 * denotes, and every `frame` field removed.
 *
 * The spec is not mutated; a resolved copy is returned, the same discipline
 * decision 0003 imposes on repairs.
 */
export function resolveFrames(spec: FigureSpec): FigureSpec {
  return { ...spec, root: resolveNode(spec.root, new Map()) };
}

function resolveNode(
  node: FigureNode,
  inherited: Map<string, Frame & { origin: Point }>,
): FigureNode {
  if (node.type === "stack") {
    return { ...node, children: node.children.map((child) => resolveNode(child, inherited)) };
  }
  if (node.type === "scene") {
    // A scene's own frames win over an enclosing scene's, by id.
    const frames = framesOf(node, inherited);

    // Generated first so it paints first: a grid is what the figure stands on.
    const furniture: Block[] = [];
    const furnitureMarks: Mark[] = [];
    for (const declared of node.frames ?? []) {
      if (declared.grid === undefined) continue;
      const expanded = expandGrid(frames.get(declared.id)!, declared.grid);
      furniture.push(...expanded.blocks);
      furnitureMarks.push(...expanded.marks);
    }
    const children = [
      ...furniture,
      ...node.children.map((child) => resolveNode(child, frames) as Block),
    ];
    const connectors = node.connectors?.map((connector, i) => {
      const where = `connectors[${i}]`;
      const curve =
        connector.curve?.kind === "sweep"
          ? {
              ...connector.curve,
              centre: resolvePoint(connector.curve.centre, frames, `${where}.curve.centre`),
            }
          : connector.curve;
      return {
        ...connector,
        from:
          typeof connector.from === "string"
            ? connector.from
            : resolvePoint(connector.from, frames, `${where}.from`),
        to:
          typeof connector.to === "string"
            ? connector.to
            : resolvePoint(connector.to, frames, `${where}.to`),
        ...(curve === undefined ? {} : { curve }),
      };
    });

    const marks = [...furnitureMarks, ...(node.marks ?? [])].map((mark, i) => {
      const where = `marks[${i}]`;
      return {
        ...mark,
        from: resolvePoint(mark.from, frames, `${where}.from`),
        segments: mark.segments.map((segment, j) =>
          "line" in segment
            ? { line: resolvePoint(segment.line, frames, `${where}.segments[${j}].line`) }
            : {
                arc: resolvePoint(segment.arc, frames, `${where}.segments[${j}].arc`),
                centre: resolvePoint(segment.centre, frames, `${where}.segments[${j}].centre`),
              },
        ),
      } as Mark;
    });

    const resolved: Scene = {
      ...node,
      children,
      ...(connectors === undefined ? {} : { connectors }),
      ...(marks.length === 0 ? {} : { marks }),
    };
    delete resolved.frames;
    return resolved;
  }

  const block = node as Block;
  if (block.frame === undefined) return block;
  const frame = frameOrThrow(inherited, block.frame, `block "${block.id ?? "(unnamed)"}"`);

  // A block in a frame LIES IN that frame: its box is laid out along the
  // frame's axes from the stated corner, and the whole thing is then mapped
  // to the canvas. Since `Block.rotation` turns a box about its own centre
  // (geometry/rotate.ts), the way to get that is to map the CENTRE and place
  // the box around it -- mapping the corner instead and rotating about the
  // centre swings the box away from where the frame put it, which for a
  // 440px bar on a 30 degree frame threw it 35px off the canvas.
  //
  // A block with no declared size has no centre to map, so its corner is
  // mapped and it sits where an unrotated frame would have put it anyway.
  const sized = block.width !== undefined && block.height !== undefined;
  const at = resolveInFrame(frame, block.x ?? 0, block.y ?? 0);
  // The half-box offset is applied along the frame's DIRECTIONS but in CANVAS
  // pixels, because width and height are pixels and x and y are frame units.
  // Adding one to the other -- which a first version did -- is a unit error
  // that stays invisible while xUnit is 1 and throws a marker 550px off the
  // plane the moment a frame scales.
  const radians = ((frame.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const along = (dx: number, dy: number): Point => ({
    x: at.x + dx * cos + dy * sin,
    y: at.y - dx * sin + dy * cos,
  });
  const placed = !sized
    ? at
    : block.anchor === "center"
      ? { x: at.x - block.width! / 2, y: at.y - block.height! / 2 }
      : (() => {
          // Default: the stated point is the box's top-left corner IN THE
          // FRAME, so the box extends along the frame's own axes from there.
          const centre = along(block.width! / 2, block.height! / 2);
          return { x: centre.x - block.width! / 2, y: centre.y - block.height! / 2 };
        })();
  const resolved: Block = {
    ...block,
    x: placed.x,
    y: placed.y,
    // A block in a tilted frame is tilted with it unless it says otherwise.
    // Block.rotation is CLOCKWISE and a frame's is counter-clockwise, hence
    // the negation -- the one sign flip in this file, and the reason
    // `rotateBox` is set alongside it: a frame turns the box, not just the
    // glyphs inside it.
    ...(frame.rotation === undefined || frame.rotation === 0 || block.rotation !== undefined
      ? {}
      : { rotation: -frame.rotation, rotateBox: block.rotateBox ?? true }),
  };
  delete resolved.frame;
  return resolved;
}
