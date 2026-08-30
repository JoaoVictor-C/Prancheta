# 0019 — Geometry a figure derives, and labels that may sit on what they name

## Status

Accepted.

## The defect

The first exercise figure this project was ever asked for — a free-body diagram on a 30° incline — rendered with exit code 0 and a slope of roughly 46°, the diagonal of its own bounding box, beside a label reading `30°`.

**It passed every geometric check while asserting something false.** Every check this project has measures the figure against *itself*: does this label fit its box, do these two boxes collide, does this connector cross something it does not join. None of them asks whether the figure says what it means. The declared non-goal — *"every check answers malformation, not misrepresentation"* — is defensible for a diagram and is the **dominant** failure mode for an exercise.

Chasing it produced [docs/PLAN-EXERCISES.md](../PLAN-EXERCISES.md) and one observation that organises all of it:

> The number 30 appeared twice in that spec: once as a printed string, once implicitly as whatever slope a 380×200 isoceles triangle happens to have. Nothing connected them.

Every substrate this tool draws *well* computes its geometry from the content being asserted — a bar's height from its datum through a scale, a molecule's coordinates from RDKit, a node's position from ELK. Every substrate it draws *badly* asks an author to hand-place coordinates that a label separately claims.

Three further failures in that same render were all one thing wearing three coats: the arrows could not share an application point, the labels could not sit on the figure, and the angle could not be marked at all.

## The decision

**Derive, do not verify.** Where a figure's geometry can be computed from the quantity it asserts, that is worth more than any check over the result, because the two cannot then disagree. `sweep` is the pure case: an angle mark's arc subtends whatever its two arms subtend, so an author who computes the arms from the angle they mean gets an arc that is correct by construction. Nothing is checked because nothing can drift.

**Check only what derivation cannot reach.** Derivation makes the drawing agree with the coordinates; it cannot make a *label* agree, because a label is typed independently. That gap is exactly where the original defect lived, so it is the one place a check earns its keep:

- `sweep-matches-its-label` — an arc that sweeps 21° beside a label reading `30°`.
- `annotation-nearest-its-owner` — a label that has drifted closer to something it does not name.

Both are arithmetic over the figure's own declared numbers. Neither needs a model, and neither knows any physics. **This does not reopen the non-goal.** The tool still cannot tell you a diode is backwards or that your angle sum is 190°; it can only tell you that two things *in this document* which claim to be the same number are not.

**Every new freedom arrives with the constraint that bounds it**, per CONTRIBUTING.md, and the ledger is explicit:

| freedom | what it relaxes | what it adds |
| --- | --- | --- |
| `Block.annotates` | a label may overlap the element it names — at `text-clear-of-other-boxes`, `boxes-do-not-overlap` and `connector-clear-of-boxes` | `annotation-nearest-its-owner` |
| `Connector.from: Point` | nothing; `to` already allowed it | a free vector joins no box, so it earns **no** endpoint exemption |
| `curve: { kind: "sweep" }` | nothing; already gated by `allowCurvedConnectors` | `sweep-matches-its-label` |

`annotates` is the one to watch, because it is the only relief here. It is deliberately narrow: an annotation may overlap **the element it names and nothing else**, and the ownership is *authored* rather than inferred from proximity, so a figure cannot acquire the exemption by accident.

## What was refused

**A Frame, for now.** The plan proposed a named coordinate system — origin, units, rotation — as M1's centrepiece, on the reasoning that it would let the incline's angle be stated once. A day-one experiment refused it: `Block.rotation` with `rotateBox` already exists and is analytically exact, so a rotated rect gives a *true* slope today with no new vocabulary. The Frame's remaining value is real but narrower than claimed — it would move the trigonometry from a script into the spec — and it is not needed for the deliverable. It is deferred rather than dropped, and the gap it leaves is named below.

**An Annotation node.** `annotates` is a field on `Block`, not a new node kind. A new kind would need its own layout path, measurement path and renderer branch to deliver a thing the existing Block already is: text with a measured box.

**A new element kind for the angle mark.** An arc *is* a curved line between two points, and connectors had just gained bare-point ends. Making it a fourth `ConnectorCurve` meant it inherited `annotates`, the polyline every check already walks, and the `allowCurvedConnectors` gate, for one variant and one router.

**Proximity as a substitute for ownership.** `annotation-nearest-its-owner` uses distance to *report*, never to *infer*. A label's owner is always the one the author declared; guessing it would make the check unfalsifiable, since any placement would define its own correctness.

## The cost, stated

**The slope is still not tied to its own label.** The fixture's arc is checked against the `30°` it prints, and the arc's arms and the slope's `rotation: -30` both come from one number *in the script that generated the file* — but nothing in the spec connects them. A hand-edited slope rotation would render green. This is the residue the Frame was meant to remove, and it is the honest reason the Frame is deferred rather than cancelled.

**`annotation-nearest-its-owner` measures from the annotation's centre.** One metric so a box and a connector compare on the same terms; a connector is measured against its polyline rather than its bounding box, which for a long diagonal would beat every real neighbour. A large annotation whose centre is misleading is a case this does not model.

**`sweep-matches-its-label` tolerates one degree**, not `EPSILON`. A label is written to the precision a reader sees, and arm endpoints rounded to whole pixels are not a defect. A figure that genuinely needs sub-degree agreement is not served.

**It only reads labels that state a number.** `θ` names an angle without claiming a value, so it is `not-applicable` — which means a figure can carry an unchecked angle mark simply by labelling it symbolically. That is the right default (reporting it would punish correct figures) and it is a real hole.

## Found while building it

Four silent defects, none of which any existing check could see, all fixed here or in the commits this ADR covers:

- `contrast-sufficient` resolved a label's substrate by **ownership** rather than geometry, then — once geometric — by the **rotated bounding box**, which for a 439px rule on a 30° diagonal covers most of the figure.
- Alpha was parsed everywhere and **composited nowhere**, so a 34%-alpha Venn circle was scored as saturated blue.
- `PlacedConnector.curve` was stored in **scene** space beside `points` already lifted into **page** space. Harmless until something read both; `sweep-matches-its-label` reads both, and measured 21.4° for an arc subtending exactly 30°.
- The SVG **sweep flag was inverted**, which does not fail loudly: endpoint parameterisation offers two centres for the same endpoints and radius, so the wrong flag draws a perfectly good arc about the *mirror* centre.

The last two are worth naming together. Both were invisible to every check and to the eye, and both were caught only because a new check compared two things that had never been compared before. That is the argument for this ADR's whole shape: **derivation removes the chance to disagree, and a check is what finds the disagreements derivation could not remove.**
