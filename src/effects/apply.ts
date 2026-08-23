/**
 * Attaching effects to a figure that has already been laid out.
 *
 * The timing is the whole point. Layout has finished, every coordinate is
 * final, and nothing this module does can change one — it reads the spec for
 * what each element was asked to look like and records that on the placed
 * element, together with the exact distance that look puts ink past the
 * element's own edges.
 *
 * Doing it here rather than during layout is what lets checks.ts treat a
 * shadow as geometry: by the time the checks run, the halo has a rectangle.
 */

import type { FigureNode, FigureSpec, LaidOutFigure } from "../ir/types.ts";
import { bleedOf } from "./bleed.ts";
import { labelChain, resolveEffects } from "./types.ts";
import type { ResolvedEffect } from "./types.ts";

/**
 * Effect chains by element id, for blocks and connectors alike.
 *
 * Ids follow the same scheme ir/normalise.ts and layout/place.ts assign, which
 * is a contract rather than a coincidence — it is the same reason the repair
 * loop can name a node it never rendered.
 */
export function collectEffectChains(spec: FigureSpec): Map<string, ResolvedEffect[]> {
  const chains = new Map<string, ResolvedEffect[]>();
  let counter = 0;

  const visit = (node: FigureNode): void => {
    counter += 1;
    const id = node.id ?? `${node.type}-${counter}`;
    if (node.type === "stack") {
      node.children.forEach(visit);
      return;
    }
    if (node.type === "scene") {
      node.children.forEach(visit);
      (node.connectors ?? []).forEach((connector, index) => {
        const chain = resolveEffects(connector.effect);
        if (chain.length === 0) return;
        chains.set(connector.id ?? `${id}-edge-${index + 1}`, chain);
      });
      return;
    }
    const chain = resolveEffects(node.effect);
    if (chain.length > 0) chains.set(id, chain);
  };

  visit(spec.root);
  return chains;
}

/**
 * Record each element's chain and its reach on the laid-out figure.
 *
 * A label takes only the part of its block's chain that describes appearance
 * rather than surface (see labelChain), so a card casts one shadow instead of
 * one per glyph, while a receding block goes soft label and all.
 */
export function attachEffects(figure: LaidOutFigure, spec: FigureSpec): LaidOutFigure {
  const chains = collectEffectChains(spec);
  if (chains.size === 0) {
    return { ...figure, vignette: spec.canvas?.vignette };
  }

  const elements = figure.elements.map((element) => {
    if (element.kind === "text") {
      // Text is keyed by the block it labels: the spec says a *block* recedes,
      // and its label is part of the block, not a separate authored thing.
      const owner = element.ownerId === null ? undefined : chains.get(element.ownerId);
      const chain = owner === undefined ? [] : labelChain(owner);
      if (chain.length === 0) return element;
      return { ...element, effects: chain, bleed: bleedOf(chain) };
    }
    const chain = chains.get(element.id);
    if (chain === undefined) return element;
    return { ...element, effects: chain, bleed: bleedOf(chain) };
  });

  return { ...figure, elements, vignette: spec.canvas?.vignette };
}
