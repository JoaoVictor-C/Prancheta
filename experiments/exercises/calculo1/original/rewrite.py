s = open('lista.html', encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b)


def splice(start, end, new):
    """Replace from `start` (inclusive) up to `end` (exclusive)."""
    global s
    i = s.index(start)
    j = s.index(end, i)
    s = s[:i] + new + s[j:]


# ---- capa -----------------------------------------------------------------
rep('Regra da potência · Regra da cadeia</p>', 'Regra da potência · Derivadas sucessivas</p>')
rep('<li><b>Regra da cadeia (compostas duplas e triplas)</b>: exercícios 5.1 a 5.6</li>',
    '<li><b>Derivadas sucessivas (segunda e terceira derivada)</b>: exercícios 5.1 a 5.6</li>')
rep(r"""      <tr><td>Regra da cadeia</td><td>\(\big[f(g(x))\big]' = f'(g(x))\cdot g'(x)\)</td></tr>
      <tr><td>Seno e cosseno (usados no tema 5)</td><td>\((\operatorname{sen} x)' = \cos x,\quad (\cos x)' = -\operatorname{sen} x\)</td></tr>
""", r"""      <tr><td>Derivadas sucessivas</td><td>\(f''=(f')',\quad f'''=(f'')',\quad f^{(4)}=(f''')',\ \dots\)</td></tr>
""")

# ---- enunciados do tema 5 -------------------------------------------------
splice('<h2>5. Regra da cadeia (compostas duplas e triplas)</h2>', '</section>', r"""<h2>5. Derivadas sucessivas (segunda e terceira derivada)</h2>
<p class="lead">A derivada de uma função também é uma função, então podemos derivá-la de novo: \(f''\) (segunda derivada) é a derivada de \(f'\), e \(f'''\) (terceira derivada) é a derivada de \(f''\). Use a regra da potência em cada etapa.</p>

<div class="q easy"><div class="qh">5.1 <span class="tag easy">fácil</span></div>
  <p>Seja \(f(x)=x^4-3x^2+2x\). Calcule \(f'(x)\), \(f''(x)\) e \(f'''(x)\).</p>
</div>

<div class="q easy"><div class="qh">5.2 <span class="tag easy">fácil</span></div>
  <p>Seja \(f(x)=5x^3-2x+7\). Calcule \(f''(x)\) e o valor de \(f''(2)\).</p>
</div>

<div class="q mid"><div class="qh">5.3 <span class="tag mid">médio</span></div>
  <p>Seja \(f(x)=\sqrt{x}+\dfrac{1}{x}\) (com \(x>0\)). Calcule \(f''(x)\) e o valor de \(f''(1)\).</p>
</div>

<div class="q mid"><div class="qh">5.4 <span class="tag mid">médio</span></div>
  <p>A posição de uma partícula, em metros, é \(s(t)=t^3-6t^2+9t\), com \(t\ge 0\) em segundos. A velocidade é \(v(t)=s'(t)\) e a aceleração é \(a(t)=s''(t)\).</p>
  <ol class="items" type="a">
    <li>Encontre \(v(t)\) e \(a(t)\).</li>
    <li>Em que instantes a partícula está parada (\(v=0\))? Qual é a aceleração em cada um desses instantes?</li>
    <li>Em que instante a aceleração é zero?</li>
  </ol>
</div>

<div class="q hard"><div class="qh">5.5 <span class="tag hard">difícil</span></div>
  <p>Seja \(f(x)=x^5-5x^4\).</p>
  <ol class="items" type="a">
    <li>Calcule \(f'(x)\), \(f''(x)\) e \(f'''(x)\).</li>
    <li>Resolva a equação \(f''(x)=0\).</li>
    <li>Continue derivando. Qual é a primeira ordem \(n\) para a qual \(f^{(n)}(x)=0\) para todo \(x\)? Explique por quê.</li>
  </ol>
</div>

<div class="q hard"><div class="qh">5.6 <span class="tag hard">difícil</span></div>
  <p>Encontre as constantes \(a\), \(b\), \(c\) e \(d\) do polinômio \(f(x)=ax^3+bx^2+cx+d\) sabendo que
  $$f(0)=1,\qquad f'(0)=-2,\qquad f''(0)=4,\qquad f'''(0)=12.$$</p>
</div>
""")

