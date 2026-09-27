"""One-off: convert the hand-edited original/lista.html into lista.json, the
structured sheet the `sheet` command builds from.

Kept beside its output so the conversion can be audited: every figure is
taken from fixtures/function-graph (the same data the tests render), every
answer from the answer key (the worked solutions' own answer lines were a
second copy and are dropped), and the coordinates the text cites about a
figure's points become placeholders resolved from that figure.

usage: python experiments/exercises/calculo1/convert.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[2]
html = (HERE / "original" / "lista.html").read_text(encoding="utf8")

LEVEL = {"easy": "easy", "mid": "mid", "hard": "hard"}


def between(text: str, start: str, end: str) -> str:
    i = text.index(start) + len(start)
    return text[i:text.index(end, i)]


def figure(name: str, caption: str) -> dict:
    data = json.loads((REPO / "fixtures" / "function-graph" / f"calc1-{name}.json").read_text(encoding="utf8"))
    data.pop("preset")
    return {"graph": data, "caption": caption}


FIG = re.compile(r'<figure><img src="render/([\w-]+)\.svg"><figcaption>(.*?)</figcaption></figure>', re.S)


def take_figure(body: str) -> tuple[str, dict | None]:
    m = FIG.search(body)
    if m is None:
        return body, None
    return body[: m.start()] + "{{figure}}" + body[m.end():], figure(m.group(1), m.group(2))


cover_html = between(html, '<section class="cover">', "</section>")
part1, gab, part2 = re.findall(r'<section class="part">(.*?)</section>', html, re.S)

sheet: dict = {
    "name": "calculo1",
    "title": re.search(r"<h1>(.*?)</h1>", cover_html).group(1),
    "subtitle": re.search(r'<p class="sub">(.*?)</p>', cover_html).group(1),
    "locale": "pt-BR",
    "footer": "Cálculo 1 · Lista de exercícios",
    "contentsNote": re.search(r'(<p style="margin:4pt 0 0">.*?</p>)', cover_html, re.S).group(1),
    "cover": [re.search(r'<div class="box">(.*?)</div>\s*$', cover_html, re.S).group(1).strip()],
    "exercisesLead": re.search(r'<p class="lead">(.*?)</p>', part1, re.S).group(1),
    "answersLead": re.search(r'<p class="lead">(.*?)</p>', gab, re.S).group(1),
    "solutionsLead": re.search(r'<p class="lead">(.*?)</p>', part2, re.S).group(1),
    "sections": [],
}

answers = dict(re.findall(r"<tr><td>([\d.]+)</td><td>(.*?)</td></tr>", gab))

Q = re.compile(
    r'<div class="q (\w+)"><div class="qh">([\d.]+) <span class="tag \w+">[^<]*</span>'
    r'(?: <span[^>]*>(.*?)</span>)?</div>\n(.*?)\n</div>\n',
    re.S,
)
for block in re.split(r"\n<h2>", part1)[1:]:
    title, rest = block.split("</h2>", 1)
    lead = re.match(r'\s*<p class="lead">(.*?)</p>', rest, re.S)
    section: dict = {"title": title}
    if lead:
        section["lead"] = lead.group(1).strip()
    section["exercises"] = []
    for level, qid, note, body in Q.findall(rest):
        body, fig = take_figure(body.strip())
        exercise: dict = {"id": qid, "level": LEVEL[level]}
        if note:
            exercise["note"] = note
        exercise["statement"] = body
        if fig:
            exercise["figure"] = fig
        exercise["answer"] = answers[qid]
        section["exercises"].append(exercise)
    sheet["sections"].append(section)

SOL = re.compile(
    r'<div class="sol"><div class="qh">([\d.]+)(?: [^<]*)?</div>\n(.*?)\n\s*<span class="ans">.*?</span>\n</div>',
    re.S,
)
blocks = re.split(r"\n<h2>", part2)[1:]
by_id = {e["id"]: e for s in sheet["sections"] for e in s["exercises"]}
for i, block in enumerate(blocks):
    title, rest = block.split("</h2>", 1)
    section = sheet["sections"][i]
    if title != section["title"]:
        section["solutionsTitle"] = title
    intro = re.match(r'\s*<div class="box">\n?(.*?)\n?</div>', rest, re.S)
    if intro:
        section["solutionsIntro"] = intro.group(1).strip()
    for qid, body in SOL.findall(rest):
        body, fig = take_figure(body.strip())
        by_id[qid]["solution"] = body
        if fig:
            by_id[qid]["solutionFigure"] = fig
closing = re.search(r'<div class="box">\n?(<b>Resumo final\.</b>.*?)\n?</div>', part2, re.S)
sheet["closing"] = closing.group(1).strip()

# The coordinates the text cites about a figure's own points, computed from
# that figure instead of typed a second time.
def sub(qid: str, field: str, old: str, new: str) -> None:
    target = by_id[qid]
    path = field.split(".")
    holder = target
    for key in path[:-1]:
        holder = holder[key]
    assert old in holder[path[-1]], (qid, field, old)
    holder[path[-1]] = holder[path[-1]].replace(old, new)


sub("2.5", "statement", r"P=(2;\,5)", "P={{fig.P}}")
sub("3.2", "statement", r"P(3;\,9)", "P{{fig.P}}")
sub("1.3", "solutionFigure.caption", r"\((4;\,8)\)", r"\({{sol.buraco}}\)")
sub("1.6", "solutionFigure.caption", r"\left(2;\,\frac{17}{3}\right)", "{{sol.encontro}}")
sub("3.3", "solutionFigure.caption", r"\((1;\,-2)\)", r"\({{sol.P}}\)")
sub("3.6", "answer", r"\((2;\,8)\)", r"\({{sol.P}}\)")
sub("3.6", "answer", r"\((-2;\,-8)\)", r"\({{sol.Q}}\)")
sub("4.4", "solutionFigure.caption", r"\((2;\,2)\)", r"\({{sol.P}}\)")
sub("4.5", "solutionFigure.caption", r"\((1;\,5)\)", r"\({{sol.max}}\)")
sub("4.5", "solutionFigure.caption", r"\((3;\,1)\)", r"\({{sol.min}}\)")
sub("4.5", "answer", r"\((1;\,5)\)", r"\({{sol.max}}\)")
sub("4.5", "answer", r"\((3;\,1)\)", r"\({{sol.min}}\)")
sub("4.6", "solutionFigure.caption", r"\((1;\,2)\)", r"\({{sol.P}}\)")

count = sum(len(s["exercises"]) for s in sheet["sections"])
figs = sum(("figure" in e) + ("solutionFigure" in e) for s in sheet["sections"] for e in s["exercises"])
(HERE / "lista.json").write_text(json.dumps(sheet, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(f"{count} exercises, {figs} figures, {len(answers)} answers -> lista.json")
