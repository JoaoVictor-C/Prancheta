s = open('figs.mjs', encoding='utf-8').read()
s = s.replace('''    axisNames() {
      g.ticks();
      const ex = p.at(xr[1], 0);
      f.place("x",''', '''    axisNames(xn = "x", yn = "y") {
      g.ticks();
      const ex = p.at(xr[1], 0);
      f.place(xn,''')
s = s.replace('''f.place("y", ey.x''', '''f.place(yn, ey.x''')
new = '''
// ---- S5.4: posição, velocidade e aceleração ------------------------------------------
{
  const g = graph({ xr: [-0.5, 4.5], yr: [-13, 13], ux: 120, uy: 17, sy: 2, ly: 2, lx: 1 });
  g.curve((t) => t ** 3 - 6 * t * t + 9 * t, 0, 4.3, { stroke: KEY });
  g.curve((t) => 3 * t * t - 12 * t + 9, 0, 4.3, { stroke: ASK });
  g.curve((t) => 6 * t - 12, 0, 4.3, { stroke: WARM });
  g.dot(1, 0, ASK);
  g.dot(3, 0, ASK);
  g.dot(2, 0, WARM);
  g.dot(1, 4, KEY);
  g.dot(3, 0.001, KEY);
  g.legend([
    ["s(t) = t³ − 6t² + 9t   (posição)", KEY],
    ["v(t) = s′(t) = 3t² − 12t + 9", ASK],
    ["a(t) = s″(t) = 6t − 12", WARM],
  ], 1.35, -6.2);
  g.axisNames("t", "");
  figs["s5-4"] = g.f;
}
'''
s = s.replace('for (const [name, fig]', new + '\nfor (const [name, fig]')
open('figs.mjs', 'w', encoding='utf-8').write(s)
