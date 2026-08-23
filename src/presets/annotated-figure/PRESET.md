# annotated-figure

A shape or scene with labels pinned to specific places on it, joined by leader lines.

**This is the figure class nothing else serves.** Every shipped diagramming skill covers whiteboard and architecture genres; a cross-section, an anatomy, a labelled apparatus needs a real coordinate system, and that is what this preset is.

**Choose it when** the content is a spatial scene (`S-scene-favours-annotated`), when the request names parts to be called out (`I-annotated-favours-annotated`), or when it asks to be sectioned (`I-cross-section-favours-annotated`).

**It wins even when the content is also a graph.** An annotated schematic of a signal path is both; a scene disqualifies the graph preset outright, and disqualification beats weight.

## Conventions

- **Callouts carry no fill and no border.** They sit *on* the figure; a boxed label floating over a diagram reads as a sticky note. The leader line does the pointing, so the label does not have to.
- Callout text is one step down the type scale — it annotates, it does not compete.
- Leader lines are clipped to the box they leave and stop short of it, because a line touching a border reads as a join.
- A leader line necessarily crosses any container holding the part it points at. That is enclosure, not collision, and the check knows the difference.

## The thing to watch

`layout: "absolute"` means **the geometry is yours and it means something**. On a cross-section the layer positions are the content. So a repair that grows a box to fit its label can push it into the layer below — fixing one defect by creating another. `boxes-do-not-overlap` catches exactly that, and it exists because it happened while building this preset.

Size the parts to hold their labels, or leave the labels off the parts and put them in callouts.

## Input

```json
{
  "preset": "annotated-figure",
  "width": 620,
  "height": 340,
  "parts": [{ "id": "case", "x": 210, "y": 60, "width": 200, "height": 220, "role": "muted" }],
  "callouts": [{ "text": "Positive terminal", "at": { "x": 20, "y": 20 }, "points": "terminal" }]
}
```

`points` takes a part id or a bare `{x, y}` on the figure.

Fixture: [`fixtures/annotated-cell.json`](../../../fixtures/annotated-cell.json)
