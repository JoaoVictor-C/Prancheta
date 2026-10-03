/** Input types and the palette the two genetics figures share. */

export type Dominance = "complete" | "incomplete" | "codominance";

export type PunnettInput = {
  kind: "punnett";
  title?: string;
  /** The two parents' genotypes: "Aa", "AaBb", "XᴬXᵃ" and "XᴬY", "IᴬIᵇ"... The first is the Punnett square's rows, the second its columns. */
  parents: [string, string];
  /** What to call the parents. Default: "Mãe" / "Pai" for a sex-linked cross, else "Genitor 1" / "Genitor 2". */
  names?: [string, string];
  /** "complete" (default), "incomplete" or "codominance" -- for every locus, or per locus (keyed by its letter: "A", "I", "X"). */
  dominance?: Dominance | Record<string, Dominance>;
  /**
   * What each phenotype is called, per locus. Complete dominance: { "A": { "dominant": "amarela", "recessive": "verde" } }.
   * Incomplete dominance and codominance: { "C": { "CᴿCᴿ": "vermelha", "CᴿCᵂ": "rosa", "CᵂCᵂ": "branca" } } (genotypes naming the same phenotype merge).
   */
  phenotypes?: Record<string, Record<string, string>>;
  /** Words for the offspring's sex in a sex-linked cross. Default { F: "filha", M: "filho" }. */
  sexWords?: { F: string; M: string };
  /** Genotypes ("A_bb", "aabb", "XᵃY") or phenotype names whose cells are outlined and whose probability is printed. */
  highlight?: string[];
  answers?: boolean;
};

export type CarrierStyle = "half" | "dot";

export type PedigreeIndividual = {
  /** A key other fields refer to. An id that looks like a label ("II-3") must equal the label the layout gives that individual. */
  id: string;
  sex: "M" | "F" | "?";
  affected?: boolean;
  carrier?: boolean;
  deceased?: boolean;
  proband?: boolean;
  /** The two parents' ids. */
  parents?: [string, string];
  /** A name printed under the label. */
  name?: string;
  /** A genotype given by the exercise ("Aa", "XᵃY"), used by the analysis; shown only with answers. */
  genotype?: string;
};

export type PedigreeMarriage = {
  between: [string, string];
  /** Marked by hand when the shared ancestor is not drawn; a shared ancestor that is drawn is found by itself. */
  consanguineous?: boolean;
};

export type PedigreeQuery =
  | { of: string; is: "carrier" | "affected" | "unaffected"; label?: string }
  | { of: string; is: "genotype"; genotype: string; label?: string }
  | { childOf: [string, string]; is: "affected" | "carrier"; sex?: "M" | "F"; label?: string };

export type PedigreeAnalysis = {
  /** "autosomal recessive", "autosomal dominant", "X-linked recessive" or "X-linked dominant" (also in Portuguese). */
  mode: string;
  /** Frequency of the disease allele in the population, as a fraction ("1/100"); needed only when a probability depends on an unrelated individual's genotype. */
  frequency?: string;
  queries?: PedigreeQuery[];
};

export type PedigreeInput = {
  kind: "pedigree";
  title?: string;
  individuals: PedigreeIndividual[];
  marriages?: PedigreeMarriage[];
  /** How a carrier is marked: "half" (half-filled) or "dot" (a dot in the symbol). Default "dot". */
  carrierStyle?: CarrierStyle;
  /** Draw a key of the symbols used. Default true. */
  legend?: boolean;
  analysis?: PedigreeAnalysis;
  answers?: boolean;
};

export type GeneticsInput = PunnettInput | PedigreeInput;

export const PAPER = "#FCFBF7";
export const INK = "#181B21";
export const SOFT = "#4E5763";
export const RULE = "#9AA3AE";
export const LIGHT = "#D3D8DE";
export const ACCENT = "#1D4E89";

/** Cell tints and the stronger swatch beside each, by phenotype. */
export const TINTS = ["#DCEAF7", "#FBE5C8", "#DDF0DC", "#F4DCE8", "#E8E0F5", "#F6F0BE", "#DAEFF0", "#EBDDD3"];
export const SWATCHES = ["#2F6DB5", "#D98324", "#3F9A3F", "#C2467F", "#7A58B5", "#B89A12", "#2A9AA3", "#8C5E3F"];
