# Progresso: Matrizes

O plano está em [`PLANO.md`](PLANO.md). Este arquivo é atualizado e enviado
(commit e push) ao fim de cada sessão.

## Onde estamos

- **Plano:** versão 2 (método CIDA), desde 08/10/2026. Veja `PLANO.md` e `PESQUISA-METODOS.md`.
- **Módulo atual:** 1, A matriz age em vetores
- **Próxima atividade:** **Aula 1.1** (08/10). A revisão espaçada e o desafio de entrada foram enviados; falta receber as respostas.
- **Atraso:** nenhum em relação ao calendário da versão 2.
- **Decisão sobre o M0 (08/10):** o estudante pediu para começar as aulas sem o checkpoint M0-bis. O reforço deu B1 4,0/5, B2 4,0/5 e B3 3,75/5 (cerca de 78%); o laboratório B4 ficou com Q1 certa, Q2 e Q3 com meio ponto, e Q4 e Q5 dispensadas pelo estudante. Os itens abertos do M0 estão no baralho e valem no **Checkpoint M1**, que exige pelo menos 80% também nesses itens.

## Como retomar numa sessão nova

1. Na sessão nova, peça: "continue meus estudos de matrizes, branch `claude/wonderful-hopper-hqs74s`".
2. `git fetch origin claude/wonderful-hopper-hqs74s && git checkout claude/wonderful-hopper-hqs74s`
3. `source experiments/estudos/matrizes/setup-nuvem.sh`: instala as dependências e
   aponta o Playwright para o Chromium do container, para a Prancheta renderizar.
4. Ler o `PLANO.md` e este arquivo, e continuar da "Próxima atividade".

Figuras: `node src/cli.ts render <spec>.json --out experiments/estudos/matrizes/figuras`.

## Checkpoints

| módulo | data | nota | passou (≥ 80%)? | observação |
| --- | --- | --- | --- | --- |
| 0 Diagnóstico | 05/10 | 4,0/10 (40%) | não | vetores 25%, sistemas 50%, somatório 75%, programação 0%. Correção em `aulas/aula-00-diagnostico.md` |
| 0 Reforço (sem checkpoint) | 05–07/10 | B1 80%, B2 80%, B3 75% | dispensado | o estudante pediu para começar as aulas; os itens do M0 caem no checkpoint do M1 |
| 1 A matriz age em vetores | 11/10 | | | |
| 2 Transformações do plano | 15/10 | | | |
| 3 Produto = composição | 19/10 | | | |
| 4 Determinante | 23/10 | | | |
| 5 Sistemas e inversa | 28/10 | | | |
| 6 Espaços da matriz | 02/11 | | | |
| 7 Autovalores e autovetores | 07/11 | | | |
| 8 Ortogonalidade | 11/11 | | | |
| 9 SVD e tópicos avançados | 17/11 | | | |
| Prova final | 21/11 | | | |
| Prova de retenção | 21/12 | | | |

## Baralho de revisão (era o caderno de erros)

Regra 5 do plano: um acerto avança o intervalo (1 → 3 → 7 → 14 → 30 dias); um
erro volta o item para 1 dia; um erro com confiança 3 tem prioridade. O item sai
depois de acertado no intervalo de 30 dias. As colunas "acertos seguidos" e
"status" da versão 1 continuam; "próxima revisão" foi acrescentada em 08/10.

