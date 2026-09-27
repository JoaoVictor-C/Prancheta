# 0028 — A length is checked against its label, and a label may name a place

## Status

Accepted.

## The defect

Two gaps [ADR 0019](0019-derived-geometry-and-annotation.md) left open, both recorded in TODO.md as correctness debt: ways a figure that already renders green can lie.

**A line could disagree with its printed length.** `sweep-matches-its-label` catches an arc that sweeps 21° beside a label reading `30°`. Nothing caught a dimension line drawn 42 units long beside `"50m"`, or an arrow scaled at 2px per m/s whose length disagrees with its `vA = 50 m/s`. Both exam figures this project has reproduced depend on exactly that pair of numbers. The frame that draws the line gets it right by construction, but the label is typed separately, and that separate typing is the gap 0019 says a check is for. What made it harder than the angle case is units. An angle is degrees wherever it is drawn. A length is pixels unless a frame says otherwise, and frame resolution removes every trace of the frame before any check runs.

**A label that names a place could not be checked, so it was deleted.** `annotation-nearest-its-owner` assumes a label names something drawn. Twice the honest fix was to remove `annotates` instead of moving the label:

- The `0` on a trajectory names the origin, the point where two axes meet. Measured against either axis, it is always nearer the *other* axis, or equally near both.
- In a legend row, the text names its swatch because they share a row, not because they are close. Measured from a wide label's centre, each row's text is nearer the next row's text than its own swatch.

Deleting the annotation meant the figure claimed nothing and nothing checked it. Those are the commonest labels in the repertoire.

## The decision

**The frame's scale survives resolution, and only the scale.** Resolution still turns every framed point into canvas pixels and strips the `frame`. Now, when *both* ends of a straight run (a connector, or a mark of one line segment) were stated at one scale, it also records `MeasuredIn`: `xUnit`, `yUnit`, rotation and an optional unit name. "One scale" means the same frame, or frames whose scale and unit agree. That second case covers the incline figure, where an arrow leaves a point in the tilted frame and ends in the level one. Two non-square frames must also share a rotation, because a non-square frame measures a diagonal differently depending on which way its axes run. A run with an end in canvas pixels, or ends in frames of different scale, records nothing. No unit is invented for it.

**`Frame.unit` says what a unit is.** It is optional, e.g. `"m"`, `"m/s"` or `"N"`. `xUnit` gives pixels per unit, and `unit` gives the unit's name. This check is the only reader.

**`length-matches-its-label` works like the sweep check:**

- The label is found through `annotates`, never by proximity.
- Only a label that states a number is read. The number is read the way the project's formatter writes it (ADR 0023): pt-BR, with a comma decimal (`2,5`), and `1.500` is fifteen hundred. A bare `2.5` still reads as a decimal, because no pt-BR writer puts a thousands mark before one digit.
- A leading name is ignored (`vA = 50 m/s`, `d = 2,5 m`). A trailing unit is kept, whether or not there is a space (`50m`, `50 m`).
- A degree sign or a percentage marks an angle, so it belongs to the sweep check and is not read here.
- The tolerance is what a reader could not see: half the label's last printed digit, plus the half pixel every check forgives, converted into units. A label `50` covers anything that rounds to 50. A label `50,0` covers only what rounds to 50,0.

**When the length cannot be measured, the check says `not-applicable` and never passes.** That applies in each of these cases:

- a numeric label on a run with no recorded scale
- a curved route
- a mark of several segments
- a label whose unit differs from its frame's `unit`

Each case is reported for that run, naming the reason. So unlike the sweep check, this check reports once per run rather than once per figure. One figure can hold a measured dimension line and an unmeasurable one, and a single figure-level verdict would have to hide one of them. A figure with no length claims at all gets one figure-level `not-applicable`.

