"""Skew-T log-P figure module for Prancheta.

The genuinely skewed coordinate system a meteorological sounding is plotted
on: isotherms drawn at roughly 45 degrees, pressure on a log scale, so that a
dry-adiabatic ascent traces a recognisable curve rather than a meaningless
one. See docs/research/candidate-modules.md, candidate #7.

Why a module rather than a preset: the core's IR has no notion of a skewed
axis, and no atmospheric thermodynamics. This module owns the transform
(a straight algebraic definition, computed once and applied everywhere) and
borrows the physics from MetPy: dry_lapse for the dry adiabats,
parcel_profile for a lifted surface parcel's full dry+moist ascent, and lcl
for the lifting condensation level. Getting parcel_profile right by hand
would mean re-implementing a moist-adiabatic ODE integration -- exactly the
"geometry/physics the core cannot compute" decision 0005 exists for.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.

The named sounding below is an ILLUSTRATIVE mid-latitude summer-afternoon
profile, not observed data from any real station or date.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any

import numpy as np
from metpy.calc import dry_lapse, lcl, parcel_profile
from metpy.units import units

P_TOP, P_BOTTOM = 100.0, 1000.0
T_MIN, T_MAX = -40.0, 40.0
SKEW_K = 22.0  # degC per log-decade of pressure; tilts isotherms toward 45 degrees
P_REF = 1000.0

TEMP_COLOUR = "#E76F51"
DEWPOINT_COLOUR = "#5B8DEF"
PARCEL_COLOUR = "#E9C46A"
ADIABAT_COLOUR = "#3D4757"
GRID_COLOUR = "#262C38"
LCL_COLOUR = "#48A9A6"
TICK_COLOUR = "#9AA4B2"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "midlatitude_summer": {
        # Illustrative: a plausible mid-latitude summer-afternoon sounding
        # shape, not observed data from any real station or date.
        "pressure": [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100],
        "temperature": [28, 22, 17, 6, -12, -25, -40, -50, -56, -58, -56],
        "dewpoint": [22, 17, 10, -4, -22, -35, -48, -58, -64, -68, -70],
    },
    "unstable_afternoon": {
        # Illustrative: a steeper low-level lapse rate, giving a taller,
        # more obviously bent parcel-profile curve for the same reason.
        "pressure": [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100],
        "temperature": [33, 24, 16, 2, -16, -29, -43, -52, -57, -58, -55],
        "dewpoint": [24, 19, 13, -2, -20, -34, -49, -59, -65, -69, -70],
    },
}


def y_of_p(p: float) -> float:
    """0 (top, P_TOP) .. 1 (bottom, P_BOTTOM), linear in log(P)."""
    return (math.log(p) - math.log(P_TOP)) / (math.log(P_BOTTOM) - math.log(P_TOP))


def x_of_t_skewed(t: float, p: float) -> float:
    """Temperature shifted by the skew term -- the whole point of a Skew-T."""
    return t + SKEW_K * (math.log(P_REF) - math.log(p))


def render(width: float, height: float, pressure: list[float], temperature: list[float], dewpoint: list[float]) -> dict[str, Any]:
    if not (len(pressure) == len(temperature) == len(dewpoint)) or len(pressure) < 2:
        raise ValueError("pressure, temperature and dewpoint must be equal-length lists of at least 2 levels")

    left, right, top, bottom = 60.0, 30.0, 24.0, 40.0
    plot_w, plot_h = width - left - right, height - top - bottom

    t_skew_min = x_of_t_skewed(T_MIN, P_BOTTOM)
    t_skew_max = x_of_t_skewed(T_MAX, P_TOP)

    def canvas(t: float, p: float) -> tuple[float, float]:
        xs = x_of_t_skewed(t, p)
        cx = left + (xs - t_skew_min) / (t_skew_max - t_skew_min) * plot_w
        cy = top + y_of_p(p) * plot_h
        return cx, cy

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    # --- isobars (horizontal) and isotherms (skewed diagonal) --------------
    for p in (1000, 850, 700, 500, 400, 300, 200, 100):
        cy = top + y_of_p(p) * plot_h
        parts.append(f'<line x1="{left:.2f}" y1="{cy:.2f}" x2="{left + plot_w:.2f}" y2="{cy:.2f}" stroke="{GRID_COLOUR}" stroke-width="1"/>')
        tick_id = f"isobar-{p}"
        parts.append(
            f'<text data-pr-id="{tick_id}" x="{left - 8:.2f}" y="{cy:.2f}" text-anchor="end" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="10" fill="{TICK_COLOUR}">{p}</text>'
        )
        elements.append({"id": tick_id, "kind": "label", "claim": f"the {p} hPa isobar"})
    for t in range(-80, 41, 10):
        x0, y0 = canvas(t, P_BOTTOM)
        x1, y1 = canvas(t, P_TOP)
        if x1 < left - 40 or x0 > left + plot_w + 40:
            continue
        parts.append(f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="{GRID_COLOUR}" stroke-width="1"/>')
        if T_MIN <= t <= T_MAX:
            tick_id = f"isotherm-{t}"
            parts.append(
                # +22, not +14: at +14 the bottom-left isotherm tick's box
                # overlapped the 1000 hPa isobar tick sitting right at the
                # same corner -- module-labels-do-not-collide caught it on
                # the first honest render.
                f'<text data-pr-id="{tick_id}" x="{x0:.2f}" y="{top + plot_h + 22:.2f}" text-anchor="middle" '
                f'font-family="Segoe UI, sans-serif" font-size="10" fill="{TICK_COLOUR}">{t}°</text>'
            )
            elements.append({"id": tick_id, "kind": "label", "claim": f"the {t}°C isotherm"})

    # --- dry adiabats, from real dry_lapse ascent, not hand-drawn curves ----
    p_levels = np.linspace(P_BOTTOM, P_TOP, 40) * units.hPa
    for i, theta_start in enumerate((-20, 0, 20, 40)):
        temps = dry_lapse(p_levels, (theta_start + 273.15) * units.kelvin).to("degC").magnitude
        pts = [canvas(float(t), float(p)) for t, p in zip(temps, p_levels.magnitude)]
        # Clipped to the plot area itself, not a margin around it: a dry
        # adiabat's low-pressure end can bend well outside the temperature
        # range, and a generous +-60px tolerance here let its dashed stroke
        # stray into the left-edge isobar tick labels' own space --
        # module-labels-clear-of-strokes caught "isobar-400 sits on
        # dry-adiabat-1" on the first honest render.
        pts = [(x, y) for x, y in pts if left <= x <= left + plot_w]
        if len(pts) < 2:
            continue
        aid = f"dry-adiabat-{i}"
        d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
        parts.append(f'<path data-pr-id="{aid}" d="{d}" stroke="{ADIABAT_COLOUR}" stroke-width="1.2" fill="none" stroke-dasharray="4 3"/>')
        xs, ys = zip(*pts)
        elements.append(
            {
                "id": aid,
                "kind": "decoration",
                "claim": f"a dry adiabat from {theta_start}°C at {P_BOTTOM:.0f} hPa",
                "declaredBox": {
                    "x": round(min(xs), 2), "y": round(min(ys), 2),
                    "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2),
                },
            }
        )

    # --- the environmental sounding: temperature and dewpoint traces -------
    def trace(tid: str, values: list[float], colour: str, claim: str) -> None:
        pts = [canvas(v, p) for v, p in zip(values, pressure)]
        d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
        parts.append(f'<path data-pr-id="{tid}" d="{d}" stroke="{colour}" stroke-width="2.5" fill="none"/>')
        xs, ys = zip(*pts)
        elements.append(
            {
                "id": tid,
                "kind": "feature",
                "claim": claim,
                "declaredBox": {
                    "x": round(min(xs), 2), "y": round(min(ys), 2),
                    "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2),
                },
            }
        )

    trace("temperature-trace", temperature, TEMP_COLOUR, "the environmental temperature profile")
    trace("dewpoint-trace", dewpoint, DEWPOINT_COLOUR, "the environmental dewpoint profile")

    # --- a lifted surface parcel: real dry+moist ascent, and its LCL -------
    p_arr = np.array(pressure) * units.hPa
    t_arr = np.array(temperature) * units.degC
    td_arr = np.array(dewpoint) * units.degC
    profile = parcel_profile(p_arr, t_arr[0], td_arr[0]).to("degC").magnitude
    pts = [canvas(float(t), float(p)) for t, p in zip(profile, pressure)]
    d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
    parts.append(f'<path data-pr-id="parcel-profile" d="{d}" stroke="{PARCEL_COLOUR}" stroke-width="2" stroke-dasharray="6 4" fill="none"/>')
    xs, ys = zip(*pts)
    elements.append(
        {
            "id": "parcel-profile",
            "kind": "feature",
            "claim": "the lifted surface parcel's dry+moist adiabatic ascent (metpy.calc.parcel_profile)",
            "declaredBox": {
                "x": round(min(xs), 2), "y": round(min(ys), 2),
                "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2),
            },
        }
    )

    lcl_p, lcl_t = lcl(p_arr[0], t_arr[0], td_arr[0])
    lcl_cx, lcl_cy = canvas(float(lcl_t.to("degC").magnitude), float(lcl_p.magnitude))
    r = 5.0
    parts.append(f'<circle data-pr-id="lcl-marker" cx="{lcl_cx:.2f}" cy="{lcl_cy:.2f}" r="{r:.1f}" fill="{BG}" stroke="{LCL_COLOUR}" stroke-width="2.5"/>')
    elements.append(
        {
            "id": "lcl-marker",
            "kind": "feature",
            "claim": f"the lifting condensation level, {lcl_p.magnitude:.0f} hPa / {lcl_t.to('degC').magnitude:.1f}°C (metpy.calc.lcl)",
            "declaredBox": {"x": round(lcl_cx - r, 2), "y": round(lcl_cy - r, 2), "width": round(2 * r, 2), "height": round(2 * r, 2)},
        }
    )
    # Offset diagonally, not just sideways: the LCL sits ON the parcel-profile
    # curve by definition (that curve's kink IS the LCL), and the temperature
    # trace passes close by too. A purely horizontal +10px offset still
    # crossed both -- module-labels-clear-of-strokes caught "lcl-label sits
    # on temperature-trace, parcel-profile" on the first honest render. Also
    # no owner: the label sits BESIDE the small marker circle, not inside its
    # own fill, so it was never a real containment claim to begin with.
    parts.append(
        f'<text data-pr-id="lcl-label" x="{lcl_cx + 26:.2f}" y="{lcl_cy - 26:.2f}" text-anchor="start" '
        f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="11" font-weight="600" fill="{LCL_COLOUR}">LCL</text>'
    )
    elements.append({"id": "lcl-label", "kind": "label", "claim": "names the LCL marker"})

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {
        "svg": svg,
        "elements": elements,
        "notes": [f"LCL at {lcl_p.magnitude:.0f} hPa / {lcl_t.to('degC').magnitude:.1f}°C"],
    }


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "trace-phantom", "kind": "feature", "claim": "a trace that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "x": box["x"] + 30.0}
            break
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom trace declared, and one real trace's own geometry shifted 30px from what it drew"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)

    if name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        spec = NAMED[key]
    else:
        spec = NAMED["midlatitude_summer"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 640))
    height = float(request.get("height", 640))

    output = render(width, height, spec["pressure"], spec["temperature"], spec["dewpoint"])
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
