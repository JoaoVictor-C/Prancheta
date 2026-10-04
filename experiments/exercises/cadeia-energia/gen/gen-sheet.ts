import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root = "C:/Joao/Programação/ProjectHub/Prancheta/experiments/";
const fig = (f: string) => JSON.parse(readFileSync(root + "figures/" + f, "utf8"));
const v = (name: string, d: number) => ` {{= ${name} : ${d}}} `;

const params = {
  g: 9.8, Rg: 8.314, ng: 0.2, T0: 300, eta: 0.4,
  ms: 0.5, qs: 0.002, Ef: 1500, hr: 0.6, rl: 0.4, Hq: 0.6,
  Mc: 2, Nt: 25, Bf: 0.8, ls: 0.1, rho: 0.5, kmola: 300, Lb: 0.3,
  K0: "0.7*ms*g*rl + ms*g*2*rl - ms*g*hr",
  W: "K0/eta", Q: "5*W/2", dT: "W/(ng*Rg)",
  v0: "sqrt(K0/(0.7*ms))", vt: "sqrt(g*rl)",
  vb: "sqrt((K0 + ms*g*hr)/(0.7*ms))",
  Nb: "ms*(g + vb^2/rl)",
  tq: "sqrt(2*Hq/g)", ax: "qs*Ef/ms",
  xl: "vb*tq + ax*tq^2/2", vx: "vb + ax*tq", vy: "g*tq",
  Kt: "ms*(vx^2 + vy^2)/2", Kr: "ms*vb^2/5", Kb: "Kt + Kr",
  Vc: "ms*vx/(ms + Mc)", Ka: "(ms + Mc)*Vc^2/2", perda: "1 - Ka/Kb",
  fem: "Nt*Bf*ls*Vc", Ic: "fem/rho", Fm: "Nt*Bf*Ic*ls",
  bk: "Nt^2*Bf^2*ls^2/rho", Jb: "bk*ls", pc: "(ms + Mc)*Vc",
  V1: "Vc - 2*Jb/(ms + Mc)", p1: "(ms + Mc)*V1",
  xm: "V1*sqrt((ms + Mc)/kmola)", tc: "pi*sqrt((ms + Mc)/kmola)",
  dfora: "(p1 - Jb)/bk",
};

