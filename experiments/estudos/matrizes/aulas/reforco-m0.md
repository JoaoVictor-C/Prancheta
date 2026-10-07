# Reforço M0 (05/10/2026)

O reforço ataca os erros 1 a 9 do caderno e tem quatro blocos: vetores,
sistemas, somatório e laboratório. No fim vem o checkpoint M0-bis.

## Bloco 1: Vetores

**Intuição.** Um vetor é um deslocamento: (3, 4) significa "anda 3 para a
direita e 4 para cima". As figuras são
[`../figuras/reforco-m0-norma.png`](../figuras/reforco-m0-norma.png) e
[`../figuras/reforco-m0-produto-escalar.png`](../figuras/reforco-m0-produto-escalar.png).

**Definições** (u = (u₁, u₂), v = (v₁, v₂), k um número):

| operação | fórmula | resultado |
| --- | --- | --- |
| soma | u + v = (u₁ + v₁, u₂ + v₂) | vetor |
| escalar | k·u = (k·u₁, k·u₂) | vetor |
| subtração | u − v = u + (−1)·v = (u₁ − v₁, u₂ − v₂) | vetor |
| norma | \|u\| = √(u₁² + u₂²) | número ≥ 0 |
| combinação linear | α·u + β·v, com α e β **números** | vetor |
| produto escalar | u·v = u₁v₁ + u₂v₂ | **número** |

**Regras práticas:**
- **Subtração:** escreva sempre o parêntese, como em 6 − (−2) = 8.
- **Ângulo:** u·v = \|u\|·\|v\|·cos θ. Se u·v > 0, o ângulo é agudo; se u·v = 0, é reto; se u·v < 0, é obtuso.

**Exemplo resolvido.** u = (−1, 3), v = (2, −2).
- 3u − 2v = (−3, 9) − (4, −4) = (−3 − 4, 9 − (−4)) = **(−7, 13)**
- \|v\| = √(2² + (−2)²) = √8 = **2√2**
- u·v = (−1)·2 + 3·(−2) = −2 − 6 = **−8**, que é negativo, então o ângulo é obtuso

**Sua vez:**
1. (fácil) u = (4, −3), v = (−1, 5). Calcule u − v, −2v e \|u\|.
2. (fácil) p = (2, −3), q = (4, 1). Calcule p·q e diga se o ângulo é agudo, reto ou obtuso.
3. (médio) Escreva (5, −2) como αe₁ + βe₂. Depois ache α e β com α(1, 1) + β(1, −1) = (5, −2).
4. (médio) Para que valor de k os vetores (k, 2) e (3, −6) são perpendiculares?
5. (difícil, justificar) Mostre que u·u = \|u\|². Use isso para provar que, se u·v = 0, então \|u + v\|² = \|u\|² + \|v\|².

**Correção (parcial)**
- **Q1, certa:** (5, −8), (2, −10) e 5.
- **Q2, certa:** 5, ângulo agudo.
- **Q3, meio ponto.** A 1ª parte está certa: 5e₁ + (−2)e₂. Na 2ª, você tentou adivinhar inteiros, mas a resposta é α = 3/2 e β = 7/2. Ela sai do sistema α + β = 5 e α − β = −2, que abre o bloco 2.
- **Q4, certa:** k = 4.
- **Q5, meio ponto.**
  - A 1ª parte está certa: u·u = u₁² + u₂² = |u|². Faltou só escrever |u|² = (√(u₁² + u₂²))².
  - A 2ª parte está errada. Uma soma pode dar zero sem nenhuma parcela zero: a = (2, 1) e b = (−1, 2) dão −2 + 2 = 0. Além disso, um exemplo não prova o caso geral.
  - A prova: |u + v|² = (u₁ + v₁)² + (u₂ + v₂)² = |u|² + |v|² + 2u·v, que é |u|² + |v|² quando u·v = 0.

**Bloco 1: 4,0 / 5 (80%).**

## Bloco 2: Sistemas 2×2

**Intuição.** Um sistema 2×2 pode ser lido de dois jeitos:
- **pelas linhas:** cada equação é uma reta, e a solução é onde elas se encontram
  ([`../figuras/aula-00-q5-q6-retas.png`](../figuras/aula-00-q5-q6-retas.png));
- **pelas colunas:** a solução diz quanto de cada vetor-coluna é preciso para
  chegar ao lado direito ([`../figuras/reforco-m0-colunas.png`](../figuras/reforco-m0-colunas.png)).

**Definição.** Seja o sistema

$$\begin{cases} ax + by = e \\ cx + dy = f \end{cases}$$

