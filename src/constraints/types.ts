/**
 * Constraint vocabulary (M10, stage 6, step 31).
 *
 * Declarative spatial relationships a figure states about its boxes, checked
 * by `constraints-satisfied` against the laid-out figure. They are verified,
 * not enforced: the translation repair that would have moved boxes to satisfy
 * them was never wired and was removed (ADR 0076).
 */

export type Constraint =
  | AlignConstraint
  | DistributeConstraint
  | KeepClearConstraint
  | SameSizeConstraint
  | AnchorConstraint;

/**
 * Align: make multiple elements share a common coordinate along an axis.
 *
 * Examples:
 * - align(["box1", "box2", "box3"], "left") — left edges vertically aligned
 * - align(["label1", "label2"], "top") — top edges horizontally aligned
 * - align(["a", "b"], "center-x") — centers vertically aligned
 */
export type AlignConstraint = {
  kind: "align";
  /** Element ids to align. */
  elements: string[];
  /** Alignment axis. */
  axis: "left" | "right" | "top" | "bottom" | "center-x" | "center-y";
};

/**
 * Distribute: space elements evenly along an axis.
 *
 * Examples:
 * - distribute(["a", "b", "c"], "horizontal", 20) — equal 20px gaps horizontally
 * - distribute(["row1", "row2", "row3"], "vertical") — equal gaps vertically
 */
export type DistributeConstraint = {
  kind: "distribute";
  /** Element ids to distribute. */
  elements: string[];
  /** Distribution axis. */
  axis: "horizontal" | "vertical";
  /** Fixed spacing between elements (optional; default: equal spacing). */
  spacing?: number;
};

/**
 * KeepClear: maintain minimum distance between two elements.
 *
 * Examples:
 * - keepClear("title", "legend", 30) — title and legend at least 30px apart
 * - keepClear("box1", "box2", 10) — 10px minimum clearance
 */
export type KeepClearConstraint = {
  kind: "keepClear";
  /** First element id. */
  element1: string;
  /** Second element id. */
  element2: string;
  /** Minimum distance in pixels. */
  minDistance: number;
};

/**
 * SameSize: make elements have identical dimensions.
 *
 * Examples:
 * - sameSize(["card1", "card2", "card3"], "width") — all cards same width
 * - sameSize(["icon1", "icon2"], "both") — identical width and height
 */
export type SameSizeConstraint = {
  kind: "sameSize";
  /** Element ids to size identically. */
  elements: string[];
  /** Which dimension(s) to match. */
  dimension: "width" | "height" | "both";
};

/**
 * Anchor: pin an element to a specific position or relative to another element.
 *
 * Examples:
 * - anchor("logo", {x: 20, y: 20}) — absolute position
 * - anchor("caption", "image", "below", 10) — caption 10px below image
 */
export type AnchorConstraint = {
  kind: "anchor";
  /** Element id to anchor. */
  element: string;
  /** Absolute position (if specified). */
  position?: { x: number; y: number };
  /** Relative anchor (if specified). */
  relativeTo?: {
    /** Element id to anchor relative to. */
    target: string;
    /** Relative position. */
    relation: "above" | "below" | "left" | "right";
    /** Distance from target. */
    offset: number;
  };
};

/**
 * Check if a constraint is satisfied for the given element positions.
 */
export function isConstraintSatisfied(
  constraint: Constraint,
  boxes: Map<string, { x: number; y: number; width: number; height: number }>,
): boolean {
  const EPSILON = 0.1; // Floating-point tolerance

  switch (constraint.kind) {
    case "align": {
      const elements = constraint.elements
        .map((id) => boxes.get(id))
        .filter((box): box is NonNullable<typeof box> => box !== undefined);

      if (elements.length < 2) return true; // Not applicable

      const getCoord = (box: { x: number; y: number; width: number; height: number }) => {
        switch (constraint.axis) {
          case "left":
            return box.x;
          case "right":
            return box.x + box.width;
          case "top":
            return box.y;
          case "bottom":
            return box.y + box.height;
          case "center-x":
            return box.x + box.width / 2;
          case "center-y":
            return box.y + box.height / 2;
        }
      };

      const coords = elements.map(getCoord);
      const first = coords[0]!;
      return coords.every((c) => Math.abs(c - first) < EPSILON);
    }

    case "distribute": {
      const elements = constraint.elements
        .map((id) => boxes.get(id))
        .filter((box): box is NonNullable<typeof box> => box !== undefined);

      if (elements.length < 2) return true; // Not applicable

      // Sort by position along axis
      const sorted =
        constraint.axis === "horizontal"
          ? [...elements].sort((a, b) => a.x - b.x)
          : [...elements].sort((a, b) => a.y - b.y);

      // Check if spacing is uniform
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;
        const gap =
          constraint.axis === "horizontal"
            ? curr.x - (prev.x + prev.width)
            : curr.y - (prev.y + prev.height);
        gaps.push(gap);
      }

      if (constraint.spacing !== undefined) {
        // Fixed spacing specified
        return gaps.every((gap) => Math.abs(gap - constraint.spacing!) < EPSILON);
      } else {
        // Equal spacing (all gaps should be the same)
        const first = gaps[0]!;
        return gaps.every((gap) => Math.abs(gap - first) < EPSILON);
      }
    }

    case "keepClear": {
      const box1 = boxes.get(constraint.element1);
      const box2 = boxes.get(constraint.element2);

      if (!box1 || !box2) return true; // Not applicable

      // Compute minimum distance between boxes
      const dx = Math.max(0, box1.x - (box2.x + box2.width), box2.x - (box1.x + box1.width));
      const dy = Math.max(0, box1.y - (box2.y + box2.height), box2.y - (box1.y + box1.height));
      const distance = Math.sqrt(dx * dx + dy * dy);

      return distance >= constraint.minDistance - EPSILON;
    }

    case "sameSize": {
      const elements = constraint.elements
        .map((id) => boxes.get(id))
        .filter((box): box is NonNullable<typeof box> => box !== undefined);

      if (elements.length < 2) return true; // Not applicable

      const first = elements[0]!;
      if (constraint.dimension === "width" || constraint.dimension === "both") {
        if (!elements.every((box) => Math.abs(box.width - first.width) < EPSILON)) {
          return false;
        }
      }
      if (constraint.dimension === "height" || constraint.dimension === "both") {
        if (!elements.every((box) => Math.abs(box.height - first.height) < EPSILON)) {
          return false;
        }
      }
      return true;
    }

    case "anchor": {
      const box = boxes.get(constraint.element);
      if (!box) return true; // Not applicable

      if (constraint.position) {
        // Absolute anchor
        return (
          Math.abs(box.x - constraint.position.x) < EPSILON &&
          Math.abs(box.y - constraint.position.y) < EPSILON
        );
      }

      if (constraint.relativeTo) {
        const target = boxes.get(constraint.relativeTo.target);
        if (!target) return true; // Not applicable

        const { relation, offset } = constraint.relativeTo;
        let expectedX = box.x;
        let expectedY = box.y;

        switch (relation) {
          case "above":
            expectedY = target.y - box.height - offset;
            break;
          case "below":
            expectedY = target.y + target.height + offset;
            break;
          case "left":
            expectedX = target.x - box.width - offset;
            break;
          case "right":
            expectedX = target.x + target.width + offset;
            break;
        }

        return Math.abs(box.x - expectedX) < EPSILON && Math.abs(box.y - expectedY) < EPSILON;
      }

      return true; // No position or relativeTo specified
    }
  }
}
