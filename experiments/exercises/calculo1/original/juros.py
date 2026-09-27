s = open('lista.html', encoding='utf-8').read()

def splice(start, end, new):
    global s
    i = s.index(start); j = s.index(end, i)
    s = s[:i] + new + s[j:]

splice('<div class="q mid"><div class="qh">2.3', '<div class="q mid"><div class="qh">2.4', r"""<div class="q mid"><div class="qh">2.3 <span class="tag mid">médio</span> <span style="font-weight:400;color:var(--soft)">(juros simples × compostos)</span></div>
  <p>Um capital de R$ 1.000,00 é aplicado a uma taxa de 20% ao ano, de duas formas diferentes (\(t\) em anos):</p>
  $$\text{juros simples: } S(t)=1000\,(1+0{,}2\,t)\qquad\qquad \text{juros compostos: } C(t)=1000\cdot(1{,}2)^t$$
  <ol class="items" type="a">
    <li>Calcule \(S\) e \(C\) nos instantes \(t=0\), \(t=2\) e \(t=4\).</li>
    <li>Calcule a TMV de cada função no intervalo \([0,2]\) e no intervalo \([2,4]\).</li>
    <li>Comparando as TMVs dos dois intervalos, o que se pode concluir sobre o comportamento de cada função? Qual delas cresce sempre no mesmo ritmo e qual cresce cada vez mais rápido? Explique por que isso acontece.</li>
  </ol>
</div>

""")

splice('  <tr><td>2.3</td>', '  <tr><td>2.4</td>', r"""  <tr><td>2.3</td><td>a) \(S\): 1000; 1400; 1800 &nbsp;·&nbsp; \(C\): 1000; 1440; 2073,60 &nbsp; b) \(S\): 200 e 200; \(C\): 220 e 316,80 &nbsp; c) \(S\) cresce em ritmo constante (linear); \(C\) cresce cada vez mais rápido (juros sobre juros)</td></tr>
""")

splice('<div class="sol"><div class="qh">2.3</div>', '<div class="sol"><div class="qh">2.4</div>', r"""<div class="sol"><div class="qh">2.3 (juros simples × compostos)</div>
  <p><b>a) Os valores.</b> Para juros simples basta substituir:</p>
  $$S(0)=1000\cdot1=1000,\qquad S(2)=1000\cdot(1+0{,}4)=1400,\qquad S(4)=1000\cdot(1+0{,}8)=1800.$$
  <p>Para juros compostos, calcule as potências de 1,2 com calma. Um atalho: \((1{,}2)^4=\big((1{,}2)^2\big)^2\).</p>
  $$(1{,}2)^2=1{,}44,\qquad (1{,}2)^4=1{,}44^2=2{,}0736,$$
  $$C(0)=1000,\qquad C(2)=1000\cdot1{,}44=1440,\qquad C(4)=1000\cdot2{,}0736=2073{,}60.$$

  <p><b>b) As TMVs.</b> Em cada intervalo, aplicamos \(\dfrac{\text{valor final}-\text{valor inicial}}{\text{tempo}}\). As duas contas usam 2 anos no denominador.</p>
  <p>Juros simples:</p>
  $$\text{TMV}_{[0,2]}=\frac{1400-1000}{2}=200,\qquad \text{TMV}_{[2,4]}=\frac{1800-1400}{2}=200.$$
  <p>Juros compostos:</p>
  $$\text{TMV}_{[0,2]}=\frac{1440-1000}{2}=220,\qquad \text{TMV}_{[2,4]}=\frac{2073{,}60-1440}{2}=\frac{633{,}60}{2}=316{,}80.$$
  <p>As unidades são <b>reais por ano</b>: a TMV diz quanto dinheiro a aplicação ganhou, em média, a cada ano do intervalo.</p>

  <p><b>c) O que as TMVs revelam.</b></p>
  <p><b>Juros simples:</b> a TMV é a mesma nos dois intervalos (R$ 200 por ano). Uma função que tem a mesma TMV em qualquer intervalo é uma <b>reta</b>, ou seja, cresce sempre no mesmo ritmo. Isso bate com a fórmula: \(S(t)=1000+200t\) é uma função do 1º grau, e 200 é a inclinação dela.</p>
  <p><b>Por quê:</b> no regime simples, os juros são calculados sempre sobre o capital inicial. Todo ano rende 20% de R$ 1.000, que são R$ 200, nem mais nem menos.</p>
  <p><b>Juros compostos:</b> a TMV <b>aumentou</b> de 220 para 316,80. O dinheiro não só cresce, como cresce <b>cada vez mais rápido</b>. Por isso o gráfico de \(C\) não é uma reta: é uma curva que vai ficando mais inclinada.</p>
  <p><b>Por quê:</b> no regime composto, os juros de cada ano são calculados sobre o <b>montante acumulado</b>, que já inclui os juros anteriores ("juros sobre juros"). No 1º ano rende 20% de 1000 = 200. No 2º ano rende 20% de 1200 = 240. No 3º rende 20% de 1440 = 288, e assim por diante. A cada ano a base é maior, então o ganho também é maior.</p>
  <figure><img src="render/s2-3.svg"><figcaption>As duas aplicações começam iguais (e até coincidem em \(t=1\)), mas a composta vai se afastando: a distância entre as curvas é de R$ 40 em \(t=2\) e já chega a R$ 273,60 em \(t=4\).</figcaption></figure>
  <p class="tip">A ideia que vale para qualquer função: se a TMV <b>muda</b> de um intervalo para outro, a função <b>não é linear</b>. Se a TMV aumenta, ela está acelerando o crescimento. Se diminui, está desacelerando. Comparar TMVs em intervalos vizinhos é um jeito simples de "enxergar" o formato do gráfico sem desenhá-lo.</p>
  <span class="ans">S: TMV 200 e 200 (ritmo constante) · C: TMV 220 e 316,80 (crescimento acelerado)</span>
</div>

""")
open('lista.html', 'w', encoding='utf-8').write(s)
print('ok')
