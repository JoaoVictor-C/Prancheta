# Pesquisa: como ensinar matrizes a este estudante

Pesquisa feita em 08/10/2026, a pedido do estudante, antes de refazer o plano.
Foram 20 buscas na web e uma leitura do artigo completo do tutor de Harvard.
Cada achado tem a fonte, o que ela mostra e o que muda no plano.

**Para quem:** prioridades curiosidade > programação/ML > faculdade; de 3 a 4 h
por dia, todos os dias; autoestudo, com uma IA (eu) como tutora. O diagnóstico
mostrou contato prévio, mas fraco: os erros mais frequentes são de notação
(parênteses no Σ), de limites (`np.arange`) e de prova (generalizar a partir de
um exemplo).

---

## 1. O que a ciência cognitiva mostra que funciona

### 1.1 Prática de recuperação: testar-se em vez de reler

- **Dunlosky et al. (2013).** A revisão avaliou dez técnicas de estudo. Só duas
  receberam "alta utilidade": a **prática de testes** e a **prática distribuída**.
  Reler, grifar e resumir ficaram com "baixa utilidade".
  ([APS](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html))
- **Adesope, Trevisan & Sundararajan (2017).** A meta-análise reúne 272
  tamanhos de efeito, com g ≈ 0,61 (modelo de efeitos fixos) e g ≈ 0,70
  (efeitos aleatórios). O efeito aumenta **com feedback** e é maior quando o
  teste final vem de 1 a 6 dias depois. Aparece tanto em retenção quanto em
  transferência. ([WSU PDF](https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/),
  [Frontiers](https://frontiersin.org/articles/10.3389/fpsyg.2018.02412/full))
- **No plano:** toda sessão começa com perguntas de memória, sem consulta, sobre
  conteúdo antigo. O feedback vem logo depois. Nada de "revisar relendo".

### 1.2 Prática espaçada: intervalos crescentes

- **Cepeda et al. (2008).** O estudo teve mais de 1 350 participantes, com
  intervalos de até 3,5 meses e testes de até 1 ano depois. O intervalo ótimo
  entre revisões cresce com o tempo que se quer lembrar: fica entre 20% e 40%
  de um prazo de uma semana e entre 5% e 10% de um prazo de um ano.
  ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19076480/))
- **No plano:** o caderno de erros vira um **baralho de revisão**. Cada item é
  revisto em +1, +3, +7, +14 e +30 dias; um erro faz o item voltar para +1.
  Uma **prova de retenção** 30 dias depois da prova final mede se o conteúdo
  ficou.

### 1.3 Prática intercalada: misturar tipos de problema