- **SPD** (uma solução, retas concorrentes): $\dfrac{a}{c} \neq \dfrac{b}{d}$, ou seja, $ad - bc \neq 0$.
- **SPI** (infinitas soluções, retas coincidentes): $\dfrac{a}{c} = \dfrac{b}{d} = \dfrac{e}{f}$.
- **SI** (nenhuma solução, retas paralelas distintas): $\dfrac{a}{c} = \dfrac{b}{d} \neq \dfrac{e}{f}$.

**Exemplo resolvido.** Resolver $\begin{cases} 2x + 3y = 7 \\ x - y = 1 \end{cases}$
1. Classificar: $ad - bc = 2\cdot(-1) - 3\cdot 1 = -5 \neq 0$, então é SPD.
2. Eliminar $y$: multiplicando a 2ª equação por 3, fica $3x - 3y = 3$. Somando com a 1ª: $5x = 10$, logo $x = 2$, e daí $y = x - 1 = 1$.
3. Conferir: $2\cdot 2 + 3\cdot 1 = 7$ ✓ e $2 - 1 = 1$ ✓. Pelas colunas: $2\begin{pmatrix}2\\1\end{pmatrix} + 1\begin{pmatrix}3\\-1\end{pmatrix} = \begin{pmatrix}7\\1\end{pmatrix}$ ✓.

**Sua vez:**
1. (fácil) Resolva por adição: $\begin{cases} 3x + y = 9 \\ x - y = -1 \end{cases}$
2. (fácil) Classifique sem resolver e justifique:
   - (a) $\begin{cases} x - 2y = 3 \\ -2x + 4y = -6 \end{cases}$
   - (b) $\begin{cases} 4x + 6y = 2 \\ 6x + 9y = 5 \end{cases}$
   - (c) $\begin{cases} x + y = 2 \\ x - y = 0 \end{cases}$
3. (médio) Para que valores de $m$ o sistema $\begin{cases} x + my = 3 \\ 2x + 4y = 5 \end{cases}$ é SPD? Existe $m$ que o torne SPI?
4. (médio) Escreva $(4, 7)$ como combinação de $(1, 2)$ e $(1, 3)$.
5. (difícil, justificar) Mostre que, se $ad - bc \neq 0$, o sistema $\begin{cases} ax + by = e \\ cx + dy = f \end{cases}$ tem uma única solução, e ache fórmulas para $x$ e $y$.

**Correção (06/10)**
- **Q1, certa:** $x = 2$, $y = 3$.
- **Q2, certa,** com as três justificativas: (a) SPI, (b) SI, (c) SPD.
- **Q3, certa.** SPD para $m \neq 2$; com $m = 2$ é SI, porque $\frac{1}{2} = \frac{2}{4} \neq \frac{3}{5}$, e nunca é SPI. O \"SPI\" da resposta foi erro de digitação, corrigido pelo aluno.
- **Q4, certa:** $\alpha = 5$, $\beta = -1$.
- **Q5, errou.** Calculou $ad - bc$ para um sistema específico em vez do geral. A prova é a regra de Cramer: $x = \frac{ed - bf}{ad - bc}$ e $y = \frac{af - ce}{ad - bc}$.

**Bloco 2: 4,0 / 5 (80%).**

## Bloco 3: Somatório

**Intuição.** $\sum$ é um laço `for` escrito em matemática:
$\sum_{i=1}^{n} f(i)$ equivale a `sum(f(i) for i in range(1, n + 1))`.
A figura é [`../figuras/reforco-m0-somatorio-quadrados.png`](../figuras/reforco-m0-somatorio-quadrados.png):
$\sum_{k=1}^{4}(2k - 1) = 16 = 4^2$.

**Propriedades:**
- linearidade: $\sum (a_i + b_i) = \sum a_i + \sum b_i$;
- constante para fora: $\sum c\,a_i = c\sum a_i$;
- soma de constante: $\sum_{i=1}^{n} c = n\,c$;
- o índice é mudo: $\sum_i a_i = \sum_k a_k$.

O produto escalar é $u \cdot v = \sum_{i} u_i v_i$, e o produto de matrizes vai ser $(AB)_{ij} = \sum_k a_{ik} b_{kj}$.

**Exemplos resolvidos:**
- $\sum_{k=1}^{4}(k^2 - 1) = 0 + 3 + 8 + 15 = 26$. Pelas propriedades: $30 - 4 = 26$.
- $2\cdot 5 + 4\cdot 6 + 6\cdot 7 = \sum_{k=1}^{3} 2k(k + 4)$.

