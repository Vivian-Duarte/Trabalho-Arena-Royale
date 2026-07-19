# I - Infraestrutura de Navegação e Colisão

## 1. Movimentação e Identificação de Obstáculos

---

## Problema

Dificuldade geral de locomoção e identificação de obstáculos, o que ocasionava travamentos constantes dos personagens não jogáveis ao longo da arena.

Sintomas identificados:

- bots travando contra paredes;
- bots tremendo ao tentar andar contra obstáculos;
- bots colidindo ou se bloqueando mutuamente;
- bots insistindo em movimentos inválidos;
- bots tentando sair da arena ao encostar nas bordas.

---

## Solução

Foi implementado um algoritmo de **desvio local** (*local avoidance*) para garantir que as entidades recalculem trajetórias curtas de forma autônoma. A solução busca evitar colisões físicas mútuas, colisões contra a geometria estática do mapa, insistência em movimentos inválidos e tremedeira nas bordas da arena. O módulo recalcula pequenos desvios de trajetória em tempo real quando o movimento direto do bot está bloqueado, sem substituir a física original do jogo.

---

## Arquivos da Implementação

A implementação foi isolada em dois arquivos:

```text
bot-local-avoidance.js
bot-local-avoidance-tests.js
```

### `bot-local-avoidance.js`

Contém o algoritmo de desvio local.

### `bot-local-avoidance-tests.js`

Contém os testes automatizados executados diretamente no navegador, com o jogo aberto.

Essa separação permite:

- testar a solução sem modificar o arquivo original do jogo;
- carregar o módulo dinamicamente pelo console do navegador;
- instalar e remover o algoritmo durante a execução;
- comparar o comportamento do jogo com e sem a melhoria;
- validar a solução de forma isolada antes da integração real;
- manter a implementação reversível.

---

## Fluxo da Lógica Implementada

A lógica inicial do módulo segue o fluxo:

```text
1. A IA original decide a direção em que o bot deseja se mover.
2. O jogo chama a função moverEntidade().
3. O módulo intercepta essa chamada quando está instalado.
4. O módulo verifica se o movimento direto está bloqueado.
5. Se o movimento estiver livre, ele é mantido sem alteração.
6. Se o movimento estiver bloqueado, o módulo testa pequenos ângulos alternativos.
7. Se encontrar um desvio válido, retorna esse novo vetor.
8. Se não encontrar desvio válido, retorna movimento zero.
9. A física original do jogo continua sendo responsável por aplicar o movimento final.
```

---

## Refinamentos Implementados

Após partidas reais e auditoria visual, foram adicionados refinamentos para reduzir comportamentos instáveis.

### 1. Memória curta de desvio

Quando o bot escolhe um lado para contornar um obstáculo, ele mantém essa preferência por alguns frames. Isso reduz a alternância rápida entre esquerda e direita.

### 2. Leitura antecipada de bloqueio

O módulo passou a detectar bloqueios antes da colisão física direta. Foram usados pontos de sondagem à frente do bot, considerando:

- direção do movimento;
- raio da entidade;
- distância de antecipação;
- paredes;
- bordas;
- outras entidades.

### 3. Verificação pós-movimento

Após a tentativa de movimento, o módulo compara a posição antes e depois da chamada da física original. Se o bot tentou se mover, mas quase não saiu do lugar, o contador `stuck` é incrementado.

---

## Correção Específica para Bordas da Arena

Durante a auditoria visual, foi observado que alguns bots ainda tremiam ao encostar nas bordas da arena. O comportamento identificado foi:

```text
1. O bot tentava andar para fora da arena.
2. A física bloqueava o movimento.
3. O módulo tentava um desvio lateral.
4. No frame seguinte, a IA voltava a tentar sair.
5. O bot oscilava visualmente na borda.
```

Para resolver esse problema, foi implementada a lógica:

```text
getArenaReturnMove(...)
```

Essa função calcula um vetor de retorno para dentro da arena sempre que o bot tenta sair do mapa. A regra implementada foi:

- se o bot tenta sair pela esquerda, o movimento corrigido aponta para a direita;
- se o bot tenta sair pela direita, o movimento corrigido aponta para a esquerda;
- se o bot tenta sair por cima, o movimento corrigido aponta para baixo;
- se o bot tenta sair por baixo, o movimento corrigido aponta para cima;
- se o bot está em um canto, o movimento corrigido aponta diagonalmente para dentro.

Também foram adicionadas as configurações:

```text
arenaSoftMargin
minArenaReturnSpeed
```

A `arenaSoftMargin` faz com que a correção seja acionada antes do bot ficar exatamente colado na borda.

A `minArenaReturnSpeed` garante que o vetor de retorno tenha força mínima suficiente para afastar o bot da borda.

---

## Testes Automatizados

Antes da correção de bordas, a suíte possuía 10 testes. Após a auditoria visual, foram adicionados 5 testes específicos. A suíte final passou a ter 15 testes:

```text
1. movimento livre mantém vetor original
2. parede bloqueia movimento direto e gera desvio
3. borda da arena bloqueia saída e gera desvio
4. borda esquerda força retorno para dentro da arena
5. borda direita força retorno para dentro da arena
6. borda superior força retorno para dentro da arena
7. borda inferior força retorno para dentro da arena
8. canto da arena força correção diagonal para dentro
9. outra entidade bloqueia movimento direto e gera desvio
10. sem desvio possível retorna espera
11. entidade encostada pode se afastar
12. memória curta mantém lado de desvio contra parede
13. parede longa permite sequência curta de contorno
14. pós-movimento travado força tentativa de escape
15. jogo aberto expõe funções necessárias
```

Com esses testes, o módulo passou a validar se existe algum desvio na borda e se esse desvio aponta corretamente para dentro da arena.

---

## Como Executar o Jogo para Testes

O jogo deve estar aberto no navegador antes de carregar os módulos.

Recomendação:

```powershell
py -m http.server 5500
```

Depois, acessar:

```text
http://localhost:5500/Learning%20Framework.html
```

Também é possível abrir o HTML diretamente no navegador.

---

## Como Carregar o Módulo Principal

No console do navegador:

```js
const scriptAvoidance = document.createElement("script");
scriptAvoidance.src = "bot-local-avoidance.js?v=" + Date.now();
document.head.appendChild(scriptAvoidance);
```

Verificação:

```js
typeof BotLocalAvoidance
```

Resultado esperado:

```js
"object"
```

---

## Como Carregar o Módulo de Testes

No console:

```js
const scriptTests = document.createElement("script");
scriptTests.src = "bot-local-avoidance-tests.js?v=" + Date.now();
document.head.appendChild(scriptTests);
```

Verificação:

```js
typeof BotLocalAvoidanceTests
```

Resultado esperado:

```js
"object"
```

---

## Como Executar os Testes Automatizados

Executar:

```js
BotLocalAvoidanceTests.run()
```

Resultado esperado:

```text
Todos os testes passaram.
```

---

## Como Instalar o Módulo no Jogo Real

Após os testes passarem:

```js
BotLocalAvoidance.install()
```

Resultado esperado:

```js
{
  ok: true,
  installed: true,
  message: "Desvio local instalado."
}
```

Confirmar a instalação:

```js
moverEntidade.name
```

Resultado esperado com o módulo ativo:

```js
"patchedMover"
```

Esse resultado confirma que a função original `moverEntidade()` foi envelopada pelo módulo de desvio local.

---

## Como Zerar Contadores Antes da Partida

Antes de cada partida de teste:

```js
BotLocalAvoidance.resetStats()
BotLocalAvoidance.stats.stuck = 0
BotLocalAvoidance.stats
```

Resultado esperado:

```js
{
  direct: 0,
  avoided: 0,
  wait: 0,
  ignored: 0,
  stuck: 0,
  installs: 1
}
```

Esse passo evita confusão com dados acumulados de partidas anteriores.

---

## Lógica Executada a Cada Frame

Durante uma partida, quando a IA tenta mover um bot, ocorre a seguinte sequência:

```text
1. A IA original decide a direção do bot.
2. O jogo chama moverEntidade(bot, movX, movY).
3. Como o módulo está instalado, a chamada passa por patchedMover.
4. O módulo verifica se a entidade é um bot/NPC.
5. Se não for bot, registra ignored e chama a função original.
6. Se for bot, calcula o movimento desejado.
7. O módulo verifica paredes, entidades e arena.
8. Se o movimento direto estiver livre, registra direct.
9. Se o movimento estiver bloqueado, calcula desvio local.
10. Se o bloqueio for borda de arena, prioriza vetor para dentro da arena.
11. Se encontrar desvio válido, registra avoided.
12. Se não encontrar desvio válido, registra wait e retorna movimento zero.
13. A função original moverEntidade aplica o movimento final.
14. O módulo compara posição antes/depois.
15. Se o bot quase não se moveu, registra stuck.
```

---

## Como Consultar Métricas Após a Partida

Durante ou após a partida:

```js
BotLocalAvoidance.stats
```

Campos:

```text
direct   → movimentos normais, sem necessidade de desvio
avoided  → movimentos em que o desvio local foi aplicado
wait     → situações em que nenhum desvio válido foi encontrado
ignored  → chamadas ignoradas por não exigirem atuação do módulo
stuck    → casos em que o bot tentou se mover, mas quase não saiu do lugar
installs → quantidade de instalações do módulo
```
---

## Como Remover o Módulo para Comparação

Para remover:

```js
BotLocalAvoidance.uninstall()
```

Resultado esperado:

```js
{
  ok: true,
  installed: false,
  message: "Desvio local removido."
}
```

Confirmar:

```js
moverEntidade.name
```

Resultado esperado após remoção:

```js
"moverEntidade"
```

Isso indica que o jogo voltou a usar a função original.

---

## Como Confirmar que o Módulo Parou de Atuar

Após remover o módulo:

```js
const antes = { ...BotLocalAvoidance.stats };

setTimeout(() => {
  const depois = { ...BotLocalAvoidance.stats };
  console.table({ antes, depois });
}, 5000);
```

Critério esperado:

```text
Os valores de antes e depois devem permanecer iguais.
```

Se os contadores não aumentarem, o módulo não está mais interceptando a movimentação.

---

## Conclusão da Etapa 1

A solução final utiliza um algoritmo modular de desvio local capaz de detectar bloqueios contra paredes, bordas da arena e outras entidades, sugerindo movimentos alternativos curtos apenas quando o movimento direto está impedido.

## Etapa 2 — Navegação e Verificação Espacial do Chefão

A Etapa 2 teve como objetivo corrigir os travamentos específicos do Chefão/Titã durante a navegação pela arena. O problema identificado era a ausência de uma avaliação dimensional antes do deslocamento. Como o Chefão possui tamanho físico maior do que os bots comuns, alguns caminhos aparentemente livres para entidades menores eram, na prática, incompatíveis com seu raio de colisão.

Para resolver esse problema, foi implementada uma validação espacial volumétrica específica para o Chefão. Antes de aplicar o movimento, o sistema verifica se o caminho projetado possui espaço suficiente para a passagem da entidade, considerando seu raio físico, margem de segurança, obstáculos, paredes, limites da arena e entidades próximas.

A implementação foi feita de forma modular, sem alterar diretamente o arquivo original do jogo. A integração foi realizada no mesmo módulo de desvio local usado na Etapa 1, mantendo o interceptador `patchedMover`.

### Arquivos adicionados ou atualizados

- `boss-spatial-validation.js`  
  Contém a lógica de validação espacial específica do Chefão.

- `boss-spatial-validation-tests.js`  
  Contém os testes automatizados da Etapa 2.

- `bot-local-avoidance.js`  
  Foi atualizado para integrar a validação espacial do Chefão ao sistema de desvio local já existente.

### Problemas tratados na Etapa 2