# ---- gabarito ---------------------------------------------------------------
splice('  <tr><td>5.1</td>', '</table>', r"""  <tr><td>5.1</td><td>\(f'=4x^3-6x+2;\ \ f''=12x^2-6;\ \ f'''=24x\)</td></tr>
  <tr><td>5.2</td><td>\(f''(x)=30x\); \(f''(2)=60\)</td></tr>
  <tr><td>5.3</td><td>\(f''(x)=-\dfrac{1}{4x\sqrt{x}}+\dfrac{2}{x^3}\); \(f''(1)=\dfrac74\)</td></tr>
  <tr><td>5.4</td><td>a) \(v=3t^2-12t+9\), \(a=6t-12\) &nbsp; b) \(t=1\) s (\(a=-6\ \text{m/s}^2\)) e \(t=3\) s (\(a=6\ \text{m/s}^2\)) &nbsp; c) \(t=2\) s</td></tr>
  <tr><td>5.5</td><td>a) \(5x^4-20x^3;\ 20x^3-60x^2;\ 60x^2-120x\) &nbsp; b) \(x=0\) ou \(x=3\) &nbsp; c) \(n=6\)</td></tr>
  <tr><td>5.6</td><td>\(a=2,\ b=2,\ c=-2,\ d=1\), ou seja, \(f(x)=2x^3+2x^2-2x+1\)</td></tr>
""")