**Sua vez:**
1. (fácil) Calcule $\sum_{i=1}^{5}(3i - 2)$.
2. (fácil) Calcule $\sum_{j=2}^{4} 5$.
3. (médio) Escreva com $\sum$: (a) $1\cdot 2 + 2\cdot 3 + \dots + 10\cdot 11$; (b) $3 + 5 + 7 + \dots + 21$.
4. (médio) Com $u = (2, -1, 3)$ e $v = (4, 0, -2)$, escreva $u \cdot v$ com $\sum$ e calcule.
5. (difícil) Prove que $\sum_{i=1}^{n}(a_i + b_i)^2 = \sum a_i^2 + 2\sum a_i b_i + \sum b_i^2$. Conclua o Pitágoras do bloco 1 em $n$ dimensões.

**Correção (07/10)**
- **Q1, certa:** 35. A observação de que é uma PA de razão 3 está certa: $S_5 = \frac{5(1 + 13)}{2} = 35$.
- **Q2, certa:** 15.
- **Q3, meio ponto.** (a) $\sum_{i=1}^{10} i(i + 1)$ está certo, com parênteses. (b) Respondida depois: $\sum_{i=0}^{9} 3 + (2i)$. Os termos estão certos (de $i = 0$ a $9$ sai $3, 5, \dots, 21$), mas faltaram os parênteses em volta do termo todo, $\sum_{i=0}^{9}(3 + 2i)$. A nota da Q3 passou a 0,75.
- **Q4, meio ponto.** $\sum_{i=1}^{3} u_i v_i$ está certo, mas faltou calcular: $8 + 0 - 6 = 2$.
- **Q5, meio ponto.** A prova está certa e geral: expandir o quadrado, usar a linearidade, tirar a constante. Dois deslizes de notação:
  - faltaram os parênteses em $\sum(a_i^2 + 2a_ib_i + b_i^2)$;
  - o passo 3 escrito como "$\sum 2 + 2i \Rightarrow 2\sum 2i$" está errado; o certo é $\sum 2x_i = 2\sum x_i$.

  A conclusão não foi feita: com $a_i = u_i$ e $b_i = v_i$, sai $|u + v|^2 = |u|^2 + 2\,u\cdot v + |v|^2$ para qualquer $n$.

**Bloco 3: 3,75 / 5 (75%).**

## Bloco 4: Laboratório (Python e NumPy)

| matemática | NumPy |
| --- | --- |
| $u + v$, $k\,u$ | `u + v`, `k * u` |
| $(u_1 v_1, \dots, u_n v_n)$ | `u * v` (componente a componente) |
| $u \cdot v = \sum u_i v_i$ | `np.sum(u * v)`, `np.dot(u, v)`, `u @ v` |
| $\lvert u \rvert$ | `np.linalg.norm(u)`, `np.sqrt(u @ u)` |
| resolver $Ax = b$ | `np.linalg.solve(A, b)` |
| $\sum_{i=1}^{n} f(i)$ | `np.sum(f(np.arange(1, n + 1)))` |

Cuidado: com **listas**, `[1, 2] * [3, 4]` dá TypeError e `[1, 2] + [3, 4]` concatena. Só `np.array` faz conta de vetor.

**Sua vez** (mande o código e a saída):
1. (fácil) Em Python puro, sem NumPy, escreva `def dot(u, v)` com `zip`. Teste com $u = (2, -1, 3)$ e $v = (4, 0, -2)$.
2. (fácil) Com NumPy, confira a Q1 do bloco 1: $u - v$, $-2v$ e $\lvert u \rvert$ para $u = (4, -3)$ e $v = (-1, 5)$.
3. (médio) Com `np.arange` e `np.sum`, calcule as duas somas da Q3 do bloco 3.
4. (médio) Use `np.linalg.solve` na Q1 e na Q4 do bloco 2. Depois rode com o sistema SI da Q2(b) e explique o erro que aparece.
5. (difícil) Verifique o Pitágoras em 768 dimensões, o tamanho de um embedding de linguagem:
   - sorteie `u` e `w` com `np.random.randn(768)`;
   - construa `v = w - (w @ u) / (u @ u) * u`;
   - confira que `u @ v` é quase 0 e que $\lvert u + v \rvert^2 \approx \lvert u \rvert^2 + \lvert v \rvert^2$;
   - explique por que `v` sai perpendicular a `u`.

**Correção parcial (07/10).** O código foi rodado aqui.
- **Q1, certa:** `dot((2, -1, 3), (4, 0, -2))` devolve 2.
- **Q2, meio ponto.** Usou os vetores da Q1 deste bloco, e não $u = (4, -3)$ e $v = (-1, 5)$. Além disso, `-2v` dá SyntaxError: o certo é `-2 * v`. Com os vetores certos sai `[5 -8]`, `[2 -10]` e `5.0`.
- **Q3, meio ponto.** `np.arange(10)` vai de 0 a 9, então as somas deram 330 e 100 em vez de 440 e 120; o certo é `np.arange(1, 11)`. A variável `ii` foi criada e nunca usada.
- **Q4 e Q5:** pendentes.
