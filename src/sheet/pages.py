"""Rasterise every page of a PDF to PNG with PyMuPDF.

Used by the `sheet` command so a sheet can be looked at page by page without
pdftoppm (poppler), which is not on a stock Windows machine. PyMuPDF is one
pip install and renders with MuPDF, independently of the Chromium that wrote
the PDF -- a second renderer agreeing with the first is worth having.

usage: python pages.py <in.pdf> <out-dir> [dpi]
writes <out-dir>/p01.png, p02.png, ...
"""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        import pymupdf  # PyMuPDF >= 1.24
    except ImportError:
        try:
            import fitz as pymupdf  # older PyMuPDF
        except ImportError:
            print("PyMuPDF is not installed: python -m pip install pymupdf", file=sys.stderr)
            return 3
    source, out = Path(sys.argv[1]), Path(sys.argv[2])
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 110
    out.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(source) as doc:
        width = len(str(doc.page_count))
        for i, page in enumerate(doc, start=1):
            page.get_pixmap(dpi=dpi).save(out / f"p{i:0{max(2, width)}d}.png")
        print(doc.page_count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