# ---- resoluções 4.3 a 4.6 ---------------------------------------------------
splice('<div class="sol"><div class="qh">4.3</div>', '<h2>5. Regra da cadeia</h2>', r"""<div class="sol"><div class="qh">4.3</div>
  <p><b>a)</b> A regra da potência só funciona quando cada termo está no formato \(c\,x^n\) (um número vezes \(x\) elevado a um expoente). Raízes e frações com \(x\) no denominador <b>não</b> estão nesse formato. Então o primeiro trabalho é só de álgebra: reescrever.</p>
  <table class="ref" style="width:auto;margin:4pt auto">
    <tr><th>Termo original</th><th>Por quê</th><th>Como potência</th></tr>
    <tr><td>\(\sqrt{x}\)</td><td>raiz quadrada = expoente \(\tfrac12\)</td><td>\(x^{1/2}\)</td></tr>
    <tr><td>\(\dfrac{1}{x^2}\)</td><td>passar do denominador para o numerador troca o sinal do expoente</td><td>\(x^{-2}\)</td></tr>
    <tr><td>\(\dfrac{2}{\sqrt[3]{x}}\)</td><td>\(\sqrt[3]{x}=x^{1/3}\) e ela está no denominador, então o expoente fica negativo</td><td>\(2x^{-1/3}\)</td></tr>
  </table>
  <p>Portanto:</p>
  $$f(x)=x^{1/2}+x^{-2}-2x^{-1/3}.$$
  <p>Agora derivamos <b>termo a termo</b>. Em cada um, o expoente \(n\) desce multiplicando e o novo expoente é \(n-1\). A conta \(n-1\) com frações é onde mais se erra, então vamos fazer com calma.</p>
  <p><b>1º termo</b>, \(x^{1/2}\): aqui \(n=\tfrac12\), e \(n-1=\tfrac12-\tfrac22=-\tfrac12\).</p>
  $$\left(x^{1/2}\right)'=\tfrac12\,x^{-1/2}.$$
  <p><b>2º termo</b>, \(x^{-2}\): aqui \(n=-2\), e \(n-1=-2-1=-3\). O \(-2\) desce multiplicando:</p>
  $$\left(x^{-2}\right)'=-2\,x^{-3}.$$
  <p><b>3º termo</b>, \(-2x^{-1/3}\): o \(-2\) é uma constante multiplicando, então ele fica. Aqui \(n=-\tfrac13\), e \(n-1=-\tfrac13-\tfrac33=-\tfrac43\). O expoente \(-\tfrac13\) desce e multiplica o \(-2\): \((-2)\cdot\left(-\tfrac13\right)=+\tfrac23\) (menos com menos dá mais).</p>
  $$\left(-2x^{-1/3}\right)'=-2\cdot\left(-\tfrac13\right)x^{-4/3}=\tfrac23\,x^{-4/3}.$$
  <p>Juntando os três:</p>
  $$f'(x)=\tfrac12x^{-1/2}-2x^{-3}+\tfrac23x^{-4/3}.$$
  <p>Essa já é uma resposta correta. Se quiser voltar para a forma com raízes, desfaça a reescrita: expoente negativo volta para o denominador, e expoente fracionário vira raiz (\(x^{4/3}=\sqrt[3]{x^4}\)):</p>
  $$f'(x)=\frac{1}{2\sqrt x}-\frac{2}{x^3}+\frac{2}{3\sqrt[3]{x^4}}.$$
  <p class="tip">Erro comum: calcular \(-\tfrac13-1\) como \(-\tfrac23\). Subtrair 1 de um número negativo deixa ele <b>mais</b> negativo: \(-\tfrac13-1=-\tfrac43\).</p>

  <p><b>b)</b> Aqui temos um <b>produto</b> de dois parênteses, e a regra da potência não se aplica direto a um produto. Um erro muito comum é derivar cada parêntese e multiplicar: \((2)\cdot(2x)=4x\). <b>Isso está errado</b>, porque a derivada de um produto não é o produto das derivadas.</p>
  <p>Com o que temos até aqui, a saída é <b>expandir</b> (fazer a distributiva) e transformar o produto numa soma de potências. Cada termo do primeiro parêntese multiplica cada termo do segundo:</p>
  $$2x\cdot x^2=2x^3,\qquad 2x\cdot(-3)=-6x,\qquad 1\cdot x^2=x^2,\qquad 1\cdot(-3)=-3.$$
  <p>Somando e ordenando pelo grau:</p>
  $$g(x)=2x^3+x^2-6x-3.$$
  <p>Agora sim, derivamos termo a termo: \((2x^3)'=6x^2\), \((x^2)'=2x\), \((-6x)'=-6\) e \((-3)'=0\).</p>
  $$g'(x)=6x^2+2x-6.$$
  <p class="tip">Para ver que o "atalho errado" falha, basta testar um valor: em \(x=1\) a resposta certa dá \(g'(1)=6+2-6=2\), e o atalho errado dá \(4\cdot1=4\). Os valores são diferentes, então o atalho não vale.</p>
  <span class="ans">a) 1/(2√x) − 2/x³ + 2/(3∛x⁴) &nbsp; b) 6x² + 2x − 6</span>
</div>

<div class="sol"><div class="qh">4.4</div>
  <p>A reta tangente é a reta que "encosta" no gráfico num ponto, com a mesma inclinação que o gráfico tem ali. Para escrever a equação de qualquer reta precisamos de duas coisas: <b>um ponto</b> por onde ela passa e <b>a inclinação</b> dela. Depois usamos a forma ponto-inclinação \(y-y_0=m\,(x-x_0)\).</p>
  <p><b>1. O ponto.</b> A reta toca o gráfico em \(x=2\), então o ponto é \((2,\,f(2))\):</p>
  $$f(2)=2^3-3\cdot2=8-6=2\quad\Longrightarrow\quad (x_0,y_0)=(2,\,2).$$
  <p><b>2. A derivada.</b> Termo a termo: \((x^3)'=3x^2\) e \((-3x)'=-3\).</p>
  $$f'(x)=3x^2-3.$$
  <p><b>3. A inclinação.</b> A inclinação da tangente em \(x=2\) é a derivada calculada em 2:</p>
  $$m=f'(2)=3\cdot2^2-3=3\cdot4-3=12-3=9.$$
  <p><b>4. A equação.</b> Substituímos na forma ponto-inclinação e isolamos \(y\):</p>
  $$y-2=9(x-2)\;\Longrightarrow\;y-2=9x-18\;\Longrightarrow\;y=9x-16.$$
  <p><b>5. Conferência.</b> Em \(x=2\) a reta dá \(9\cdot2-16=2\), que é o valor de \(f(2)\). A reta passa mesmo pelo ponto de tangência.</p>
  <figure><img src="render/s4-4.svg"><figcaption>A tangente em \((2,2)\) tem inclinação 9: perto desse ponto, \(f\) sobe cerca de 9 unidades para cada 1 unidade em \(x\).</figcaption></figure>
  <p class="tip">Dois erros comuns: usar \(f'(2)=9\) como se fosse a altura do ponto (a altura é \(f(2)=2\)); ou deixar \(f'(x)\) com \(x\) na equação da reta. A inclinação de uma reta é um <b>número</b>, então é preciso calcular \(f'\) no ponto.</p>
  <span class="ans">y = 9x − 16</span>
</div>

<div class="sol"><div class="qh">4.5</div>
  <p><b>Traduzindo a pergunta.</b> Uma reta horizontal tem inclinação zero. A inclinação da tangente é a derivada. Então "tangente horizontal" quer dizer \(f'(x)=0\). O problema virou: derivar e resolver uma equação.</p>
  <p><b>1. Derivar</b> termo a termo: \((x^3)'=3x^2\), \((-6x^2)'=-12x\), \((9x)'=9\) e \((1)'=0\).</p>
  $$f'(x)=3x^2-12x+9.$$
  <p><b>2. Resolver \(f'(x)=0\).</b> Primeiro dividimos tudo por 3 para simplificar (dividir os dois lados de uma equação \(=0\) por 3 não muda as soluções):</p>
  $$3x^2-12x+9=0\;\Longrightarrow\;x^2-4x+3=0.$$
  <p>Procuramos dois números com <b>soma 4</b> e <b>produto 3</b>: são 1 e 3. Então:</p>
  $$(x-1)(x-3)=0\;\Longrightarrow\;x=1\ \text{ou}\ x=3.$$
  <p>(Por Bhaskara dá o mesmo: \(\Delta=16-12=4\) e \(x=\frac{4\pm2}{2}\), ou seja, \(x=3\) ou \(x=1\).)</p>
  <p><b>3. Achar as alturas.</b> A pergunta pede <b>pontos</b> do gráfico, então calculamos \(f\) (a função original, não a derivada) em cada \(x\):</p>
  $$f(1)=1^3-6\cdot1^2+9\cdot1+1=1-6+9+1=5,$$
  $$f(3)=3^3-6\cdot3^2+9\cdot3+1=27-54+27+1=1.$$
  <figure><img src="render/s4-5.svg"><figcaption>Nos pontos \((1,5)\) e \((3,1)\) a tangente fica horizontal, com \(f'=0\).</figcaption></figure>
  <p><b>O que esses pontos significam.</b> Em \((1,5)\) o gráfico para de subir e começa a descer, como o topo de uma colina. Em \((3,1)\) ele para de descer e começa a subir, como o fundo de um vale. Nos dois casos, bem no ponto de virada, a curva fica "achatada" e a tangente é horizontal.</p>
  <p class="tip">Erros comuns: responder só \(x=1\) e \(x=3\), sem as alturas; ou calcular a altura usando \(f'\) no lugar de \(f\). Nesse caso daria sempre 0, porque foi assim que achamos esses \(x\).</p>
  <span class="ans">(1, 5) e (3, 1)</span>
</div>

<div class="sol"><div class="qh">4.6</div>
  <p><b>Quantas equações precisamos?</b> Há duas incógnitas, \(a\) e \(b\), então precisamos de duas equações. A frase "a reta é tangente ao gráfico em \(x=1\)" fornece exatamente duas informações:</p>
  <ol class="items">
    <li>a reta e a curva <b>passam pelo mesmo ponto</b> em \(x=1\);</li>
    <li>a reta e a curva têm <b>a mesma inclinação</b> em \(x=1\).</li>
  </ol>
  <p><b>Equação (i), mesmo ponto.</b> A altura da reta em \(x=1\) é \(y=3\cdot1-1=2\). A altura da curva em \(x=1\) é \(f(1)=a\cdot1^2+b\cdot1=a+b\). Igualando:</p>
  $$a+b=2.$$
  <p><b>Equação (ii), mesma inclinação.</b> A inclinação da reta \(y=3x-1\) é o número que multiplica \(x\), ou seja, 3. A inclinação da curva é a derivada. Atenção: \(a\) e \(b\) são <b>números</b> (constantes), então derivamos só o \(x\):</p>
  $$(ax^2)'=a\cdot2x=2ax,\qquad (bx)'=b\qquad\Longrightarrow\qquad f'(x)=2ax+b.$$
  <p>Em \(x=1\): \(f'(1)=2a+b\). Igualando à inclinação da reta:</p>
  $$2a+b=3.$$
  <p><b>Resolvendo o sistema.</b> Subtraímos a equação (i) da (ii). O \(b\) some:</p>
  $$(2a+b)-(a+b)=3-2\;\Longrightarrow\;a=1.$$
  <p>Substituindo \(a=1\) em (i): \(1+b=2\), então \(b=1\). A função é \(f(x)=x^2+x\).</p>
  <p><b>Conferência</b> das duas condições: \(f(1)=1+1=2\) (mesmo ponto da reta) e \(f'(x)=2x+1\), então \(f'(1)=3\) (mesma inclinação da reta). As duas batem.</p>
  <figure><img src="render/s4-6.svg"><figcaption>Com \(a=b=1\), a reta \(y=3x-1\) toca \(y=x^2+x\) em \((1,2)\).</figcaption></figure>
  <p class="tip">Erro comum: usar só uma das condições. Com uma equação e duas incógnitas existem infinitas respostas. É a tangência (ponto <b>e</b> inclinação) que fixa \(a\) e \(b\).</p>
  <span class="ans">a = 1 e b = 1</span>
</div>

""")