Durante os testes e auditorias visuais, foram identificados os seguintes problemas:

- Chefão tentando atravessar vãos estreitos incompatíveis com seu tamanho.
- Chefão colidindo com paredes e obstáculos maiores.
- Chefão permanecendo preso em regiões com pouca folga.
- Chefão tremendo visualmente ao tentar escapar.
- Chefão ficando em zigue-zague ao desviar de adversários próximos.
- Chefão ativando fuga emergencial repetidas vezes sem sair do local.

### Soluções implementadas

A solução final incluiu os seguintes recursos:

- Validação do caminho projetado antes do deslocamento.
- Cálculo do raio físico do Chefão.
- Uso de margem de segurança ao redor da entidade.
- Bloqueio preventivo de rotas estreitas.
- Detecção de travamento visual.
- Detecção de permanência excessiva na mesma área.
- Escape reforçado em caso de stuck.
- Fuga contra adversários próximos.
- Fuga vetorial para longe de obstáculos e entidades.
- Direção de escape comprometida, evitando zigue-zague.
- Restrição da fuga emergencial apenas para ameaças realmente próximas.
- Priorização da direção de escape já escolhida antes de recalcular novo pânico.

---

## Como carregar os módulos da Etapa 2

Com o jogo aberto no navegador, execute no console:

```javascript
(async function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src + "?v=" + Date.now();
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  await loadScript("boss-spatial-validation.js");
  await loadScript("bot-local-avoidance.js");
  await loadScript("boss-spatial-validation-tests.js");

  console.table({
    BossSpatialValidation: typeof window.BossSpatialValidation,
    BotLocalAvoidance: typeof window.BotLocalAvoidance,
    BossSpatialValidationTests: typeof window.BossSpatialValidationTests,
    moverEntidade: typeof window.moverEntidade === "function" ? window.moverEntidade.name : "undefined",
    version: window.BotLocalAvoidance ? window.BotLocalAvoidance.version : "não carregado"
  });
})();
```

### Resultado esperado

| Item | Valor esperado |
|---|---|
| `BossSpatialValidation` | `"object"` |
| `BotLocalAvoidance` | `"object"` |
| `BossSpatialValidationTests` | `"object"` |
| `version` | `"2.8.2"` |

---

## Como executar os testes da Etapa 2

Após carregar os arquivos, execute:

```javascript
BossSpatialValidationTests.run()
```

### Resultado esperado

```text
Todos os testes do Chefão passaram.
```
---

## Como instalar o módulo no jogo real

Depois que os testes passarem, execute:

```javascript
BotLocalAvoidance.install()
```

Em seguida, confirme se o interceptador foi instalado:

```javascript
moverEntidade.name
```

### Resultado esperado

```text
"patchedMover"
```

Esse resultado indica que a função original `moverEntidade()` foi envelopada pelo módulo de desvio local. A física original do jogo continua sendo responsável por aplicar o movimento final das entidades. O módulo apenas ajusta ou bloqueia o vetor de movimento antes que a física original execute o deslocamento.

---

## Como zerar as métricas antes da partida

Antes de cada simulação, execute:

```javascript
BotLocalAvoidance.resetStats()
BotLocalAvoidance.resetBossStats()
BotLocalAvoidance.resetStates()
BotLocalAvoidance.stats.stuck = 0
```
---

## Como verificar as métricas do Chefão

Durante ou após a partida, execute:

```javascript
console.table({
  bossStuck: BotLocalAvoidance.bossStats.stuck,
  bossVisualStuck: BotLocalAvoidance.bossStats.visualStuck,
  bossAreaStuck: BotLocalAvoidance.bossStats.areaStuck,

  bossPanicEscapes: BotLocalAvoidance.bossStats.panicEscapes,
  bossThreatEscapes: BotLocalAvoidance.bossStats.threatEscapes,
  bossEscapeBoosts: BotLocalAvoidance.bossStats.escapeBoosts,

  bossCommittedEscapes: BotLocalAvoidance.bossStats.committedEscapes,
  bossLastMoveMode: BotLocalAvoidance.bossStats.lastMoveMode,
  bossLastBlockReason: BotLocalAvoidance.bossStats.lastBlockReason
});
```

---

## Significado das métricas do Chefão

| Métrica | Descrição |
|---|---|
| `bossStuck` | Quantidade de travamentos detectados no Chefão. |
| `bossVisualStuck` | Travamentos visuais detectados após uma tentativa de movimento. |
| `bossAreaStuck` | Casos em que o Chefão permaneceu tempo demais na mesma região. |
| `bossPanicEscapes` | Quantidade de fugas emergenciais contra ameaças próximas. |
| `bossThreatEscapes` | Fugas acionadas por adversários próximos. |
| `bossEscapeBoosts` | Escapes que utilizaram reforço temporário de velocidade. |
| `bossCommittedEscapes` | Quantidade de vezes em que o Chefão reutilizou uma direção de fuga já escolhida. |
| `bossLastMoveMode` | Último modo de movimento registrado. |
| `bossLastBlockReason` | Último motivo de bloqueio ou fuga registrado. |

---

## Resultado esperado nas validações finais

Nas validações finais, os principais indicadores de travamento devem permanecer o mais proximo de zero possivel:

```text
bossStuck: <2
bossVisualStuck: <2
bossAreaStuck: <2
```

Esses valores indicam que o Chefão quase não apresentou travamentos durante a simulação real.

---

## Resultado final da Etapa 2

A Etapa 2 foi validada na versão `2.8.2`.

### Resultados obtidos

- [x] 16 testes automatizados da Etapa 2 aprovados.
- [x] Chefão com menos travamentos visuais nas simulações finais.
- [x] `bossStuck = <2`.
- [x] `bossVisualStuck = <2`.
- [x] `bossAreaStuck = <2`.
- [x] Bots comuns revalidados após a integração.
- [x] 15 testes da Etapa 1 aprovados novamente.
- [x] Métricas da Etapa 1 com `wait = 0` e `stuck = 0`.

