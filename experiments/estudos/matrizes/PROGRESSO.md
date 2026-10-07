# Progresso: Matrizes

O plano está em [`PLANO.md`](PLANO.md). Este arquivo é atualizado e enviado
(commit e push) ao fim de cada sessão.

## Onde estamos

- **Módulo atual:** 0, Diagnóstico (reprovado com 40%, em reforço)
- **Próxima atividade:** **Reforço M0** (previsto para 06/10), atacando os erros 1 a 9 do caderno:
  1. vetores: sinal ao subtrair, multiplicação por escalar, norma (Pitágoras), combinação linear (α e β são números), produto escalar e o sinal do ângulo;
  2. sistemas 2×2 como duas retas: se cortam (SPD), coincidem (SPI) ou são paralelas (SI), e como classificar comparando as equações;
  3. somatório: índice, limites e parênteses; Σ aᵢbᵢ é o produto escalar;
  4. laboratório: listas e `zip`, depois `np.array`, `*`, `np.sum`, `np.dot`, `@` e `np.linalg.norm`.

  No fim da sessão vem o **checkpoint M0-bis**: 10 questões novas no mesmo formato. Com 80% ou mais, segue a Aula 1.1.
- **Atraso em relação ao calendário:** +2 dias (o reforço ocupou 05 a 07/10; a Aula 1.1 vai para depois do M0-bis, no mínimo 08/10)
- **Andamento do reforço:** B1 4,0/5, B2 4,0/5, B3 3,75/5; B4 (laboratório): Q1 certa, Q2 e Q3 com meio ponto, Q4 e Q5 pendentes.

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
| 0 M0-bis | | | | |
| 1 O que é uma matriz | | | | |
| 2 Operações | | | | |
| 3 Matriz como transformação | | | | |
| 4 Determinante | | | | |
| 5 Inversa e sistemas | | | | |
| 6 Espaços da matriz | | | | |
| 7 Autovalores e autovetores | | | | |
| 8 Ortogonalidade | | | | |
| 9 Tópicos avançados | | | | |
| 10 Prova final | | | | |

## Caderno de erros

Cada erro tem uma causa e só sai daqui depois de acertado duas vezes seguidas
nas revisões.

| # | data | módulo/aula | questão | o que aconteceu | causa | acertos seguidos | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 05/10 | M0 Q1 | 2u − v com u = (3, −1), v = (−2, 4) | respondeu (4, 2); o certo é (8, −6) | somou v em vez de subtrair: 6 − (−2) = 8 e −2 − 4 = −6 | 1 | aberto |
| 2 | 05/10 | M0 Q2 | norma de (3, 4) | respondeu 1; o certo é 5 | não conhecia \|w\| = √(x² + y²), que é Pitágoras | 1 | aberto |
| 3 | 05/10 | M0 Q3 | a = (2, 3) como αe₁ + βe₂ | ideia certa, notação errada: (2,0)(1,0) + (0,3)(0,1) | α e β são **números** (2 e 3), não vetores; "vetor vezes vetor" não foi definido | 1 | aberto |
| 4 | 05/10 | M0 Q4 | produto escalar de (1, 2) e (3, −1) | respondeu (3, −2) | multiplicou componente a componente e não somou: o produto escalar é **um número**, 3 − 2 = 1 | 1 | aberto |
| 5 | 05/10 | M0 Q4 | o que o produto escalar diz sobre o ângulo | não sabia | positivo: agudo; zero: reto; negativo: obtuso | 1 | aberto |
| 6 | 05/10 | M0 Q6 | classificar sistemas e justificar | (a) certo, sem justificar; (b) "impossível saber" | não comparou as equações: em (b), dividindo a 1ª por 2, fica x + 2y = 3 contra x + 2y = 4, então não há solução (SI) | 1 | aberto |
| 7 | 05/10 | M0 Q7 | geometria de um sistema 2×2 | não sabia | cada equação é uma reta; a solução é o ponto comum (SPD), a reta inteira (SPI) ou nada (paralelas, SI) | 0 | aberto |
| 8 | 05/10 | M0 Q9 | escrever 1·4 + 2·5 + 3·6 com Σ | Σ i . i+3, sem limites e sem parênteses | sem parênteses vira i² + 3; faltou i = 1 até 3: Σ_{i=1}^{3} i(i + 3). Em 07/10 acertou na B3 Q3a, mas esqueceu os parênteses na B3 Q5 e na Q3b (Σ 3 + (2i)) | 0 | aberto |
| 9 | 05/10 | M0 Q10 | 1·4 + 2·5 + 3·6 em Python | `np.sum(a, b)`, que dá TypeError | `np.sum` soma os elementos de **um** array, e o 2º argumento é o eixo; o certo é `np.dot(a, b)`, `np.array(a) @ np.array(b)` ou `sum(x*y for x, y in zip(a, b))` | 0 | aberto |
| 10 | 05/10 | Reforço M0, B1 Q3 | α(1, 1) + β(1, −1) = (5, −2) | tentou adivinhar inteiros (1 e 4, 2 e 3), e nenhum par serviu | igualar componente a componente dá um **sistema**: α + β = 5 e α − β = −2, logo α = 3/2 e β = 7/2 | 1 | aberto |
| 11 | 05/10 | Reforço M0, B1 Q5 | provar \|u + v\|² = \|u\|² + \|v\|² quando u·v = 0 | concluiu que cada produto u₁v₁, u₂v₂ tem fator zero, e generalizou a partir de um exemplo | **produto** zero implica fator zero; **soma** zero não (−2 + 2 = 0). Um exemplo não prova o caso geral; é preciso expandir (u₁ + v₁)² + (u₂ + v₂)². **Repetiu em 06/10** (B2 Q5: provou com um sistema específico) | 1 | aberto |
| 12 | 07/10 | Reforço M0, B4 Q3 | Σ de i = 1 a 10 com NumPy | usou `np.arange(10)`, que vai de 0 a 9, e as somas deram 330 e 100 em vez de 440 e 120 | `np.arange(n)` começa em **0** e para **antes** de n; Σ de i = 1 a 10 é `np.arange(1, 11)`. É o mesmo cuidado com os limites do Σ | 0 | aberto |

## Diário das sessões

| data | atividade | o que foi feito |
| --- | --- | --- |
| 05/10/2026 | Planejamento | Perfil definido (curiosidade > programação/ML > faculdade; 3 a 4 h por dia, todos os dias). Plano e calendário fixados. Figura de prévia: [`figuras/demo-2112.png`](figuras/demo-2112.png). |
| 05/10/2026 | Aula 0, diagnóstico | Nota 4,0/10 (40%), abaixo dos 80%, então vem o reforço. 9 erros no caderno. Contato anterior com matrizes: já teve, mas lembra pouco; NumPy: já usou, sem fluência. |
| 05–06/10 | Reforço M0, blocos 1 e 2 | B1 (vetores) 4,0/5, B2 (sistemas) 4,0/5. Erros 1–6 e 10 com 1 acerto; entrou o erro 11 (o "SPI" da B2 Q3 foi erro de digitação, então o erro 12 saiu). Regra nova: LaTeX só em bloco nas mensagens. |
| 07/10 | Reforço M0, bloco 3 | B3 (somatório) 3,75/5 (Q3b entregue depois, sem parênteses). A prova da Q5 foi geral (erro 11 ganhou 1 acerto), mas sem parênteses (erro 8 segue em 0). Bloco 4 (laboratório) enviado. |