**A label may name a place: `Block.annotatesPlace`.** It takes a point, in canvas coordinates or in a frame. Frame resolution rewrites it as `annotates` naming a generated mark, `<id>-place`. That mark has no stroke and no fill, is a single point, and carries `Mark.place`. It has the same shape as a tick requirement, for the same reason: layout already lifts every mark into page space, and `annotates` already reaches the placed figure. The place therefore lands where its label does, with no second lifting path and no new field in the pipeline. The rewrite is also what keeps resolution idempotent, just as stripping `frame` is.

**A place is measured by `label-nearest-its-place`, under its own name because the method differs** (the rule from decision 0005):

- **Distance is taken from the label's near edge, not its centre.** A wide legend text names the swatch its left edge sits against. `curve-label-nearest-its-curve` measures the same way for the same reason.
- **"Beside" means within the label's own size.** A place has no extent, so nothing competes with it along the lines that meet there. Without this bound, a `0` slid 40px down the x axis would pass.
- **Anything that passes through the place does not compete.** Those are the lines that make it a place: the axes at an origin, or the swatch whose end a legend row names. Everything else competes, including the *other* places labels name. That is how a legend row that has slid next to its neighbour's swatch is caught.
- **Another label never competes.** A reader attributes a label to something drawn, never to a second label.

A place is not ink, so it is kept out of `annotation-nearest-its-owner` in both roles: its label is not measured there, and the place itself is not a competitor for any element label.

The freedoms ledger, extended in 0019's form:

| freedom | what it relaxes | what it adds |
| --- | --- | --- |
| `Frame.unit` | nothing | makes `length-matches-its-label` refuse to compare across units |
| `Block.annotatesPlace` | **nothing**: a place has no ink to overlap | `label-nearest-its-place` |

## What was refused

**Widening `annotates` to take a point.** `annotates` is a string in the spec, in `PlacedBox`, in the chart preset and in the pipeline's copy step. Making it a union would change every reader in order to reach one new check. A separate authored field that resolves into the existing one changes none of them.

**Changing `annotation-nearest-its-owner` to the edge metric.** That would fix legends and quietly change what every existing annotated figure is measured against, including the case 0019 designed the centre metric for. A place is a different claim, so it gets a different check.

**Unit conversion.** A label reading `50 cm` beside a line in a metres frame is reported as not comparable, not converted. A conversion table is physics, and this checker deliberately knows none (0019: "neither knows any physics").

**Inferring a scale for a canvas-pixel run.** A dimension line drawn in pixels could be "checked" by assuming one unit per pixel. That would make every pixel-drawn figure pass or fail by coincidence. It is `not-applicable`, and the fix is to state the line in a frame.

**Checking a label's sign against the arrow's direction.** The sign is dropped and the magnitude compared. `vx = −3 m/s` drawn pointing right is a real defect, but it is a separate claim, and nobody has asked for it yet.

## The cost, stated

**A label with a number but no frame is only reported, never corrected.** Every existing figure that draws a dimension in canvas pixels now shows a `not-applicable` for it. That is correct, and it is also a hole: that figure has had nothing verified. The in-progress `vectors` preset is one such case. It resolves its arrows to canvas points itself (`resolveInFrame`), so its component labels land here. Stating those ends as `{frame: "plane", ...}` would put them under the check.

**A frame with no `unit` takes the label's unit on trust.** `50 cm` beside a 50-unit line in a frame that never said what a unit is will pass on the number alone.

**Units are compared as written.** `m/s` and `m / s` match; `m/s` and `m·s⁻¹` do not, and the check then reports "not comparable" rather than a disagreement.

**The reach bound is the label's larger dimension, and that number is chosen, not derived.** For a 10×14 `0`, the reach is 14px. For an 80px legend row, it is 80px, which is generous, though the other places and swatches still compete within that distance.

**A block (a rotated rule drawn as a thin rect) is not a run.** The incline's slope is a block, so a length printed on it is not checked. Runs are connectors and single-segment marks, which is what a dimension line or a vector is. Extending this to blocks would mean deciding which of a box's two dimensions the label measures.

**The presets do not use `annotatesPlace` yet.** The function-graph legend and grid-numbered origins still carry no place annotation. The mechanism is in place for them. Wiring it in belongs to the presets and was not part of this change.
