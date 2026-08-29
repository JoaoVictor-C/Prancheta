/**
 * Collapses runs of consecutive, EXACTLY-identical keyframe stops within each
 * @keyframes block down to just the first and last stop of each run.
 *
 * Why this is safe, not a lossy shortcut: CSS interpolates between two
 * DIFFERENT adjacent stops, and holds flat between two IDENTICAL ones. A run
 * of stops that all carry the same declaration -- 14.5% { translate(0,0) }
 * 20% { translate(0,0) } 20% { translate(0,0) } 30% { translate(0,0) } ...
 * -- renders as a flat hold no matter how many stops sit inside it, because
 * every sub-interval interpolates from a value to the SAME value. Only the
 * first stop of the run (where the hold begins) and the last (where the next
 * DIFFERENT value takes over, or the run reaches 100%) affect anything a
 * viewer or the DOM can observe. Everything between them is measurably inert.
 *
 * This is why an N-state sequence is verbose in the first place: ADR 0016's
 * own fix anchors every track explicitly at BOTH ends of the whole run (a
 * real correctness fix for browser default-value synthesis), and a mostly-
 * static element -- true of most nodes in a growth sequence, since each one
 * only moves during its own generation's two segments -- pays for an anchor
 * at every OTHER segment boundary too, even though nothing there ever
 * changes. Measured on this figure: 71% of all keyframe stops are exact
 * duplicates of the stop immediately before them.
 *
 * This does not touch percentage precision, coordinate precision, or drop
 * any FIRST/LAST anchor -- the property this whole project holds itself to
 * (every track anchored at both ends) is preserved exactly; only the
 * redundant middle of an unchanging run is removed.
 */

export function minifyKeyframes(svg) {
  let removed = 0;
  let kept = 0;
  const out = svg.replace(/@keyframes ([\w-]+) \{([\s\S]*?)\}\s*\}/g, (whole, name, body) => {
    const stops = [...body.matchAll(/([\d.]+)%\s*\{([^}]*)\}/g)].map((m) => ({
      pct: m[1],
      decl: m[2].trim(),
    }));
    if (stops.length === 0) return whole;

    const survivors = [];
    let i = 0;
    while (i < stops.length) {
      let j = i;
      while (j + 1 < stops.length && stops[j + 1].decl === stops[i].decl) j += 1;
      survivors.push(stops[i]);
      if (j !== i) survivors.push(stops[j]);
      kept += j === i ? 1 : 2;
      removed += j - i - (j === i ? 0 : 1);
      i = j + 1;
    }

    const rendered = survivors.map((s) => `${s.pct}% { ${s.decl} }`).join(" ");
    return `@keyframes ${name} { ${rendered} }`;
  });
  return { svg: out, removed, kept };
}
