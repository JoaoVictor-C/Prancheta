# Plano de estudo: Matrizes, do zero ao domínio

Este plano é fixo. Ele só muda se o estudante pedir. O andamento, as notas e o
caderno de erros ficam em [`PROGRESSO.md`](PROGRESSO.md).

**Perfil (respondido em 05/10/2026)**

- **Objetivo, em ordem de prioridade:** 1. curiosidade, 2. programação/ML, 3. faculdade.
- **Tempo:** 3 a 4 horas por dia, todos os dias.
- **Onde fica:** branch `claude/wonderful-hopper-hqs74s` do repositório
  `JoaoVictor-C/Prancheta`, na pasta `experiments/estudos/matrizes/`.

## Como as prioridades mudam as aulas

1. **Curiosidade.** Toda aula começa pelo que a ideia *faz*, com uma figura da
   Prancheta, e termina com "de onde isso veio / onde aparece".
2. **Programação/ML.** Toda aula tem um laboratório em Python/NumPy, e cada
   módulo liga o conteúdo a um uso real em ML (veja a coluna "Ponte com ML").
3. **Faculdade.** O exercício difícil de cada aula pede uma justificativa ou
   uma demonstração. A partir do Módulo 6 há pelo menos uma prova curta por aula.

## Como cada sessão funciona (sempre nesta ordem, de 3 a 4 h)

| bloco | duração | o que acontece |
| --- | --- | --- |
| 1. Revisão | 20 min | 2 ou 3 perguntas de módulos anteriores, sempre incluindo um erro do caderno |
| 2. Intuição | 20 min | figura da Prancheta: o que a ideia *faz* antes da fórmula |
| 3. Definição formal | 20 min | notação e enunciado exatos |
| 4. Exemplo resolvido | 20 min | passo a passo, com o porquê de cada passo |
| 5. Sua vez | 60 min | exercícios fácil → médio → difícil, à mão |
| 6. Laboratório | 45 min | o mesmo conteúdo em Python/NumPy, conferindo as contas feitas à mão |
| 7. Correção comentada | 15 min | cada erro vai para o caderno de erros; o `PROGRESSO.md` é atualizado e salvo |
| (opcional) Extra | até 60 min | desafio, demonstração ou leitura de curiosidade |

Quando for útil, as listas saem em PDF com gabarito pelo comando `sheet` da
Prancheta, que também gera versões com números novos para refazer.

## Regras que eu sigo à risca

1. **Toda sessão começa** pela leitura do `PLANO.md` e do `PROGRESSO.md`, e
   continua exatamente da próxima atividade registrada.
2. **Regra de avanço:** só se passa de módulo com **pelo menos 80%** no
   checkpoint. Abaixo disso, a sessão seguinte é de reforço, atacando
   exatamente o que falhou, e depois vem um checkpoint novo, com números novos.
3. **Nada é pulado.** Se faltar tempo, a aula termina na sessão seguinte. Ela
   nunca é comprimida.
4. **O calendário escorrega, a ordem não muda.** Um dia perdido ou um reforço
   empurra todas as datas seguintes. O `PROGRESSO.md` registra o atraso.
5. **Todo erro entra no caderno de erros**, com a causa, e volta nas revisões
   até ser acertado duas vezes seguidas.
6. **Toda sessão termina com commit e push** do `PROGRESSO.md`. O container
   da nuvem é temporário.
7. **Toda matemática é escrita em LaTeX** (pedido do estudante em 05/10/2026).
   - **Nas mensagens:** só LaTeX em bloco, `$$...$$` numa linha própria, porque o
     LaTeX dentro da linha não funciona no app do Claude. No meio do texto vai
     Unicode simples (x², ≠, √2, aᵢⱼ, θ), nunca `$...$`.
   - **Nos arquivos `.md`:** pode usar `$...$` no texto, porque o GitHub renderiza.

## Os módulos

