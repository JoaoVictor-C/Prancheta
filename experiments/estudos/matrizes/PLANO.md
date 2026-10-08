# Plano de estudo: Matrizes, do zero ao domínio

**Versão 2, de 08/10/2026.** O plano foi refeito a pedido do estudante, depois
de uma pesquisa sobre métodos de ensino. As fontes e o raciocínio estão em
[`PESQUISA-METODOS.md`](PESQUISA-METODOS.md). O andamento, as notas e o baralho
de revisão ficam em [`PROGRESSO.md`](PROGRESSO.md). O plano só muda se o
estudante pedir.

**Perfil (respondido em 05/10/2026)**

- **Objetivo, em ordem de prioridade:** 1. curiosidade, 2. programação/ML, 3. faculdade.
- **Tempo:** 3 a 4 horas por dia, todos os dias.
- **Onde fica:** branch `claude/wonderful-hopper-hqs74s` do repositório
  `JoaoVictor-C/Prancheta`, na pasta `experiments/estudos/matrizes/`.

## O método: ciclo CIDA

| letra | o que é | evidência |
| --- | --- | --- |
| **C**uriosidade | cada módulo abre com uma **pergunta-motor** e cada aula com um **desafio de entrada**, uma tentativa curta antes da explicação | Gruber 2014; Sinha & Kapur 2021; Richland et al. 2009 |
| **I**nstrução do concreto ao abstrato | figura da Prancheta → cálculo → definição formal → código; exemplo completo → exemplo com lacunas → problema sozinho | Fyfe et al. 2014; Sweller; Stewart & Thomas; Strang 2020 |
| **D**omínio | prática **intercalada** calibrada em cerca de 80% de acerto; autoexplicação; "ache o erro"; checkpoint **cumulativo** de pelo menos 80% | Rohrer 2020; Bisra 2018; McLaren; Bloom; Rosenshine |
| **A**prendizagem que dura | recuperação **espaçada** (+1, +3, +7, +14, +30 dias) com confiança de 1 a 3; prova de retenção 30 dias depois do fim | Dunlosky 2013; Adesope 2017; Cepeda 2008 |

## Como cada sessão funciona (cerca de 3 h 30)

| bloco | duração | o que acontece |
| --- | --- | --- |
| 1. Revisão espaçada | 15 min | 3 a 5 perguntas sem consulta, vindas do baralho (itens vencendo hoje). Cada resposta leva uma confiança de 1 a 3. |
| 2. Desafio de entrada | 10–15 min | um problema sobre o assunto novo, resolvido **antes** da explicação, só com o que já se sabe. Errar é esperado e não vale nota. |
| 3. Instrução | 30 min | figura da Prancheta → cálculo → definição formal. A explicação mostra por que o desafio funcionou ou não. |
| 4. Exemplos | 30 min | um exemplo completo com perguntas "por que este passo?", depois um exemplo com lacunas para completar |
| 5. Prática intercalada | 60 min | de 6 a 8 exercícios, misturando o assunto novo com os antigos, do fácil ao difícil, com um "ache o erro" |
| 6. Laboratório | 45 min | o mesmo conteúdo em NumPy, como peça do mini-projeto do módulo |
| 7. Saída | 10 min | 3 perguntas rápidas sem consulta e "o que ficou mais confuso hoje?". Depois atualizo e salvo o `PROGRESSO.md`. |

Quando for útil, as listas saem em PDF com gabarito pelo comando `sheet` da
Prancheta, que também gera versões com números novos.

## Regras que eu sigo à risca

1. **Toda sessão começa** pela leitura do `PLANO.md` e do `PROGRESSO.md`, e
   continua exatamente da próxima atividade registrada.
2. **Regra de avanço.** Só se passa de módulo com **pelo menos 80%** no
   checkpoint, que é **cumulativo**: cerca de 70% do conteúdo do módulo e 30%
   dos anteriores. Abaixo disso, a sessão seguinte é um reforço do que falhou,
   seguido de um checkpoint com números novos.
3. **Nada é pulado.** Se faltar tempo, a aula termina na sessão seguinte, sem
   ser comprimida.
4. **O calendário escorrega, a ordem não muda.** Um reforço ou um dia perdido
   empurra as datas seguintes, e o `PROGRESSO.md` registra o atraso.
5. **Baralho de revisão.** Todo erro e todo conceito novo entram no baralho,
   com data da próxima revisão. Um acerto avança o intervalo
   (1 → 3 → 7 → 14 → 30 dias); um erro faz o item voltar para 1 dia. Um erro
   cometido com confiança 3 tem prioridade. O item sai do baralho depois de
   acertado no intervalo de 30 dias.