const sheet = {
  name: "cadeia-energia",
  title: "Física — Uma cadeia de energia",
  subtitle: "Do gás à mola: termodinâmica, rolamento, eletrostática, colisão, indução e oscilações num só sistema",
  locale: "pt-BR",
  footer: "Física · Cadeia de energia",
  contentsNote: "<p style=\"margin:4pt 0 0\">Todos os números do enunciado, da figura e do gabarito vêm dos mesmos parâmetros. Use \\(g = " + v("g", 1) + "\\ \\text{m/s}^2\\) e \\(R = " + v("Rg", 3) + "\\ \\text{J}\\,\\text{mol}^{-1}\\,\\text{K}^{-1}\\).</p>",
  params,
  sections: [
    {
      title: "A montagem",
      exercises: [
        {
          id: "1",
          level: "mid",
          statement:
            "<p>Um gás ideal monoatômico (\\(n = " + v("ng", 1) + "\\) mol, \\(T_0 = " + v("T0", 0) + "\\) K) é aquecido lentamente a pressão constante e empurra um pistão de massa desprezível. O pistão lança uma esfera maciça (\\(m = " + v("ms", 1) + "\\) kg, raio \\(a\\) desprezível frente às outras medidas, carga \\(q = +" + v("qs*1000", 0) + "\\) mC), que já sai rolando sem deslizar. Ela desce uma rampa de altura \\(h = " + v("hr", 1) + "\\) m até o trilho e percorre um loop vertical de raio \\(r = " + v("rl", 1) + "\\) m.</p>" +
            "<p>Depois do loop, o trilho termina numa borda. A esfera cai \\(" + v("Hq", 1) + "\\) m entre duas placas verticais, num campo uniforme \\(E = " + v("Ef", 0) + "\\) N/C que aponta no sentido do movimento, e cai dentro de um carrinho (\\(M = " + v("Mc", 0) + "\\) kg) em repouso num piso sem atrito, onde fica presa.</p>" +
            "<p>O carrinho leva uma bobina quadrada (\\(N = " + v("Nt", 0) + "\\) espiras, lado \\(\\ell = " + v("ls", 1) + "\\) m, resistência total \\(\\rho = " + v("rho", 1) + "\\ \\Omega\\)). Ela atravessa uma região de largura \\(" + v("Lb", 1) + "\\) m com \\(B = " + v("Bf", 1) + "\\) T entrando na página. Depois, o carrinho bate numa mola de \\(k = " + v("kmola", 0) + "\\) N/m.</p>{{figure}}" +
            "<p><b>Termodinâmica.</b> O pistão converte \\(" + v("eta*100", 0) + "\\%\\) do trabalho do gás em energia cinética da esfera. Qual é o menor calor \\(Q\\) que faz a esfera passar pelo topo do loop?</p>",
          figure: { spec: fig("cadeia-energia-print.json"), caption: "A montagem, em escala. Os números são os do enunciado." },
          answer: "\\(Q \\approx " + v("Q", 1) + "\\) J",
          solution:
            "<p>No topo, o mínimo é a normal nula: \\(mg = mv_t^2/r\\), então \\(v_t^2 = gr\\). Rolando sem deslizar, a energia cinética total é \\(\\tfrac{7}{10}mv^2\\). Do lançamento (altura \\(h\\) acima do trilho) ao topo (altura \\(2r\\)):</p>" +
            "$$K_0 = \\tfrac{7}{10}m\\,gr + mg\\,2r - mgh = " + v("K0", 2) + "\\ \\text{J}.$$" +
            "<p>Esse valor é \\(" + v("eta*100", 0) + "\\%\\) do trabalho do gás: \\(W = K_0/" + v("eta", 1) + " = " + v("W", 2) + "\\) J. A pressão constante, num gás monoatômico, \\(W = nR\\,\\Delta T\\) e \\(Q = \\tfrac{5}{2}nR\\,\\Delta T = \\tfrac{5}{2}W\\):</p>" +
            "$$Q = \\tfrac{5}{2}\\cdot " + v("W", 2) + " \\approx " + v("Q", 1) + "\\ \\text{J}\\qquad(\\Delta T \\approx " + v("dT", 2) + "\\ \\text{K}).$$" +
            "<p>Repare: se \\(h\\) fosse maior que \\(2{,}7\\,r = " + v("2.7*rl", 2) + "\\) m, a esfera passaria pelo loop sem lançamento algum e \\(Q\\) seria zero.</p>",
        },
        {
          id: "2",
          level: "mid",
          statement: "<p><b>Rolamento e movimento circular.</b> Com o \\(Q\\) do exercício 1, qual é a força normal sobre a esfera no ponto mais baixo do loop? E no topo?</p>",
          answer: "\\(N_{\\text{baixo}} = \\tfrac{34}{7}mg \\approx " + v("Nb", 1) + "\\) N; \\(N_{\\text{topo}} = 0\\)",
          solution:
            "<p>No topo, \\(N = 0\\) por construção. Do topo ao ponto mais baixo, a esfera desce \\(2r\\):</p>" +
            "$$\\tfrac{7}{10}mv_b^2 = \\tfrac{7}{10}m\\,gr + mg\\,2r \\;\\Rightarrow\\; v_b^2 = \\tfrac{27}{7}gr,\\quad v_b \\approx " + v("vb", 2) + "\\ \\text{m/s}.$$" +
            "$$N_b = m\\Big(g + \\frac{v_b^2}{r}\\Big) = mg\\Big(1 + \\frac{27}{7}\\Big) = \\frac{34}{7}mg \\approx " + v("Nb", 1) + "\\ \\text{N}.$$" +
            "<p>É o análogo do clássico \\(6mg\\) de um bloco que desliza: parte da energia está na rotação, então a esfera passa mais devagar.</p>",
        },
      ],
    },
    {
      title: "A queda e o carrinho",
      exercises: [
        {
          id: "3",
          level: "mid",
          statement: "<p><b>Projétil e eletrostática.</b> A esfera sai da borda com a velocidade do trilho e cai entre as placas. A que distância horizontal da borda ela cai no carrinho? Despreze efeitos da rotação no voo.</p>",
          answer: "\\(x \\approx " + v("xl", 2) + "\\) m",
          solution:
            "<p>Na vertical, só a gravidade: \\(t = \\sqrt{2H/g} \\approx " + v("tq", 3) + "\\) s. Na horizontal, a força elétrica dá \\(a_x = qE/m = " + v("ax", 0) + "\\ \\text{m/s}^2\\), no sentido do movimento:</p>" +
            "$$x = v_b\\,t + \\tfrac{1}{2}a_x t^2 = " + v("vb", 2) + "\\cdot " + v("tq", 3) + " + \\tfrac{1}{2}\\cdot " + v("ax", 0) + "\\cdot " + v("tq", 3) + "^2 \\approx " + v("xl", 2) + "\\ \\text{m}.$$" +
            "<p>Ao chegar: \\(v_x \\approx " + v("vx", 2) + "\\) m/s e \\(v_y \\approx " + v("vy", 2) + "\\) m/s.</p>{{figure}}",
          solutionFigure: { spec: fig("cadeia-energia-resolucao-print.json"), caption: "A trajetória calculada e o ponto de queda." },
        },
        {
          id: "4",
          level: "mid",
          statement: "<p><b>Colisão.</b> A esfera fica presa no carrinho. Qual é a velocidade do carrinho logo depois, e que fração da energia cinética se perde? Não esqueça a energia de rotação.</p>",
          answer: "\\(V \\approx " + v("Vc", 2) + "\\) m/s; perde-se \\(\\approx " + v("perda*100", 1) + "\\%\\)",
          solution:
            "<p>O piso não tem atrito, então só o momento horizontal se conserva (o impulso vertical vem do piso):</p>" +
            "$$V = \\frac{m\\,v_x}{m + M} = \\frac{" + v("ms", 1) + "\\cdot " + v("vx", 2) + "}{" + v("ms + Mc", 1) + "} \\approx " + v("Vc", 2) + "\\ \\text{m/s}.$$" +
            "<p>Antes, há translação \\(\\tfrac12 m(v_x^2 + v_y^2) \\approx " + v("Kt", 2) + "\\) J e rotação \\(\\tfrac15 m v_b^2 \\approx " + v("Kr", 2) + "\\) J (o giro não muda no voo), num total de \\(" + v("Kb", 2) + "\\) J. Depois, \\(\\tfrac12(m + M)V^2 \\approx " + v("Ka", 2) + "\\) J:</p>" +
            "$$1 - \\frac{" + v("Ka", 2) + "}{" + v("Kb", 2) + "} \\approx " + v("perda*100", 1) + "\\%.$$",
        },
        {
          id: "5",
          level: "hard",
          statement: "<p><b>Indução.</b> Ao entrar na região de campo, quais são a fem máxima, a corrente e a força de frenagem sobre a bobina? Use o impulso \\(\\int F\\,dt = N^2B^2\\ell^3/\\rho\\) por borda atravessada para obter a velocidade depois de a bobina sair inteira do campo.</p>",
          answer: "\\(\\varepsilon \\approx " + v("fem", 2) + "\\) V, \\(I \\approx " + v("Ic", 2) + "\\) A, \\(F \\approx " + v("Fm", 2) + "\\) N; depois \\(V' \\approx " + v("V1", 2) + "\\) m/s",
          solution:
            "<p>Só a borda dianteira está no campo: \\(\\varepsilon = NB\\ell V \\approx " + v("fem", 2) + "\\) V, \\(I = \\varepsilon/\\rho \\approx " + v("Ic", 2) + "\\) A e \\(F = NBI\\ell = \\dfrac{N^2B^2\\ell^2}{\\rho}V \\approx " + v("Fm", 2) + "\\) N, contra o movimento.</p>" +
            "<p>Como \\(F\\,dt = \\dfrac{N^2B^2\\ell^2}{\\rho}\\,dx\\), o momento cai linearmente com a distância: atravessar uma borda (\\(\\ell\\)) custa exatamente \\(J = N^2B^2\\ell^3/\\rho = " + v("Jb", 2) + "\\) N·s, sem aproximação. Com a bobina inteira dentro, o fluxo não varia e não há força. Entrar e sair custa \\(2J\\):</p>" +
            "$$V' = V - \\frac{2J}{m + M} = " + v("Vc", 2) + " - \\frac{" + v("2*Jb", 1) + "}{" + v("ms + Mc", 1) + "} \\approx " + v("V1", 2) + "\\ \\text{m/s}.$$" +
            "<p>Isso só funciona porque o momento \\((m + M)V \\approx " + v("pc", 2) + "\\) N·s é maior que \\(2J\\).</p>",
        },
        {
          id: "6",
          level: "hard",
          statement: "<p><b>Oscilações.</b> Qual é a compressão máxima da mola e quanto tempo dura o contato? Na volta, o carrinho atravessa de novo a região de campo? Com que velocidade final?</p>",
          answer: "\\(x_{\\max} \\approx " + v("xm*100", 1) + "\\) cm, \\(t \\approx " + v("tc", 3) + "\\) s; não atravessa: para com \\(" + v("dfora*100", 1) + "\\) cm da bobina fora do campo, velocidade final \\(0\\)",
          solution:
            "<p>Sem atrito, a energia cinética vira elástica: \\(x_{\\max} = V'\\sqrt{(m + M)/k} \\approx " + v("xm*100", 1) + "\\) cm. O contato é meio período: \\(t = \\pi\\sqrt{(m + M)/k} \\approx " + v("tc", 3) + "\\) s. O carrinho volta com a mesma velocidade, \\(" + v("V1", 2) + "\\) m/s.</p>" +
            "<p>Na volta ele leva \\((m + M)V' \\approx " + v("p1", 2) + "\\) N·s, menos que os \\(2J = " + v("2*Jb", 1) + "\\) N·s para atravessar. Ele entra inteiro (\\(J\\)) e para enquanto sai, depois de avançar:</p>" +
            "$$d = \\frac{(m + M)V' - J}{N^2B^2\\ell^2/\\rho} = \\frac{" + v("p1 - Jb", 3) + "}{" + v("bk", 0) + "} \\approx " + v("dfora*100", 1) + "\\ \\text{cm}.$$" +
            "<p>A velocidade final é zero, com a bobina parada sobre a borda do campo: \\(" + v("dfora*100", 1) + "\\) cm fora, \\(" + v("(ls - dfora)*100", 1) + "\\) cm dentro. Essa é a última parte da energia que se converte em calor no resistor.</p>",
        },
      ],
    },
  ],
};
mkdirSync(root + "exercises/cadeia-energia", { recursive: true });
writeFileSync(root + "exercises/cadeia-energia/lista.json", JSON.stringify(sheet, null, 2));
