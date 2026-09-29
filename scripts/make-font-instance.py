"""Derive the bundled figure face from upstream Inter (ADR 0063).

    python scripts/make-font-instance.py

Reads `assets/fonts/Inter-Variable.ttf` (upstream Inter 4, axes opsz 14-32
and wght 100-900) and writes `assets/fonts/Inter-Text-Variable.woff`:

  - opsz pinned at 14, the "Text" optical size. Chromium applies optical
    sizing automatically (`font-optical-sizing: auto`), so with the axis left
    in, a 30px title would be set in a narrower design than a 13px label and
    every size would need its own advance table. Pinned, the face at wght 400
    is glyph-for-glyph the upstream static Inter Regular this project shipped
    before, and a width depends only on size and weight.
  - wght limited to 400-700, the range every preset and type pack uses. A
    weight outside it is clamped by the browser and by `measureText` alike.
  - WOFF (zlib), not WOFF2: Node can parse it with opentype.js, which cannot
    decode WOFF2's Brotli, so ONE file serves the HTML mirror, `embed`,
    `outline` and planning-time measurement. One file means the four can
    never disagree about which glyphs they are looking at.

Needs fontTools (`pip install fonttools`); runs offline. The output is
committed, so nothing at run time depends on Python.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"

font = TTFont(FONTS / "Inter-Variable.ttf")
instance = instancer.instantiateVariableFont(font, {"opsz": 14, "wght": (400, 700)})
# Keep the head table's timestamp, so a rerun writes the same bytes.
instance.recalcTimestamp = False
instance.flavor = "woff"
instance.save(FONTS / "Inter-Text-Variable.woff")
print(f"wrote {FONTS / 'Inter-Text-Variable.woff'}")