6. **Regras de tutor**, de Bastani 2025 e Kestin 2025:
   - nunca dou a resposta de um exercício antes de uma tentativa sua;
   - a ajuda vem em três níveis: dica de ideia → dica de passo → solução;
   - confiro toda conta com código ou com a Prancheta antes de afirmar;
   - quando você pede "não responda", eu espero.
7. **Toda sessão termina com commit e push** do `PROGRESSO.md`. O container
   da nuvem é temporário.
8. **Toda matemática é escrita em LaTeX** (pedido do estudante em 05/10/2026).
   - **Nas mensagens:** só LaTeX em bloco, `$$...$$` numa linha própria, porque
     o LaTeX dentro da linha não funciona no app do Claude. No meio do texto vai
     Unicode simples (x², ≠, √2, aᵢⱼ, θ), nunca `$...$`.
   - **Nos arquivos `.md`:** pode usar `$...$` no texto, porque o GitHub renderiza.

## Os módulos

O Módulo 0 (vetores, sistemas 2×2, somatório) foi feito de 05 a 07/10, com
diagnóstico e reforço. Os erros que continuam abertos vão para o baralho e
caem no checkpoint do Módulo 1 (veja o `PROGRESSO.md`).

| # | módulo | pergunta-motor | conteúdo | Prancheta | mini-projeto (NumPy) | aulas |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **A matriz age em vetores** | O que uma camada de rede neural faz com um vetor? | Ax como combinação das colunas e como produtos escalares das linhas; notação aᵢⱼ, ordem m×n, lei de formação; matriz como dados (imagem, dataset) | `linear-map`, `data-table` | aplicar W a pontos e a uma imagem pequena; y = Wx + b | 3 |
| 2 | **Transformações do plano** | Por que toda transformação linear é uma matriz? | linearidade; colunas = T(e₁), T(e₂); rotação, reflexão, escala, cisalhamento, projeção; o que **não** é linear (translação) | `linear-map` | data augmentation: girar e espelhar uma figura | 3 |
| 3 | **Produto = composição** | Por que duas camadas lineares equivalem a uma só? | AB como "faça B, depois A"; (AB)ᵢⱼ = Σₖ aᵢₖbₖⱼ; AB ≠ BA; identidade, potências, soma, escalar; transposta e (AB)ᵀ = BᵀAᵀ; tipos: diagonal, triangular, simétrica | `linear-map`, `data-table` | mostrar que W₂(W₁x) = (W₂W₁)x e medir o custo das duas formas | 3 |
| 4 | **Determinante** | Quanto uma transformação estica a área? | det 2×2 como área com sinal; 3×3 como volume (Sarrus, Laplace); propriedades; det(AB) = det A · det B; det = 0 ⟺ achata | `linear-map` (área medida), `space` | Monte Carlo: medir a área da imagem do quadrado e comparar com o det | 3 |
| 5 | **Sistemas e inversa** | Como desfazer uma transformação? | Ax = b; Gauss e Gauss-Jordan; posto; SPD/SPI/SI com 3 variáveis; inversa 2×2 e por escalonamento; Cramer e adjunta | `space` (3 planos), `function-graph` | eliminação de Gauss escrita do zero, comparada com `np.linalg.solve` | 4 |
| 6 | **Espaços da matriz** | Quanta informação uma matriz carrega de verdade? | span, independência linear, base, dimensão; espaço coluna e A = CR (Strang); núcleo; posto-nulidade; mudança de base | `linear-map` (matriz singular achatando o plano) | detectar features redundantes num dataset pelo posto | 4 |
| 7 | **Autovalores e autovetores** | Quais direções uma matriz não gira? Como o Google ordena páginas? | Av = λv; polinômio característico; diagonalização; Aⁿ (Fibonacci); Cayley-Hamilton; teorema espectral; autovalores complexos | `linear-map` (eigen) | método da potência num grafo pequeno, um PageRank de brinquedo | 4 |
| 8 | **Ortogonalidade** | Qual é a melhor reta por pontos que não estão alinhados? | produto interno; projeção sobre reta e subespaço; Gram-Schmidt; QR; mínimos quadrados e equações normais | `vectors`, módulo `plot` | regressão linear do zero, comparada com `np.linalg.lstsq` | 3 |
| 9 | **SVD e tópicos avançados** | Como comprimir uma imagem guardando só o essencial? | formas quadráticas e cônicas; SVD (girar, esticar, girar); PCA; exponencial de matriz e x′ = Ax; Jordan (visão geral); número de condição | `construction`, `field` | compressão de imagem por SVD e PCA de um dataset | 5 |
| 10 | **Aplicações e projeto final** | Onde as matrizes aparecem fora da aula? | Markov e PageRank; adjacência (Aⁿ conta caminhos); cifra de Hill; coordenadas homogêneas; atenção (QKᵀ) | `graph`, `probability-tree` | projeto final escolhido pelo estudante | 3 |

