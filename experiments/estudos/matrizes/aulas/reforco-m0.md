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
- **Q5:** pendente. O aluno perguntou o que é u; resposta: um vetor qualquer, u = (u₁, u₂).