Com isso, a navegação do Chefão tornou-se mais estável, coerente com seu tamanho físico e mais fluida durante o combate, mantendo a entidade ativa como ameaça real dentro da arena sem comprometer o comportamento dos bots comuns.

---

## Etapa 3 — Correção do Travamento do Titã em Paredes

A Etapa 3 teve como objetivo corrigir situações em que o Titã poderia ficar preso ao tentar se mover contra paredes, obstáculos ou regiões de pouca folga. Embora as etapas anteriores já tratassem desvio local e validação espacial, ainda era necessário criar uma camada específica para detectar quando o Titã tentava se mover, mas permanecia praticamente parado.

A implementação foi feita de forma modular, sem alterar diretamente o arquivo principal do jogo.

### Arquivos adicionados ou atualizados

- `boss-wall-unstuck.js`  
  Contém a lógica específica de detecção e destravamento do Titã em paredes.

- `boss-wall-unstuck-tests.js`  
  Contém os testes automatizados da Etapa 3.

- `bot-local-avoidance.js`  
  Foi ajustado com autorização da responsável pela funcionalidade anterior para suavizar o zigue-zague rápido do Titã quando cercado por bots, sem comprometer os testes já existentes.

---

## Problema tratado na Etapa 3

O Titã poderia insistir em movimentos inválidos quando estivesse próximo a paredes ou obstáculos. Em alguns casos, ele tentava se mover, mas quase não saía do lugar, gerando risco de travamento visual ou funcional.

Sintomas observados:

- Titã tentando se mover contra paredes;
- Titã quase parado mesmo recebendo comando de movimento;
- necessidade de uma rotina própria de destravamento;
- risco de interferir nas funcionalidades anteriores de desvio local e validação espacial.

---

## Solução implementada

Foi criado o módulo `boss-wall-unstuck.js`, responsável por comparar o movimento pretendido com o movimento realmente executado pelo Titã.

A lógica principal utiliza:

```text
movimentoPretendido = distância que o Titã tentou andar
movimentoReal = distância que ele realmente saiu do lugar
```

Se o Titã se mover menos do que o limite esperado por alguns frames consecutivos, o sistema considera que existe uma possível situação de travamento e ativa um estado temporário de destravamento.

Configuração final utilizada:

```javascript
stuckTriggerFrames: 2,
stuckMoveRatio: 0.35,

unstuckFrames: 45,
unstuckCommitFrames: 18,
unstuckSpeedMultiplier: 1.05,
minUnstuckSpeed: 1.5,
```

Isso significa que, se o Titã andar menos de 35% do movimento pretendido por 2 frames consecutivos, o módulo ativa a rotina de destravamento.

Durante o estado de destravamento, o Titã deixa de insistir na direção bloqueada e passa a testar rotas alternativas:

- movimentos laterais;
- movimentos diagonais;
- movimento de recuo;
- manutenção temporária da direção escolhida.

Quando volta a se mover normalmente por alguns frames, o estado de destravamento é encerrado.

---

## Correção complementar: zigue-zague rápido do Titã

Durante os testes visuais, foi identificado um comportamento em que o Titã ficava fazendo zigue-zague muito rápido quando era cercado por vários bots. Esse comportamento deixava a movimentação pouco natural, principalmente porque o Titã recalculava rotas de fuga muitas vezes em sequência.

Após análise, foi observado que esse comportamento vinha principalmente da lógica de escape e repulsão do Chefão no `bot-local-avoidance.js`, e não diretamente do novo módulo `boss-wall-unstuck.js`.

Com autorização da responsável pela funcionalidade anterior, foram ajustados apenas os parâmetros específicos do Chefão, preservando a lógica original e mantendo todos os testes passando.

Configuração final ajustada:

```javascript
bossEscapeFrames: 80,
bossEscapeSpeedMultiplier: 1.15,
bossEscapeCommitFrames: 42,

bossRepulsionEntityRange: 105,
bossRepulsionEntityWeight: 2.2,

bossThreatEscapeRange: 180,
bossThreatHardRange: 90,
bossThreatEscapeFrames: 45,
```

Com isso, o Titã continuou desviando e evitando travamentos, mas passou a manter a direção de escape por mais tempo e com menor aceleração. O zigue-zague ainda existe, mas ficou visualmente mais natural, com movimentos mais amplos e menos tremidos.

---

## Testes automatizados da Etapa 3

A nova suíte de testes possui 7 testes:

```text
1. módulo expõe funções principais
2. bot comum não ativa destravamento do Titã
3. Titã parado por alguns frames ativa estado de destravamento
4. estado de destravamento troca perseguição direta por rota alternativa
5. direção alternativa é mantida por alguns ciclos
6. Titã sai do estado de destravamento após movimentos válidos
7. instalação preserva moverEntidade como função
```

Esses testes validam que:

- o módulo foi carregado corretamente;
- bots comuns não ativam a lógica do Titã;
- o Titã entra em estado de destravamento quando necessário;
- o Titã escolhe rotas alternativas;
- a direção alternativa é mantida por alguns frames;
- o estado de destravamento é encerrado após recuperação;
- a função `moverEntidade()` continua funcionando após a instalação do módulo.

---

## Como carregar os módulos da Etapa 3

Com o jogo aberto no navegador, execute no console:

```javascript
(async function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src + "?v=" + Date.now();
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  await loadScript("boss-spatial-validation.js");
  await loadScript("bot-local-avoidance.js");
  await loadScript("bot-local-avoidance-tests.js");
  await loadScript("boss-spatial-validation-tests.js");
  await loadScript("boss-wall-unstuck.js");
  await loadScript("boss-wall-unstuck-tests.js");

  console.table({
    BossSpatialValidation: typeof window.BossSpatialValidation,
    BotLocalAvoidance: typeof window.BotLocalAvoidance,
    BotLocalAvoidanceTests: typeof window.BotLocalAvoidanceTests,
    BossSpatialValidationTests: typeof window.BossSpatialValidationTests,
    BossWallUnstuck: typeof window.BossWallUnstuck,
    BossWallUnstuckTests: typeof window.BossWallUnstuckTests,
    moverEntidade: typeof window.moverEntidade === "function" ? window.moverEntidade.name : "undefined"
  });
})();
```

