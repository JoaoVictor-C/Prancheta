# mindmap

A single-rooted tree, radiating from one idea.

**Choose it when** the content is a hierarchy (`S-hierarchy-favours-mindmap`): a breakdown, an outline, an incident review, anything with one root and no cycles. A radial tree shows depth at a glance where a layered graph shows only edges.

**Do not choose it when** the content has cross-links. If the structure is asserted as *both* hierarchy and graph, it is not a strict tree — dependency graphs have diamonds — and the [graph](../graph/PRESET.md) preset is correct.

## Conventions

- **Depth carries meaning, so it carries style.** The root is `primary`, first branches keep full contrast, everything deeper is `muted`. A mindmap where every node shouts is a mindmap nobody can read.
- **Branches have no arrowheads.** A branch is containment, not flow. An arrow would claim a direction the content does not have.
- The root is one step up the type scale and centred; branches are left-aligned, because ragged-right text is easier to scan down a column.
- `shape: "tree"` (ELK `mrtree`) lays out downward and stays legible as it grows wide. `shape: "radial"` spreads around the root — prettier for small maps, harder to read past about twenty nodes.

## Structurally the cheapest preset here

It is the same ELK ingest as `graph`, with a tree algorithm and edges derived from nesting rather than listed by hand. The difficulty in a mindmap was never the drawing — it is deciding what belongs in it, and that is the author's problem, not this preset's.

## Input

```json
{
  "preset": "mindmap",
  "shape": "tree",
  "root": {
    "label": "Checkout outage",
    "children": [{ "label": "Trigger", "children": [{ "label": "Config push at 14:02" }] }]
  }
}
```

Fixture: [`fixtures/mindmap-incident.json`](../../../fixtures/mindmap-incident.json)
