/**
 * Which font actually drew the glyphs?
 *
 * The HTML mirror declares a family *stack* (`"Prancheta Sans", "Segoe UI",
 * "Noto Sans", system-ui, sans-serif`). Chromium resolves that stack per glyph run, so a
 * CJK label is drawn by a fallback face nobody named. Exporting the stack
 * verbatim means another renderer — Inkscape, resvg, Illustrator — is free to
 * resolve it differently, and every advance width we measured silently stops
 * matching the glyphs it draws.
 *
 * So we ask Chromium what it actually used, via CDP, and name that face first
 * in the exported SVG. Where several faces drew one label (mixed script), that
 * is a portability risk we cannot fix by naming one family — so it is reported
 * rather than papered over.
 */

import type { Page } from "playwright";
import { BUNDLED_FONT_FAMILY } from "../export/fonts.ts";

export type ResolvedFont = {
  /** The face Chromium actually used for most glyphs, e.g. "Segoe UI". */
  family: string;
  /** Other faces that drew part of the same label. */
  alsoUsed: string[];
};

type PlatformFont = { familyName: string; glyphCount: number; isCustomFont?: boolean };

/**
 * A web font reports the family name inside its own file -- the bundled face
 * says "Inter" -- not the `@font-face` name the mirror loaded it under. The
 * mirror loads exactly one web font, so a custom face IS the bundled one, and
 * the exported SVG must name it as the SVG can find it: "Prancheta Sans",
 * which `embed` defines. Naming "Inter" first asked the viewer's host for a
 * font it usually lacks, and it drew Segoe UI instead (ADR 0063).
 */
const familyOf = (font: PlatformFont): string => (font.isCustomFont === true ? BUNDLED_FONT_FAMILY : font.familyName);

export async function resolvePlatformFonts(
  page: Page,
  ownerIds: string[],
): Promise<Map<string, ResolvedFont>> {
  const resolved = new Map<string, ResolvedFont>();
  if (ownerIds.length === 0) return resolved;

  let session;
  try {
    session = await page.context().newCDPSession(page);
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const document = (await session.send("DOM.getDocument")) as { root: { nodeId: number } };

    for (const ownerId of ownerIds) {
      const found = (await session.send("DOM.querySelector", {
        nodeId: document.root.nodeId,
        selector: `[data-pr-text="${cssEscape(ownerId)}"]`,
      })) as { nodeId: number };
      if (!found.nodeId) continue;

      const platform = (await session.send("CSS.getPlatformFontsForNode", {
        nodeId: found.nodeId,
      })) as { fonts: PlatformFont[] };

      const fonts = [...(platform.fonts ?? [])]
        .filter((font) => font.familyName !== "" && font.glyphCount > 0)
        .sort((a, b) => b.glyphCount - a.glyphCount);
      if (fonts.length === 0) continue;

      resolved.set(ownerId, {
        family: familyOf(fonts[0]!),
        alsoUsed: fonts.slice(1).map(familyOf),
      });
    }
  } catch {
    // CDP is a fidelity improvement, not a dependency. Without it the exported
    // SVG keeps the declared stack, which still resolves on this machine.
    return resolved;
  } finally {
    await session?.detach().catch(() => {});
  }

  return resolved;
}

/** Quote a value for use inside an SVG font-family list. */
export function quoteFamily(family: string): string {
  return /^[A-Za-z][A-Za-z0-9 -]*$/.test(family) ? `"${family}"` : `"${family.replace(/"/g, "")}"`;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