### Resultado esperado

| Item | Valor esperado |
|---|---|
| `BossSpatialValidation` | `"object"` |
| `BotLocalAvoidance` | `"object"` |
| `BotLocalAvoidanceTests` | `"object"` |
| `BossSpatialValidationTests` | `"object"` |
| `BossWallUnstuck` | `"object"` |
| `BossWallUnstuckTests` | `"object"` |

---

## Como executar todos os testes

Após carregar os módulos, execute:

```javascript
BotLocalAvoidanceTests.run()
BossSpatialValidationTests.run()
BossWallUnstuckTests.run()
```

### Resultado esperado

```text
Todos os testes passaram.
Todos os testes do Chefão passaram.
Todos os testes de destravamento do Titã passaram.
```

---

## Como instalar os módulos no jogo real

Depois que todos os testes passarem, execute:

```javascript
BotLocalAvoidance.install()
BossWallUnstuck.install()
```

Confirme a instalação:

```javascript
moverEntidade.name
```

Resultado esperado:

```text
"bossWallUnstuckMover"
```

Esse resultado indica que o módulo de destravamento do Titã foi instalado por cima do módulo de desvio local, preservando a lógica anterior e adicionando uma camada extra de segurança para o Chefão.

---

## Como zerar as métricas antes da partida

Antes de cada partida de validação, execute:

```javascript
BotLocalAvoidance.resetStats()
BotLocalAvoidance.resetBossStats()
BotLocalAvoidance.resetStates()

BossWallUnstuck.resetStats()
BossWallUnstuck.resetStates()
```

---

## Como verificar as métricas após a partida

Durante ou após a partida, execute:

```javascript
console.table({
  botDirect: BotLocalAvoidance.stats.direct,
  botAvoided: BotLocalAvoidance.stats.avoided,
  botWait: BotLocalAvoidance.stats.wait,
  botStuck: BotLocalAvoidance.stats.stuck,

  bossDirect: BotLocalAvoidance.bossStats.direct,
  bossAvoided: BotLocalAvoidance.bossStats.avoided,
  bossWait: BotLocalAvoidance.bossStats.wait,
  bossStuck: BotLocalAvoidance.bossStats.stuck,
  bossVisualStuck: BotLocalAvoidance.bossStats.visualStuck,
  bossAreaStuck: BotLocalAvoidance.bossStats.areaStuck,

  bossPanicEscapes: BotLocalAvoidance.bossStats.panicEscapes,
  bossThreatEscapes: BotLocalAvoidance.bossStats.threatEscapes,
  bossRepulsionEscapes: BotLocalAvoidance.bossStats.repulsionEscapes,
  bossEscapeBoosts: BotLocalAvoidance.bossStats.escapeBoosts,
  bossCommittedEscapes: BotLocalAvoidance.bossStats.committedEscapes,

  bossLastMoveMode: BotLocalAvoidance.bossStats.lastMoveMode,
  bossLastBlockReason: BotLocalAvoidance.bossStats.lastBlockReason,
  bossLastEscapeMultiplier: BotLocalAvoidance.bossStats.lastEscapeMultiplier,
  bossLastThreatType: BotLocalAvoidance.bossStats.lastThreatType,

  wallUnstuckDetections: BossWallUnstuck.stats.stuckDetections,
  wallUnstuckActivations: BossWallUnstuck.stats.activations,
  wallUnstuckRecoveries: BossWallUnstuck.stats.recoveries
});
```

---

## Significado das métricas do BossWallUnstuck

| Métrica | Descrição |
|---|---|
| `wallUnstuckDetections` | Quantidade de vezes em que o módulo detectou possível travamento do Titã. |
| `wallUnstuckActivations` | Quantidade de vezes em que o estado de destravamento foi ativado. |
| `wallUnstuckRecoveries` | Quantidade de vezes em que o Titã saiu do estado de destravamento e voltou ao movimento normal. |

---

## Resultado final da Etapa 3

A Etapa 3 foi validada com todos os testes automatizados passando.

### Resultados obtidos

- [x] 15 testes da Etapa 1 aprovados novamente.
- [x] 16 testes da Etapa 2 aprovados novamente.
- [x] 7 testes da Etapa 3 aprovados.
- [x] Bots comuns sem travamento nas validações finais.
- [x] Titã sem travamento visual nas validações finais.
- [x] `botStuck = 0`.
- [x] `bossStuck = 0`.
- [x] `bossVisualStuck = 0`.
- [x] `bossAreaStuck = 0`.
- [x] Zigue-zague rápido do Titã suavizado.
- [x] Movimento do Titã mais natural quando cercado por bots.

Com isso, o Titã passou a contar com uma camada própria de destravamento em paredes, sem comprometer o comportamento dos bots comuns e sem quebrar a validação espacial já implementada anteriormente. Além disso, o ajuste complementar no comportamento do Chefão reduziu o zigue-zague acelerado, tornando a experiência de combate mais natural.

## Etapa 4 — Processamento Visual e Tomada de Decisão do Chefão

A Etapa 4 teve como objetivo reduzir a paralisia decisória do Chefão/Titã quando vários agentes aparecem simultaneamente em seu campo de visão. No modo Chefão, o Titã precisa lidar ao mesmo tempo com o jogador e com os bots aliados azuis. Como a lógica original recalculava o alvo a cada frame, o Chefão podia alternar rapidamente entre diferentes inimigos, dificultando a escolha de um alvo principal.

A solução implementada foi uma memória curta de alvo. Em vez de criar uma nova IA completa para o Chefão, a lógica final mantém o alvo que o próprio jogo já escolheu por 3 segundos. Durante esse tempo, o Titã ignora trocas rápidas de alvo e continua atacando o mesmo inimigo. Após os 3 segundos, ele aceita novamente o alvo definido pela lógica original.

