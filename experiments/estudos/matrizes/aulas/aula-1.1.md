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

## Correção da revisão e do desafio (10/10)

- **R1, certa** (confiança 3): $(9, -8)$.
- **R2, certa** (confiança 3): $\sum_{i=1}^{4}(i + 1)\,i$, com os parênteses.
- **R3, errou** (confiança 2). `np.arange(1, 7)` dá `[1 2 3 4 5 6]`, porque para **antes** do 7. É o erro 12 de novo. O certo é `np.arange(1, 8)`, e a soma dos quadrados é `np.sum(np.arange(1, 8)**2)` = 140, parte que faltou responder.
- **Desafio:**
  - (a) certa: $(2, 1)$, $(1, 2)$, $(5, 1)$.
  - (b) "preciso de mais informações": era a pergunta aberta. A resposta é **4 números**, as duas colunas, que formam a matriz $\begin{pmatrix}2&1\\1&2\end{pmatrix}$.
  - (c) certa, montou e resolveu o sistema: $(2, 1)$.
  - (d) certa, apesar da confiança 1: $M(1,1) = (3,3) = 3\,(1,1)$. Também vale $M(1,-1) = (1,-1)$, com $\lambda = 1$.

## Bloco 3: Instrução

Figuras: [`../figuras/aula-1.1-colunas.png`](../figuras/aula-1.1-colunas.png) e [`../figuras/demo-2112.png`](../figuras/demo-2112.png).

- **Matriz $m\times n$:** $m$ linhas e $n$ colunas. A entrada $a_{ij}$ fica na linha $i$, coluna $j$.
- **Definição** (pelas colunas $a_1, \dots, a_n$): $Ax = x_1 a_1 + x_2 a_2 + \dots + x_n a_n$.
  - $x$ precisa ter $n$ componentes, uma por coluna;
  - $Ax$ tem $m$ componentes, o tamanho de cada coluna.
- **Duas leituras:**
  - resolver $Ax = b$ é achar a combinação das colunas que dá $b$ (desafio c);
  - $Ax = \lambda x$ é a pergunta dos autovetores, que volta no Módulo 7 (desafio d).

## Bloco 4: Exemplos

**Completo.** $A = \begin{pmatrix}1&0&2\\-1&3&1\end{pmatrix}$ (2×3), $x = (2, 1, -1)$:

$Ax = 2(1,-1) + 1(0,3) + (-1)(2,1) = (2,-2) + (0,3) + (-2,-1) = (0, 0)$.

Perguntas para explicar: por que $x$ tem 3 componentes? Por que o resultado tem 2? O que significa uma combinação **não nula** dar o vetor zero?

**Com lacunas.** $A = \begin{pmatrix}3&-1\\0&2\\1&4\end{pmatrix}$ (3×2), $x = (2, -3)$:

$Ax = 2(3, 0, 1) + (-3)(-1, 2, 4) = (6, 0, 2) + (\_, \_, \_) = (\_, \_, \_)$.

## Bloco 5: Prática intercalada

1. (fácil) $A = \begin{pmatrix}4&-2&0\\1&5&3\end{pmatrix}$. Dê a ordem de $A$ e as entradas $a_{12}$, $a_{23}$ e $a_{21}$.
2. (fácil) Calcule $\begin{pmatrix}1&2\\3&-1\end{pmatrix}\begin{pmatrix}4\\-2\end{pmatrix}$ como combinação das colunas.
3. (médio, revisita o erro 10) Que $x$ faz $\begin{pmatrix}1&1\\1&-1\end{pmatrix}x = \begin{pmatrix}5\\-2\end{pmatrix}$?
4. (médio) Escreva a matriz da máquina $N(x, y) = (x - y,\ 2x,\ 3y)$. Qual é a ordem dela?
5. (médio, revisita produto escalar) Com $A = \begin{pmatrix}2&1\\1&2\end{pmatrix}$, calcule $A(1,-1)$ e mostre, pelo produto escalar, que o resultado é perpendicular a $(1, 1)$.
6. (ache o erro) Um aluno calculou $\begin{pmatrix}2&0\\1&3\end{pmatrix}\begin{pmatrix}1\\4\end{pmatrix} = 1(2,0) + 4(1,3) = (6, 12)$. Qual foi o erro? Qual é a resposta certa?
7. (difícil, prove para quaisquer vetores) Mostre que $A(x + y) = Ax + Ay$ para qualquer matriz $A$ 2×2 e quaisquer $x, y \in \mathbb{R}^2$, usando a definição pelas colunas.
