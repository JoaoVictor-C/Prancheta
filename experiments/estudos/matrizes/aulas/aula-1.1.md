# Aula 1.1: Ax como combinação das colunas (08/10/2026)

**Módulo 1. Pergunta-motor:** o que uma camada de rede neural faz com um vetor?

## Bloco 1: Revisão espaçada

Itens do baralho que vencem hoje: 1, 8 e 12. Responda sem consultar e dê a
cada resposta uma **confiança**: 1 (chute), 2 (acho que sim) ou 3 (tenho certeza).

1. Com $u = (1, -2)$ e $v = (-3, 1)$, calcule $3u - 2v$.
2. Escreva $2\cdot 1 + 3\cdot 2 + 4\cdot 3 + 5\cdot 4$ com $\sum$, com os limites e os parênteses.
3. Que código NumPy gera o array `[1 2 3 4 5 6 7]`? E como somar os quadrados desses números?

## Bloco 2: Desafio de entrada

Tente antes de qualquer explicação. Errar aqui é esperado e ajuda a aprender
(Richland et al. 2009; Sinha & Kapur 2021). Não vale nota.

Uma máquina $M$ recebe um vetor $(x, y)$ e devolve

$$M(x, y) = x\begin{pmatrix}2\\1\end{pmatrix} + y\begin{pmatrix}1\\2\end{pmatrix}$$

- (a) Calcule $M(1, 0)$, $M(0, 1)$ e $M(3, -1)$.
- (b) Invente um jeito compacto de guardar **tudo** o que define $M$. Quantos números bastam?
- (c) Que vetor $(x, y)$ a máquina transforma em $(5, 4)$?
- (d) Extra: existe um vetor diferente de $(0, 0)$ que sai como múltiplo de si mesmo, isto é, $M(v) = \lambda v$?
