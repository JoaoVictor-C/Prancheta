"""Map figure module for Prancheta.

Reads one JSON document on stdin, writes one on stdout. It computes geometry the
TypeScript core cannot: projection with pyproj, and label placement with
shapely's ``representative_point()``, which is guaranteed to lie *inside* a
polygon even when that polygon is concave.

That guarantee is the whole point of the probe. A naive placement — the centre
of the bounding box — falls OUTSIDE an L-shaped region, and no amount of
bounding-box measurement on the core's side can tell the difference. Only a real
hit-test can. Run with ``--misdeclare`` to place labels that way on purpose and
watch the core catch it.

The module declares WHAT IT DREW. It does not certify that what it drew is
correct: the core measures the geometry itself. See decision 0005.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

from pyproj import Transformer
from shapely.geometry import Polygon, box as shapely_box, shape as shapely_shape
from shapely.ops import transform as shapely_transform

# Lon/lat outlines. "harbour" is deliberately L-shaped: the centre of its
# bounding box lies in the notch, outside the polygon itself.
REGIONS: dict[str, dict[str, Any]] = {
    "northfield": {
        "name": "Northfield",
        "fill": "#1E3A5F",
        "stroke": "#5B8DEF",
        "coords": [(-3.2, 55.2), (-2.4, 55.25), (-2.35, 54.85), (-3.15, 54.8)],
    },
    "harbour": {
        "name": "Harbour District",
        "fill": "#2A2418",
        "stroke": "#E9C46A",
        # L-shape: a wide base with a tall arm on the left.
        "coords": [
            (-3.2, 54.75),
            (-2.9, 54.75),
            (-2.9, 54.45),
            (-2.35, 54.45),
            (-2.35, 54.15),
            (-3.2, 54.15),
        ],
    },
    "southmoor": {
        "name": "Southmoor",
        "fill": "#16261E",
        "stroke": "#4CAF7D",
        "coords": [(-2.85, 54.4), (-2.3, 54.4), (-2.3, 54.05), (-2.85, 54.05)],
    },
}

TRANSFORMER = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def project(polygon: Polygon) -> Polygon:
    """Lon/lat -> Web Mercator metres."""
    return shapely_transform(lambda x, y, z=None: TRANSFORMER.transform(x, y), polygon)


def render(width: float, height: float, misdeclare: bool) -> dict[str, Any]:
    projected = {key: project(Polygon(region["coords"])) for key, region in REGIONS.items()}

    # Fit all regions into the canvas, leaving room for labels.
    pad = 40.0
    minx = min(p.bounds[0] for p in projected.values())
    miny = min(p.bounds[1] for p in projected.values())
    maxx = max(p.bounds[2] for p in projected.values())
    maxy = max(p.bounds[3] for p in projected.values())
    scale = min((width - 2 * pad) / (maxx - minx), (height - 2 * pad) / (maxy - miny))

    # Mercator y grows north, SVG y grows down, so the group flips it. The core
    # must undo this transform to compare a label box with a region path — which
    # is exactly the coordinate trap the protocol normalises away.
    tx = pad - minx * scale
    ty = height - pad + miny * scale
    group_transform = f"translate({tx:.3f} {ty:.3f}) scale({scale:.9f} {-scale:.9f})"

    def to_canvas(x: float, y: float) -> tuple[float, float]:
        return (x * scale + tx, -y * scale + ty)

    paths: list[str] = []
    labels: list[str] = []
    elements: list[dict[str, Any]] = []
    notes: list[str] = []

    for key, region in REGIONS.items():
        polygon = projected[key]
        coords = list(polygon.exterior.coords)
        d = "M " + " L ".join(f"{x:.3f} {y:.3f}" for x, y in coords) + " Z"
        paths.append(
            f'<path data-pr-id="{key}" d="{d}" fill="{region["fill"]}" '
            f'stroke="{region["stroke"]}" stroke-width="{2 / scale:.6f}"/>'
        )
        # A feature's box IS something this module knows: it computed the
        # geometry. Declaring it lets the core check the module's own model
        # against what the module actually drew.
        fx0, fy0, fx1, fy1 = polygon.bounds
        cx0, cy0 = to_canvas(fx0, fy0)
        cx1, cy1 = to_canvas(fx1, fy1)
        elements.append(
            {
                "id": key,
                "kind": "feature",
                "claim": f'the area of {region["name"]}',
                "declaredBox": {
                    "x": round(min(cx0, cx1), 2),
                    "y": round(min(cy0, cy1), 2),
                    "width": round(abs(cx1 - cx0), 2),
                    "height": round(abs(cy1 - cy0), 2),
                },
            }
        )

        if misdeclare:
            # Bounding-box centre: correct for a rectangle, wrong for the L.
            bx0, by0, bx1, by1 = polygon.bounds
            anchor = ((bx0 + bx1) / 2.0, (by0 + by1) / 2.0)
        else:
            point = polygon.representative_point()
            anchor = (point.x, point.y)

        cx, cy = to_canvas(*anchor)
        label_id = f"{key}-label"
        name = region["name"]
        labels.append(
            f'<text data-pr-id="{label_id}" x="{cx:.2f}" y="{cy:.2f}" '
            f'text-anchor="middle" dominant-baseline="middle" '
            f'font-family="Segoe UI, sans-serif" font-size="15" fill="#E6E9EF">{name}</text>'
        )
        # NO declaredBox for a label. The first version of this module guessed
        # one from the character count and was wrong by up to 16px, which the
        # core caught immediately. That was the check working, and the lesson is
        # sharper than the bug: a module should declare only geometry it
        # actually computes. This one computed polygons; it cannot measure text,
        # because measuring text needs a font engine. Guessing and calling it a
        # declaration is how a module ends up certifying its own fiction.
        elements.append(
            {
                "id": label_id,
                "kind": "label",
                "owner": key,
                "claim": f"names {name}",
            }
        )

    if misdeclare:
        # A claim about something never drawn. The core must refuse it.
        elements.append({"id": "phantom-region", "kind": "feature", "claim": "a region that was never drawn"})
        notes.append("misdeclare mode: labels placed at bounding-box centres and a phantom id declared")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="#0F1115"/>'
        f'<g data-pr-layer="regions" transform="{group_transform}">{"".join(paths)}</g>'
        f'<g data-pr-layer="labels">{"".join(labels)}</g>'
        f"</svg>"
    )

    return {"svg": svg, "elements": elements, "notes": notes}


# ---------------------------------------------------------------------------
# Campaign maps: many regions, a category legend, movement arrows -- the
# "categorical political map with a legend box" class of figure (a WWII
# theatre map, an election map, a treaty-boundary map), as opposed to the
# probe above's fixed 3-region fixture. See render_campaign().
# ---------------------------------------------------------------------------


def grid_box(col: float, row: float, w: float = 1.0, h: float = 1.0, base_lon: float = 0.0, base_lat: float = 52.0) -> list[tuple[float, float]]:
    """A rectangular region on a simple lon/lat grid -- no real geography.

    Every named campaign map in this module is an illustrative fictional
    continent, exactly like fixtures/broken-boxes.json is a fictional figure:
    the point is the DIAGRAM CLASS (categorical shading, a legend, movement
    arrows), not a claim about any real place or historical campaign.
    """
    lon0, lon1 = base_lon + col, base_lon + col + w
    lat0, lat1 = base_lat - row - h, base_lat - row
    return [(lon0, lat1), (lon1, lat1), (lon1, lat0), (lon0, lat0)]


def _jitter_edge(
    p0: tuple[float, float], p1: tuple[float, float], segments: int, amplitude: float, salt: str
) -> list[tuple[float, float]]:
    """The points from p0 to p1 along a straight edge, perturbed perpendicular
    to it by up to `amplitude`, deterministically -- so two regions that share
    this exact edge (a real border) compute the identical jittered path
    independently, from either direction, with no seam between them.

    The trick: derive the random sequence from the edge's UNORDERED endpoints
    (`a, b = sorted(...)`), always walk a -> b to generate it, then reverse the
    result if the caller actually wanted b -> a. Two callers approaching the
    same physical edge from opposite sides both land on the same canonical a/b
    pair, so they draw the same offsets in the same positions along the edge --
    only the direction they're handed back in differs.
    """
    reversed_order = p0 > p1
    a, b = (p1, p0) if reversed_order else (p0, p1)
    rng = random.Random(f"{salt}:{a}:{b}")
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1e-9)
    ux, uy = dx / length, dy / length
    perp_x, perp_y = -uy, ux
    points = [a]
    for i in range(1, segments):
        t = i / segments
        base_x, base_y = a[0] + dx * t, a[1] + dy * t
        offset = rng.uniform(-amplitude, amplitude)
        points.append((base_x + perp_x * offset, base_y + perp_y * offset))
    points.append(b)
    if reversed_order:
        points.reverse()
    return points


def jittered_grid_box(
    col: float,
    row: float,
    w: float = 1.0,
    h: float = 1.0,
    base_lon: float = 0.0,
    base_lat: float = 52.0,
    segments: int = 4,
    amplitude: float = 0.075,
) -> list[tuple[float, float]]:
    """`grid_box`'s four corners, but every edge walks an irregular path
    between them instead of a straight line -- a coastline/border, not a
    ruled rectangle side. Two adjacent regions built from grids that share a
    corner-to-corner edge (Corenia's east side, Ausland's west side -- the
    same two lon/lat points either way) get the exact same jittered path for
    it, from `_jitter_edge`'s own guarantee, so borders between neighbours
    still meet with zero gap; only the shared edge itself stops being straight.
    """
    corners = grid_box(col, row, w, h, base_lon, base_lat)
    salt = f"{base_lon}:{base_lat}"
    boundary: list[tuple[float, float]] = []
    for i in range(len(corners)):
        p0, p1 = corners[i], corners[(i + 1) % len(corners)]
        edge_points = _jitter_edge(p0, p1, segments, amplitude, salt)
        boundary.extend(edge_points[:-1])  # drop the last point: it's the next edge's first
    return boundary


def grid_point(col: float, row: float, base_lon: float = 0.0, base_lat: float = 52.0) -> tuple[float, float]:
    """The same (col, row) -> (lon, lat) convention grid_box's corners use, for a single point (an arrow vertex)."""
    return (base_lon + col, base_lat - row)


