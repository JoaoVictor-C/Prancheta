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