# ---- resoluções do tema 5 ---------------------------------------------------
splice('<h2>5. Regra da cadeia</h2>', '<div class="box">\n<b>Resumo final.', r"""<h2>5. Derivadas sucessivas</h2>

<div class="box">
<b>A ideia central.</b> Depois de derivar \(f\), obtemos outra função, \(f'\). Nada impede de derivar de novo:
$$f\;\xrightarrow{\text{deriva}}\;f'\;\xrightarrow{\text{deriva}}\;f''\;\xrightarrow{\text{deriva}}\;f'''\;\xrightarrow{\text{deriva}}\;f^{(4)}\;\cdots$$
A partir da quarta usamos o número entre parênteses: \(f^{(4)}, f^{(5)},\dots\) (também se escreve \(\frac{d^2y}{dx^2}\) para a segunda derivada).
<br><b>O que significam.</b> \(f'\) mede quão rápido \(f\) muda; \(f''\) mede quão rápido a <i>inclinação</i> muda. Na física: posição \(\to\) velocidade \(\to\) aceleração.
<br><b>Regra de ouro:</b> derive sempre o <b>resultado anterior</b>, nunca a função original de novo. E simplifique cada etapa antes de seguir.
</div>

<div class="sol"><div class="qh">5.1</div>
  <p><b>Primeira derivada</b> (regra da potência termo a termo): \((x^4)'=4x^3\), \((-3x^2)'=-6x\) e \((2x)'=2\).</p>
  $$f'(x)=4x^3-6x+2.$$
  <p><b>Segunda derivada</b>: agora derivamos \(f'\), não \(f\). \((4x^3)'=12x^2\), \((-6x)'=-6\) e \((2)'=0\).</p>
  $$f''(x)=12x^2-6.$$
  <p><b>Terceira derivada</b>: derivamos \(f''\). \((12x^2)'=24x\) e \((-6)'=0\).</p>
  $$f'''(x)=24x.$$
  <p class="tip">Repare que o grau cai 1 a cada derivada (4, 3, 2, 1) e que as constantes vão sumindo: o \(+2\) de \(f'\) virou 0 em \(f''\).</p>
  <span class="ans">f′ = 4x³ − 6x + 2; f″ = 12x² − 6; f‴ = 24x</span>
</div>

<div class="sol"><div class="qh">5.2</div>
  <p>Para chegar à segunda derivada, precisamos passar pela primeira:</p>
  $$f'(x)=15x^2-2\qquad(\text{o }7\text{ é constante e some}),$$
  $$f''(x)=30x\qquad(\text{o }-2\text{ é constante e some}).$$
  <p>Só no final substituímos o número: \(f''(2)=30\cdot2=60\).</p>
  <p class="tip">Erro comum: substituir \(x=2\) cedo demais, em \(f'\), e depois derivar o número. \(f'(2)=58\) é uma constante, e a derivada de uma constante é 0. Primeiro derive tudo, depois substitua.</p>
  <span class="ans">f″(x) = 30x; f″(2) = 60</span>
</div>

<div class="sol"><div class="qh">5.3</div>
  <p>Como no 4.3, reescrevemos como potências: \(\sqrt x=x^{1/2}\) e \(\frac1x=x^{-1}\).</p>
  $$f(x)=x^{1/2}+x^{-1}.$$
  <p><b>Primeira derivada.</b> Expoentes: \(\tfrac12-1=-\tfrac12\) e \(-1-1=-2\).</p>
  $$f'(x)=\tfrac12x^{-1/2}-x^{-2}.$$
  <p><b>Segunda derivada.</b> Derivamos cada termo de \(f'\) com o mesmo cuidado.</p>
  <p>1º termo: o \(\tfrac12\) fica, o expoente \(-\tfrac12\) desce e o novo expoente é \(-\tfrac12-1=-\tfrac32\). Então \(\tfrac12\cdot\left(-\tfrac12\right)x^{-3/2}=-\tfrac14x^{-3/2}\).</p>
  <p>2º termo: o \(-1\) fica, o expoente \(-2\) desce e o novo expoente é \(-3\). Então \(-1\cdot(-2)x^{-3}=+2x^{-3}\).</p>
  $$f''(x)=-\tfrac14x^{-3/2}+2x^{-3}=-\frac{1}{4x\sqrt x}+\frac{2}{x^3}.$$
  <p>(Usamos \(x^{3/2}=x^1\cdot x^{1/2}=x\sqrt x\).)</p>
  <p><b>Valor em \(x=1\).</b> Como \(1\) elevado a qualquer expoente é \(1\):</p>
  $$f''(1)=-\tfrac14+2=\tfrac74.$$
  <span class="ans">f″(x) = −1/(4x√x) + 2/x³; f″(1) = 7/4</span>
</div>

<div class="sol"><div class="qh">5.4</div>
  <p><b>a)</b> A velocidade é a primeira derivada da posição, e a aceleração é a segunda (ou seja, a derivada da velocidade):</p>
  $$v(t)=s'(t)=3t^2-12t+9,\qquad a(t)=v'(t)=s''(t)=6t-12.$$
  <p><b>b)</b> "Parada" significa velocidade zero:</p>
  $$3t^2-12t+9=0\;\Longrightarrow\;t^2-4t+3=0\;\Longrightarrow\;(t-1)(t-3)=0\;\Longrightarrow\;t=1\ \text{s ou}\ t=3\ \text{s}.$$
  <p>A aceleração nesses instantes:</p>
  $$a(1)=6-12=-6\ \text{m/s}^2,\qquad a(3)=18-12=6\ \text{m/s}^2.$$
  <p>Interpretação: em \(t=1\) a partícula para com aceleração negativa, então ela passa a andar para trás. Em \(t=3\) para com aceleração positiva, então volta a andar para frente. Parar (\(v=0\)) não significa aceleração zero.</p>
  <p><b>c)</b> \(a(t)=6t-12=0\) quando \(t=2\) s. É o instante em que a velocidade para de diminuir e começa a aumentar (o ponto mais baixo da curva de \(v\)).</p>
  <figure><img src="render/s5-4.svg"><figcaption>Posição, velocidade e aceleração no mesmo gráfico. \(v\) vale zero onde \(s\) tem tangente horizontal (\(t=1\) e \(t=3\)), e \(a\) vale zero onde \(v\) atinge o valor mínimo (\(t=2\)).</figcaption></figure>
  <span class="ans">a) v = 3t² − 12t + 9, a = 6t − 12 &nbsp; b) t = 1 s (a = −6) e t = 3 s (a = 6) &nbsp; c) t = 2 s</span>
</div>

<div class="sol"><div class="qh">5.5</div>
  <p><b>a)</b> Uma derivada de cada vez, sempre a partir da anterior:</p>
  $$f'(x)=5x^4-20x^3,$$
  $$f''(x)=20x^3-60x^2,$$
  $$f'''(x)=60x^2-120x.$$
  <p><b>b)</b> Para resolver \(20x^3-60x^2=0\), colocamos em evidência o que os dois termos têm em comum, que é \(20x^2\):</p>
  $$20x^2(x-3)=0.$$
  <p>Um produto é zero quando algum fator é zero: \(20x^2=0\) dá \(x=0\), e \(x-3=0\) dá \(x=3\).</p>
  <p class="tip">Erro comum: dividir a equação por \(x^2\) e perder a solução \(x=0\). Colocar em evidência não perde nenhuma solução.</p>
  <p><b>c)</b> Continuamos derivando:</p>
  $$f^{(4)}(x)=120x-120,\qquad f^{(5)}(x)=120,\qquad f^{(6)}(x)=0.$$
  <p>Então \(n=6\). O motivo: cada derivada diminui o grau do polinômio em 1. \(f\) tem grau 5, e depois de 5 derivadas sobra uma constante (grau 0). A sexta derivada de uma constante é zero, e daí em diante tudo continua zero. De modo geral, <b>um polinômio de grau \(n\) tem a derivada de ordem \(n+1\) igual a zero</b>.</p>
  <span class="ans">a) 5x⁴ − 20x³; 20x³ − 60x²; 60x² − 120x &nbsp; b) x = 0 ou x = 3 &nbsp; c) n = 6</span>
</div>

<div class="sol"><div class="qh">5.6</div>
  <p>A estratégia é calcular \(f, f', f'', f'''\) de forma geral e depois substituir \(x=0\). O zero apaga quase todos os termos, e cada condição acaba revelando uma constante.</p>
  <p>Lembre que \(a, b, c, d\) são números, então derivamos só o \(x\):</p>
  $$f(x)=ax^3+bx^2+cx+d,$$
  $$f'(x)=3ax^2+2bx+c,$$
  $$f''(x)=6ax+2b,$$
  $$f'''(x)=6a.$$
  <p>Agora usamos as condições, uma por linha:</p>
  $$f(0)=d=1\;\Longrightarrow\;d=1,$$
  $$f'(0)=c=-2\;\Longrightarrow\;c=-2,$$
  $$f''(0)=2b=4\;\Longrightarrow\;b=2,$$
  $$f'''(0)=6a=12\;\Longrightarrow\;a=2.$$
  <p>Logo \(f(x)=2x^3+2x^2-2x+1\).</p>
  <p><b>Conferência:</b> \(f'(x)=6x^2+4x-2\), \(f''(x)=12x+4\) e \(f'''(x)=12\). Em \(x=0\): \(f(0)=1\), \(f'(0)=-2\), \(f''(0)=4\) e \(f'''(0)=12\). Todas as condições batem.</p>
  <p class="tip">Repare no padrão: em \(x=0\), a derivada de ordem \(k\) "enxerga" só o termo \(x^k\). É por isso que cada condição isolou uma constante diferente.</p>
  <span class="ans">a = 2, b = 2, c = −2, d = 1</span>
</div>

""")

rep('A regra da potência e a regra da cadeia são atalhos para calcular essa derivada sem refazer o limite toda vez.',
    'A regra da potência é o atalho para calcular essa derivada sem refazer o limite toda vez. Derivadas sucessivas são essa mesma derivada aplicada de novo ao resultado.')

open('lista.html', 'w', encoding='utf-8').write(s)
for word in ['cadeia', 'sen', 'cos', 's5-5']:
    import re
    print(word, len(re.findall(word, s)))