CAMPAIGN_CATEGORIES: dict[str, dict[str, str]] = {
    "core": {"label": "Core power", "fill": "#1E3A8A"},
    "core_ally": {"label": "Allied with core power", "fill": "#3B5FC4"},
    "occupied_early": {"label": "Occupied, year 1", "fill": "#6E8EDE"},
    "occupied_late": {"label": "Occupied, year 2", "fill": "#A9BCEB"},
    "opposing": {"label": "Opposing power", "fill": "#B23A48"},
    "allied": {"label": "Allied power", "fill": "#D97E86"},
}

CAMPAIGN_REGIONS: list[dict[str, Any]] = [
    {"id": "islania", "name": "Islania", "category": "allied", "grid": (-2.3, 1.2, 1.4, 1.6)},
    {"id": "corenia", "name": "Corenia", "category": "core", "grid": (1.6, 1.6, 1.5, 1.3)},
    {"id": "corenia_south", "name": "Suden", "category": "core", "grid": (1.6, 2.9, 1.5, 1.0)},
    {"id": "ausland", "name": "Ausland", "category": "core_ally", "grid": (3.1, 2.9, 1.4, 1.2)},
    {"id": "westmark", "name": "Westmark", "category": "occupied_early", "grid": (0.2, 1.6, 1.4, 1.3)},
    {"id": "nordland", "name": "Nordland", "category": "occupied_early", "grid": (1.6, 0.2, 1.5, 1.4)},
    {"id": "brekland", "name": "Brekland", "category": "occupied_late", "grid": (3.1, 1.6, 1.4, 1.3)},
    {"id": "sudmark", "name": "Sudmark", "category": "occupied_late", "grid": (0.2, 2.9, 1.4, 1.0)},
    {"id": "polska_", "name": "Polvia", "category": "occupied_late", "grid": (4.5, 1.3, 1.6, 1.6)},
    {"id": "vastland", "name": "Vastland", "category": "opposing", "grid": (6.1, 0.2, 3.4, 4.5)},
]

