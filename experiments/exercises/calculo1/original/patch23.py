s = open('figs.mjs', encoding='utf-8').read()
new = r'''
// ---- S2.3: juros simples x compostos -------------------------------------------------
{
  const g = graph({ xr: [-1, 6], yr: [-200, 2800], ux: 90, uy: 0.15, sy: 200, ly: 2, lx: 1 });
  const S = (t) => 1000 * (1 + 0.2 * t);
  const C = (t) => 1000 * 1.2 ** t;
  g.curve(S, 0, 5.6, { stroke: KEY });
  g.curve(C, 0, 5.6, { stroke: ASK });
  g.line(0, 1000, 220, 0, 2, { stroke: ASK, width: 1.6, lineStyle: "dashed" });
  g.line(2, 1440, 316.8, 2, 4, { stroke: ASK, width: 1.6, lineStyle: "dashed" });
  for (const t of [0, 2, 4]) { g.dot(t, S(t), KEY); if (t > 0) g.dot(t, C(t), ASK); }
  g.text("1000", 0, 1000, [L, NW], { colour: INK, size: 12.5 });
  g.text("1400", 2, 1400, [SE, D, R], { colour: KEY, size: 12.5 });
  g.text("1800", 4, 1800, [SE, D, R], { colour: KEY, size: 12.5 });
  g.text("1440", 2, 1440, [NW, UP, L], { colour: ASK, size: 12.5 });
  g.text("2073,60", 4, 2073.6, [NW, UP, L], { colour: ASK, size: 12.5 });
  g.legend([
    ["juros simples: S(t) = 1000(1 + 0,2t)", KEY],
    ["juros compostos: C(t) = 1000·(1,2)ᵗ", ASK],
    ["secantes de C em [0, 2] e [2, 4]", ASK, true],
  ], 0.3, 2650);
  g.axisNames("t (anos)", "R$");
  figs["s2-3"] = g.f;
}
'''
s = s.replace('\nfor (const [name, fig]', new + '\nfor (const [name, fig]')
open('figs.mjs', 'w', encoding='utf-8').write(s)
