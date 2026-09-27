p = "lista.html"
s = open(p, encoding="utf-8").read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (old[:80], n)
    s = s.replace(old, new)


# J: fórmulas inline não quebram no meio
rep(r'''  .katex { font-size: 1.06em; }''', r'''  .katex { font-size: 1.06em; white-space: nowrap; }''')
rep(r'''<td>\(a^2-b^2=(a-b)(a+b),\quad a^3-b^3=(a-b)(a^2+ab+b^2)\)</td>''',
    r'''<td>\(a^2-b^2=(a-b)(a+b)\)<br>\(a^3-b^3=(a-b)(a^2+ab+b^2)\)</td>''')

# A: pares ordenados com ';'
rep(r'''Nas figuras, os pontos fechados (●) pertencem ao gráfico e as bolinhas abertas (○) não pertencem.</p>''',
    r'''Nas figuras, os pontos fechados (●) pertencem ao gráfico e as bolinhas abertas (○) não pertencem. Como a vírgula já é usada nos números decimais (0,5), as coordenadas de um ponto são separadas por ponto e vírgula: \((2;\,5)\) é o ponto com \(x=2\) e \(y=5\).</p>''')
pairs = [
    (r"\(P=(2,\,5)\)", r"\(P=(2;\,5)\)"),
    (r"\(P(3,9)\)", r"\(P(3;\,9)\)", 2),
    (r"\((2,8)\) e \((-2,-8)\)", r"\((2;\,8)\) e \((-2;\,-8)\)"),
    (r"\((1,5)\) e \((3,1)\)", r"\((1;\,5)\) e \((3;\,1)\)", 2),
    (r'com um "buraco" em \((4,8)\)', r'com um "buraco" em \((4;\,8)\)'),
    (r"\(\left(2,\frac{17}{3}\right)\)", r"\(\left(2;\,\frac{17}{3}\right)\)"),
    (r"\((a,f(a))\) e \((b,f(b))\)", r"\((a;\,f(a))\) e \((b;\,f(b))\)"),
    (r"toca a parábola em \((1,-2)\)", r"toca a parábola em \((1;\,-2)\)"),
    (r"dando \((2,8)\), e \(f(-2)=-8\), dando \((-2,-8)\).", r"dando \((2;\,8)\), e \(f(-2)=-8\), dando \((-2;\,-8)\)."),
    ("pontos (2, 8) e (−2, −8)", "pontos (2; 8) e (−2; −8)"),
    (r"o ponto é \((2,\,f(2))\)", r"o ponto é \((2;\,f(2))\)"),
    (r"(x_0,y_0)=(2,\,2)", r"(x_0;\,y_0)=(2;\,2)"),
    (r"<figcaption>A tangente em \((2,2)\)", r"<figcaption>A tangente em \((2;\,2)\)"),
    (r"Em \((1,5)\) o gráfico", r"Em \((1;\,5)\) o gráfico"),
    (r"Em \((3,1)\) ele para", r"Em \((3;\,1)\) ele para"),
    ('<span class="ans">(1, 5) e (3, 1)</span>', '<span class="ans">(1; 5) e (3; 1)</span>'),
    (r"toca \(y=x^2+x\) em \((1,2)\)", r"toca \(y=x^2+x\) em \((1;\,2)\)"),
]
for t in pairs:
    rep(*t)

# 1.3: 0/0 só implica fator comum porque são polinômios
rep(r'''Isso é uma <b>indeterminação</b>, e não significa que o limite não existe. Significa que o numerador e o denominador têm um fator comum \((x-4)\) escondido.</p>''',
    r'''Isso é uma <b>indeterminação</b>: não diz que o limite não existe, só que a expressão precisa ser reescrita antes. Aqui numerador e denominador são polinômios que valem 0 em \(x=4\), e um polinômio que vale 0 em \(x=4\) tem o fator \((x-4)\). Então os dois têm esse fator escondido.</p>''')

# 2.3c: duas TMVs iguais não provam que é reta
rep(r'''Uma função que tem a mesma TMV em qualquer intervalo é uma <b>reta</b>, ou seja, cresce sempre no mesmo ritmo. Isso bate com a fórmula: \(S(t)=1000+200t\) é uma função do 1º grau, e 200 é a inclinação dela.</p>''',
    r'''Isso combina com uma <b>reta</b>, mas dois intervalos sozinhos não provam: quem confirma é a fórmula. \(S(t)=1000+200t\) é uma função do 1º grau, com inclinação 200, então a TMV é 200 em <b>qualquer</b> intervalo, e \(S\) cresce sempre no mesmo ritmo.</p>''')