# An offshore island, not part of the mainland grid at all -- a real coastline
# has outlying land, and a single hand-authored small polygon (rather than
# another grid cell) is the honest way to draw one: it borders nothing, so
# there is no shared edge that needs the jitter machinery's matching
# guarantee, only its own irregular coastline.
OSTHOLM_ISLES: list[tuple[float, float]] = [
    (9.75, 1.75), (9.95, 1.60), (10.20, 1.68), (10.32, 1.90),
    (10.18, 2.12), (9.98, 2.25), (9.80, 2.15), (9.68, 1.95),
]

CAMPAIGN_ARROWS: list[dict[str, Any]] = [
    {"id": "thrust-north", "points": [(2.3, 2.2), (2.3, 1.4), (2.3, 0.7)]},
    {"id": "thrust-east", "points": [(3.3, 2.2), (4.4, 2.0), (5.5, 1.9)]},
    {"id": "thrust-southeast", "points": [(3.8, 3.3), (5.0, 2.9), (6.3, 2.6)]},
]


def render_campaign(width: float, height: float, misdeclare: bool) -> dict[str, Any]:
    regions = [
        {"id": r["id"], "name": r["name"], "category": r["category"], "coords": jittered_grid_box(*r["grid"])}
        for r in CAMPAIGN_REGIONS
    ]
    projected = {r["id"]: project(Polygon(r["coords"])) for r in regions}
    island_coords = [grid_point(col, row) for col, row in OSTHOLM_ISLES]
    projected["ostholm"] = project(Polygon(island_coords))

    legend_w = 190.0
    pad = 30.0
    map_right_margin = legend_w + 24.0
    minx = min(p.bounds[0] for p in projected.values())
    miny = min(p.bounds[1] for p in projected.values())
    maxx = max(p.bounds[2] for p in projected.values())
    maxy = max(p.bounds[3] for p in projected.values())
    scale = min((width - pad - map_right_margin) / (maxx - minx), (height - 2 * pad) / (maxy - miny))

    tx = pad - minx * scale
    ty = height - pad + miny * scale
    group_transform = f"translate({tx:.3f} {ty:.3f}) scale({scale:.9f} {-scale:.9f})"

    def to_canvas(x: float, y: float) -> tuple[float, float]:
        return (x * scale + tx, -y * scale + ty)

    # --- graticule: a faint lon/lat reference grid behind the land, exactly
    # the undeclared-decoration convention modules/skewt already uses for its
    # own isobar tick marks -- context a reader expects on a real map, not a
    # claim this module needs to verify. -------------------------------------
    background: list[str] = []
    graticule_lons = range(0, 11)
    graticule_lats = range(-1, 6)
    for col in graticule_lons:
        lon, _ = grid_point(col, 0)
        x0, y0 = to_canvas(*TRANSFORMER.transform(lon, 48.0))
        x1, y1 = to_canvas(*TRANSFORMER.transform(lon, 56.0))
        background.append(f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="#0F1115" stroke-width="0.6" opacity="0.14" stroke-dasharray="3 4"/>')
    for row in graticule_lats:
        _, lat = grid_point(0, row)
        x0, y0 = to_canvas(*TRANSFORMER.transform(-2.0, lat))
        x1, y1 = to_canvas(*TRANSFORMER.transform(12.0, lat))
        background.append(f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="#0F1115" stroke-width="0.6" opacity="0.14" stroke-dasharray="3 4"/>')

    paths: list[str] = []
    overlay: list[str] = []
    elements: list[dict[str, Any]] = []
    notes: list[str] = []

    for r in regions:
        polygon = projected[r["id"]]
        cat = CAMPAIGN_CATEGORIES[r["category"]]
        coords = list(polygon.exterior.coords)
        d = "M " + " L ".join(f"{x:.3f} {y:.3f}" for x, y in coords) + " Z"
        paths.append(f'<path data-pr-id="{r["id"]}" d="{d}" fill="{cat["fill"]}" stroke="#0F1115" stroke-width="{1.5 / scale:.6f}"/>')
        fx0, fy0, fx1, fy1 = polygon.bounds
        cx0, cy0 = to_canvas(fx0, fy0)
        cx1, cy1 = to_canvas(fx1, fy1)
        elements.append(
            {
                "id": r["id"], "kind": "feature", "claim": f'the territory of {r["name"]} ({cat["label"]})',
                "declaredBox": {
                    "x": round(min(cx0, cx1), 2), "y": round(min(cy0, cy1), 2),
                    "width": round(abs(cx1 - cx0), 2), "height": round(abs(cy1 - cy0), 2),
                },
            }
        )
        anchor = polygon.bounds if misdeclare else None
        point = ((anchor[0] + anchor[2]) / 2, (anchor[1] + anchor[3]) / 2) if misdeclare else polygon.representative_point()
        px, py = (point if misdeclare else (point.x, point.y))
        lcx, lcy = to_canvas(px, py)
        label_id = f'{r["id"]}-label'
        # font-size 10, not 12: Westmark is a narrow country (56px wide at
        # this canvas size) whose neighbour corenia starts right at its
        # shared border with zero gap -- real adjacent countries do share a
        # border. At 12px, "Westmark" nearly fills the country's own width,
        # so its label's right edge landed almost exactly ON that shared
        # border, and module-labels-clear-of-strokes read that as sitting on
        # corenia's own stroke. Not a placement bug so much as text too large
        # for a genuinely narrow country; shrinking the font is the honest
        # fix, the same way modules/genomic shrinks or relocates labels for
        # features narrower than their own name.
        overlay.append(
            f'<text data-pr-id="{label_id}" x="{lcx:.2f}" y="{lcy:.2f}" text-anchor="middle" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="9" fill="#0F1115" '
            f'font-weight="600">{r["name"]}</text>'
        )
        elements.append({"id": label_id, "kind": "label", "owner": r["id"], "claim": f'names {r["id"]}'})

    # --- an offshore island, drawn like any other territory: it just isn't
    # part of the mainland grid, so it borders nothing and needs no jitter
    # matching. Coloured "allied", the same category Islania carries, so the
    # legend needs no new row for it. --------------------------------------
    island = projected["ostholm"]
    island_cat = CAMPAIGN_CATEGORIES["allied"]
    island_coords_canvas = list(island.exterior.coords)
    d = "M " + " L ".join(f"{x:.3f} {y:.3f}" for x, y in island_coords_canvas) + " Z"
    paths.append(f'<path data-pr-id="ostholm" d="{d}" fill="{island_cat["fill"]}" stroke="#0F1115" stroke-width="{1.5 / scale:.6f}"/>')
    ix0, iy0, ix1, iy1 = island.bounds
    icx0, icy0 = to_canvas(ix0, iy0)
    icx1, icy1 = to_canvas(ix1, iy1)
    elements.append(
        {
            "id": "ostholm", "kind": "feature", "claim": f'the territory of Ostholm Isles ({island_cat["label"]})',
            "declaredBox": {
                "x": round(min(icx0, icx1), 2), "y": round(min(icy0, icy1), 2),
                "width": round(abs(icx1 - icx0), 2), "height": round(abs(icy1 - icy0), 2),
            },
        }
    )
    ipoint = island.representative_point()
    ilx, ily = to_canvas(ipoint.x, ipoint.y)
    overlay.append(
        f'<text data-pr-id="ostholm-label" x="{ilx:.2f}" y="{ily:.2f}" text-anchor="middle" '
        f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="9" fill="#0F1115" '
        f'font-weight="600">Ostholm</text>'
    )
    elements.append({"id": "ostholm-label", "kind": "label", "owner": "ostholm", "claim": "names ostholm"})

    # --- compass rose: a fixed canvas-space ornament, the same treatment the
    # legend already gets -- UI over the map, not a claim about the map. -----
    rose_cx, rose_cy, rose_r = pad + 26.0, height - pad - 30.0, 20.0
    overlay.append(
        f'<circle cx="{rose_cx:.1f}" cy="{rose_cy:.1f}" r="{rose_r:.1f}" fill="none" stroke="#0F1115" stroke-width="1" opacity="0.55"/>'
        f'<path d="M {rose_cx:.1f} {rose_cy - rose_r + 3:.1f} L {rose_cx - 5:.1f} {rose_cy + 6:.1f} '
        f'L {rose_cx:.1f} {rose_cy + 2:.1f} L {rose_cx + 5:.1f} {rose_cy + 6:.1f} Z" fill="#0F1115" opacity="0.75"/>'
        f'<text x="{rose_cx:.1f}" y="{rose_cy - rose_r - 6:.1f}" text-anchor="middle" '
        f'font-family="Segoe UI, sans-serif" font-size="11" font-weight="700" fill="#0F1115" opacity="0.75">N</text>'
    )

    # --- movement arrows: real polylines, declared box from real points -----
    for arrow in CAMPAIGN_ARROWS:
        # Arrow points are authored as (col, row) grid coordinates, exactly
        # like the regions' corners -- they need the SAME two-step path a
        # region's corners take (grid -> lon/lat -> Mercator metres) before
        # to_canvas, which expects Mercator metres. The first version fed raw
        # grid coordinates (single-digit numbers) straight into to_canvas,
        # which is calibrated for six/seven-digit Mercator values, and every
        # arrow landed thousands of pixels off-canvas -- content-within-canvas
        # failed on all three the moment module-ids-resolve stopped masking it
        # (see the arrow-id fix above: they couldn't even be measured before).
        merc_pts = [TRANSFORMER.transform(*grid_point(col, row)) for col, row in arrow["points"]]
        canvas_pts = [to_canvas(x, y) for x, y in merc_pts]
        d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in canvas_pts)
        (hx, hy), (tx2, ty2) = canvas_pts[-1], canvas_pts[-2]
        dx, dy = hx - tx2, hy - ty2
        length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
        ux, uy = dx / length, dy / length
        px_, py_ = -uy, ux
        head = 9.0
        tip = (hx, hy)
        left = (hx - ux * head + px_ * head * 0.55, hy - uy * head + py_ * head * 0.55)
        right = (hx - ux * head - px_ * head * 0.55, hy - uy * head - py_ * head * 0.55)
        # Line and arrowhead share one id, grouped -- the identical fix
        # modules/reaction/MODULE.md already recorded for its own arrow: a
        # declared id needs a real drawn element to resolve against, and the
        # first version here declared the arrow but never wrote its
        # data-pr-id onto anything, so module-ids-resolve failed outright.
        overlay.append(
            f'<g data-pr-id="{arrow["id"]}">'
            f'<path d="{d}" stroke="#0F1115" stroke-width="2.5" fill="none" opacity="0.75"/>'
            f'<path d="M {tip[0]:.2f} {tip[1]:.2f} L {left[0]:.2f} {left[1]:.2f} L {right[0]:.2f} {right[1]:.2f} Z" fill="#0F1115" opacity="0.75"/>'
            f"</g>"
        )
        xs = [p[0] for p in canvas_pts] + [left[0], right[0]]
        ys = [p[1] for p in canvas_pts] + [left[1], right[1]]
        elements.append(
            {
                "id": arrow["id"], "kind": "decoration", "claim": "a campaign movement arrow",
                "declaredBox": {
                    "x": round(min(xs), 2), "y": round(min(ys), 2),
                    "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2),
                },
            }
        )

    # --- legend: a fixed UI overlay in canvas space, not map space ---------
    legend_x = width - legend_w - pad + 24.0
    legend_y = pad
    row_h = 22.0
    legend_h = 34.0 + len(CAMPAIGN_CATEGORIES) * row_h
    overlay.append(
        f'<rect data-pr-id="legend-box" x="{legend_x:.2f}" y="{legend_y:.2f}" width="{legend_w:.2f}" height="{legend_h:.2f}" '
        f'fill="#F4F1EA" stroke="#0F1115" stroke-width="1.5"/>'
    )
    elements.append(
        {
            "id": "legend-box", "kind": "decoration", "claim": "the legend panel",
            "declaredBox": {"x": round(legend_x, 2), "y": round(legend_y, 2), "width": round(legend_w, 2), "height": round(legend_h, 2)},
        }
    )
    overlay.append(
        f'<text data-pr-id="legend-title" x="{legend_x + legend_w / 2:.2f}" y="{legend_y + 18:.2f}" text-anchor="middle" '
        f'font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#0F1115">Fictional campaign map</text>'
    )
    elements.append({"id": "legend-title", "kind": "label", "claim": "the legend title"})
    for i, (cat_id, cat) in enumerate(CAMPAIGN_CATEGORIES.items()):
        ry = legend_y + 30.0 + i * row_h
        swatch_id = f"legend-swatch-{cat_id}"
        overlay.append(f'<rect data-pr-id="{swatch_id}" x="{legend_x + 10:.2f}" y="{ry:.2f}" width="16" height="14" fill="{cat["fill"]}" stroke="#0F1115" stroke-width="1"/>')
        elements.append(
            {
                "id": swatch_id, "kind": "decoration", "claim": f'the legend swatch for {cat["label"]}',
                "declaredBox": {"x": round(legend_x + 10, 2), "y": round(ry, 2), "width": 16.0, "height": 14.0},
            }
        )
        text_id = f"legend-label-{cat_id}"
        overlay.append(
            f'<text data-pr-id="{text_id}" x="{legend_x + 32:.2f}" y="{ry + 10:.2f}" text-anchor="start" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="11" fill="#0F1115">{cat["label"]}</text>'
        )
        # No owner: the label sits BESIDE its swatch, not inside its fill --
        # module-label-within-feature correctly refused this the first time,
        # the same false-ownership mistake modules/reaction and modules/plot
        # already record for their own stroke- and gap-adjacent labels.
        elements.append({"id": text_id, "kind": "label", "claim": f'names the {cat["label"]} category'})

    if misdeclare:
        elements.append({"id": "phantom-territory", "kind": "feature", "claim": "a territory that was never drawn"})
        # Every campaign region is a plain rectangle, so a bbox-centre label
        # anchor (the harbour probe's own misdeclare trick) can't demonstrate
        # anything here -- a rectangle's centre is always inside it. Shifting
        # one region's own declared geometry is the honest way to exercise
        # module-geometry-agrees in this variant instead.
        for element in elements:
            if element["id"] == "corenia" and "declaredBox" in element:
                box = element["declaredBox"]
                element["declaredBox"] = {**box, "x": box["x"] + 22.0}
                break
        notes.append(
            "misdeclare mode: a phantom territory id declared, and corenia's own geometry shifted 22px from what it drew"
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="#E8E4D8"/>'
        f'<g data-pr-layer="graticule">{"".join(background)}</g>'
        f'<g data-pr-layer="regions" transform="{group_transform}">{"".join(paths)}</g>'
        f'<g data-pr-layer="overlay">{"".join(overlay)}</g>'
        f"</svg>"
    )
    return {"svg": svg, "elements": elements, "notes": notes}


# ---------------------------------------------------------------------------
# Real geography: actual country borders, not a synthetic grid. Data is
# bundled locally (modules/map/data/europe_countries.geojson) rather than
# fetched at render time, so a render is reproducible offline and doesn't
# depend on a third-party CDN staying up. See modules/map/MODULE.md for how
# it was prepared and why SUBREGION -- the data provider's OWN classification,
# not one this module asserts -- is what gets coloured.
# ---------------------------------------------------------------------------

SUBREGION_CATEGORIES: dict[str, str] = {
    "Western Europe": "#3B5FC4",
    "Northern Europe": "#48A9A6",
    "Southern Europe": "#E9C46A",
    "Eastern Europe": "#E76F51",
}

# South America's own SUBREGION field has a single value ("South America"),
# so it carries no categorical information there -- ECONOMY (Natural Earth's
# own development-tier field) is the one that actually varies across these
# 13 countries. Real, sourced, the same discipline SUBREGION follows for
# Europe: the classification is the data provider's own, not asserted here.
ECONOMY_CATEGORIES: dict[str, str] = {
    "2. Developed region: nonG7": "#3B5FC4",
    "3. Emerging region: BRIC": "#E76F51",
    "5. Emerging region: G20": "#E9C46A",
    "6. Developing region": "#48A9A6",
}

DATA_DIR = Path(__file__).resolve().parent / "data"


def polygon_path_d(geom: Any) -> str:
    """SVG path data for a Polygon or MultiPolygon -- one 'M ... Z' per ring."""
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    parts = []
    for poly in polys:
        coords = list(poly.exterior.coords)
        parts.append("M " + " L ".join(f"{x:.3f} {y:.3f}" for x, y in coords) + " Z")
    return " ".join(parts)


def _render_political_region(
    width: float,
    height: float,
    misdeclare: bool,
    *,
    geojson_file: str,
    category_field: str,
    category_colors: dict[str, str],
    legend_title: str,
    bg_fill: str,
    legend_w: float = 190.0,
) -> dict[str, Any]:
    """Shared machinery behind every real-geography variant (europe, south_america, ...).

    Parametrised out of render_europe once a second real region (South
    America) needed the identical pipeline with a different bundled file, a
    different category field (ECONOMY has no equivalent of SUBREGION's four
    real Europe values -- South America's own SUBREGION is a single value,
    so ECONOMY, Natural Earth's own development-tier field, is the one that
    actually varies), and a different legend title. Every fix recorded in
    modules/map/MODULE.md for the Europe render -- the abs() sign fix, the
    erosion-before-representative_point placement, the real
    intersects()-against-neighbours label-fit check -- applies unchanged to
    every region this function is asked to draw, because none of them were
    specific to Europe's geography in the first place.
    """
    with open(DATA_DIR / geojson_file, encoding="utf-8") as f:
        geojson = json.load(f)

    countries = []
    for feature in geojson["features"]:
        props = feature["properties"]
        geom = shapely_shape(feature["geometry"])
        if geom.is_empty:
            continue
        countries.append({"name": props["NAME"], "category": props[category_field], "geom": project(geom)})

    pad = 24.0
    map_right_margin = legend_w + 20.0
    minx = min(c["geom"].bounds[0] for c in countries)
    miny = min(c["geom"].bounds[1] for c in countries)
    maxx = max(c["geom"].bounds[2] for c in countries)
    maxy = max(c["geom"].bounds[3] for c in countries)
    scale = min((width - pad - map_right_margin) / (maxx - minx), (height - 2 * pad) / (maxy - miny))

    tx = pad - minx * scale
    ty = height - pad + miny * scale
    group_transform = f"translate({tx:.3f} {ty:.3f}) scale({scale:.9f} {-scale:.9f})"

    def to_canvas(x: float, y: float) -> tuple[float, float]:
        return (x * scale + tx, -y * scale + ty)

    paths: list[str] = []
    overlay: list[str] = []
    elements: list[dict[str, Any]] = []
    notes: list[str] = []

    for i, c in enumerate(countries):
        cid = f"country-{i}"
        fill = category_colors[c["category"]]
        d = polygon_path_d(c["geom"])
        paths.append(f'<path data-pr-id="{cid}" d="{d}" fill="{fill}" stroke="#0F1115" stroke-width="{1.0 / scale:.6f}"/>')
        bx0, by0, bx1, by1 = c["geom"].bounds
        cx0, cy0 = to_canvas(bx0, by0)
        cx1, cy1 = to_canvas(bx1, by1)
        elements.append(
            {
                "id": cid, "kind": "feature", "claim": f'the territory of {c["name"]} ({c["category"]})',
                "declaredBox": {
                    "x": round(min(cx0, cx1), 2), "y": round(min(cy0, cy1), 2),
                    "width": round(abs(cx1 - cx0), 2), "height": round(abs(cy1 - cy0), 2),
                },
            }
        )
        # representative_point(), not a bounding-box centre: real country
        # shapes are frequently concave or multi-part (a mainland plus
        # islands), the exact case this guarantee exists for -- the same
        # reasoning as the harbour probe above, now exercised on real,
        # non-trivial coastlines instead of one hand-built L-shape.
        if misdeclare:
            point = ((bx0 + bx1) / 2.0, (by0 + by1) / 2.0)
        else:
            # Erode inward before picking the point, when erosion leaves
            # anything: representative_point() guarantees a point INSIDE the
            # polygon, but not a point far from its edge, and a country
            # sharing a border with a neighbour can have its representative
            # point land close enough to that shared edge that the label
            # reads as sitting on the NEIGHBOUR's own border stroke --
            # exactly what happened to Greece, whose label crossed onto
            # Albania's line. Buffering inward by a small fraction of the
            # country's own size pulls the candidate point away from every
            # edge at once, a real computed margin rather than a guess at
            # which specific border to avoid.
            bw, bh = bx1 - bx0, by1 - by0
            eroded = c["geom"].buffer(-0.08 * min(bw, bh))
            source = eroded if not eroded.is_empty else c["geom"]
            rp = source.representative_point()
            point = (rp.x, rp.y)
        lcx, lcy = to_canvas(*point)
        label_id = f"{cid}-label"
        # abs(): to_canvas flips y (Mercator y grows north, SVG y grows
        # down), so cy1 < cy0 for normal bounds ordering and the unsigned
        # product was always negative -- every country failed `area > 120`
        # silently, and zero labels were ever declared until this was caught
        # by noticing module-label-within-feature stayed not-applicable at
        # ANY canvas size, which should have been geometrically impossible
        # for a 1000x800 render of 39 countries.
        area = abs(cx1 - cx0) * abs(cy1 - cy0)

        def label_fits(font_size: float) -> bool:
            """Does a label this size, centred here, avoid every OTHER country's fill?

            Estimated from character count (no font engine here, the usual
            reason), but the decision it drives is then checked for real
            against actual neighbouring polygons -- not tuned by hand per
            country the way a fixed erosion constant or area threshold was
            in two earlier versions, each of which fixed one country's
            collision and produced a different one elsewhere. A geometric
            question ("does this box reach another country's real shape")
            gets a geometric answer instead of a guessed margin.
            """
            # A 1.6x safety margin on top of the character-count estimate:
            # Czechia's label still reached Poland's real polygon at a size
            # this check, unmargined, had approved as clear. Rather than
            # keep retuning the per-character width factor to chase one
            # exact miss, the estimate is deliberately over-generous -- a
            # false "doesn't fit" here costs a label; a false "fits" costs a
            # real collision the core will catch anyway, which is the worse
            # failure to risk.
            margin = 1.6
            half_w = (len(c["name"]) * font_size * 0.74) / 2 / scale * margin
            half_h = (font_size * 1.3) / 2 / scale * margin
            label_box = shapely_box(point[0] - half_w, point[1] - half_h, point[0] + half_w, point[1] + half_h)
            return not any(j != i and other["geom"].intersects(label_box) for j, other in enumerate(countries))

        if area > 900 and label_fits(11):
            font_size = 11.0
        elif area > 300 and label_fits(8.5):
            font_size = 8.5
        else:
            font_size = 0.0  # no size clears its neighbours -- leave it unlabelled

        if font_size > 0:
            overlay.append(
                f'<text data-pr-id="{label_id}" x="{lcx:.2f}" y="{lcy:.2f}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="{font_size}" '
                f'fill="#0F1115" font-weight="600">{c["name"]}</text>'
            )
            elements.append({"id": label_id, "kind": "label", "owner": cid, "claim": f'names {cid}'})

    legend_x = width - legend_w - pad + 20.0
    legend_y = pad
    row_h = 22.0
    legend_h = 34.0 + len(category_colors) * row_h
    overlay.append(
        f'<rect data-pr-id="legend-box" x="{legend_x:.2f}" y="{legend_y:.2f}" width="{legend_w:.2f}" height="{legend_h:.2f}" '
        f'fill="#F4F1EA" stroke="#0F1115" stroke-width="1.5"/>'
    )
    elements.append(
        {
            "id": "legend-box", "kind": "decoration", "claim": "the legend panel",
            "declaredBox": {"x": round(legend_x, 2), "y": round(legend_y, 2), "width": round(legend_w, 2), "height": round(legend_h, 2)},
        }
    )
    overlay.append(
        f'<text data-pr-id="legend-title" x="{legend_x + legend_w / 2:.2f}" y="{legend_y + 18:.2f}" text-anchor="middle" '
        f'font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#0F1115">{legend_title}</text>'
    )
    elements.append({"id": "legend-title", "kind": "label", "claim": "the legend title"})
    for i, (category, fill) in enumerate(category_colors.items()):
        ry = legend_y + 30.0 + i * row_h
        swatch_id = f"legend-swatch-{i}"
        overlay.append(f'<rect data-pr-id="{swatch_id}" x="{legend_x + 10:.2f}" y="{ry:.2f}" width="16" height="14" fill="{fill}" stroke="#0F1115" stroke-width="1"/>')
        elements.append(
            {
                "id": swatch_id, "kind": "decoration", "claim": f"the legend swatch for {category}",
                "declaredBox": {"x": round(legend_x + 10, 2), "y": round(ry, 2), "width": 16.0, "height": 14.0},
            }
        )
        text_id = f"legend-label-{i}"
        overlay.append(
            f'<text data-pr-id="{text_id}" x="{legend_x + 32:.2f}" y="{ry + 10:.2f}" text-anchor="start" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="11" fill="#0F1115">{category}</text>'
        )
        elements.append({"id": text_id, "kind": "label", "claim": f"names the {category} category"})

    if misdeclare:
        elements.append({"id": "phantom-country", "kind": "feature", "claim": "a country that was never drawn"})
        for element in elements:
            if element["kind"] == "feature" and "declaredBox" in element:
                box = element["declaredBox"]
                element["declaredBox"] = {**box, "y": box["y"] + 18.0}
                break
        notes.append("misdeclare mode: bounding-box-centre labels, a phantom country id, one shifted declared box")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{bg_fill}"/>'
        f'<g data-pr-layer="countries" transform="{group_transform}">{"".join(paths)}</g>'
        f'<g data-pr-layer="overlay">{"".join(overlay)}</g>'
        f"</svg>"
    )
    return {
        "svg": svg,
        "elements": elements,
        "notes": [
            f"{len(countries)} real country boundaries (Natural Earth 1:110m), source https://www.naturalearthdata.com/",
            *notes,
        ],
    }


