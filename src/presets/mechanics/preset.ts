/**
 * mechanics -- physics situations solved before they are drawn (ADR 0073,
 * docs/plans/PLAN-PHYSICS.md). What is typed is the situation -- masses, g, an angle,
 * μ, a spring constant -- and everything drawn is computed by a solver in
 * physics.ts. Every force arrow is drawn to one scale per figure, so its
 * length IS its magnitude.
 *
 * Each kind is one file in kinds/ and fills in the `Kind` contract (kind.ts);
 * the registry below is the only list of them. Shared drawing is in draw.ts.
 *
 * answers:false hides what a question asks: every computed value, kept in the
 * reading lines under the figure. Arrows keep their names; the given data stay.
 */

import type { FigureSpec } from "../../ir/types.ts";
import { SpecError } from "../../ir/types.ts";
import { LOCALES } from "../../locale/format.ts";
import * as v from "../validate.ts";
import type { Kind, MechanicsInput } from "./kind.ts";
import { pulleys } from "./kinds/pulleys.ts";
import { incline } from "./kinds/incline.ts";
import { table } from "./kinds/table.ts";
import { atwood } from "./kinds/atwood.ts";
import { spring } from "./kinds/spring.ts";
import { projectile } from "./kinds/projectile.ts";
import { energy } from "./kinds/energy.ts";
import { lever } from "./kinds/lever.ts";
import { collision } from "./kinds/collision.ts";
import { circular } from "./kinds/circular.ts";
import { loop } from "./kinds/loop.ts";
import { banked } from "./kinds/banked.ts";
import { conical } from "./kinds/conical.ts";
import { orbit } from "./kinds/orbit.ts";
import { freeFall } from "./kinds/free-fall.ts";
import { contact } from "./kinds/contact.ts";
import { angledPull } from "./kinds/angled-pull.ts";
import { elevator } from "./kinds/elevator.ts";
import { springs } from "./kinds/springs.ts";
import { gravitation } from "./kinds/gravitation.ts";
import { cables } from "./kinds/cables.ts";
import { centerOfMass } from "./kinds/center-of-mass.ts";
import { oscillator } from "./kinds/oscillator.ts";
import { buoyancy } from "./kinds/buoyancy.ts";
import { hydraulic } from "./kinds/hydraulic.ts";
import { pressure } from "./kinds/pressure.ts";
import { efficiency } from "./kinds/efficiency.ts";

export type { MechanicsInput } from "./kind.ts";
export * from "./physics.ts";

/** Every kind, in the order the docs list them. Adding one: a file in kinds/ and a line here. */
const REGISTRY: readonly Kind[] = [pulleys, incline, table, atwood, spring, projectile, energy, lever, collision, circular, loop, banked, conical, orbit, freeFall, contact, angledPull, elevator, springs, gravitation, cables, centerOfMass, oscillator, buoyancy, hydraulic, pressure, efficiency];

export const KINDS: readonly string[] = REGISTRY.map((k) => k.id);
const byId = new Map(REGISTRY.map((k) => [k.id, k]));
const COMMON = ["preset", "title", "locale", "kind", "g", "answers"];

// Names every preset input already owns (src/presets/index.ts validates
// style, theme and type before any preset sees them). A kind field with one
// of these names is refused there with a message about type packs; it
// happened to the collision kind's "type". Refused here at load instead.
const RESERVED = [...COMMON, "style", "theme", "type"];
for (const k of REGISTRY) {
  const clash = k.fields.filter((f) => RESERVED.includes(f));
  if (clash.length > 0) throw new Error(`mechanics kind "${k.id}" uses reserved field name(s): ${clash.join(", ")}`);
}

export function validateMechanicsInput(raw: Record<string, unknown>): void {
  const path = "mechanics";
  const id = v.optionalEnum(raw, "kind", path, KINDS);
  if (id === undefined) throw new SpecError(`${path}.kind is required: ${KINDS.map((k) => `"${k}"`).join(", ")}`);
  const kind = byId.get(id)!;
  const allowed = [...COMMON, ...kind.fields];
  for (const k of Object.keys(raw)) {
    if (allowed.includes(k)) continue;
    const owner = REGISTRY.find((x) => x.fields.includes(k));
    throw new SpecError(owner === undefined
      ? `${path}.${k} is not a field of mechanics`
      : `${path}.${k} belongs to another kind (${owner.id}), not "${id}"`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  const g = v.optionalNumber(raw, "g", path);
  if (g !== undefined && !(g > 0)) throw new SpecError(`${path}.g must be positive, got ${g}`);
  kind.validate(raw, path);
  v.optionalBoolean(raw, "answers", path);
  expandMechanics(raw as unknown as MechanicsInput);
}

export function expandMechanics(input: MechanicsInput): FigureSpec {
  const kind = byId.get(input.kind);
  if (kind === undefined) throw new SpecError(`mechanics.kind must be one of ${KINDS.join(", ")}, got ${JSON.stringify(input.kind)}`);
  return kind.draw(input);
}
