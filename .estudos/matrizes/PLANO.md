# Plano de estudo: matrizes para machine learning

Objetivo: dominar matrizes e álgebra linear com foco em machine learning.
Ritmo: 2–3 h por dia, segunda a sábado; domingo é revisão leve (caderno de erros).
Início: segunda, 05/10/2026. As datas são meta: um checkpoint reprovado empurra o resto.

## Ao abrir uma sessão nova (instrução para o tutor)

1. Ler este arquivo e `PROGRESSO.md`.
2. Retomar exatamente o dia e o módulo indicados em `PROGRESSO.md`.
3. Ao fim da aula, atualizar `PROGRESSO.md` (dia, notas, erros) e fazer commit.

## Formato de cada aula (sempre nesta ordem)

| bloco | tempo | o quê |
| --- | --- | --- |
| Revisão espaçada | 10 min | 2–3 perguntas de módulos anteriores e do caderno de erros |
| Intuição | 10 min | figura da Prancheta mostrando o que a ideia faz |
| Teoria | 30 min | definição formal e exemplo resolvido, com o porquê de cada passo |
| Exercícios à mão | 60 min | fácil → médio → difícil; lista com gabarito via `sheet` quando valer |
| NumPy | 30–45 min | implementar à mão em Python e conferir com `numpy` |
| Fechamento | 10 min | correção, caderno de erros, atualizar o progresso |

**Regra de avanço:** checkpoint no fim de cada módulo; só avança com ≥ 80%.
Abaixo disso, a aula seguinte ataca exatamente o que falhou.

## Módulos

| # | módulo | conteúdo | ligação com ML | Prancheta | dias |
| --- | --- | --- | --- | --- | --- |
| 0 | Diagnóstico e ambiente | vetores, sistemas 2×2, somatório Σ; instalar Python + NumPy | — | `vectors` | D1 |
| 1 | Matriz, vetor e *shape* | notação aᵢⱼ, ordem, tipos (identidade, diagonal, triangular, simétrica), lei de formação | dataset como matriz X (n × d), pesos W | `data-table` | D2 |
| 2 | Operações e o produto | soma, escalar, transposta, produto escalar, A·x, A·B nas 3 visões (linha·coluna, combinação de colunas, soma de produtos externos), AB ≠ BA, custo O(n³) | camada densa `y = Wx + b`, broadcasting, batch | `data-table` | D3–D5 |
| 3 | Matriz como transformação | colunas = imagens de e₁, e₂; rotação, reflexão, cisalhamento, escala, projeção; produto = composição | por que empilhar camadas lineares sem ativação não ganha nada | `linear-map` | D6–D7 |
| 4 | Sistemas e inversa | escalonamento (Gauss-Jordan), posto, SPD/SPI/SI, inversa, LU; por que `solve` em vez de `inv` | resolver equações normais, estabilidade numérica | `space` (planos), `function-graph` (retas) | D8–D10 |
| 5 | Determinante | área/volume com sinal, cofatores (só o necessário), det(AB) = det A · det B, det = 0 ⇔ singular | singularidade, jacobiano em mudança de variáveis | `linear-map`, `space` | D11 |
| 6 | Espaços da matriz | independência linear, base, dimensão, espaço coluna, núcleo, posto-nulidade, mudança de base | features redundantes, multicolinearidade, posto baixo | `linear-map` (matriz singular) | D12–D14 |
| 7 | Ortogonalidade e mínimos quadrados | produto interno, normas L1/L2/Frobenius, projeção, Gram-Schmidt, QR, equações normais | **regressão linear** derivada do zero, regularização L2 | `vectors`, módulo `plot` | D15–D18 |
| 8 | Autovalores e matrizes simétricas | polinômio característico, diagonalização, Aⁿ, teorema espectral, definida positiva, formas quadráticas xᵀAx | covariância, hessiana, condicionamento e descida do gradiente | `linear-map`, `surface`, `field` | D19–D22 |
| 9 | SVD e PCA | SVD, aproximação de posto k (Eckart–Young), pseudo-inversa, PCA pela covariância e pela SVD | **PCA**, compressão de imagem, sistemas de recomendação | `linear-map`, módulo `plot` | D23–D26 |
| 10 | Cálculo matricial | gradiente de aᵀx, xᵀAx, ‖Ax − b‖²; jacobiano; regra da cadeia matricial | **backpropagation** de uma camada densa, à mão | `field`, `surface` | D27–D29 |
| 11 | Prova final e projeto | prova cobrindo tudo; projeto: regressão linear + PCA + rede de 1 camada só com NumPy | tudo junto | conforme o projeto | D30–D31 |

Tópicos fora do caminho principal (opcionais, depois do D31): forma de Jordan, regra de Cramer,
exponencial de matriz, cadeias de Markov, PageRank.

## Calendário-meta

| semana | datas | dias |
| --- | --- | --- |
| 1 | 05/10 – 10/10 | D1–D6 (M0, M1, M2, início do M3) |
| 2 | 12/10 – 17/10 | D7–D12 (M3, M4, M5, início do M6) |
| 3 | 19/10 – 24/10 | D13–D18 (M6, M7) |
| 4 | 26/10 – 31/10 | D19–D24 (M8, início do M9) |
| 5 | 02/11 – 07/11 | D25–D30 (M9, M10, prova) |
| 6 | 09/11 | D31 (projeto final) |