| # | Módulo | Conteúdo | Visual na Prancheta | Ponte com ML | Aulas |
|---|---|---|---|---|---|
| 0 | **Diagnóstico** | Vetores no plano, sistemas 2×2, notação de somatório | `vectors` | um vetor como lista de números (features); `numpy.array` | 1 |
| 1 | **O que é uma matriz** | Notação aᵢⱼ, ordem, lei de formação (aᵢⱼ = 2i − j), tipos: quadrada, identidade, diagonal, triangular, simétrica | `data-table` | imagem em tons de cinza = matriz; dataset = matriz n×d | 2 |
| 2 | **Operações** | Soma, escalar, transposta, **produto** (linha × coluna *e* combinação de colunas), por que AB ≠ BA, potências | `data-table` com destaques | camada linear y = Wx + b; um batch é XWᵀ | 3 |
| 3 | **Matriz como transformação** | Colunas = imagens de e₁ e e₂; rotação, reflexão, cisalhamento, escala, projeção; produto = composição | `linear-map` | data augmentation; camadas sem ativação colapsam numa só | 3 |
| 4 | **Determinante** | det 2×2 como área com sinal, 3×3 por Sarrus e como volume, Laplace/cofatores, propriedades, det(AB) = det A · det B | `linear-map` (área medida), `space` | det = 0 ⟺ informação perdida; Jacobiano (curiosidade) | 3 |
| 5 | **Inversa e sistemas lineares** | Inversa 2×2, adjunta, Gauss-Jordan, posto, SPD/SPI/SI, regra de Cramer | `space` (3 planos), `function-graph` (2 retas) | `np.linalg.solve` em vez de inverter; por quê | 4 |
| 6 | **Espaços da matriz** | Independência linear, base, dimensão, espaço coluna, núcleo, posto-nulidade, mudança de base | `linear-map` (matriz singular achatando o plano) | features redundantes; posto baixo (LoRA) | 4 |
| 7 | **Autovalores e autovetores** | Polinômio característico, diagonalização, Aⁿ, Cayley-Hamilton, teorema espectral | `linear-map` (direções que não giram) | matriz de covariância; prévia do PCA | 4 |
| 8 | **Ortogonalidade** | Produto interno, projeções, Gram-Schmidt, QR, mínimos quadrados | `vectors` (projeções), módulo `plot` | regressão linear do zero | 3 |
| 9 | **Tópicos avançados** | Formas quadráticas e cônicas, SVD, exponencial de matriz e x′ = Ax, forma de Jordan, número de condição | `construction` (elipses), `field` (fluxo de x′ = Ax) | PCA, compressão de imagem, estabilidade numérica | 5 |
| 10 | **Aplicações e prova final** | Markov, PageRank, adjacência de grafos, cifra de Hill, coordenadas homogêneas | `graph`, `probability-tree` | atenção em transformers: QKᵀ é um produto de matrizes | 3 |

Total: **35 aulas e 10 checkpoints**. O diagnóstico já serve de checkpoint do
Módulo 0. Os módulos 0 a 5 cobrem ensino médio e vestibular, os módulos 6 a 8
uma disciplina de Álgebra Linear, e os módulos 9 e 10 são o "domínio completo".

## As aulas, uma a uma

