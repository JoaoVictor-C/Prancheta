/**
 * Grouping, nesting, and container transforms (M10, stage 6, step 37).
 *
 * Hierarchical layout with nested containers and coordinate transforms.
 * Elements can be grouped into containers, with transforms applied to the
 * entire group (translate, rotate, scale).
 */

export type Transform = {
  /** Translation offset. */
  translate?: { x: number; y: number };
  /** Rotation in degrees (around the group's origin). */
  rotate?: number;
  /** Scale factor (uniform or per-axis). */
  scale?: number | { x: number; y: number };
  /** Transform origin (default: top-left corner of group bounds). */
  origin?: { x: number; y: number };
};

export type Group = {
  id: string;
  /** Child element ids. */
  children: string[];
  /** Transform applied to the group. */
  transform?: Transform;
  /** Optional clipping bounds. */
  clipBounds?: { x: number; y: number; width: number; height: number };
};

/**
 * Apply a transform to a point.
 */
export function applyTransform(
  point: { x: number; y: number },
  transform: Transform,
  origin = { x: 0, y: 0 },
): { x: number; y: number } {
  let { x, y } = point;

  // Apply scale
  if (transform.scale !== undefined) {
    const sx = typeof transform.scale === "number" ? transform.scale : transform.scale.x;
    const sy = typeof transform.scale === "number" ? transform.scale : transform.scale.y;
    x = origin.x + (x - origin.x) * sx;
    y = origin.y + (y - origin.y) * sy;
  }

  // Apply rotation
  if (transform.rotate !== undefined) {
    const rad = (transform.rotate * Math.PI) / 180;
    const dx = x - origin.x;
    const dy = y - origin.y;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    x = origin.x + dx * cos - dy * sin;
    y = origin.y + dx * sin + dy * cos;
  }

  // Apply translation
  if (transform.translate !== undefined) {
    x += transform.translate.x;
    y += transform.translate.y;
  }

  return { x, y };
}

/**
 * Convert a transform to an SVG transform attribute string.
 */
export function transformToSvg(transform: Transform, origin = { x: 0, y: 0 }): string {
  const parts: string[] = [];

  if (transform.translate) {
    parts.push(`translate(${transform.translate.x}, ${transform.translate.y})`);
  }

  if (transform.rotate !== undefined) {
    parts.push(`rotate(${transform.rotate}, ${origin.x}, ${origin.y})`);
  }

  if (transform.scale !== undefined) {
    if (typeof transform.scale === "number") {
      parts.push(`scale(${transform.scale})`);
    } else {
      parts.push(`scale(${transform.scale.x}, ${transform.scale.y})`);
    }
  }

  return parts.join(" ");
}

/**
 * Compute the bounding box of a group of elements.
 */
export function groupBounds(
  elementPositions: Map<string, { x: number; y: number; width: number; height: number }>,
  elementIds: string[],
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of elementIds) {
    const pos = elementPositions.get(id);
    if (pos) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Check if a point is inside a group's clip bounds.
 */
export function isInsideClipBounds(
  point: { x: number; y: number },
  clipBounds: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    point.x >= clipBounds.x &&
    point.x <= clipBounds.x + clipBounds.width &&
    point.y >= clipBounds.y &&
    point.y <= clipBounds.y + clipBounds.height
  );
}

/**
 * Flatten nested groups into a flat list with accumulated transforms.
 */
export function flattenGroups(
  groups: Map<string, Group>,
  rootGroupId: string,
): Array<{ elementId: string; transform: Transform }> {
  const result: Array<{ elementId: string; transform: Transform }> = [];
  const visited = new Set<string>();

  function traverse(groupId: string, accumulatedTransform: Transform) {
    if (visited.has(groupId)) return; // Avoid cycles
    visited.add(groupId);

    const group = groups.get(groupId);
    if (!group) return;

    // Combine transforms (simplified: just use the group's transform)
    const currentTransform = group.transform ?? {};

    for (const childId of group.children) {
      // Check if child is itself a group
      if (groups.has(childId)) {
        traverse(childId, currentTransform);
      } else {
        result.push({ elementId: childId, transform: currentTransform });
      }
    }
  }

  traverse(rootGroupId, {});
  return result;
}

/**
 * Create a group from a set of elements.
 */
export function createGroup(
  elementIds: string[],
  transform?: Transform,
  clipBounds?: { x: number; y: number; width: number; height: number },
): Group {
  return {
    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    children: elementIds,
    transform,
    clipBounds,
  };
}
