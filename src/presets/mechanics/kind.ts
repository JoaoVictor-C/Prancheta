/**
 * The contract every mechanics kind fills in. A kind is one file in kinds/:
 * the fields it takes beyond the common ones, a validator for them, and a
 * drawing. The registry in preset.ts is the only place that lists them.
 */

import type { FigureSpec } from "../../ir/types.ts";
import { SpecError } from "../../ir/types.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";

/** What every kind accepts. A kind reads its own fields from the same object. */
export type MechanicsInput = {
  title?: string;
  locale?: Locale;
  kind: string;
  /** m/s². Default 10. */
  g?: number;
  /** false: the question's figure -- no computed value printed. Default true. */
  answers?: boolean;
  [field: string]: unknown;
};

export type Kind = {
  /** The value of `kind` that selects it. */
  id: string;
  /** Its fields, beyond title, locale, kind, g and answers. */
  fields: string[];
  /** Checks its own fields; the common ones are checked before. */
  validate: (raw: Record<string, unknown>, path: string) => void;
  draw: (input: MechanicsInput) => FigureSpec;
};

/** The settings every drawing starts from. */
export function common(input: MechanicsInput): { locale: Locale; answers: boolean; g: number } {
  return { locale: input.locale ?? "pt-BR", answers: input.answers !== false, g: input.g ?? 10 };
}

// ---- validation helpers shared by kinds ------------------------------------------------------

export function positive(raw: Record<string, unknown>, key: string, path: string): number {
  const x = v.requiredNumber(raw, key, path);
  if (!(x > 0)) throw new SpecError(`${path}.${key} must be positive, got ${x}`);
  return x;
}

export function twoMasses(raw: Record<string, unknown>, path: string): [number, number] {
  const ms = v.array(raw, "masses", path, "two masses [kg, kg]");
  if (ms.length !== 2 || ms.some((m) => typeof m !== "number" || !(m > 0))) throw new SpecError(`${path}.masses must be two positive masses, got ${JSON.stringify(ms)}`);
  return ms as [number, number];
}

export function friction(raw: Record<string, unknown>, path: string): number | undefined {
  const mu = v.optionalNumber(raw, "friction", path);
  if (mu !== undefined && mu < 0) throw new SpecError(`${path}.friction must not be negative, got ${mu}`);
  return mu;
}