| dia | data prevista | atividade |
| --- | --- | --- |
| 1 | seg 05/10 | **Aula 0:** diagnóstico (vetores, sistemas 2×2, somatório). Vale como checkpoint do M0 |
| 2 | ter 06/10 | **1.1** Notação aᵢⱼ, ordem m×n, lei de formação, igualdade de matrizes |
| 3 | qua 07/10 | **1.2** Tipos: linha, coluna, nula, quadrada, diagonal principal, identidade, diagonal, triangulares, simétrica e antissimétrica |
| 4 | qui 08/10 | **Checkpoint M1** |
| 5 | sex 09/10 | **2.1** Soma, subtração, multiplicação por escalar, transposta e suas propriedades |
| 6 | sáb 10/10 | **2.2** Produto: condição das ordens, linha × coluna, combinação das colunas |
| 7 | dom 11/10 | **2.3** AB ≠ BA, matriz identidade como elemento neutro, potências, (AB)ᵀ = BᵀAᵀ |
| 8 | seg 12/10 | **Checkpoint M2** |
| 9 | ter 13/10 | **3.1** Matriz × vetor; as colunas são T(e₁) e T(e₂); linearidade |
| 10 | qua 14/10 | **3.2** Catálogo: rotação, reflexão, cisalhamento, escala, projeção |
| 11 | qui 15/10 | **3.3** Composição = produto; por que a ordem importa; desfazer uma transformação |
| 12 | sex 16/10 | **Checkpoint M3** |
| 13 | sáb 17/10 | **4.1** det 2×2 como área com sinal; orientação |
| 14 | dom 18/10 | **4.2** det 3×3: Sarrus, volume, Laplace e cofatores |
| 15 | seg 19/10 | **4.3** Propriedades; det(AB) = det A · det B; det = 0 ⟺ a transformação achata |
| 16 | ter 20/10 | **Checkpoint M4** |
| 17 | qua 21/10 | **5.1** Inversa: definição, fórmula 2×2, quando existe |
| 18 | qui 22/10 | **5.2** Sistemas em forma matricial Ax = b; escalonamento de Gauss |
| 19 | sex 23/10 | **5.3** Gauss-Jordan; inversa por escalonamento; posto |
| 20 | sáb 24/10 | **5.4** SPD/SPI/SI e sua geometria; regra de Cramer; matriz adjunta |
| 21 | dom 25/10 | **Checkpoint M5** (fim do bloco de ensino médio e vestibular) |
| 22 | seg 26/10 | **6.1** Combinação linear, espaço gerado, independência linear |
| 23 | ter 27/10 | **6.2** Base, dimensão, coordenadas numa base |
| 24 | qua 28/10 | **6.3** Espaço coluna, espaço linha, núcleo; teorema do posto-nulidade |
| 25 | qui 29/10 | **6.4** Mudança de base; matrizes semelhantes |
| 26 | sex 30/10 | **Checkpoint M6** |
| 27 | sáb 31/10 | **7.1** Av = λv; polinômio característico |
| 28 | dom 01/11 | **7.2** Autoespaços, multiplicidades, diagonalização |
| 29 | seg 02/11 | **7.3** Aⁿ por diagonalização (Fibonacci); Cayley-Hamilton |
| 30 | ter 03/11 | **7.4** Matrizes simétricas e teorema espectral; autovalores complexos (rotações) |
| 31 | qua 04/11 | **Checkpoint M7** |
| 32 | qui 05/11 | **8.1** Produto interno, norma, ângulo, projeção ortogonal |
| 33 | sex 06/11 | **8.2** Bases ortonormais, matrizes ortogonais, Gram-Schmidt, QR |
| 34 | sáb 07/11 | **8.3** Mínimos quadrados, equações normais, regressão linear |
| 35 | dom 08/11 | **Checkpoint M8** (fim do bloco de Álgebra Linear) |
| 36 | seg 09/11 | **9.1** Formas quadráticas; cônicas xᵀAx = 1; matriz definida positiva |
| 37 | ter 10/11 | **9.2** SVD: intuição (girar, esticar, girar) e cálculo |
| 38 | qua 11/11 | **9.3** SVD na prática: PCA, compressão de imagem, aproximação de posto baixo |
| 39 | qui 12/11 | **9.4** Exponencial de matriz; x′ = Ax e retratos de fase |
| 40 | sex 13/11 | **9.5** Forma de Jordan (visão geral); número de condição |
| 41 | sáb 14/11 | **Checkpoint M9** |
| 42 | dom 15/11 | **10.1** Cadeias de Markov e PageRank |
| 43 | seg 16/11 | **10.2** Matriz de adjacência (Aⁿ conta caminhos); cifra de Hill |
| 44 | ter 17/11 | **10.3** Coordenadas homogêneas em computação gráfica; matrizes em redes neurais e atenção |
| 45 | qua 18/11 | **Prova final** (todos os módulos) |

As datas são previsões e seguem a regra 4: um reforço ou um dia perdido
empurra tudo o que vem depois.
