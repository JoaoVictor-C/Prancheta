# Implementation Plan: Constraint Toggles

**Status:** done. The three toggles shipped in M10 ([ADR 0010](../decisions/0010-constraint-toggles.md)); how to use them is [docs/CONSTRAINTS.md](../CONSTRAINTS.md). The unticked boxes below were never ticked, but the toggles and their tests are in.

**Date:** 2026-08-23  
**ADR:** [0010-constraint-toggles.md](../decisions/0010-constraint-toggles.md)

## Overview

Add three toggleable constraints to enable advanced diagram types while preserving the tool's simplifying character for users who want it.

## Implementation Steps

### Phase 1: IR and Type Changes (Foundation)

**Goal:** Add constraint toggle fields to the IR without changing behavior

| Step | What | File(s) | Details |
|------|------|---------|---------|
| 1.1 | Add `ConstraintToggles` type | `src/types.ts` | `allowOverlap`, `allowConnectorCrossing`, `allowCurvedConnectors` (all optional boolean) |
| 1.2 | Add `Canvas.constraints` field | `src/types.ts` | Optional `ConstraintToggles` on `Canvas` type |
| 1.3 | Add default values | `src/ir/normalize.ts` | All default to `false` (constraints active) |
| 1.4 | Update schema validation | `src/schema/` | JSON Schema for constraint fields |

**Verification:** All existing tests pass; no behavior changes

---

### Phase 2: Toggle #1 — `allowOverlap`

**Goal:** Make `boxes-do-not-overlap` check respect the toggle

| Step | What | File(s) | Details |
|------|------|---------|---------|
| 2.1 | Check reads toggle | `src/checks.ts` | `boxes-do-not-overlap` returns `not-applicable` when `canvas.constraints.allowOverlap === true` |
| 2.2 | Planted fixture | `fixtures/ir/allow-overlap.json` | Venn diagram with `allowOverlap: true` that passes; same diagram with `allowOverlap: false` fails |
| 2.3 | Repair loop guard | `src/repair.ts` | Ensure repair loop doesn't create overlaps as side effect when toggle is false |
| 2.4 | E2E test | `tests/` | Verify check is skipped when toggle is on, active when off |

**Verification:** 
- Planted fixture passes with toggle on, fails with toggle off
- Existing non-overlapping fixtures unchanged

---

### Phase 3: Toggle #2 — `allowConnectorCrossing`

**Goal:** Make `connector-clear-of-boxes` check respect the toggle

| Step | What | File(s) | Details |
|------|------|---------|---------|
| 3.1 | Check reads toggle | `src/checks.ts` | `connector-clear-of-boxes` returns `not-applicable` when `canvas.constraints.allowConnectorCrossing === true` |
| 3.2 | Performance note | Documentation | Line-box intersection tests with spatial indexing (R-tree/quadtree) tractable for <500 elements |
| 3.3 | Planted fixture | `fixtures/ir/allow-connector-crossing.json` | Annotated figure with leader lines crossing dense field |
| 3.4 | E2E test | `tests/` | Verify check behavior with toggle on/off |

**Verification:**
- Planted fixture passes with toggle on, fails with toggle off
- Existing fixtures with clear connectors unchanged

---

### Phase 4: Toggle #3 — `allowCurvedConnectors` (IR changes)

**Goal:** Add curved connector support to the IR

| Step | What | File(s) | Details |
|------|------|---------|---------|
| 4.1 | Add `Connector.curve` field | `src/types.ts` | Optional `{type: 'bezier', controlPoints: Point[]} \| {type: 'arc', radius: number, sweep: boolean}` |
| 4.2 | Path geometry utilities | `src/geometry/paths.ts` | `bezierBounds()`, `arcBounds()`, path-to-SVG conversion |
| 4.3 | Validation | `src/ir/normalize.ts` | `curve` only valid when `allowCurvedConnectors: true`; error otherwise |
| 4.4 | SVG emission | `src/render/svg.ts` | Emit `<path>` with bezier/arc commands instead of straight `<line>` |
| 4.5 | Bounding box measurement | `src/layout/measure.ts` | Measure curved path bounds via sampling or analytic bezier bounds |
| 4.6 | Update graph preset | `src/presets/graph/` | Optional curve specification; ELK routes stay polyline, post-process to curves if requested |
| 4.7 | Planted fixture | `fixtures/ir/allow-curved-connectors.json` | Flowchart with bezier curves |
| 4.8 | E2E test | `tests/` | Verify curved paths render correctly, bounds accurate |

**Verification:**
- Curved connectors render as paths, not lines
- Bounds contain all ink
- Existing straight connectors unchanged
- `check:independent` (resvg) confirms curves survive outside Chromium

---

### Phase 5: Documentation and Discoverability

**Goal:** Make toggles discoverable and well-documented

| Step | What | File(s) | Details |
|------|------|---------|---------|
| 5.1 | Update README | `README.md` | Add "Constraint Toggles" section after "What gets checked" |
| 5.2 | Document in IR reference | `docs/` | Constraint toggle fields, defaults, and use cases |
| 5.3 | Update AGENTS.md | `AGENTS.md` | Regenerate with constraint toggle guidance |
| 5.4 | Update skill | `.claude/skills/prancheta/SKILL.md` | Regenerate via `npm run gen:views` |
| 5.5 | Add to MCP resources | `src/mcp/server.ts` | `prancheta://constraints` resource documenting when to use each toggle |
| 5.6 | CLI help text | `src/commands.ts` | Document constraints in render command |
| 5.7 | Example fixtures | `fixtures/` | One clear example per toggle showing its use case |