- **Rohrer, Dedrick, Hartwig & Cheung (2020).** Ensaio randomizado
  pré-registrado com 54 turmas de 7º ano. Um mês depois, o grupo intercalado
  tirou 61% contra 38% do grupo em blocos (d = 0,83). O ensaio atende aos
  padrões do What Works Clearinghouse.
  ([IES/WWC](https://ies.ed.gov/ncee/wwc/Study/88770),
  [PDF](https://Www.Gwern.net/doc/psychology/spaced-repetition/2019-rohrer.pdf))
- **Por que funciona:** em matemática, a parte difícil é **escolher o método**.
  Uma lista em blocos entrega o método pronto.
- **No plano:** a prática de cada aula mistura o assunto novo com os antigos, e
  os checkpoints são **cumulativos**.

### 1.4 Exemplos resolvidos, retirados aos poucos

- **Efeito do exemplo resolvido (Sweller).** Novatos aprendem mais estudando
  soluções completas do que resolvendo problemas sozinhos.
- **Efeito de reversão da expertise.** Conforme o aluno domina o assunto, o
  exemplo resolvido passa a atrapalhar.
- **Retirada adaptativa.** Exemplos com cada vez menos passos prontos funcionam
  melhor quando a retirada acompanha o aluno (Salden et al.).
  ([Wikipedia](https://en.wikipedia.org/wiki/Worked-example_effect),
  [MIT OpenLearning](https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/worked-and-faded-examples))
- **Kirschner, Sweller & Clark (2006).** Orientação mínima não funciona com
  novatos: buscar a solução sozinho gasta a memória de trabalho e não constrói
  esquemas. ([PDF](https://www.davidlewisphd.com/courses/EDD8121/readings/2006-Kirschner_et_al.pdf))
- **No plano:** cada conceito novo segue a ordem: exemplo completo → exemplo
  com lacunas → problema sozinho. Quando o estudante acerta de primeira, o
  exemplo é pulado.

### 1.5 Autoexplicação

- **Bisra et al. (2018).** A meta-análise de 64 estudos dá g = 0,55 no geral e
  cerca de 0,44 em matemática. ([PDF](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf),
  [BPS](https://bps.org.uk/research-digest/self-explanation-powerful-learning-technique-according-meta-analysis-64-studies))
- **No plano:** nos exemplos resolvidos, o estudante responde "por que este
  passo?" em pelo menos um passo. Cada módulo termina com um "explique para um
  colega" de 5 linhas.

### 1.6 Tentar antes da explicação (falha produtiva e pré-teste)

- **Sinha & Kapur (2021).** A meta-análise reúne 53 estudos e 166 comparações.
  Resolver o problema antes da explicação supera a ordem tradicional em
  conhecimento conceitual e transferência (g ≈ 0,36), **desde que o aluno tenha
  conhecimento prévio suficiente**. O problema deve ser difícil, mas não
  impossível. ([UT Austin](https://education.utexas.edu/about/deans-office-units/office-instructional-innovation/instruction-then-problem-solving-or-vice-versa),
  [WEF](https://www.weforum.org/stories/2021/09/students-who-productively-fail-learn-more/))
- **Richland, Kornell & Kao (2009).** Até as tentativas **erradas** antes de
  estudar melhoram a retenção, desde que venham com feedback.
  ([PDF](https://learninglab.uchicago.edu/Pre-Testing_files/RichlandKornellKao.pdf))
- **Como conciliar com o item 1.4:** a tentativa é **curta** (de 10 a 15 min) e
  vem logo antes de uma explicação explícita, nunca no lugar dela.
- **No plano:** cada aula abre com um **desafio de entrada** que já usa o que o
  estudante sabe (vetores, sistemas). Ele não vale nota.

### 1.7 Exemplos com erro e confiança declarada

- **McLaren et al.** Achar e corrigir o erro de outra pessoa deu d = 0,62 num
  teste uma semana depois, embora os alunos tenham gostado **menos** da
  atividade. A replicação foi mista.
  ([Learning Scientists](https://www.learningscientists.org/blog/2023/7/27),
  [DFKI](https://dfki.de/web/forschung/projekte-publikationen/publikation/8598))
- **Efeito de hipercorreção.** Erros cometidos com **alta confiança** são
  corrigidos com mais facilidade depois do feedback, mas voltam se não forem
  revistos. ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415),
  [PubMed](https://pubmed.ncbi.nlm.nih.gov/21989771/))
- **Ilusão de competência.** Sentir que a matéria está fácil não prevê
  desempenho futuro.
  ([Structural Learning](https://www.structural-learning.com/post/fluency-illusions-students-think-they-know))
- **No plano:** toda resposta da revisão vem com uma nota de **confiança de 1 a
  3**. Um erro com confiança 3 tem prioridade no baralho. Toda aula tem um
  item "ache o erro", feito com os erros do próprio caderno.

### 1.8 Do concreto ao abstrato

- **Fyfe, McNeil, Son & Goldstone (2014).** A revisão defende começar com uma
  representação concreta e **retirá-la explicitamente** até chegar ao símbolo.
  Isso transfere melhor do que usar só o concreto ou só o abstrato.
  ([IU](https://pc.cogs.indiana.edu/?p=885),
  [Learning Scientists](https://learningscientists.org/blog/2018/2/1-1))
- **No plano:** toda ideia passa por quatro representações, sempre nesta ordem:
  figura da Prancheta → cálculo à mão → definição formal → código.

### 1.9 Curiosidade e o "jogo inteiro"

- **Gruber, Gelman & Ranganath (2014).** Em estado de curiosidade, a memória
  melhora, inclusive para informação lateral, por meio do circuito de dopamina
  e do hipocampo. A curiosidade nasce de uma **lacuna** entre o que se sabe e o
  que se quer saber (Loewenstein).
  ([Cardiff](https://orca.cardiff.ac.uk/id/eprint/96033),
  [PsyPost](https://www.psypost.org/curiosity-helps-learning-memory-study-finds))
- **Perkins, *Making Learning Whole*.** Jogar uma "versão júnior" do jogo
  inteiro desde o início, sem a "elementite" de peças soltas. O fast.ai aplica
  a mesma ideia ao ensino de ML, de cima para baixo.
  ([Harvard PZ](https://pz.harvard.edu/resources/making-learning-whole-how-seven-principles-of-teaching-can-transform-education),
  [Machine Learning Mastery](https://machinelearningmastery.com/practical-deep-learning-for-coders-review/))
- **No plano:** cada módulo abre com uma **pergunta-motor** real e termina com
  um **mini-projeto em NumPy** que a responde.

### 1.10 Domínio antes de avançar

- **Bloom (1984)** e as revisões posteriores. O "2 sigma" de Bloom não se
  replica. A tutoria humana fica em torno de d = 0,79 (VanLehn, 2011), os
  tutores inteligentes em torno de 0,76, e o domínio sozinho em cerca de 1 sigma
  nos estudos do próprio Bloom.
  ([Gwern PDF](https://Www.Gwern.net/doc/psychology/1984-bloom.pdf),
  [DTIC](https://apps.dtic.mil/sti/pdfs/AD1030353.pdf),
  [Nintil](https://nintil.com/bloom-sigma/))
- **Rosenshine.** Revisão diária curta, verificação frequente do entendimento e
  cerca de **80% de acerto** durante a prática guiada.
  ([Teacherhead](https://teacherhead.com/2019/10/02/rosenshines-principles-10-faqs/))
- **Math Academy (Skycak).** É o caso mais próximo do autoestudo: grafo de
  pré-requisitos, revisão espaçada e domínio antes de avançar, com
  "explicação mínima e prática logo".
  ([Math Academy](https://mathacademy.com/how-it-works),
  [Skycak](https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/))
- **No plano:** continua valendo a regra de 80% no checkpoint, agora
  cumulativo. Durante a prática, a dificuldade é calibrada para cerca de 80% de
  acerto: se o estudante acerta tudo, sobe a dificuldade.

### 1.11 Tutor de IA: o que funciona e o que atrapalha

- **Kestin et al. (2025), Harvard, *Scientific Reports*.** Um tutor de IA
  desenhado com boas práticas superou a aula de aprendizagem ativa. O ganho foi
  de 0,73 a 1,3 desvio-padrão por regressão quantílica (0,63 por regressão
  linear), com mediana de 49 min de estudo. Os princípios do tutor: aprendizagem
  ativa, controle da carga cognitiva, mentalidade de crescimento, andaimes passo
  a passo, informação correta, feedback imediato e ritmo próprio.
  ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/))
- **Bastani et al. (2025), *PNAS*.** O GPT-4 sem restrições melhorou a prática
  em 48%, mas **piorou a prova em 17%**: os alunos o usavam como muleta e
  achavam que estavam aprendendo. A versão com guardrails, que dá dicas em vez
  de respostas, eliminou o prejuízo.
  ([Wharton](https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education),
  [SSRN](https://papers.ssrn.com/abstract=4895486))
- **No plano:** eu nunca dou a resposta de um exercício antes de uma tentativa
  sua. A ajuda vem em três níveis de dica (ideia → passo → solução), e confiro
  toda conta com código ou com a Prancheta antes de afirmar algo.

---

## 2. O que a pesquisa sobre álgebra linear mostra

- **O obstáculo do formalismo (Dorier, Robert & Robinet).** As reclamações
  principais dos alunos são o formalismo, o excesso de definições novas e a
  falta de ligação com o que já sabiam. Os erros vêm de conceitos formais
  **desligados das intuições** anteriores. A solução proposta não é evitar o
  formalismo, mas ancorá-lo nas intuições.
  ([UNIGE](https://archive-ouverte.unige.ch/unige:16638),
  [Publimath](https://bibnum.publimath.fr/IST/IST05013.pdf))
- **Os três mundos de Tall, aplicados por Stewart & Thomas.** Os mundos são o
  corpóreo (geométrico), o simbólico e o formal. Os alunos manipulam símbolos
  sem significado e muitos não têm **nenhuma imagem geométrica** de
  autovetores. Uma sequência que passa pelos três mundos produziu respostas nos
  três; o grupo tradicional não deu nenhuma resposta corpórea.
  ([MERGA 2009](https://merga.net.au/wp-content/uploads/DOCS/common/Uploaded%20files/Annual%20Conference%20Proceedings/2009%20Annual%20Conference%20Proceedings/Stewart_RP09.pdf),
  [JOTSE](https://jotse.org/index.php/jotse/article/view/260))
- **Inquiry-Oriented Linear Algebra (Wawro, Rasmussen, Andrews-Larson).** O
  determinante é ensinado como **fator de variação da área ou do volume** de uma
  transformação, a partir de transformações de ℝ² e ℝ³. Os mínimos quadrados
  partem da ideia de "menor distância".
  ([IOLA](https://iola.math.vt.edu/publications.php))
- **Strang, *A 2020 Vision of Linear Algebra*.** Começar pelas **colunas**: Ax
  como combinação das colunas, depois espaço coluna e A = CR, antes de LU e da
  eliminação. O curso usa exemplos pequenos de inteiros, em que se **vê** a
  dependência. ([MIT OCW](https://ocw.tau.edu.ng/resources/res-18-010-a-2020-vision-of-linear-algebra-spring-2020),
  [Strang & Moler](https://math.mit.edu/~gs/linearalgebra/ila5/lucr.pdf))
- **LAFF (van de Geijn & Myers, UT Austin).** Teoria e programação andam
  juntas, ligando abstração matemática a abstração de código.
  ([UT CS](https://www.cs.utexas.edu/news/2018/linear-algebra-foundations-frontiers-kicks-its-seventh-run))

---

## 3. O método escolhido

Nenhuma escola sozinha serve. O que a evidência apoia para um autodidata com
prioridade curiosidade > ML > faculdade é uma combinação que chamo de **ciclo
CIDA**:

1. **Curiosidade:** uma pergunta-motor por módulo e um desafio de entrada por
   aula (itens 1.6 e 1.9).
2. **Instrução explícita do concreto ao abstrato:** figura → cálculo →
   definição → código, com exemplos resolvidos que vão sendo retirados (itens
   1.4, 1.8 e seção 2).
3. **Domínio:** prática intercalada calibrada em cerca de 80%, checkpoints
   cumulativos, autoexplicação e "ache o erro" (itens 1.3, 1.5, 1.7 e 1.10).
4. **Aprendizagem que dura:** recuperação espaçada com confiança declarada e
   prova de retenção (itens 1.1, 1.2 e 1.7).

Isso tudo funciona dentro das regras de tutor do item 1.11.

**Mudanças de conteúdo** em relação ao plano anterior:

- **A matriz entra como ação sobre vetores**, com Ax como combinação das
  colunas, no Módulo 1 (Strang; seção 2). Antes ela entrava como tabela de
  números.
- **Notação e tipos** (aᵢⱼ, lei de formação, diagonal, simétrica) deixam de ser
  um módulo à parte. Eles entram quando são usados, para evitar a "elementite"
  de Perkins.
- **O produto de matrizes vem depois das transformações**, como composição de
  transformações, e não como regra solta.
- **O determinante é ensinado como fator de área** (IOLA).
- **Cada módulo termina num mini-projeto de ML** em NumPy.