Essa abordagem foi escolhida por ser simples, segura e pouco invasiva. Ela não altera a movimentação, não altera as armas, não modifica os bots azuis e não interfere na funcionalidade anterior de destravamento do Titã em paredes.

### Arquivos adicionados ou atualizados

- `Learning Framework.html`  
  Foi atualizado para adicionar uma memória curta de alvo dentro da lógica específica do Chefão.

Não foram criados novos módulos para essa versão final. Durante os testes, uma abordagem com arquivo separado `boss-decision-making.js` chegou a ser experimentada, mas foi descartada porque interferia indiretamente no comportamento dos bots azuis. A solução final foi mantida diretamente no `Learning Framework.html`, dentro do bloco:

```javascript
if (bot.isBoss) {
```

Com isso, a alteração ficou restrita apenas ao Chefão.

---

## Problema tratado na Etapa 4

Durante o modo Chefão, o Titã podia sofrer paralisia decisória quando vários alvos estavam próximos ao mesmo tempo.

Sintomas observados:

- Chefão alternando rapidamente entre jogador e bots aliados;
- dificuldade para manter um alvo principal;
- mudanças constantes de direção;
- comportamento instável quando cercado;
- risco de interferir nos bots azuis caso a escolha de alvo fosse refeita de forma agressiva;
- necessidade de reduzir trocas rápidas sem quebrar as etapas anteriores.

---

## Solução implementada

A lógica original do jogo já escolhia um alvo para cada bot e armazenava esse alvo na variável:

```
alvoM
```

A solução final não substitui essa escolha. Ela apenas adiciona uma memória temporária para o Chefão.

A lógica funciona assim:

```text
1. O jogo calcula normalmente o alvo mais próximo.
2. Se a entidade atual for o Chefão, a nova lógica é executada.
3. Se o Chefão já tiver um alvo travado e ainda não passaram 3 segundos, ele mantém esse alvo.
4. Se não houver alvo travado ou o tempo tiver acabado, ele aceita o alvo atual da lógica original.
5. O alvo escolhido é salvo no próprio objeto do Chefão.
6. A lógica antiga de ataque continua funcionando normalmente.
```

A implementação adicionou três campos temporários ao objeto do Chefão:

```text
bossLockedTarget
bossLockedTargetId
bossLockedUntil
```

Esses campos armazenam o alvo atual do Chefão e o tempo até o qual ele deve continuar focando esse mesmo alvo.

Também foi criada uma estrutura global simples para métricas:

```javascript
window.BossDecisionBasicStats = {
  locks: 0,
  reuses: 0,
  switches: 0,
  lastTargetId: null,
  lastReason: null
};
```

---

## Trecho principal da implementação

```javascript
// Processamento Visual e Tomada de Decisão do Chefão.
// Método seguro: mantém o alvo que a lógica antiga já escolheu por 3 segundos.
// Não altera movimento, armas, bots azuis ou destravamento em paredes.
if (!window.BossDecisionBasicStats) {
    window.BossDecisionBasicStats = {
        locks: 0,
        reuses: 0,
        switches: 0,
        lastTargetId: null,
        lastReason: null
    };
}

if (alvoM) {
    const alvoTravadoAindaValido =
        bot.bossLockedTarget &&
        bot.bossLockedTarget.hp > 0 &&
        now < (bot.bossLockedUntil || 0);

    if (alvoTravadoAindaValido) {
        alvoM = bot.bossLockedTarget;
        menorD = Math.hypot(alvoM.x - bot.x, alvoM.y - bot.y);
        visaoLimpa = !temParede(bot.x, bot.y, alvoM.x, alvoM.y);

        window.BossDecisionBasicStats.reuses += 1;
        window.BossDecisionBasicStats.lastTargetId = alvoM.id || "player";
        window.BossDecisionBasicStats.lastReason = "mantendo_alvo_por_3_segundos";
    } else {
        const novoAlvoId = alvoM.id || "player";

        if (bot.bossLockedTargetId && bot.bossLockedTargetId !== novoAlvoId) {
            window.BossDecisionBasicStats.switches += 1;
        }

        bot.bossLockedTarget = alvoM;
        bot.bossLockedTargetId = novoAlvoId;
        bot.bossLockedUntil = now + 3000;

        window.BossDecisionBasicStats.locks += 1;
        window.BossDecisionBasicStats.lastTargetId = novoAlvoId;
        window.BossDecisionBasicStats.lastReason = "novo_alvo_travado";
    }
}
```

Esse bloco foi colocado antes da lógica antiga do Chefão:

```javascript
if (alvoM) {
    bot.angle = Math.atan2(alvoM.y - bot.y, alvoM.x - bot.x);
```

Dessa forma, o Chefão continua usando a lógica antiga para andar, atacar, usar espada, atirar e lançar basuca. A única diferença é que o alvo usado por essa lógica passa a ser mais estável.

---

## Correção complementar no menu do Chefão

Durante os testes finais, foi identificado que o menu do modo Chefão ainda exibia uma mensagem fixa relacionada ao nível 10, mesmo quando o jogador já estava em níveis mais altos.

O botão utilizava:

```html
<span id="textoNivelBoss">1</span>
```

Porém, a função `atualizarMenuModo()` limitava o valor exibido com:

```javascript
Math.min(10, nivelChefeProgresso)
```

Isso fazia com que o menu exibisse no máximo o nível 10.

A correção foi alterar para:

```javascript
document.getElementById("textoNivelBoss").innerText = nivelChefeProgresso;
```
Essa alteração é apenas visual e não interfere na lógica de movimentação, colisão, ataque ou destravamento.

---

## Métricas adicionadas

A Etapa 4 adicionou métricas simples para acompanhar a tomada de decisão do Chefão:

