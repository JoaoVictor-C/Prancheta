# Decision 0003 — Effects system extension

**Status:** planned · 2026-08-23
**Decision:** Extend effects system with gradients, patterns, blend modes, distortion, color effects, stroke effects, and transforms through a 5-phase implementation with validation gates.
**Method:** Reasoning session `df45fdfc` — 3 iterations, 2 passes, halt on signal, final confidence 0.94.
**Context:** Current system has rotation, linear gradients, and comprehensive filter effects. Must maintain SVG 1.1 portability for resvg, librsvg, Inkscape, Illustrator export.

---

## Implementation phases

### Phase 0: Foundation & Validation

Extend `effects/bleed.ts` with `patternBleed(tileWidth, tileHeight)` and `displacementBleed(maxShift)` functions. Include a prototype displacement effect to validate the bleed API before Phase 2 commits to it — prevents blocking redesign if the API proves insufficient.

**Blocking dependency:** Phase 2 cannot test displacement/wave effects without this foundation.

### Phase 1: Paint & Defs (parallel tracks)

**Track 1a — Stroke effects:**
Create `effects/strokes.ts` with `StrokeEffect` types (glow-outline, double-stroke) and `applyStroke()` function. Integrate with `effects/apply.ts`. Stroke effects are paint operations (SVG `stroke`, `stroke-width`, `stroke-dasharray`), not filter primitives — architectural separation from filters.ts is deliberate.

**Track 1b — Gradients & patterns:**
Extend `effects/filters.ts` DefsRegistry with:
- `radialGradient()` — extends existing sheenGradient/vignetteGradient pattern
- `conicGradient()` with fallback detection — SVG 2 feature, resvg supports but Inkscape/Illustrator may not
- `customGradient(stops[])` — multi-stop custom gradients
- `patternDef()` — pattern fills and textures

Tracks 1a and 1b are independent and can run in parallel.

### Phase 1.5: Compatibility Validation

**Validation gate before Phase 2.** Test overlay blend simulation and conic gradient fallback against Inkscape, Illustrator, and resvg with visual diff tools. Discovering renderer incompatibilities here prevents Phase 2 rework.

### Phase 2: Filter Effects (sequential)

Add effect types to `effects/types.ts`, then implement filter primitives in `effects/filters.ts`:

**Blend modes:**
- `feBlend` with modes: normal, multiply, screen, darken, lighten (SVG 1.1 native)
- Overlay simulation via `feComponentTransfer` — requires 4 primitives (2× `feComponentTransfer` for conditionals, 2× `feComposite` for mixing) because SVG 1.1 `feBlend` does not support overlay mode

**Color effects:**
- Hue-rotate via `feColorMatrix`
- Invert via `feComponentTransfer`
- Sepia via `feColorMatrix`

**Distortion:**
- Displacement maps via `feDisplacementMap`
- Wave effects via `feTurbulence`

Subtasks are sequential: effect type definitions must precede filter primitive emission.

### Phase 3: Transforms & Render (sequential)

**Transforms:**
Refactor `geometry/rotate.ts` → `geometry/transforms.ts` with unified `AffineTransform` supporting rotate/scale/skew via matrix math. Scale and skew share rotation's architecture: compute geometry after layout, apply transform at SVG emission only.

**Migration path:**
1. Create `geometry/transforms.ts` with new `AffineTransform` API
2. Implement rotate/scale/skew via unified transform matrix
3. Add deprecated `geometry/rotate.ts` shim wrapping `transforms.ts`
4. Update internal callers to new API
5. Document migration in CHANGELOG with examples
6. Remove shim in next major version

**Render:**
Update `render/svg.ts` for stroke rendering (from `effects/strokes.ts`), gradient/pattern fills (using DefsRegistry), and transform application.

Transforms must precede render updates due to API dependency.

## File modifications

