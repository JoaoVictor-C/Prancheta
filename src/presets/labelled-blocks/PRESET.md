# labelled-blocks

A stack of labelled boxes. The plain case.

**Choose it when** the content is a set of items with no relations between them (`S-set-favours-blocks`) — a list of services, three options side by side, the inputs and outputs of something.

**This preset exists to stay reachable.** *"Just show me the three inputs and the one output"* must not escalate into a graph. Half of selection's job is refusing to over-draw, and this is what refusing looks like.

**Do not choose it when** the content is a series (`S-series-disqualifies-blocks`) — values without a scale become unordered text, which is worse than useless because it looks deliberate. Nor when the idiom is a substrate (`I-substrate-disqualifies-plain-blocks`): stacked blocks have no plane to lay one on.

A `plain-flow` idiom nudges towards this preset but never carries a figure by itself (`I-plain-flow-favours-blocks`) — plain flow is the *absence* of an idiom, not a signal.

## Conventions

- One column by default. A row when the items are being compared rather than listed.
- Fixed width across all items, so the stack reads as one thing.
- Roles are for emphasis, not decoration. Most sets need none at all.

## Input

```json
{
  "preset": "labelled-blocks",
  "direction": "column",
  "items": [{ "label": "Ingest" }, { "label": "Parse", "role": "primary" }]
}
```

Fixture: [`fixtures/labelled-blocks.json`](../../../fixtures/labelled-blocks.json) (raw IR — this preset predates the preset layer and its fixture was written directly against the IR)
