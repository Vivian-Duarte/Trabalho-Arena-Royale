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
http://localhost:5500/jogodetiro.html
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

Nas validações finais, os principais indicadores de travamento devem permanecer zerados:

```text
bossStuck: 0
bossVisualStuck: 0
bossAreaStuck: 0
```

Esses valores indicam que o Chefão não apresentou travamentos durante a simulação real.

---

## Resultado final da Etapa 2

A Etapa 2 foi validada na versão `2.8.2`.

### Resultados obtidos

- [x] 16 testes automatizados da Etapa 2 aprovados.
- [x] Chefão sem travamento visual nas simulações finais.
- [x] `bossStuck = 0`.
- [x] `bossVisualStuck = 0`.
- [x] `bossAreaStuck = 0`.
- [x] Bots comuns revalidados após a integração.
- [x] 15 testes da Etapa 1 aprovados novamente.
- [x] Métricas da Etapa 1 com `wait = 0` e `stuck = 0`.

Com isso, a navegação do Chefão tornou-se mais estável, coerente com seu tamanho físico e mais fluida durante o combate, mantendo a entidade ativa como ameaça real dentro da arena sem comprometer o comportamento dos bots comuns.