1. **effects/bleed.ts** — add `patternBleed()`, `displacementBleed()` functions
2. **effects/strokes.ts** (new) — `StrokeEffect` type, `applyStroke()` function
3. **effects/types.ts** — add blend/color/distortion/stroke effect type unions
4. **effects/filters.ts** — add 8 filter primitive emission functions + 4 gradient/pattern methods to DefsRegistry
5. **geometry/rotate.ts → geometry/transforms.ts** — refactor with `AffineTransform`, add deprecated shim
6. **render/svg.ts** — stroke rendering, gradient/pattern fills, transform emission

Total: 6 files modified, 1 new file created.

## Risks & mitigations

**Overlay simulation complexity**
Risk: Requires 4 primitives instead of 1, complex formula implementation.
Mitigation: Visual testing against Inkscape/Illustrator in Phase 1.5, verify formula matches expected overlay mode visually before Phase 2 implementation.

**Conic gradient compatibility**
Risk: SVG 2 feature — resvg supports, but Inkscape/Illustrator may not render correctly.
Mitigation: Feature detection at runtime, fallback to radial gradient with developer warning when conic unsupported.

**Pattern bleed calculation**
Risk: Patterns can tile infinitely, unlike bounded filters — bleed calculation is more complex.
Mitigation: Bound pattern bleed by visible canvas region rather than attempting infinite tile calculation.

**Displacement bleed unbounded**
Risk: Displacement map can shift pixels arbitrary distances based on per-pixel map values, not a single maximum.
Mitigation: Clamp displacement scale parameter, document maximum shift value, validate in Phase 0 prototype.

**Transform refactor migration**
Risk: Breaking change for existing `rotate.ts` callers.
Mitigation: Deprecated shim wrapping new API, CHANGELOG with migration examples, remove shim only in next major version.

## Testing strategy

**Phase 0:** Unit tests for bleed calculation edge cases (zero-size patterns, negative displacement values, boundary conditions)

**Phase 1:** Visual regression tests for gradients/patterns/strokes against baseline SVG golden files

**Phase 1.5:** Renderer compatibility matrix (Inkscape/Illustrator/resvg) with automated visual diff tool

**Phase 2:** Effect chain integration tests validating chaining behavior, bleed calculation, content-addressed deduplication

**Phase 3:** Transform geometry tests (matrix math correctness, bounds calculation) + end-to-end export tests (PDF/PNG via resvg)

## Constraints satisfied

- **SVG 1.1 primitives only:** Maintained throughout (conic gradient SVG 2 exception documented with fallback)
- **Effects never move layout:** Phase 3 transforms follow existing rotate.ts pattern — geometry computed after layout, applied only at SVG emission
- **Effect reach/bleed computed:** Phase 0 foundation ensures all new effects have computed bleed
- **Content-addressed deduplication:** DefsRegistry extensions maintain existing deduplication architecture
- **Effects chain in order:** Phase 2 filter primitives preserve existing chaining mechanism
- **Survive export to PDF/PNG via resvg:** Phase 1.5 validation gate ensures compatibility before committing implementation

## Feature coverage

All 7 required feature categories addressed:

1. **Gradients:** radial, conic (with fallback), custom multi-stop — Phase 1b
2. **Pattern fills:** pattern defs and bleed calculation — Phase 1b
3. **Blend modes:** multiply, screen, overlay (simulated), darken, lighten — Phase 2
4. **Distortion:** displacement maps, wave effects — Phase 2
5. **Color effects:** hue-rotate, invert, sepia — Phase 2
6. **Stroke effects:** glow outlines, double strokes — Phase 1a
7. **Transforms:** scale, skew (complement existing rotation) — Phase 3

## What this enables

With all phases complete:

- Diagrams can use **radial/conic gradients** for depth cues and visual hierarchy
- **Pattern fills** enable textures, hatching, and custom backgrounds
- **Blend modes** allow overlay composition without leaving SVG
- **Distortion effects** create wave patterns, displacement-based emphasis
- **Color effects** provide accessibility transforms (desaturation) and aesthetic filters
- **Stroke effects** add emphasis without modifying fill
- **Unified transforms** simplify complex geometric operations through matrix composition

The constraint-preserving architecture ensures all extensions remain portable across the target renderer set.