| Métrica | Descrição |
|---|---|
| `locks` | Quantidade de vezes em que o Chefão travou um novo alvo. |
| `reuses` | Quantidade de vezes em que o Chefão reutilizou o alvo travado dentro do período de 3 segundos. |
| `switches` | Quantidade de trocas de alvo realizadas após o fim do ciclo de foco. |
| `lastTargetId` | Último alvo focado pelo Chefão. |
| `lastReason` | Última razão registrada pela lógica de decisão. |

---

## Como zerar as métricas antes da partida

Antes de iniciar uma partida de validação no modo Chefão, execute:

```javascript
if (window.BotLocalAvoidance) {
  BotLocalAvoidance.resetStats();
  BotLocalAvoidance.resetBossStats();
  BotLocalAvoidance.resetStates();
}

if (window.BossWallUnstuck) {
  BossWallUnstuck.resetStats();
  BossWallUnstuck.resetStates();
}

window.BossDecisionBasicStats = {
  locks: 0,
  reuses: 0,
  switches: 0,
  lastTargetId: null,
  lastReason: null
};

console.log("Métricas zeradas.");
```

---

## Como consultar as métricas da Etapa 4

Após jogar uma partida no modo Chefão, execute:

```javascript
console.table(window.BossDecisionBasicStats)
```

Resultado esperado:

```text
locks > 0
reuses > 0
lastTargetId diferente de null
lastReason: mantendo_alvo_por_3_segundos
```

Exemplo de resultado obtido nas validações:

| Métrica | Resultado |
|---|---:|
| `locks` | 31 |
| `reuses` | 5345 |
| `switches` | 14 |
| `lastTargetId` | ally2 |
| `lastReason` | mantendo_alvo_por_3_segundos |

Esses valores indicam que o Chefão travou novos alvos e reutilizou o mesmo alvo várias vezes durante os ciclos de decisão. A métrica `reuses` alta é positiva, pois mostra que o Titã manteve o foco em um alvo definido, em vez de trocar de alvo a cada frame.

---

## Como carregar os módulos para validação completa

Com o jogo aberto no navegador, execute no console:

```javascript
(async function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src + "?v=" + Date.now();
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  await loadScript("boss-spatial-validation.js");
  await loadScript("bot-local-avoidance.js");
  await loadScript("bot-local-avoidance-tests.js");
  await loadScript("boss-spatial-validation-tests.js");
  await loadScript("boss-wall-unstuck.js");
  await loadScript("boss-wall-unstuck-tests.js");

  console.table({
    BossSpatialValidation: typeof window.BossSpatialValidation,
    BotLocalAvoidance: typeof window.BotLocalAvoidance,
    BotLocalAvoidanceTests: typeof window.BotLocalAvoidanceTests,
    BossSpatialValidationTests: typeof window.BossSpatialValidationTests,
    BossWallUnstuck: typeof window.BossWallUnstuck,
    BossWallUnstuckTests: typeof window.BossWallUnstuckTests,
    moverEntidade: typeof window.moverEntidade === "function" ? window.moverEntidade.name : "undefined"
  });
})();
```

### Resultado esperado

| Item | Valor esperado |
|---|---|
| `BossSpatialValidation` | `"object"` |
| `BotLocalAvoidance` | `"object"` |
| `BotLocalAvoidanceTests` | `"object"` |
| `BossSpatialValidationTests` | `"object"` |
| `BossWallUnstuck` | `"object"` |
| `BossWallUnstuckTests` | `"object"` |

---

## Como executar todos os testes

Após carregar os módulos, execute:

```javascript
BotLocalAvoidanceTests.run()
BossSpatialValidationTests.run()
BossWallUnstuckTests.run()
```

### Resultado esperado

```text
Todos os testes passaram.
Todos os testes do Chefão passaram.
Todos os testes de destravamento do Titã passaram.
```

---

## Como instalar os módulos no jogo real

Depois que todos os testes passarem, execute:

```javascript
BotLocalAvoidance.install()
BossWallUnstuck.install()
```

Confirme a instalação:

```javascript
moverEntidade.name
```

### Resultado esperado

```text
"bossWallUnstuckMover"
```

Esse resultado indica que o módulo de destravamento do Titã foi instalado por cima do módulo de desvio local, preservando a lógica anterior e adicionando uma camada extra de segurança para o Chefão.

---

## Como verificar se a Etapa 4 não quebrou as etapas anteriores

Após jogar uma partida no modo Chefão, execute:

```javascript
console.table({
  botStuck: BotLocalAvoidance.stats.stuck,
  bossStuck: BotLocalAvoidance.bossStats.stuck,
  bossVisualStuck: BotLocalAvoidance.bossStats.visualStuck,
  bossAreaStuck: BotLocalAvoidance.bossStats.areaStuck,
  wallUnstuckDetections: BossWallUnstuck.stats.stuckDetections,
  wallUnstuckActivations: BossWallUnstuck.stats.activations,
  wallUnstuckRecoveries: BossWallUnstuck.stats.recoveries
});
```

Resultado esperado:

```text
botStuck: 0
bossStuck: 0
bossVisualStuck: 0
bossAreaStuck: 0
```

Se `wallUnstuckDetections`, `wallUnstuckActivations` e `wallUnstuckRecoveries` ficarem em `0`, isso não representa erro. Significa apenas que, naquela partida, o Titã não precisou acionar a rotina de destravamento.

---

## Testes visuais realizados

Além dos testes automatizados, foram feitos testes visuais em dois modos:

- Modo Chefão;
- Modo Solo 1v9.

No modo Chefão, foi validado que:

- o Chefão mantém um alvo por 3 segundos;
- o Chefão continua atacando normalmente;
- os bots azuis não travam em paredes;
- o Titã não trava em paredes;
- o `BossWallUnstuck` continua ativo.

No modo Solo 1v9, foi validado que:

- os bots comuns continuam desviando de obstáculos;
- os bots não ficam presos em paredes;
- a funcionalidade de desvio local continua funcionando normalmente;
- a nova lógica do Chefão não interfere no comportamento dos bots comuns.

