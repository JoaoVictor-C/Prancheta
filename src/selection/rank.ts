/**
 * Deterministic ranking.
 *
 * The output is ordered candidates with cited reasons — not a verdict handed
 * down with no visible alternatives, which is precisely the shape that makes a
 * wrong default invisible. Three outcomes are first-class:
 *
 *   single   — one candidate clears the floor
 *   compose  — two clear it on DISJOINT evidence, so the figure is genuinely
 *              two things and flattening it would repeat the failure this
 *              project exists to fix
 *   delegate — the content belongs to a domain whose geometry a real library
 *              computes and this core does not, so the answer is a figure
 *              module rather than a preset (decision 0005)
 *   none     — nothing clears the floor; author raw IR instead of forcing the
 *              request into the nearest genre
 *
 * "delegate" is fourth rather than a flavour of "none" because it is reached
 * POSITIVELY. "none" is exhaustion — nothing fit — and a request for a map
 * fits something perfectly well; it simply does not fit anything on this side
 * of the process boundary. Until this existed the module repertoire was a list
 * an agent had to already know to consult, which made it, for selection
 * purposes, invisible.
 *
 * No model, no network, no randomness: same predicates in, same ranking out.
 */

import { DELEGATE_RULES, FLOOR, RULES } from "./rules.ts";
import type { Rule } from "./rules.ts";
import { DELEGATES, PRESETS } from "./vocabulary.ts";
import type { ModuleId, Predicates, PresetId } from "./vocabulary.ts";

export type Candidate = {
  preset: PresetId;
  score: number;
  /** Highest priority among the rules that fired for this candidate. */
  priority: number;
  /** Rule ids that contributed, in table order. */
  cited: string[];
  /** Set if a disqualify rule fired; the candidate is then out regardless of score. */
  disqualifiedBy?: string;
  /** Predicate values this candidate's evidence rests on, for disjointness. */
  evidence: string[];
  implemented: boolean;
};

/** A figure module the request reached, with the rules that reached it. */
export type DelegateCandidate = {
  module: ModuleId;
  score: number;
  priority: number;
  cited: string[];
  summary: string;
};

export type Selection = {
  outcome: "single" | "compose" | "delegate" | "none";
  /** Ordered best-first. Disqualified candidates are included, last, for transparency. */
  candidates: Candidate[];
  /** The chosen preset(s). Empty when the outcome is "none" or "delegate". */
  chosen: PresetId[];
  /** Ordered best-first. Empty unless a domain predicate was asserted. */
  delegates: DelegateCandidate[];
  /** The chosen module. Set only when the outcome is "delegate". */
  delegateTo?: ModuleId;
  /** Human-readable justification, built from the cited rule statements. */
  rationale: string;
  /** Unknown predicates, preserved. Their presence means the vocabulary may be short. */
  unknown: string[];
  /** True when a chosen preset has no implementation yet. */
  notYetImplemented: PresetId[];
};

