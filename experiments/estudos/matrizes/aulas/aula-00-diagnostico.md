# Aula 0: Diagnóstico

Esta aula mede o que você já sabe. Ela não ensina nada novo e vale como
checkpoint do Módulo 0: com pelo menos 80%, seguimos para a Aula 1.1. Abaixo
disso, a próxima sessão reforça exatamente o que faltou.

Responda sem consultar nada. Quando não souber, escreva **"não sei"**: um chute
certo esconde o que precisa ser ensinado. Mostre as contas.

## A. Vetores no plano

1. Sendo u = (3, −1) e v = (−2, 4), calcule **u + v** e **2u − v**.
2. Qual é o comprimento (a norma) do vetor w = (3, 4)?
3. Escreva a = (2, 3) como combinação de e₁ = (1, 0) e e₂ = (0, 1), ou seja, ache os números α e β com a = α·e₁ + β·e₂.
4. Calcule o produto escalar de p = (1, 2) e q = (3, −1). O que o resultado diz sobre o ângulo entre os dois vetores?

## B. Sistemas 2×2

5. Resolva o sistema: x + y = 5 e x − y = 1.
6. Quantas soluções tem cada sistema? Justifique.
   - (a) 2x + 4y = 6 e x + 2y = 3
   - (b) 2x + 4y = 6 e x + 2y = 4
7. Desenhando as duas equações de um sistema 2×2 como retas no plano, o que significa a solução? Como ficam as retas nos casos (a) e (b) da questão 6?

## C. Somatório

8. Calcule a soma de (2i − 1) para i indo de 1 a 4.
9. Escreva 1·4 + 2·5 + 3·6 usando a notação de somatório (Σ).

## D. Programação

10. Em Python, com `a = [1, 2, 3]` e `b = [4, 5, 6]`, escreva o código que calcula 1·4 + 2·5 + 3·6. Você já usou NumPy? Se sim, como faria com ele?

## E. Sobre você (não vale nota)

11. Que contato você já teve com matrizes: nenhum, escola (ensino médio) ou faculdade?

---

## Correção (05/10/2026)

**Nota: 4,0 / 10 (40%).** Ficou abaixo dos 80%, então a próxima sessão é um
reforço do Módulo 0, com um checkpoint novo (M0-bis) no fim.

| questão | resposta | correta | pontos |
| --- | --- | --- | --- |
| 1 | u + v = (1, 3); 2u − v = (4, 2) | (1, 3) e **(8, −6)** | 0,5 |
| 2 | 1 | **5** = √(3² + 4²) | 0 |
| 3 | (2,0)(1,0) + (0,3)(0,1) | **a = 2e₁ + 3e₂** (α = 2, β = 3) | 0,5 |
| 4 | (3, −2); não sei | **1·3 + 2·(−1) = 1**; positivo, logo o ângulo é agudo | 0 |
| 5 | x = 3, y = 2 | x = 3, y = 2 | 1 |
| 6a | infinitas | infinitas: a 1ª equação é o dobro da 2ª | 0,5 |
| 6b | impossível saber | **nenhuma**: dividindo a 1ª por 2, x + 2y = 3, e não pode ser 3 e 4 ao mesmo tempo | 0 |
| 7 | não sei | a solução é o **ponto de encontro** das retas; em (a) as retas coincidem, em (b) são paralelas | 0 |
| 8 | 16 | 16 | 1 |
| 9 | Σ i . i+3 | **Σ_{i=1}^{3} i(i + 3)** | 0,5 |
| 10 | `np.sum(a, b)` | `np.dot(a, b)` = 32 (`np.sum(a, b)` dá TypeError) | 0 |

**Por área:** vetores 1,0/4 · sistemas 1,5/3 · somatório 1,5/2 · programação 0/1.

**O que liga os erros:** as questões 4, 9 e 10 são a mesma conta.
1·4 + 2·5 + 3·6 é o produto escalar de (1, 2, 3) com (4, 5, 6), e esse é o
coração do produto de matrizes. Na Q4 você fez a primeira metade (multiplicar
componente a componente) e parou antes de somar.

Figuras da correção: [`../figuras/aula-00-q1-vetores.png`](../figuras/aula-00-q1-vetores.png)
e [`../figuras/aula-00-q5-q6-retas.png`](../figuras/aula-00-q5-q6-retas.png).
