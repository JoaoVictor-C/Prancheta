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

import type { Block, FigureNode, FigureSpec, Frame, FramedPoint, Point, Scene } from "./types.ts";
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
    frames.set(frame.id, { ...frame, origin });
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

    const children = node.children.map(
      (child) => resolveNode(child, frames) as Block,
    );
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

    const resolved: Scene = { ...node, children, ...(connectors === undefined ? {} : { connectors }) };
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
  const x = block.x ?? 0;
  const y = block.y ?? 0;
  const placed = sized
    ? (() => {
        const centre = resolveInFrame(frame, x + block.width! / 2, y - block.height! / 2);
        return { x: centre.x - block.width! / 2, y: centre.y - block.height! / 2 };
      })()
    : resolveInFrame(frame, x, y);
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