**Verification:**
- `npm run check:views` passes
- All three use cases (Venn, annotated dense field, curved flowchart) have fixtures
- Documentation explains when to use each toggle and when not to

---

### Phase 6: Integration Testing and Polish

**Goal:** Verify cross-toggle interactions and edge cases

| Step | What | File(s) | Details |
|------|------|---------|---------|
| 6.1 | Multi-toggle fixture | `fixtures/ir/all-toggles-enabled.json` | Dense annotated diagram with curved connectors and overlaps |
| 6.2 | Repair loop interaction | Tests | Verify repair loop behaves correctly with various toggle combinations |
| 6.3 | Performance test | Tests | Verify connector-crossing check with spatial indexing performs acceptably |
| 6.4 | Negative test | Tests | Verify curves rejected when `allowCurvedConnectors: false` |
| 6.5 | Default behavior | Tests | Verify all existing fixtures unchanged (all toggles default false) |

**Verification:**
- All 374+ existing tests still pass
- New toggle-specific tests pass
- No performance regression on large fixtures

---

## Sequencing and Dependencies

### Can be done in parallel after Phase 1:
- Phase 2 (`allowOverlap`)
- Phase 3 (`allowConnectorCrossing`)

### Must be sequential:
- Phase 4 (`allowCurvedConnectors`) depends on Phases 2-3 being complete for integration testing
- Phase 5 (documentation) should happen after all three toggles work
- Phase 6 (integration testing) is last

### Recommended order:
1. Phase 1 (foundation)
2. Phase 2 (overlap toggle — simplest)
3. Phase 3 (connector crossing — moderate)
4. Phase 4 (curved connectors — most complex)
5. Phase 5 (documentation)
6. Phase 6 (integration testing)

---

## Success Criteria

### Functional
- [ ] All three toggles work independently
- [ ] All three work together in combination
- [ ] Default behavior (all false) unchanged — all existing fixtures pass
- [ ] Each toggle has a planted fixture proving it can fail and pass

### Quality
- [ ] No performance regression on large fixtures
- [ ] Curved connectors survive `check:independent` (resvg)
- [ ] Documentation complete and discoverable
- [ ] `npm run check:views` passes

### Termination
- [ ] Repair loop remains monotone and bounded with toggles
- [ ] No oscillation cases found in any toggle combination

---

## Risk Mitigation

### Risk: Repair loop creates overlaps as side effect
**Mitigation:** Guard in `src/repair.ts` — when `allowOverlap: false`, verify no new overlaps created

### Risk: Curved connector bounds inaccurate
**Mitigation:** Use analytic bezier bounds or dense sampling; verify against measured SVG

### Risk: Performance degradation with connector-crossing
**Mitigation:** Implement spatial indexing (R-tree/quadtree); benchmark on large fixtures

### Risk: Toggles conflict with future constraint vocabulary (ADR 0009)
**Mitigation:** Design constraint IR to coexist — toggles disable checks, constraints add objectives

---

## Testing Strategy

### Unit Tests
- Toggle field parsing and defaults
- Constraint toggle validation
- Curved path geometry (bounds, SVG conversion)

### Integration Tests  
- Each check respects its toggle
- Repair loop behavior with toggles
- Multi-toggle combinations

### E2E Tests
- Planted fixtures per toggle
- Negative cases (curves rejected when toggle off)
- Existing fixtures unchanged

### Performance Tests
- Large fixture (100+ boxes, 200+ connectors) with connector-crossing enabled
- Verify <2s render time (same as current)

---

## Rollback Plan

If any phase fails or introduces regressions:

1. **Before Phase 4:** Simply don't merge the failing phase
2. **During/After Phase 4:** Curved connectors are the highest-risk change
   - If bounds inaccurate → Fall back to straight lines, document as future work
   - If performance unacceptable → Keep toggle but document performance characteristics
   - If termination issues → Disable curved connectors in repair loop, manual only

3. **Complete rollback:** Remove `Canvas.constraints` field, delete planted fixtures, revert checks

---

## Future Work (Not in Scope)

These are explicitly deferred:

- **Per-element toggle scope** — would allow mixing constrained/unconstrained elements in one diagram
- **Graduated relaxation** — e.g., "allow overlap up to 20% of smaller box"
- **Additional connector routing** — orthogonal (manhattan) routing with corner style options
- **Waypoint support** — user-specified connector paths
- **Arc connectors between specific angles** — for radial layouts like mindmap

These can be considered after user feedback on the basic toggle system.

---

## Estimated Effort

| Phase | Complexity | Estimated Time |
|-------|------------|----------------|
| Phase 1: Foundation | Low | 2-4 hours |
| Phase 2: allowOverlap | Low | 2-3 hours |
| Phase 3: allowConnectorCrossing | Medium | 3-5 hours |
| Phase 4: allowCurvedConnectors | High | 8-12 hours |
| Phase 5: Documentation | Low | 2-3 hours |
| Phase 6: Integration Testing | Medium | 4-6 hours |
| **Total** | | **21-33 hours** |

Phases 2-3 can overlap, saving ~2 hours if done in parallel.
