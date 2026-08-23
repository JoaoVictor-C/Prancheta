/**
 * The figure-module repertoire.
 *
 * Modules live outside the core as separate processes (decision 0005), which
 * made them invisible: nothing in the CLI, the generated views or the MCP
 * resource tree mentioned that eleven of them exist. An agent cannot choose a
 * module it has never heard of, so the whole repertoire may as well not have
 * been built. This table is what makes it discoverable.
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
    id: "circuit",
    summary:
      "A single-loop series circuit with real electrical symbols — resistor zigzag, " +
      "capacitor plates, inductor bumps, switch gap, diode triangle.",
    entries: [{ path: "modules/circuit/render.py" }],
    dependencies: [],
    shortcuts: ["rc_lowpass", "led_circuit", "rlc_series", "switched_lamp"],
    misdeclare: true,
  },
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
    summary: "A 2D skeletal chemical structure from a SMILES string, with stereo wedges.",
    entries: [{ path: "modules/molecule/render.py" }],
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
    id: "piechart",
    summary: "Pie and donut charts drawn as real circular-sector paths, with a legend.",
    entries: [{ path: "modules/piechart/render.py" }],
    dependencies: [],
    shortcuts: ["market_share", "budget_breakdown"],
    misdeclare: true,
  },
  {
    id: "plot",
    summary:
      "Function curves with their roots and extrema, or a scatter with a least-squares " +
      "fit; plus a fixed figure explaining the derivative.",
    entries: [
      { path: "modules/plot/function.py", note: "curves and fits; takes the shortcuts below" },
      {
        path: "modules/plot/derivative.py",
        note: "one fixed pedagogical figure; no flags at all, not even --misdeclare",
      },
    ],
    dependencies: ["numpy"],
    shortcuts: [
      "quadratic",
      "sine_cosine",
      "damped_oscillation",
      "linear_fit_demo",
      "quadratic_fit_demo",
    ],
    misdeclare: true,
  },
  {
    id: "reaction",
    summary:
      "A reaction scheme: an equation row of formulas and coefficients, and a real " +
      "structural drawing of every unique participant.",
    entries: [{ path: "modules/reaction/render.py" }],
    dependencies: ["rdkit"],
    shortcuts: ["glucose_combustion", "photosynthesis", "combustion_methane", "esterification"],
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
  {
    id: "topology",
    summary:
      "A protein secondary-structure cartoon — helices as capsules, strands as " +
      "directional arrows, joined in sequence.",
    entries: [{ path: "modules/topology/render.py" }],
    dependencies: [],
    shortcuts: ["four_helix_bundle", "rossmann_pattern"],
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