---

## Resultado final da Etapa 4

A Etapa 4 foi validada com sucesso.

### Resultados obtidos

- [x] Chefão mantém um alvo primário por 3 segundos.
- [x] Redução de trocas rápidas de alvo.
- [x] Lógica antiga de ataque preservada.
- [x] Movimento do Chefão preservado.
- [x] Armas do Chefão preservadas.
- [x] Bots azuis sem travamento nas validações finais.
- [x] Modo Solo 1v9 revalidado.
- [x] Etapa 1 revalidada.
- [x] Etapa 2 revalidada.
- [x] Etapa 3 revalidada.
- [x] `moverEntidade.name = "bossWallUnstuckMover"`.
- [x] `botStuck = 0`.
- [x] `bossStuck = 0`.
- [x] `bossVisualStuck = 0`.
- [x] `bossAreaStuck = 0`.

### Métricas finais obtidas

| Teste | Resultado |
|---|---:|
| `BotLocalAvoidanceTests.run()` | PASSOU |
| `BossSpatialValidationTests.run()` | PASSOU |
| `BossWallUnstuckTests.run()` | PASSOU |
| `moverEntidade.name` | bossWallUnstuckMover |
| `locks` | 31 |
| `reuses` | 5345 |
| `switches` | 14 |
| `botStuck` | 0 |
| `bossStuck` | 0 |
| `bossVisualStuck` | 0 |
| `bossAreaStuck` | 0 |
| `wallUnstuckDetections` | 0 |
| `wallUnstuckActivations` | 0 |
| `wallUnstuckRecoveries` | 0 |

Com isso, o Chefão passou a contar com uma tomada de decisão básica, estável e pouco invasiva. A solução reduz a paralisia decisória ao manter um alvo primário definido por alguns segundos, sem comprometer as etapas anteriores de desvio local, validação espacial e destravamento do Titã em paredes.


# II - Inteligência Artificial e Comportamento Estratégico. 

## 5. Consciência Espacial e Movimentação Estratégica
A movimentação das entidades evoluiu de um comportamento puramente reativo para um sistema preditivo, consciente da topologia do mapa e das condições de estado do bot.

Problema
As entidades operavam sem "memória" ou conhecimento estrutural da arena, limitando a capacidade de manobras complexas e tornando o comportamento previsível em níveis avançados.

Solução
A estratégia consistiu em vincular o grau de consciência geográfica das entidades à progressão dos níveis da partida, utilizando a dificuldade como um multiplicador de privilégios de informação.

### 5.1 Lógica de Consciência por Nível (Map Awareness) 
Para permitir que a IA evolua conforme o progresso do jogador, implementamos uma hierarquia de acesso a dados:

Níveis 1-2 (Reativo): Os agentes operam sob uma lógica de perseguição direta, processando apenas a posição vetorial do jogador.
Níveis 3+ (Preditivo): O agente desbloqueia o scan estrutural da arena, permitindo a identificação de zonas de perigo, itens de cura e atalhos geométricos.Mecânica de Busca por CuraQuando o atributo de integridade (HP) cai abaixo de 60%, o agente suspende a perseguição e computa uma rota de menor custo para a caixa de vida mais próxima.

### 5.2 Movimentação Preditiva
Para elevar a movimentação além da perseguição linear, a IA calcula um vetor de interceptação em vez da posição absoluta.

Algoritmo de PrediçãoA IA calcula um fator de antecipação baseado na velocidade atual do jogador:

JavaScriptalvoX = player.x + (player.vx * antecipacao);
alvoY = player.y + (player.vy * antecipacao);

Isso força o agente a deslocar-se para o ponto de colisão futura, criando um comportamento de combate agressivo e estratégico.

### 5.3 Otimização (Filtro de Frequência)
Para evitar gargalos de processamento, o "raciocínio" espacial não ocorre em tempo integral. A lógica é condicionada por um temporizador de 250ms, garantindo que o custo computacional permaneça estável independentemente da complexidade da cena.

## 6. IA Adaptativa: 

## Aprendizado por Reforço Simplificado
O Titã (Chefão) utiliza um sistema baseado em pesos (Score-based Learning), permitindo que ele ajuste sua tática de combate em tempo real conforme a eficácia de cada ação.

### 6.1 Matriz de Recompensas

Cada estado de ataque (0 a 3) possui um peso dinâmico que oscila conforme o retorno das ações:

### 6.2 Política de Seleção (Epsilon-Greedy)
O Titã prioriza a estratégia com maior peso (90% do tempo), mas reserva 10% de suas decisões para testar outras abordagens, garantindo adaptação caso o jogador mude seu estilo de jogo.

## 7. Comandos de Validação e Diagnóstico
Utilize os comandos abaixo no console do navegador para inspecionar a IA durante o tempo de execução:Diagnóstico de IA e Aprendizado

JavaScript// Localizar o objeto do Titã
bots.find(b => b.isBoss);

// Verificar a matriz de pesos (memória de aprendizado)
bots.find(b => b.isBoss).acoes;

// Forçar uma mudança de estado de ataque para testar a lógica
bots.find(b => b.isBoss).attackState = 1;
Monitoramento EspacialJavaScript// Monitorar se o bot detecta a caixa de vida (hp < 60)
bots.forEach(b => {
    if (b.hp < 60) console.log(`Bot ${b.id} buscando caixa de vida:`, b.patrolPoint);
});


## Modularidade: 
A lógica foi isolada em boss-rewardlogic.js, garantindo a Separation of Concerns.

## Aprendizado em Tempo Real: 
O monitoramento via console validou a transição dinâmica dos estados de ataque, demonstrando resiliência.

## Performance: 
A combinação de filtros de frequência e políticas simplificadas permitiu a implementação de uma IA complexa sem degradação da experiência do usuário."A transição de um modelo reativo para um modelo adaptativo elevou a complexidade tática do Mega Arena Royale, transformando o combate em um ecossistema dinâmico de ação e reação."