export function rank(predicates: Predicates): Selection {
  const values = new Set<string>([
    ...predicates.structure.map((value) => `structure:${value}`),
    ...predicates.idiom.map((value) => `idiom:${value}`),
    ...predicates.domain.map((value) => `domain:${value}`),
  ]);

  const candidates: Candidate[] = PRESETS.map((preset) => {
    const fired = RULES.filter(
      (rule) => values.has(`${rule.axis}:${rule.when}`) && rule.preset === preset.id,
    );
    const disqualifier = fired.find((rule) => rule.effect === "disqualify");
    const favouring = fired.filter((rule) => rule.effect === "favour");
    return {
      preset: preset.id,
      score: favouring.reduce((total, rule) => total + rule.weight, 0),
      priority: fired.reduce((best, rule) => Math.max(best, rule.priority), 0),
      cited: fired.map((rule) => rule.id),
      disqualifiedBy: disqualifier?.id,
      evidence: favouring.map((rule) => `${rule.axis}:${rule.when}`),
      implemented: preset.implemented,
    };
  });

  candidates.sort(compareCandidates);

  const delegates: DelegateCandidate[] = DELEGATES.map((entry) => {
    const fired = DELEGATE_RULES.filter(
      (rule) => predicates.domain.includes(rule.when) && rule.module === entry.id,
    );
    return {
      module: entry.id,
      score: fired.reduce((total, rule) => total + rule.weight, 0),
      priority: fired.reduce((best, rule) => Math.max(best, rule.priority), 0),
      cited: fired.map((rule) => rule.id),
      summary: entry.summary,
    };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : b.priority !== a.priority
          ? b.priority - a.priority
          : a.module.localeCompare(b.module),
    );

  const viable = candidates.filter(
    (candidate) => candidate.disqualifiedBy === undefined && candidate.score >= FLOOR,
  );

  let outcome: Selection["outcome"] = "none";
  let chosen: PresetId[] = [];
  let delegateTo: ModuleId | undefined;

  // Delegation is decided FIRST, and that is a precedence claim worth stating:
  // a request that names a domain is answered on the far side of the boundary
  // however well some preset scores, for the same reason a scene is refused
  // the graph preset however well it would render. The domain refusals in
  // RULES already knock out the presets that would misrepresent; this stops
  // the survivors quietly winning anyway.
  if (delegates.length > 0 && delegates[0]!.score >= FLOOR) {
    outcome = "delegate";
    delegateTo = delegates[0]!.module;
  } else if (viable.length >= 2 && disjoint(viable[0]!, viable[1]!)) {
    outcome = "compose";
    chosen = [viable[0]!.preset, viable[1]!.preset];
  } else if (viable.length >= 1) {
    outcome = "single";
    chosen = [viable[0]!.preset];
  }

  return {
    outcome,
    candidates,
    chosen,
    delegates,
    delegateTo,
    rationale: explain(outcome, chosen, candidates, delegates),
    unknown: predicates.unknown ?? [],
    notYetImplemented: chosen.filter(
      (id) => PRESETS.find((preset) => preset.id === id)?.implemented === false,
    ),
  };
}

/** Total and stable: score, then priority, then id. Never engine key order. */
function compareCandidates(a: Candidate, b: Candidate): number {
  const aOut = a.disqualifiedBy !== undefined;
  const bOut = b.disqualifiedBy !== undefined;
  if (aOut !== bOut) return aOut ? 1 : -1;
  if (b.score !== a.score) return b.score - a.score;
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.preset.localeCompare(b.preset);
}

/**
 * Two candidates compose only when their evidence does not overlap: the figure
 * is two different things, not one thing two presets both claim.
 */
function disjoint(a: Candidate, b: Candidate): boolean {
  if (a.evidence.length === 0 || b.evidence.length === 0) return false;
  return !a.evidence.some((value) => b.evidence.includes(value));
}

function explain(
  outcome: Selection["outcome"],
  chosen: PresetId[],
  candidates: Candidate[],
  delegates: DelegateCandidate[],
): string {
  const statementsFor = (preset: PresetId): string => {
    const candidate = candidates.find((entry) => entry.preset === preset);
    if (!candidate) return "";
    return candidate.cited
      .map((id) => RULES.find((rule) => rule.id === id)?.statement ?? id)
      .join(" ");
  };

  if (outcome === "delegate") {
    const chosenDelegate = delegates[0]!;
    const why = chosenDelegate.cited
      .map((id) => DELEGATE_RULES.find((rule) => rule.id === id)?.statement ?? id)
      .join(" ");
    const refused = candidates
      .filter((candidate) => candidate.disqualifiedBy !== undefined)
      .map((candidate) => `${candidate.preset} (${candidate.disqualifiedBy})`);
    const suffix = refused.length > 0 ? ` Refused: ${refused.join(", ")}.` : "";
    return `Delegate to the ${chosenDelegate.module} module: ${why}${suffix}`;
  }
  if (outcome === "none") {
    const blocked = candidates
      .filter((candidate) => candidate.disqualifiedBy !== undefined)
      .map((candidate) => `${candidate.preset} (${candidate.disqualifiedBy})`);
    const suffix = blocked.length > 0 ? ` Refused: ${blocked.join(", ")}.` : "";
    return `No preset clears the floor of ${FLOOR}; author raw IR rather than forcing this into the nearest genre.${suffix}`;
  }
  if (outcome === "compose") {
    return `Compose ${chosen.join(" + ")}: each clears the floor on separate evidence. ${statementsFor(
      chosen[0]!,
    )} ${statementsFor(chosen[1]!)}`.trim();
  }
  return `${chosen[0]}: ${statementsFor(chosen[0]!)}`.trim();
}

/**
 * Replay check. Given what a figure's manifest recorded, does the table still
 * choose what was actually drawn? This cannot catch a model that misread the
 * request — but it does catch one that recorded "this is a spatial scene" and
 * then rendered a flowchart anyway.
 */
export function replayMatches(predicates: Predicates, presetUsed: PresetId): boolean {
  return rank(predicates).chosen.includes(presetUsed);
}