def render_europe(width: float, height: float, misdeclare: bool) -> dict[str, Any]:
    return _render_political_region(
        width, height, misdeclare,
        geojson_file="europe_countries.geojson", category_field="SUBREGION",
        category_colors=SUBREGION_CATEGORIES, legend_title="Europe by UN subregion", bg_fill="#DCE6F0",
    )


def render_south_america(width: float, height: float, misdeclare: bool) -> dict[str, Any]:
    return _render_political_region(
        width, height, misdeclare,
        geojson_file="south_america_countries.geojson", category_field="ECONOMY",
        category_colors=ECONOMY_CATEGORIES, legend_title="South America by economic tier",
        bg_fill="#DCE6F0", legend_w=230.0,
    )


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 720))
    height = float(request.get("height", 520))

    name = name_arg.split("=", 1)[1] if name_arg is not None else None
    if name == "campaign":
        output = render_campaign(width, height, misdeclare)
    elif name == "europe":
        output = render_europe(width, height, misdeclare)
    elif name == "south_america":
        output = render_south_america(width, height, misdeclare)
    else:
        # Default, unchanged: the original 3-region L-shape probe fixture --
        # tests/module-e2e.test.ts asserts its exact element count (6), so
        # this path is untouched rather than folded into the general case.
        output = render(width, height, misdeclare)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