Total: **35 aulas, 9 checkpoints e a prova final**, mais a prova de retenção.

## Calendário

| dia | data | atividade |
| --- | --- | --- |
| 1 | qui 08/10 | **1.1** Ax como combinação das colunas; notação aᵢⱼ e ordem m×n |
| 2 | sex 09/10 | **1.2** Ax pelas linhas: cada entrada é um produto escalar; lei de formação |
| 3 | sáb 10/10 | **1.3** Matriz como dados (imagem, dataset); y = Wx + b; mini-projeto do M1 |
| 4 | dom 11/10 | **Checkpoint M1**, com os itens abertos do M0 |
| 5 | seg 12/10 | **2.1** Linearidade; a matriz a partir de T(e₁) e T(e₂) |
| 6 | ter 13/10 | **2.2** Rotação, reflexão, escala, cisalhamento, projeção |
| 7 | qua 14/10 | **2.3** O que não é linear; mini-projeto do M2 (data augmentation) |
| 8 | qui 15/10 | **Checkpoint M2** |
| 9 | sex 16/10 | **3.1** AB como composição; a fórmula (AB)ᵢⱼ = Σₖ aᵢₖbₖⱼ |
| 10 | sáb 17/10 | **3.2** AB ≠ BA; identidade, potências, soma, escalar |
| 11 | dom 18/10 | **3.3** Transposta; tipos de matrizes; mini-projeto do M3 |
| 12 | seg 19/10 | **Checkpoint M3** |
| 13 | ter 20/10 | **4.1** det 2×2 como área com sinal |
| 14 | qua 21/10 | **4.2** det 3×3: volume, Sarrus, Laplace |
| 15 | qui 22/10 | **4.3** Propriedades; det(AB); det = 0; mini-projeto do M4 |
| 16 | sex 23/10 | **Checkpoint M4** |
| 17 | sáb 24/10 | **5.1** Ax = b; eliminação de Gauss |
| 18 | dom 25/10 | **5.2** Gauss-Jordan; posto; SPD/SPI/SI com 3 variáveis |
| 19 | seg 26/10 | **5.3** Inversa: 2×2, por escalonamento, propriedades |
| 20 | ter 27/10 | **5.4** Cramer e adjunta; mini-projeto do M5 |
| 21 | qua 28/10 | **Checkpoint M5** (fim do bloco de ensino médio e vestibular) |
| 22 | qui 29/10 | **6.1** Span e independência linear |
| 23 | sex 30/10 | **6.2** Base, dimensão, coordenadas |
| 24 | sáb 31/10 | **6.3** Espaço coluna, A = CR, núcleo, posto-nulidade |
| 25 | dom 01/11 | **6.4** Mudança de base; mini-projeto do M6 |
| 26 | seg 02/11 | **Checkpoint M6** |
| 27 | ter 03/11 | **7.1** Av = λv; polinômio característico |
| 28 | qua 04/11 | **7.2** Autoespaços; diagonalização |
| 29 | qui 05/11 | **7.3** Aⁿ (Fibonacci); Cayley-Hamilton |
| 30 | sex 06/11 | **7.4** Teorema espectral; autovalores complexos; mini-projeto do M7 |
| 31 | sáb 07/11 | **Checkpoint M7** |
| 32 | dom 08/11 | **8.1** Produto interno; projeções |
| 33 | seg 09/11 | **8.2** Bases ortonormais; Gram-Schmidt; QR |
| 34 | ter 10/11 | **8.3** Mínimos quadrados; mini-projeto do M8 (regressão) |
| 35 | qua 11/11 | **Checkpoint M8** (fim do bloco de Álgebra Linear) |
| 36 | qui 12/11 | **9.1** Formas quadráticas; cônicas; definida positiva |
| 37 | sex 13/11 | **9.2** SVD: intuição e cálculo |
| 38 | sáb 14/11 | **9.3** PCA e compressão de imagem; mini-projeto do M9 |
| 39 | dom 15/11 | **9.4** Exponencial de matriz; x′ = Ax |
| 40 | seg 16/11 | **9.5** Jordan (visão geral); número de condição |
| 41 | ter 17/11 | **Checkpoint M9** |
| 42 | qua 18/11 | **10.1** Markov e PageRank |
| 43 | qui 19/11 | **10.2** Grafos; cifra de Hill |
| 44 | sex 20/11 | **10.3** Coordenadas homogêneas; atenção; projeto final |
| 45 | sáb 21/11 | **Prova final** (cumulativa) |
| — | seg 21/12 | **Prova de retenção**, 30 dias depois, sem aviso de conteúdo |
