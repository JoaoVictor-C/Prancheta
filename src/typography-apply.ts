/**
 * Applying a type pack.
 *
 * Kept beside the pack table but in its own file, the same split
 * `effects/styles.ts` uses: the table is data a doc generator and a CLI
 * command both read, and this is the one function that mutates a spec with it.
 *
 * The rule is the rule style packs already keep — FILL ONLY ABSENCES. An
 * element that sets its own `fontSize` keeps it, and a pack supplies the rest
 * of the step around it. That matters more here than for effects: a chart's
 * value labels and a poster's date line both set sizes deliberately, and a
 * pack that overrode them would silently rescale figures that were already
 * correct.
 */

import { stepFor, typeById } from "./typography.ts";
import type { FigureNode, FigureSpec } from "./ir/types.ts";

export function applyType(spec: FigureSpec): FigureSpec {
  const id = spec.canvas?.type;
  if (id === undefined) return spec;
  const pack = typeById(id);
  if (pack === undefined) return spec;

  const visit = (node: FigureNode): FigureNode => {
    if (node.type === "stack") return { ...node, children: node.children.map(visit) };
    if (node.type === "scene") {
      return { ...node, children: node.children.map((child) => visit(child) as typeof child) };
    }
    if (node.type !== "block") return node;
    // A block with no text takes nothing: a type pack has no business setting
    // a family on a shape that will never draw a glyph.
    if (node.label === undefined) return node;
    const step = stepFor(pack, node.level);
    return {
      ...node,
      ...(node.fontFamily === undefined ? { fontFamily: step.family } : {}),
      ...(node.fontSize === undefined ? { fontSize: step.size } : {}),
      ...(node.fontWeight === undefined && step.weight !== undefined
        ? { fontWeight: step.weight }
        : {}),
      ...(node.letterSpacing === undefined && step.letterSpacing !== undefined
        ? { letterSpacing: step.letterSpacing }
        : {}),
    };
  };

  return { ...spec, root: visit(spec.root) };
}
