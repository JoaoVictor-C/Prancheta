# graph

Nodes joined by edges, laid out by ELK.

**Choose it when** the content genuinely has entities and relations between them: a pipeline, a state machine, a call graph, a dependency network. The flowchart is not forbidden — it is only wrong when the content is not a graph.

**Do not choose it when** the content is a spatial scene (`S-nograph-disqualifies-graph`) or a series (`S-series-disqualifies-graph`). Boxes and arrows will render an engine block or a latency curve, and the result will be wrong in a way that looks fine.

**For a single-rooted tree, prefer [mindmap](../mindmap/PRESET.md).** A tree is also a graph, so this preset stays a viable second choice — offered, not chosen (`S-hierarchy-favours-graph-weakly`).

## What it delegates and what it keeps

ELK decides node positions and edge routes. It is handed the **measured** size of every node — real text, wrapped as it will actually wrap — so it is never laying out guesses. Everything else stays here: text measurement, the repair loop, and anything drawn over the skeleton.

## Conventions

- Nodes are capped at 220px wide rather than fixed, so they size to their text without one long label stretching a whole rank.
- Edge routing is orthogonal. Splines read as decoration; right angles read as deliberate.
- Arrowheads are filled paths, never SVG `<marker>` — marker support varies across renderers, and a missing arrowhead silently reverses the meaning of a diagram.
- `direction: "RIGHT"` for a pipeline, `"DOWN"` for a call tree.
- Use `role` to mark what matters (`primary`) and what is failure (`warning`). Two accents per figure is usually one too many.

## Input

```json
{
  "preset": "graph",
  "direction": "RIGHT",
  "nodes": [{ "id": "a", "label": "Ingest queue", "role": "primary" }],
  "edges": [{ "from": "a", "to": "b", "dashed": true }]
}
```

Fixture: [`fixtures/graph-pipeline.json`](../../../fixtures/graph-pipeline.json)
