/**
 * Style packs — a whole look, named once instead of applied N times.
 *
 * The effect repertoire is per-element: `effect: "raised-2"` on a block. That
 * is the right primitive and the wrong ergonomics for a figure with forty
 * nodes, where an author must write the field forty times AND keep the choices
 * consistent by hand. Consistency maintained by hand is consistency that drifts
 * the moment a node is added.
 *
 * A pack maps the ROLE an element already declares to the effect it should
 * carry. Roles exist because a figure's parts mean different things; a pack is
 * the statement of what that difference should look like. So `role: "warning"`
 * keeps meaning "this is the failure case" and the pack decides whether that
 * reads as a glow, a bevel or nothing at all.
 *
 * THREE RULES THIS LAYER KEEPS.
 *
 * 1. It only ever fills ABSENCES. A block that declares its own `effect` is
 *    left exactly as authored, because a pack is a default and the author is
 *    not overruled by one. Same for a connector's line and arrow styles.
 *
 * 2. It buys no exemption. Every effect a pack applies goes through the same
 *    `resolveEffects` and the same bleed arithmetic as a hand-written one, so
 *    `effect-within-canvas` still runs and the repair loop still grows
 *    `canvas.padding` when the ink would clip. A pack makes a look reachable;
 *    it does not make it unchecked.
 *
 * 3. It never touches `callout`. A callout carries no fill and no border by
 *    design — it sits ON the figure, and the leader line does the pointing.
 *    An effect there would turn it back into the floating sticky note the
 *    annotated-figure preset exists to avoid.
 */

import type { ArrowStyle, BlockRole, FigureNode, FigureSpec, LineStyle } from "../ir/types.ts";
import type { EffectRef } from "./types.ts";

export type StylePack = {
  id: string;
  summary: string;
  /** Effect per declared role. `callout` is deliberately never listed. */
  roles: Partial<Record<BlockRole, EffectRef | EffectRef[]>>;
  /** Line and arrow defaults for connectors that declare none. */
  connector?: { lineStyle?: LineStyle; arrowStyle?: ArrowStyle };
  /** Edge darkening the pack implies, if the canvas does not set its own. */
  vignette?: number;
};

export const STYLE_PACKS: StylePack[] = [
  {
    id: "elevated",
    summary:
      "Cards lifted off the page. Depth carries hierarchy: the more a part matters, " +
      "the further it floats.",
    roles: {
      primary: "raised-3",
      accent: "raised-2",
      warning: "raised-2",
      default: "raised-1",
      muted: "seated",
    },
  },
  {
    id: "neon",
    summary:
      "Glow as emphasis. The loudest pack here: primaries and accents burn, failures " +
      "alarm, everything else recedes to outline.",
    roles: {
      primary: "emphasis",
      accent: "emphasis",
      warning: "alarm",
      default: "outlined",
      muted: "ghost",
    },
    vignette: 0.35,
  },
  {
    id: "spotlight",
    summary:
      "One thing in focus and the rest falling away — lit primaries against blurred, " +
      "desaturated surroundings.",
    roles: {
      primary: "lit",
      accent: "raised-2",
      warning: "alarm",
      default: "recede",
      muted: "depth-of-field",
    },
    vignette: 0.45,
  },
  {
    id: "etched",
    summary:
      "Engraved rather than lit: bevels and grain, no cast shadows, nothing leaving " +
      "its own bounds. The pack to reach for when a figure has to print.",
    roles: {
      primary: "etched",
      accent: "etched",
      warning: "outlined",
      default: "inset",
      muted: "ghost",
    },
    vignette: 0.12,
  },
];

export const STYLE_IDS: string[] = STYLE_PACKS.map((pack) => pack.id);

export function styleById(id: string): StylePack | undefined {
  return STYLE_PACKS.find((pack) => pack.id === id);
}

/**
 * Fill in every effect, line style and arrow style the pack implies and the
 * author did not write. Returns the spec unchanged when no pack is named, so a
 * figure that says nothing renders exactly as it did before packs existed.
 */
export function applyStyle(spec: FigureSpec): FigureSpec {
  const id = spec.canvas?.style;
  if (id === undefined) return spec;
  const pack = styleById(id);
  if (pack === undefined) return spec;

  const visit = (node: FigureNode): FigureNode => {
    if (node.type === "stack") {
      return { ...node, children: node.children.map(visit) };
    }
    if (node.type === "scene") {
      return {
        ...node,
        children: node.children.map((child) => visit(child) as typeof child),
        connectors: node.connectors?.map((connector) => ({
          ...connector,
          ...(connector.lineStyle === undefined && pack.connector?.lineStyle !== undefined
            ? { lineStyle: pack.connector.lineStyle }
            : {}),
          ...(connector.arrowStyle === undefined && pack.connector?.arrowStyle !== undefined
            ? { arrowStyle: pack.connector.arrowStyle }
            : {}),
        })),
      };
    }
    if (node.type !== "block") return node;
    // Authored effects win. A pack is a default, not an override.
    if (node.effect !== undefined) return node;
    const role: BlockRole = node.role ?? "default";
    // `callout` is never styled -- see the header.
    if (role === "callout") return node;
    const effect = pack.roles[role];
    return effect === undefined ? node : { ...node, effect };
  };

  const canvas =
    pack.vignette !== undefined && spec.canvas?.vignette === undefined
      ? { ...spec.canvas, vignette: pack.vignette }
      : spec.canvas;

  return { ...spec, canvas, root: visit(spec.root) };
}
