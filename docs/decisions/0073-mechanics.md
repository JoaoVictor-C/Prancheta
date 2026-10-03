# 0073 — Mechanics: pulleys and inclines, solved and drawn to scale

## Status

Accepted.

## The need

Free-body diagrams and pulley systems are standard in any Física list, and ENEM
prints them (2023 Q109: movable against fixed pulleys). Drawn by hand, a force
arrow's length says nothing, and a figure can show F as long as P while the
text says F = P/2.

## Decision

A `mechanics` preset that solves the situation first and draws the solution.

- **pulleys**:
  - n movable pulleys in series (0–3), each hung by its own rope from the
    ceiling and lifting the one below, so T_i = P/2^i and F = P/2ⁿ.
  - An optional fixed pulley redirects the pull downward.
  - The rope is traced from the wheel geometry: vertical runs tangent to each
    wheel, wrapping under a movable one and over the fixed one.
- **incline**:
  - Pₓ = P sen θ, Pᵧ = N = P cos θ.
  - With μ, the block slides when tg θ > μ, with kinetic friction μN and
    a = g(sen θ − μ cos θ). Otherwise static friction holds it, equal to Pₓ.

Every force arrow is drawn to one scale, so a length on the page IS a
magnitude; the tests compare arrow-length ratios with force ratios.

Arrows carry names only; values are reading lines. A label "P = 400 N" is
80 px wide, and measured from its centre it is farther from its arrow than the
ramp's edge is. That fails `annotation-nearest-its-owner` honestly: a reader
would hesitate too. Textbooks name the arrows and give the values in the text.
For the same reason:
- the arrow scale keeps P's and Pᵧ's tips 64 px above the ground;
- the angle's label sits where it is nearer its arc than either side of the
  angle (d < (R + d)·sen(θ/2), solved for R);
- the angle is at least 10°.

`answers: false` drops the reading lines and keeps every arrow and name.

## Consequences

- 2023 Q109 is covered. 2023 Q114 (a truck pulling by two cords) stays
  partial: the truck is a picture.
- Not built yet, and the obvious next kinds: blocks joined over a pulley on a
  table, Atwood's machine, springs. Each is a solve-then-draw kind on the same
  arrow scale.
