/**
 * Wrapping the text of a panel, once.
 *
 * Eight presets set a few lines of statements under the figure and each wrote
 * its own loop to break them: a paragraph broken at spaces in distribution,
 * linear-map and probability-tree (each with its own idea of which words must
 * not be parted), the same loop bare in logic-circuit, truth-table and
 * statistics, and a pack-items-with-a-separator loop in statistics and
 * linear-map. They all measure differently -- the board's own measurer, a
 * probe, a per-character estimate -- so the shared function takes the measure
 * as a callback and knows nothing about fonts.
 */

/** The width, in pixels, a piece of text will occupy. */
export type Measure = (text: string) => number;

/**
 * Which words a line must not part. A word that `joinsPrevious` stays with
 * the word before it ("+", "="); after a word that `joinsNext` the next word
 * stays with it ("=" then its right-hand side). A line never ends on "S ≈"
 * or begins with "+".
 */
export type WrapRules = {
  joinsPrevious?: (word: string) => boolean;
  joinsNext?: (word: string) => boolean;
};

/** Items joined by `sep`, packed into lines no wider than `maxPx`; an item wider than that stands alone. */
export function packItems(items: readonly string[], sep: string, maxPx: number, measure: Measure): string[] {
  const out: string[] = [];
  let cur = "";
  for (const item of items) {
    const next = cur === "" ? item : `${cur}${sep}${item}`;
    if (cur !== "" && measure(next) > maxPx) {
      out.push(cur);
      cur = item;
    } else cur = next;
  }
  if (cur !== "") out.push(cur);
  return out;
}

/**
 * The lines of a paragraph, broken at spaces so none is wider than `maxPx`
 * (a single word wider than that stands alone).
 *
 * Words the rules bind together travel as one piece. A chain of operands and
 * operators binds into ONE piece, and a piece still too wide breaks BEFORE an
 * operator -- the way an equation is carried over -- never after one.
 */
export function wrapText(text: string, maxPx: number, measure: Measure, rules: WrapRules = {}): string[] {
  if (measure(text) <= maxPx) return [text];
  const joinsPrevious = rules.joinsPrevious ?? (() => false);
  const joinsNext = rules.joinsNext ?? (() => false);
  const pieces: string[] = [];
  let hold = false;
  for (const word of text.split(" ")) {
    if (pieces.length > 0 && (hold || joinsPrevious(word))) pieces[pieces.length - 1] += ` ${word}`;
    else pieces.push(word);
    hold = joinsNext(word);
  }
  return packItems(pieces, " ", maxPx, measure).flatMap((piece) =>
    measure(piece) <= maxPx ? [piece] : breakBeforeOperators(piece, maxPx, measure, rules),
  );
}

function breakBeforeOperators(piece: string, maxPx: number, measure: Measure, rules: WrapRules): string[] {
  const joinsPrevious = rules.joinsPrevious ?? (() => false);
  const joinsNext = rules.joinsNext ?? (() => false);
  const rows: string[] = [];
  let cur = "";
  const words = piece.split(" ");
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const next = cur === "" ? word : `${cur} ${word}`;
    const mayBreak = i > 0 && joinsPrevious(word) && !joinsNext(words[i - 1]!);
    if (cur !== "" && mayBreak && measure(next) > maxPx) {
      rows.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur !== "") rows.push(cur);
  return rows;
}

/** Width of a narrow no-break space (U+202F, the digit-group mark) as a share of a normal character's advance in an estimate: about 0.2em against 0.56em. */
const NARROW_SHARE = 0.2 / 0.56;

/**
 * A generous width, in pixels, for the longest line of `text` set at `size`:
 * every character is `size * 0.56 + tracking` wide, except the narrow spaces
 * that group digits ("12 000"), which are about a third of that. Every panel
 * estimate goes through here so a grouped number is not budgeted a full
 * character per gap and does not push a label past the box drawn for it.
 */
export function estimateWidth(text: string, size: number, tracking = 0.1): number {
  let longest = 0;
  for (const line of text.split("\n")) {
    let units = 0;
    for (const ch of line) units += ch === "\u202f" ? NARROW_SHARE : 1;
    longest = Math.max(longest, units);
  }
  return Math.ceil(longest * (size * 0.56 + tracking) + 10);
}
