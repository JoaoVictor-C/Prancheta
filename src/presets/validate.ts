/**
 * Shared primitives for preset-input validation.
 *
 * The preset input is the surface the skill and the MCP instructions both tell
 * an agent to author, and until now it was the only input here that nothing
 * validated: `isPresetInput` checked that `preset` was one of five strings and
 * handed the rest, unexamined, to an expander. What an agent got back was an
 * internal `TypeError` at a line number in this repo, or fifteen frames of
 * minified ELK.
 *
 * WHERE THE LINE IS. A rule belongs here when it is knowable from the document
 * alone AND is outside anything the repair loop may legitimately change. The
 * second half matters more than it looks: repair's entire edit vocabulary is
 * `width | height | wrap | canvasPadding` (src/repair.ts), so a part declared
 * taller than its canvas is the CHECK layer's business -- refusing it here
 * would turn a figure this project can fix into a figure it will not draw,
 * pre-empting a better-informed stage with a worse-informed one. Data, ids and
 * references are never repaired, so they are ours.
 *
 * WHAT WE NEVER DO. Nothing here coerces. Reading `value` as `values` would
 * change the author's document and hide the mistake that produced it. Naming
 * the near miss inside the refusal is required; acting on it is forbidden.
 * The repair loop follows the same discipline -- it edits geometry and reports
 * every edit, and it never edits intent.
 *
 * A malformed document throws and produces nothing. That is not in tension
 * with "a figure that fails its checks is reported, never hidden": a failed
 * check leaves a figure to look at, and a malformed document does not.
 */

import { SpecError } from "../ir/types.ts";

/** Levenshtein, only ever run against one object's own key list. */
function distance(a: string, b: string): number {
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row.push(
        Math.min(
          rows[i - 1]![j]! + 1,
          row[j - 1]! + 1,
          rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

/**
 * The key this object has that the author most plausibly meant to be `key`.
 * Reported, never acted on -- `value` stays `value`, and the author is told
 * that it did.
 */
function nearMiss(subject: Record<string, unknown>, key: string): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of Object.keys(subject)) {
    if (candidate === key) continue;
    const d = distance(candidate.toLowerCase(), key.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

function absent(
  subject: Record<string, unknown>,
  path: string,
  key: string,
  expectation: string,
): never {
  const guess = nearMiss(subject, key);
  const hint =
    guess === undefined
      ? ""
      : ` This object has "${guess}" -- if that was meant to be "${key}", rename it; ` +
        `nothing is renamed for you.`;
  throw new SpecError(`${path}.${key} is required (${expectation}), and is absent.${hint}`);
}

export function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SpecError(`${path} must be an object, got ${JSON.stringify(value)}`);
  }
  return value as Record<string, unknown>;
}

/** A required array the expander will index or divide by, so never empty. */
export function nonEmptyArray(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  what: string,
): unknown[] {
  const value = parent[key];
  if (value === undefined) absent(parent, path, key, `a non-empty array of ${what}`);
  if (!Array.isArray(value)) {
    throw new SpecError(`${path}.${key} must be an array of ${what}, got ${JSON.stringify(value)}`);
  }
  if (value.length === 0) {
    throw new SpecError(
      `${path}.${key} must not be empty -- there is no figure to draw from zero ${what}.`,
    );
  }
  return value;
}

/** A required array the expander may legitimately find empty. */
export function array(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  what: string,
): unknown[] {
  const value = parent[key];
  if (value === undefined) absent(parent, path, key, `an array of ${what}`);
  if (!Array.isArray(value)) {
    throw new SpecError(`${path}.${key} must be an array of ${what}, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function requiredString(parent: Record<string, unknown>, key: string, path: string): string {
  const value = parent[key];
  if (value === undefined) absent(parent, path, key, "a string");
  if (typeof value !== "string") {
    throw new SpecError(`${path}.${key} must be a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function optionalString(
  parent: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  const value = parent[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new SpecError(`${path}.${key} must be a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function optionalEnum<T extends string>(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
): T | undefined {
  const value = parent[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new SpecError(
      `${path}.${key} must be one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`,
    );
  }
  return value as T;
}

export function requiredNumber(parent: Record<string, unknown>, key: string, path: string): number {
  const value = parent[key];
  if (value === undefined) absent(parent, path, key, "a finite number");
  return finite(value, `${path}.${key}`);
}

export function optionalNumber(
  parent: Record<string, unknown>,
  key: string,
  path: string,
): number | undefined {
  const value = parent[key];
  if (value === undefined) return undefined;
  return finite(value, `${path}.${key}`);
}

export function optionalBoolean(
  parent: Record<string, unknown>,
  key: string,
  path: string,
): boolean | undefined {
  const value = parent[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new SpecError(`${path}.${key} must be true or false, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * NaN and Infinity are refused everywhere a number is read, including numbers
 * the expander DERIVES: two individually-finite values whose sum overflows are
 * as unusable as a NaN written by hand, and neither is something repair can
 * edit its way out of.
 */
export function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SpecError(`${path} must be a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function point(value: unknown, path: string): { x: number; y: number } {
  const p = object(value, path);
  return { x: requiredNumber(p, "x", path), y: requiredNumber(p, "y", path) };
}

/**
 * Ids must be unique. ELK either refuses a duplicate or silently merges the
 * two nodes into one, and a figure quietly missing a node is exactly the kind
 * of wrong-but-plausible output this project exists to prevent.
 */
export function unique(entries: { id: string; at: string }[], what: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new SpecError(
        `${entry.at}.id is ${JSON.stringify(entry.id)}, which is already used by an earlier ` +
          `${what}. Ids identify ${what}s and cannot be shared.`,
      );
    }
    seen.add(entry.id);
  }
}

/** The role vocabulary every preset's items draw from (BlockRole in the IR). */
export const ROLES = ["default", "primary", "accent", "warning", "muted", "callout"] as const;

/**
 * A reference to an id declared elsewhere in the same document. This is the
 * one rule that must live here rather than downstream: a name that was never
 * declared cannot be repaired into existence, and the engine that finally
 * dereferences it reports in its own vocabulary, about its own graph, with no
 * idea the caller wrote `edges[0].to`.
 *
 * parseSpec deliberately leaves the equivalent question about `layoutConstraints`
 * to a check rather than the parser, and that is not a contradiction: a named
 * check reports those, so the author hears about them in the manifest. Nothing
 * reported these -- the first thing to notice was ELK, and it noticed by
 * throwing.
 */
export function knownId(id: string, known: Set<string>, path: string, what: string): void {
  if (known.has(id)) return;
  const guess = [...known].find(
    (candidate) => distance(candidate.toLowerCase(), id.toLowerCase()) < 3,
  );
  const hint = guess === undefined ? "" : ` Did you mean ${JSON.stringify(guess)}?`;
  const declared = known.size === 0 ? "none are declared" : `declared: ${[...known].join(", ")}`;
  throw new SpecError(
    `${path} refers to ${what} ${JSON.stringify(id)}, which is not declared (${declared}).${hint}`,
  );
}