| # | data | módulo/aula | questão | o que aconteceu | causa | acertos seguidos | status | próxima revisão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 05/10 | M0 Q1 | 2u − v com u = (3, −1), v = (−2, 4) | respondeu (4, 2); o certo é (8, −6) | somou v em vez de subtrair: 6 − (−2) = 8 e −2 − 4 = −6 | 1 | aberto | 08/10 |
| 2 | 05/10 | M0 Q2 | norma de (3, 4) | respondeu 1; o certo é 5 | não conhecia \|w\| = √(x² + y²), que é Pitágoras | 1 | aberto | 10/10 |
| 3 | 05/10 | M0 Q3 | a = (2, 3) como αe₁ + βe₂ | ideia certa, notação errada: (2,0)(1,0) + (0,3)(0,1) | α e β são **números** (2 e 3), não vetores; "vetor vezes vetor" não foi definido | 1 | aberto | 10/10 |
| 4 | 05/10 | M0 Q4 | produto escalar de (1, 2) e (3, −1) | respondeu (3, −2) | multiplicou componente a componente e não somou: o produto escalar é **um número**, 3 − 2 = 1 | 1 | aberto | 10/10 |
| 5 | 05/10 | M0 Q4 | o que o produto escalar diz sobre o ângulo | não sabia | positivo: agudo; zero: reto; negativo: obtuso | 1 | aberto | 10/10 |
| 6 | 05/10 | M0 Q6 | classificar sistemas e justificar | (a) certo, sem justificar; (b) "impossível saber" | não comparou as equações: em (b), dividindo a 1ª por 2, fica x + 2y = 3 contra x + 2y = 4, então não há solução (SI) | 1 | aberto | 11/10 |
| 7 | 05/10 | M0 Q7 | geometria de um sistema 2×2 | não sabia | cada equação é uma reta; a solução é o ponto comum (SPD), a reta inteira (SPI) ou nada (paralelas, SI) | 0 | aberto | 09/10 |
| 8 | 05/10 | M0 Q9 | escrever 1·4 + 2·5 + 3·6 com Σ | Σ i . i+3, sem limites e sem parênteses | sem parênteses vira i² + 3; faltou i = 1 até 3: Σ_{i=1}^{3} i(i + 3). Em 07/10 acertou na B3 Q3a, mas esqueceu os parênteses na B3 Q5 e na Q3b (Σ 3 + (2i)) | 0 | aberto | 08/10 |
| 9 | 05/10 | M0 Q10 | 1·4 + 2·5 + 3·6 em Python | `np.sum(a, b)`, que dá TypeError | `np.sum` soma os elementos de **um** array, e o 2º argumento é o eixo; o certo é `np.dot(a, b)`, `np.array(a) @ np.array(b)` ou `sum(x*y for x, y in zip(a, b))` | 0 | aberto | 09/10 |
| 10 | 05/10 | Reforço M0, B1 Q3 | α(1, 1) + β(1, −1) = (5, −2) | tentou adivinhar inteiros (1 e 4, 2 e 3), e nenhum par serviu | igualar componente a componente dá um **sistema**: α + β = 5 e α − β = −2, logo α = 3/2 e β = 7/2 | 1 | aberto | 11/10 |
| 11 | 05/10 | Reforço M0, B1 Q5 | provar \|u + v\|² = \|u\|² + \|v\|² quando u·v = 0 | concluiu que cada produto u₁v₁, u₂v₂ tem fator zero, e generalizou a partir de um exemplo | **produto** zero implica fator zero; **soma** zero não (−2 + 2 = 0). Um exemplo não prova o caso geral; é preciso expandir (u₁ + v₁)² + (u₂ + v₂)². **Repetiu em 06/10** (B2 Q5: provou com um sistema específico) | 1 | aberto | 11/10 |
| 12 | 07/10 | Reforço M0, B4 Q3 | Σ de i = 1 a 10 com NumPy | usou `np.arange(10)`, que vai de 0 a 9, e as somas deram 330 e 100 em vez de 440 e 120 | `np.arange(n)` começa em **0** e para **antes** de n; Σ de i = 1 a 10 é `np.arange(1, 11)`. É o mesmo cuidado com os limites do Σ | 0 | aberto | 08/10 |

## Diário das sessões

| data | atividade | o que foi feito |
| --- | --- | --- |
| 05/10/2026 | Planejamento | Perfil definido (curiosidade > programação/ML > faculdade; 3 a 4 h por dia, todos os dias). Plano e calendário fixados. Figura de prévia: [`figuras/demo-2112.png`](figuras/demo-2112.png). |
| 05/10/2026 | Aula 0, diagnóstico | Nota 4,0/10 (40%), abaixo dos 80%, então vem o reforço. 9 erros no caderno. Contato anterior com matrizes: já teve, mas lembra pouco; NumPy: já usou, sem fluência. |
| 05–06/10 | Reforço M0, blocos 1 e 2 | B1 (vetores) 4,0/5, B2 (sistemas) 4,0/5. Erros 1–6 e 10 com 1 acerto; entrou o erro 11 (o "SPI" da B2 Q3 foi erro de digitação, então o erro 12 saiu). Regra nova: LaTeX só em bloco nas mensagens. |
| 07/10 | Reforço M0, bloco 3 | B3 (somatório) 3,75/5 (Q3b entregue depois, sem parênteses). A prova da Q5 foi geral (erro 11 ganhou 1 acerto), mas sem parênteses (erro 8 segue em 0). Bloco 4 (laboratório) enviado. |
| 08/10 | Pesquisa e plano v2 | O estudante dispensou Q4 e Q5 do laboratório e pediu uma pesquisa extensa de métodos antes das aulas. Foram 20 buscas; síntese em `PESQUISA-METODOS.md`. Plano refeito com o método CIDA: Ax pelas colunas primeiro, produto como composição, mini-projeto de ML por módulo, revisão espaçada e checkpoints cumulativos. Aula 1.1 iniciada. |