# 2.4: legenda que não depende de cor
rep(r'''<figcaption>Figura 2.4: as secantes AB (laranja) e BC (verde).</figcaption>''',
    r'''<figcaption>Figura 2.4: as secantes AB e BC.</figcaption>''')

# 2.6: por que pode cancelar
rep(r'''  <p>Comparando os denominadores: \(3+\sqrt a=5\), então \(\sqrt a=2\) e \(a=4\).</p>''',
    r'''  <p>Podemos cancelar \(3-\sqrt a\) porque ele não é zero: como \(a<9\), temos \(\sqrt a<3\). Agora as duas frações têm numerador 1, então os denominadores são iguais: \(3+\sqrt a=5\), logo \(\sqrt a=2\) e \(a=4\).</p>''')

# tema 3: definição em destaque
rep(r'''<p class="lead">Em todos os exercícios deste tema, use a definição \(f'(x) = \lim_{h\to 0}\frac{f(x+h)-f(x)}{h}\), e não as regras de derivação.</p>''',
    r'''<p class="lead">Em todos os exercícios deste tema, use a definição
  $$f'(x) = \lim_{h\to 0}\frac{f(x+h)-f(x)}{h}$$
  e não as regras de derivação.</p>''')

# 3.3: o ponto é um par, não a altura
rep(r'''o ponto é \(f(1)=1-4+1=-2\) e a inclinação é''',
    r'''a altura é \(f(1)=1-4+1=-2\), então o ponto é \((1;\,-2)\), e a inclinação é''')

# 3.6: legenda não cita reta que não está no desenho
rep(r'''<figcaption>As duas tangentes de inclinação 12 são paralelas entre si e à reta \(y=12x+1\).</figcaption>''',
    r'''<figcaption>As duas tangentes têm inclinação 12, a mesma da reta \(y=12x+1\) (que não está desenhada). Por isso são paralelas a ela e entre si.</figcaption>''')

# 5.4: enunciado, "parada", figura
rep(r'''é \(s(t)=t^3-6t^2+9t\), com \(t\ge 0\) em segundos.''',
    r'''é \(s(t)=t^3-6t^2+9t\), com \(t\) em segundos (\(t\ge 0\)).''')
rep(r'''<li>Em que instantes a partícula está parada (\(v=0\))? Qual é a aceleração em cada um desses instantes?</li>''',
    r'''<li>Em que instantes a partícula para, mesmo que só por um instante (\(v=0\))? Qual é a aceleração em cada um desses instantes?</li>''')
rep(r'''  <p><b>b)</b> "Parada" significa velocidade zero:</p>''',
    r'''  <p><b>b)</b> "Parar" aqui significa velocidade zero naquele instante:</p>''')
rep(r'''Interpretação: em \(t=1\) a partícula para com aceleração negativa, então ela passa a andar para trás. Em \(t=3\) para com aceleração positiva, então volta a andar para frente.''',
    r'''Interpretação: a partícula não fica parada, ela para só por um instante. Em \(t=1\) a aceleração é negativa, então logo depois a velocidade fica negativa e ela passa a andar para trás. Em \(t=3\) a aceleração é positiva, então a velocidade volta a ser positiva e ela anda para frente de novo.''')
rep(r'''<figcaption>Posição, velocidade e aceleração no mesmo gráfico. \(v\) vale zero''',
    r'''<figcaption>Posição, velocidade e aceleração no mesmo gráfico. Cada curva tem sua unidade (\(s\) em m, \(v\) em m/s, \(a\) em m/s²), então compare onde cada uma vale zero, não a altura de uma contra a outra. \(v\) vale zero''')

# 5.6: dica verificável
rep(r'''Repare no padrão: em \(x=0\), a derivada de ordem \(k\) "enxerga" só o termo \(x^k\). É por isso que cada condição isolou uma constante diferente.''',
    r'''Repare no padrão: em \(x=0\), todo termo que ainda tem \(x\) vale 0. Na derivada de ordem \(k\), o único termo sem \(x\) é o que veio de \(x^k\) (por exemplo, em \(f''(x)=6ax+2b\), o \(2b\) veio de \(bx^2\)). Por isso cada condição isolou uma constante diferente.''')

open(p, "w", encoding="utf-8").write(s)
print("ok")
