(function (global) {
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function runCase(name, fn) {
    try {
      fn();
      return { teste: name, resultado: "PASSOU" };
    } catch (error) {
      return { teste: name, resultado: "FALHOU", erro: error.message };
    }
  }

  function requireModules() {
    assert(global.BossSpatialValidation, "BossSpatialValidation não foi carregado.");
    return {
      B: global.BossSpatialValidation,
      A: global.BotLocalAvoidance || null
    };
  }

  function baseContext(extra) {
    return Object.assign({
      arena: { x: 0, y: 0, width: 200, height: 200 },
      walls: []
    }, extra || {});
  }

  function run() {
    const modules = requireModules();
    const B = modules.B;
    const A = modules.A;
    const results = [];

    results.push(runCase("sucesso em vão largo", function () {
      const boss = { id: "boss", x: 20, y: 50, radius: 10 };
      const context = baseContext({
        walls: [
          { x: 0, y: 0, width: 200, height: 35 },
          { x: 0, y: 65, width: 200, height: 35 }
        ]
      });

      const result = B.validateBossPath(boss, 40, 0, context, { safetyMargin: 2 });

      assert(result.valid === true, "o Chefão deveria passar por um vão largo");
      assert(result.minClearance >= result.requiredClearance, "o clearance mínimo deveria ser suficiente");
    }));

    results.push(runCase("bloqueio em vão estreito", function () {
      const boss = { id: "boss", x: 20, y: 50, radius: 10 };
      const context = baseContext({
        walls: [
          { x: 0, y: 0, width: 200, height: 40 },
          { x: 0, y: 60, width: 200, height: 40 }
        ]
      });

      const result = B.validateBossPath(boss, 40, 0, context, { safetyMargin: 2 });

      assert(result.valid === false, "o Chefão deveria ser bloqueado em vão estreito");
      assert(result.minClearance < result.requiredClearance, "o clearance mínimo deveria ser menor que o necessário");
    }));

    results.push(runCase("diferenciação de entidades", function () {
      const normalBot = { id: "bot0", x: 20, y: 50, radius: 10 };
      const context = baseContext({
        walls: [
          { x: 0, y: 0, width: 200, height: 40 },
          { x: 0, y: 60, width: 200, height: 40 }
        ]
      });

      const result = B.validateBossPath(normalBot, 40, 0, context, { safetyMargin: 2 });

      assert(B.isBossEntity(normalBot) === false, "bot comum não deveria ser identificado como Chefão");
      assert(result.valid === true, "a validação dimensional pesada não deveria bloquear bot comum");
      assert(result.reason === "not_boss", "o motivo esperado para bot comum é not_boss");
    }));

    results.push(runCase("softlock permite afastar da parede", function () {
      const boss = { id: "boss", x: 50, y: 100, radius: 12 };
      const context = baseContext({
        walls: [
          { x: 60, y: 0, width: 20, height: 200 }
        ]
      });

      const result = B.validateBossPath(boss, -5, 0, context, { safetyMargin: 4 });

      assert(result.valid === true, "Chefão parcialmente preso deveria poder se afastar da parede");
      assert(result.reason === "escaping_softlock", "o movimento de afastamento deveria ser tratado como escape de softlock");
      assert(result.finalClearance > result.currentClearance, "o movimento aprovado deveria aumentar o espaço livre");
    }));

    results.push(runCase("softlock bloqueia aproximação da parede", function () {
      const boss = { id: "boss", x: 50, y: 100, radius: 12 };
      const context = baseContext({
        walls: [
          { x: 60, y: 0, width: 20, height: 200 }
        ]
      });

      const result = B.validateBossPath(boss, 5, 0, context, { safetyMargin: 4 });

      assert(result.valid === false, "Chefão parcialmente preso não deveria poder agravar a colisão");
      assert(result.reason === "softlock_aggravation", "o motivo esperado é agravamento de softlock");
      assert(result.finalClearance < result.currentClearance, "o movimento bloqueado deveria reduzir o espaço livre");
    }));

    results.push(runCase("limites da arena bloqueiam saída", function () {
      const boss = { id: "boss", x: 15, y: 100, radius: 12 };
      const context = baseContext();

      const result = B.validateBossPath(boss, -10, 0, context, { safetyMargin: 4 });

      assert(result.valid === false, "Chefão tentando transpor a borda da arena deveria ser bloqueado");
      assert(result.minClearance < result.requiredClearance, "o clearance na borda deveria ser insuficiente");
    }));

    results.push(runCase("delegação correta para bot-local-avoidance", function () {
      assert(A && typeof A.resolveMove === "function", "BotLocalAvoidance precisa estar carregado para testar a delegação");

      const boss = { id: "boss", x: 20, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = {
        arena: { x: 0, y: 0, width: 200, height: 200 },
        walls: [
          { x: 0, y: 0, width: 200, height: 40 },
          { x: 0, y: 60, width: 200, height: 40 }
        ],
        entities: [boss]
      };

      const validation = B.validateBossPath(boss, 40, 0, context, { safetyMargin: 2 });
      const result = A.resolveMove(boss, 40, 0, context, { bossSafetyMargin: 2 });

      assert(validation.valid === false, "o caminho direto do Chefão deveria ser recusado pela validação espacial");
      assert(result.mode === "avoid" || result.mode === "wait", "o BotLocalAvoidance deveria tentar desviar ou aguardar sem forçar movimento");
      assert(result.mode !== "direct", "o movimento direto não deveria ser aceito quando a validação espacial bloqueia");
    }));


    results.push(runCase("métricas específicas do Chefão disponíveis", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar métricas do Chefão");
      assert(A.bossStats, "bossStats deveria estar disponível no BotLocalAvoidance");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");
      A.resetBossStats();

      assert(A.bossStats.direct === 0, "bossStats.direct deveria iniciar em zero");
      assert(A.bossStats.avoided === 0, "bossStats.avoided deveria iniciar em zero");
      assert(A.bossStats.wait === 0, "bossStats.wait deveria iniciar em zero");
      assert(A.bossStats.visualStuck === 0, "bossStats.visualStuck deveria iniciar em zero");
    }));

    results.push(runCase("travamento visual do Chefão é registrado", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar travamento visual do Chefão");
      assert(typeof A.registerMoveResult === "function", "registerMoveResult deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");

      const boss = { id: "boss", x: 50, y: 100, radius: 12, hp: 100, shootCooldown: 1000 };
      A.resetBossStats();

      A.registerMoveResult(
        boss,
        10,
        0,
        50,
        100,
        50.5,
        100,
        { mode: "avoid", reason: "boss_spatial_wall" },
        { bossVisualStuckTriggerFrames: 2, bossVisualStuckMoveRatio: 0.8, bossEscapeFrames: 5 }
      );

      A.registerMoveResult(
        boss,
        10,
        0,
        50.5,
        100,
        50.6,
        100,
        { mode: "avoid", reason: "boss_spatial_wall" },
        { bossVisualStuckTriggerFrames: 2, bossVisualStuckMoveRatio: 0.8, bossEscapeFrames: 5 }
      );

      assert(A.bossStats.physicsBlocked > 0, "o baixo deslocamento físico do Chefão deveria ser registrado");
      assert(A.bossStats.visualStuck > 0, "o travamento visual do Chefão deveria ser registrado");
      assert(A.bossStats.stuck > 0, "o contador específico bossStats.stuck deveria aumentar");
    }));


    results.push(runCase("travamento por permanência na mesma área do Chefão é registrado", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar permanência na mesma área");
      assert(typeof A.registerMoveResult === "function", "registerMoveResult deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");

      const boss = { id: "boss", x: 100, y: 100, radius: 16, hp: 100, shootCooldown: 1000 };
      A.resetBossStats();

      for (let i = 0; i < 4; i++) {
        const beforeX = 100 + i;
        const afterX = 101 + i;
        A.registerMoveResult(
          boss,
          8,
          0,
          beforeX,
          100,
          afterX,
          100,
          { mode: "avoid", reason: "boss_spatial_wall" },
          { bossAreaStuckRadius: 10, bossAreaStuckTriggerFrames: 3, bossRecentObstacleFrames: 10, bossEscapeFrames: 5 }
        );
      }

      assert(A.bossStats.areaStuck > 0, "a permanência do Chefão na mesma área deveria ser registrada");
      assert(A.bossStats.visualStuck > 0, "travamento por área deveria contar como travamento visual");
      assert(A.bossStats.stuck > 0, "o contador específico de stuck do Chefão deveria aumentar");
    }));



    results.push(runCase("escape reforçado é exclusivo do Chefão", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar escape reforçado");
      assert(typeof A.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof A.registerMoveResult === "function", "registerMoveResult deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");

      const context = {
        arena: { x: 0, y: 0, width: 300, height: 300 },
        walls: [],
        entities: []
      };

      const boss = { id: "boss", x: 120, y: 120, radius: 16, hp: 100, shootCooldown: 1000 };
      A.resetStates();
      A.resetBossStats();

      A.registerMoveResult(
        boss,
        10,
        0,
        120,
        120,
        120.1,
        120,
        { mode: "avoid", reason: "boss_spatial_wall" },
        { bossVisualStuckTriggerFrames: 1, bossVisualStuckMoveRatio: 0.9, bossEscapeFrames: 8 }
      );

      const bossResult = A.resolveMove(
        boss,
        10,
        0,
        context,
        { bossEscapeSpeedMultiplier: 1.5, bossEscapeFrames: 8 }
      );

      assert(bossResult.mode === "avoid", "o Chefão em escape deveria usar desvio");
      assert(bossResult.bossEscape === true, "o escape reforçado deveria ser marcado como específico do Chefão");
      assert(bossResult.multiplier > 1, "o escape do Chefão deveria usar multiplicador maior que 1");
      assert(A.bossStats.escapeBoosts > 0, "o contador de escape reforçado do Chefão deveria aumentar");

      const boostsAfterBoss = A.bossStats.escapeBoosts;
      const normalBot = { id: "bot0", x: 80, y: 80, radius: 10, hp: 20, shootCooldown: 1000 };

      A.registerMoveResult(
        normalBot,
        10,
        0,
        80,
        80,
        80.1,
        80,
        { mode: "avoid", reason: "wall" },
        { stuckTriggerFrames: 1, stuckMoveRatio: 0.9, escapeFrames: 8 }
      );

      const normalResult = A.resolveMove(
        normalBot,
        10,
        0,
        context,
        { bossEscapeSpeedMultiplier: 1.5, escapeFrames: 8 }
      );

      assert(normalResult.bossEscape !== true, "bot comum não deveria usar o escape reforçado do Chefão");
      assert(A.bossStats.escapeBoosts === boostsAfterBoss, "escape de bot comum não deveria alterar bossStats.escapeBoosts");
    }));



    results.push(runCase("escape comprometido do Chefão mantém direção por alguns ciclos", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar escape comprometido");
      assert(typeof A.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof A.registerMoveResult === "function", "registerMoveResult deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");
      assert(typeof A.resetStates === "function", "resetStates deveria estar disponível");

      const context = {
        arena: { x: 0, y: 0, width: 300, height: 300 },
        walls: [],
        entities: []
      };

      const boss = { id: "boss", x: 120, y: 120, radius: 16, hp: 100, shootCooldown: 1000 };

      A.resetStates();
      A.resetBossStats();

      A.registerMoveResult(
        boss,
        10,
        0,
        120,
        120,
        120.1,
        120,
        { mode: "avoid", reason: "boss_spatial_wall" },
        { bossVisualStuckTriggerFrames: 1, bossVisualStuckMoveRatio: 0.9, bossEscapeFrames: 8 }
      );

      const firstEscape = A.resolveMove(
        boss,
        10,
        0,
        context,
        { bossEscapeSpeedMultiplier: 1.6, bossEscapeCommitFrames: 4, bossEscapeFrames: 8 }
      );

      const secondEscape = A.resolveMove(
        boss,
        10,
        0,
        context,
        { bossEscapeSpeedMultiplier: 1.6, bossEscapeCommitFrames: 4, bossEscapeFrames: 8 }
      );

      assert(firstEscape.bossEscape === true, "o primeiro escape deveria ser específico do Chefão");
      assert(secondEscape.bossEscape === true, "o segundo escape também deveria ser específico do Chefão");
      assert(secondEscape.committed === true, "o segundo escape deveria reutilizar a direção comprometida");
      assert(A.bossStats.escapeCommits > 0, "deveria registrar criação de direção de escape comprometida");
      assert(A.bossStats.committedEscapes > 0, "deveria registrar reutilização da direção comprometida");
    }));



    results.push(runCase("escape vetorial do Chefão foge de adversário próximo", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar escape vetorial");
      assert(typeof A.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof A.registerMoveResult === "function", "registerMoveResult deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");
      assert(typeof A.resetStates === "function", "resetStates deveria estar disponível");

      const boss = { id: "boss", x: 100, y: 100, radius: 16, hp: 100, shootCooldown: 1000 };
      const enemy = { id: "bot-enemy", x: 130, y: 100, radius: 12, hp: 20, shootCooldown: 1000 };
      const context = {
        arena: { x: 0, y: 0, width: 300, height: 300 },
        walls: [],
        entities: [boss, enemy]
      };

      A.resetStates();
      A.resetBossStats();

      A.registerMoveResult(
        boss,
        10,
        0,
        100,
        100,
        100.1,
        100,
        { mode: "avoid", reason: "entity" },
        { bossVisualStuckTriggerFrames: 1, bossVisualStuckMoveRatio: 0.9, bossEscapeFrames: 8 }
      );

      const result = A.resolveMove(
        boss,
        10,
        0,
        context,
        {
          bossEscapeSpeedMultiplier: 1.5,
          bossEscapeCommitFrames: 4,
          bossEscapeFrames: 8,
          bossRepulsionEscape: true,
          bossRepulsionEntityRange: 160
        }
      );

      assert(result.bossEscape === true, "o escape deveria ser específico do Chefão");
      assert(
        result.source === "repulsion" || result.source === "panic_entity",
        "o escape deveria usar vetor de repulsão ou fuga emergencial por entidade"
      );
      assert(result.dx < 0, "o Chefão deveria fugir para longe do adversário à direita");
      assert(
        A.bossStats.repulsionEscapes > 0 || A.bossStats.threatEscapes > 0 || A.bossStats.panicEscapes > 0,
        "algum contador de fuga do Chefão deveria aumentar"
      );
      assert(A.bossStats.lastThreatType === "entity", "a ameaça dominante deveria ser uma entidade/adversário");
    }));



    results.push(runCase("escape de ameaça força Chefão a fugir de adversário mesmo com caminho direto livre", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar fuga de ameaça");
      assert(typeof A.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");
      assert(typeof A.resetStates === "function", "resetStates deveria estar disponível");

      const boss = { id: "boss", x: 100, y: 100, radius: 16, hp: 100, shootCooldown: 1000 };
      const enemy = { id: "bot-enemy", x: 135, y: 100, radius: 12, hp: 20, shootCooldown: 1000 };
      const context = {
        arena: { x: 0, y: 0, width: 300, height: 300 },
        walls: [],
        entities: [boss, enemy]
      };

      A.resetStates();
      A.resetBossStats();

      const result = A.resolveMove(
        boss,
        10,
        0,
        context,
        {
          bossThreatEscape: true,
          bossThreatHardRange: 80,
          bossThreatEscapeRange: 200,
          bossEscapeSpeedMultiplier: 1.5,
          bossEscapeCommitFrames: 4
        }
      );

      assert(result.bossEscape === true, "o Chefão deveria entrar em escape por ameaça próxima");
      assert(result.source === "panic_entity", "o escape deveria ser classificado como fuga de entidade");
      assert(result.dx < 0, "o Chefão deveria fugir para longe do adversário à direita, mesmo se o movimento direto estivesse livre");
      assert(A.bossStats.threatEscapes > 0, "o contador de fuga por ameaça deveria aumentar");
      assert(A.bossStats.panicEscapes > 0, "o contador de fuga panic deveria aumentar");
      assert(A.bossStats.lastThreatType === "entity", "a ameaça dominante deveria ser entity");
    }));



    results.push(runCase("entidade distante não mantém fuga emergencial do Chefão", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar ameaça distante");
      assert(typeof A.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");
      assert(typeof A.resetStates === "function", "resetStates deveria estar disponível");

      const boss = { id: "boss", x: 100, y: 100, radius: 16, hp: 100, shootCooldown: 1000 };
      const distantEnemy = { id: "bot-distant-enemy", x: 360, y: 100, radius: 12, hp: 20, shootCooldown: 1000 };
      const context = {
        arena: { x: 0, y: 0, width: 500, height: 300 },
        walls: [],
        entities: [boss, distantEnemy]
      };

      A.resetStates();
      A.resetBossStats();

      const result = A.resolveMove(
        boss,
        10,
        0,
        context,
        {
          bossThreatEscape: true,
          bossThreatHardRange: 130,
          bossThreatEscapeRange: 300,
          bossEscapeSpeedMultiplier: 1.5,
          bossEscapeCommitFrames: 4
        }
      );

      assert(result.mode === "direct", "ameaça distante não deveria ativar fuga emergencial");
      assert(result.bossEscape !== true, "ameaça distante não deveria marcar bossEscape");
      assert(A.bossStats.panicEscapes === 0, "ameaça distante não deveria aumentar panicEscapes");
      assert(A.bossStats.threatEscapes === 0, "ameaça distante não deveria aumentar threatEscapes");
      assert(A.bossStats.lastEntityThreatDistance > 130, "a ameaça usada no teste deveria estar fora do hard range");
    }));



    results.push(runCase("direção comprometida tem prioridade sobre recalcular pânico", function () {
      assert(A, "BotLocalAvoidance precisa estar carregado para validar prioridade do escape comprometido");
      assert(typeof A.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof A.resetBossStats === "function", "resetBossStats deveria estar disponível");
      assert(typeof A.resetStates === "function", "resetStates deveria estar disponível");

      const boss = { id: "boss", x: 100, y: 100, radius: 16, hp: 100, shootCooldown: 1000 };
      const enemy = { id: "bot-enemy", x: 135, y: 100, radius: 12, hp: 20, shootCooldown: 1000 };
      const context = {
        arena: { x: 0, y: 0, width: 300, height: 300 },
        walls: [],
        entities: [boss, enemy]
      };

      A.resetStates();
      A.resetBossStats();

      const first = A.resolveMove(
        boss,
        10,
        0,
        context,
        {
          bossThreatEscape: true,
          bossThreatHardRange: 130,
          bossThreatEscapeRange: 200,
          bossEscapeSpeedMultiplier: 1.5,
          bossEscapeCommitFrames: 4
        }
      );

      const panicAfterFirst = A.bossStats.panicEscapes;

      const second = A.resolveMove(
        boss,
        10,
        0,
        context,
        {
          bossThreatEscape: true,
          bossThreatHardRange: 130,
          bossThreatEscapeRange: 200,
          bossEscapeSpeedMultiplier: 1.5,
          bossEscapeCommitFrames: 4
        }
      );

      assert(first.bossEscape === true, "o primeiro movimento deveria ativar fuga do Chefão");
      assert(panicAfterFirst > 0, "o primeiro movimento deveria registrar fuga panic");
      assert(second.bossEscape === true, "o segundo movimento ainda deveria ser fuga do Chefão");
      assert(second.committed === true, "o segundo movimento deveria reutilizar a direção comprometida");
      assert(A.bossStats.panicEscapes === panicAfterFirst, "o segundo movimento não deveria recalcular pânico");
      assert(A.bossStats.committedEscapes > 0, "o contador de escapes comprometidos deveria aumentar");
    }));



    console.table(results);

    const failed = results.filter(function (item) { return item.resultado === "FALHOU"; });
    if (failed.length > 0) {
      console.error("Testes com falha:", failed);
      return { ok: false, results: results };
    }

    console.log("Todos os testes do Chefão passaram.");
    return { ok: true, results: results };
  }

  global.BossSpatialValidationTests = {
    run: run
  };
})(window);
