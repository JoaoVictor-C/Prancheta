/**
 * The figure-module repertoire.
 *
 * Modules live outside the core as separate processes (decision 0005), which
 * made them invisible: nothing in the CLI, the generated views or the MCP
 * resource tree mentioned that they exist. An agent cannot choose a module it
 * has never heard of, so the whole repertoire may as well not have been
 * built. This table is what makes it discoverable.
 *
 * IT IS SHORTER THAN IT WAS, ON PURPOSE. The bar in
 * docs/research/candidate-modules.md is that a real library computes geometry
 * no TypeScript reimplementation is worth writing -- "if ELK or a bit of
 * arithmetic in the core would do, it isn't a module candidate, it's a preset
 * or a fixture". Four entries stopped clearing it: circuit and topology never
 * did (both were stdlib-only and said so in their own MODULE.md), piechart's
 * reason expired when the Mark arrived and a sector became something the core
 * can state and check, and plot/derivative.py drew one fixed figure rather
 * than a class of them. reaction was never a separate module at all -- it
 * imports molecule's own render() -- so it is an entry point here, not a row.
 * The deletions are recorded, with what was learned building them, in
 * docs/research/candidate-modules.md.
 *
 * It is hand-curated on purpose. A summary is editorial — "what is this for,
 * in one line" is exactly what a generator cannot write — and the parts that
 * *can* drift are held in place by tests/module-repertoire.test.ts instead:
 * every directory with a MODULE.md must appear here, every entry path must
 * exist, and no entry may name a module that is gone. Curated where judgement
 * is needed, mechanically checked everywhere else.
 *
 * Dependencies are what the module actually imports. They are listed so a
 * caller knows what a module will cost before running it, not to install
 * anything: a missing dependency surfaces as the module's own import error.
 */

export type ModuleEntry = {
  /** Repo-relative path to the script, as passed to `--args`. */
  path: string;
  /** Present when a module has more than one entry point worth naming. */
  note?: string;
};

export type ModuleInfo = {
  id: string;
  /** One line: what figure this draws. */
  summary: string;
  entries: ModuleEntry[];
  /** Third-party Python packages it imports. Empty means stdlib only. */
  dependencies: string[];
  /** Keys accepted by `--name=`. The first is the default. */
  shortcuts: string[];
  /** Whether it accepts `--misdeclare`, the planted-defect self-test. */
  misdeclare: boolean;
};

export const MODULES: ModuleInfo[] = [
  {
    id: "crystal",
    summary:
      "One conventional crystallographic unit cell, orthographically projected, with " +
      "visible and hidden cell edges distinguished by real depth.",
    entries: [{ path: "modules/crystal/render.py" }],
    dependencies: ["numpy", "ase"],
    shortcuts: ["nacl_rocksalt", "diamond_cubic", "fcc_copper"],
    misdeclare: true,
  },
  {
    id: "dendrogram",
    summary: "A hierarchical-clustering dendrogram where height is real merge distance.",
    entries: [{ path: "modules/dendrogram/render.py" }],
    dependencies: ["numpy", "scipy"],
    shortcuts: ["cluster_demo", "species_traits"],
    misdeclare: true,
  },
  {
    id: "genomic",
    summary: "Gene arrows on a real base-pair axis; arrow direction is the strand.",
    entries: [{ path: "modules/genomic/render.py" }],
    dependencies: ["dna_features_viewer"],
    shortcuts: ["plasmid_simple", "operon"],
    misdeclare: true,
  },
  {
    id: "map",
    summary:
      "Region and country maps, longitude/latitude projected to Web Mercator, with " +
      "labels placed at each region's representative point.",
    entries: [{ path: "modules/map/render.py" }],
    dependencies: ["pyproj", "shapely"],
    shortcuts: ["campaign", "europe", "south_america"],
    misdeclare: true,
  },
  {
    id: "molecule",
    summary:
      "2D skeletal chemical structures from SMILES, with stereo wedges -- one molecule, " +
      "or a whole reaction scheme laid out as an equation and its participants.",
    entries: [
      { path: "modules/molecule/render.py", note: "one molecule; takes the shortcuts below" },
      {
        path: "modules/reaction/render.py",
        note:
          "a reaction scheme; imports this module's own render() rather than computing " +
          "any chemistry of its own, and takes --name=glucose_combustion, photosynthesis, " +
          "combustion_methane, esterification, arrhenius_hcl, bronsted_nh3 or lewis_bf3_nh3; " +
          "--display= (textbook formulas, verified against the computed ones), --equilibrium, --lone-pairs, --theme=print|light|dark",
      },
    ],
    dependencies: ["rdkit"],
    shortcuts: [
      "glucose",
      "fructose",
      "sucrose",
      "caffeine",
      "aspirin",
      "water",
      "ethanol",
      "benzene",
    ],
    misdeclare: true,
  },
  {
    id: "plot",
    summary:
      "A scatter with a least-squares fit, its R² and each residual. Every fitted value is " +
      "declared to lie on the fit and on its own residual, and both are checked. Function " +
      "curves moved to the function-graph preset.",
    entries: [{ path: "modules/plot/fit.py" }],
    dependencies: ["numpy"],
    shortcuts: ["linear_fit_demo", "quadratic_fit_demo"],
    misdeclare: true,
  },
  {
    id: "skewt",
    summary:
      "A Skew-T log-P atmospheric sounding with temperature and dewpoint traces, a " +
      "lifted-parcel profile and the LCL.",
    entries: [{ path: "modules/skewt/render.py" }],
    dependencies: ["numpy", "metpy"],
    shortcuts: ["midlatitude_summer", "unstable_afternoon"],
    misdeclare: true,
  },
];

export function moduleById(id: string): ModuleInfo | undefined {
  return MODULES.find((module) => module.id === id);
}

/** The `--args` value that runs a module at its default figure. */
export function exampleArgs(module: ModuleInfo): string {
  const entry = module.entries[0]!.path;
  const shortcut = module.shortcuts[0];
  return shortcut === undefined ? entry : `${entry},--name=${shortcut}`;
}
