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

  function baseContext(extra) {
    return Object.assign({
      arena: { x: 0, y: 0, width: 300, height: 300 },
      walls: [],
      entities: []
    }, extra || {});
  }

  function requireModules() {
    assert(global.BotLocalAvoidance, "BotLocalAvoidance precisa estar carregado.");
    assert(global.BossSpatialValidation, "BossSpatialValidation precisa estar carregado.");
    assert(global.BossWallUnstuck, "BossWallUnstuck precisa estar carregado.");

    return {
      A: global.BotLocalAvoidance,
      B: global.BossSpatialValidation,
      U: global.BossWallUnstuck
    };
  }

  function run() {
    const modules = requireModules();
    const A = modules.A;
    const U = modules.U;

    const results = [];

    results.push(runCase("módulo expõe funções principais", function () {
      assert(typeof U.install === "function", "install deveria estar disponível");
      assert(typeof U.uninstall === "function", "uninstall deveria estar disponível");
      assert(typeof U.resolveMove === "function", "resolveMove deveria estar disponível");
      assert(typeof U.registerMoveResult === "function", "registerMoveResult deveria estar disponível");
      assert(typeof U.getStateSnapshot === "function", "getStateSnapshot deveria estar disponível");
      assert(U.version === "1.0.0", "versão esperada: 1.0.0");
    }));

    results.push(runCase("bot comum não ativa destravamento do Titã", function () {
      const bot = { id: "bot0", x: 50, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };

      U.resetStats();
      U.resetStates();

      U.registerMoveResult(
        bot,
        10,
        0,
        50,
        50,
        50,
        50,
        { mode: "direct", reason: "wall" },
        { stuckTriggerFrames: 1 }
      );

      assert(U.stats.stuckDetections === 0, "bot comum não deveria registrar stuck do Titã");
      assert(U.stats.activations === 0, "bot comum não deveria ativar destravamento do Titã");
    }));

    results.push(runCase("Titã parado por alguns frames ativa estado de destravamento", function () {
      const boss = { id: "boss", isBoss: true, x: 50, y: 100, radius: 14, hp: 300, shootCooldown: 1000 };

      U.resetStats();
      U.resetStates();

      U.registerMoveResult(
        boss,
        10,
        0,
        50,
        100,
        50.2,
        100,
        { mode: "direct", reason: "boss_spatial_wall" },
        { stuckTriggerFrames: 2, stuckMoveRatio: 0.5, unstuckFrames: 20 }
      );

      U.registerMoveResult(
        boss,
        10,
        0,
        50.2,
        100,
        50.3,
        100,
        { mode: "direct", reason: "boss_spatial_wall" },
        { stuckTriggerFrames: 2, stuckMoveRatio: 0.5, unstuckFrames: 20 }
      );

      const state = U.getStateSnapshot(boss);

      assert(U.stats.stuckDetections > 0, "deveria detectar stuck do Titã");
      assert(U.stats.activations > 0, "deveria ativar o estado de destravamento");
      assert(state.unstuckFramesLeft > 0, "o Titã deveria permanecer em destravamento por alguns frames");
    }));

    results.push(runCase("estado de destravamento troca perseguição direta por rota alternativa", function () {
      const boss = { id: "boss", isBoss: true, x: 45, y: 100, radius: 12, hp: 300, shootCooldown: 1000 };

      const context = baseContext({
        walls: [
          { x: 60, y: 75, width: 25, height: 50 }
        ],
        entities: [boss]
      });

      U.resetStats();
      U.resetStates();

      U.activateUnstuck(boss, "teste_wall_stuck", {
        unstuckFrames: 20
      });

      const result = U.resolveMove(
        boss,
        20,
        0,
        context,
        {
          unstuckSpeedMultiplier: 1.2,
          minUnstuckSpeed: 3,
          unstuckCommitFrames: 6
        }
      );

      assert(result.bossWallUnstuck === true, "o movimento deveria ser marcado como destravamento do Titã");
      assert(result.mode === "unstuck", "o Titã deveria usar uma rota alternativa");
      assert(result.reason === "boss_wall_unstuck_alternative", "o motivo deveria indicar rota alternativa");
      assert(!A.isMoveBlocked(boss, result.dx, result.dy, context), "a rota alternativa não deveria estar bloqueada");
      assert(Math.abs(result.dy) > 0 || result.dx < 0, "o movimento não deveria insistir apenas em linha reta contra a parede");
    }));

    results.push(runCase("direção alternativa é mantida por alguns ciclos", function () {
      const boss = { id: "boss", isBoss: true, x: 45, y: 100, radius: 12, hp: 300, shootCooldown: 1000 };

      const context = baseContext({
        walls: [
          { x: 60, y: 75, width: 25, height: 50 }
        ],
        entities: [boss]
      });

      U.resetStats();
      U.resetStates();

      U.activateUnstuck(boss, "teste_wall_stuck", {
        unstuckFrames: 20
      });

      const first = U.resolveMove(
        boss,
        20,
        0,
        context,
        {
          unstuckSpeedMultiplier: 1.2,
          minUnstuckSpeed: 3,
          unstuckCommitFrames: 6
        }
      );

      const second = U.resolveMove(
        boss,
        20,
        0,
        context,
        {
          unstuckSpeedMultiplier: 1.2,
          minUnstuckSpeed: 3,
          unstuckCommitFrames: 6
        }
      );

      assert(first.mode === "unstuck", "o primeiro movimento deveria usar destravamento");
      assert(second.mode === "unstuck", "o segundo movimento deveria continuar em destravamento");
      assert(second.committed === true, "o segundo movimento deveria reutilizar a direção alternativa escolhida");
      assert(U.stats.committedMoves > 0, "deveria registrar movimento comprometido");
    }));

    results.push(runCase("Titã sai do estado de destravamento após movimentos válidos", function () {
      const boss = { id: "boss", isBoss: true, x: 80, y: 100, radius: 12, hp: 300, shootCooldown: 1000 };

      U.resetStats();
      U.resetStates();

      U.activateUnstuck(boss, "teste_wall_stuck", {
        unstuckFrames: 20
      });

      for (let i = 0; i < 4; i++) {
        U.registerMoveResult(
          boss,
          10,
          0,
          80 + i * 10,
          100,
          90 + i * 10,
          100,
          { mode: "unstuck", reason: "boss_wall_unstuck_alternative", bossWallUnstuck: true },
          { recoveryFrames: 3, recoveryMoveRatio: 0.6 }
        );
      }

      const state = U.getStateSnapshot(boss);

      assert(U.stats.recoveries > 0, "deveria registrar recuperação do Titã");
      assert(state.unstuckFramesLeft === 0, "o Titã deveria sair do estado de destravamento");
    }));

    results.push(runCase("instalação preserva moverEntidade como função", function () {
      const moverTypeBefore = global.eval("typeof moverEntidade");

      assert(moverTypeBefore === "function", "moverEntidade precisa existir antes da instalação");

      const installResult = U.install();
      const moverTypeAfter = global.eval("typeof moverEntidade");

      assert(installResult.ok === true, "install deveria retornar ok");
      assert(moverTypeAfter === "function", "moverEntidade deveria continuar sendo função após instalar");

      const uninstallResult = U.uninstall();

      assert(uninstallResult.ok === true, "uninstall deveria retornar ok");
      assert(global.eval("typeof moverEntidade") === "function", "moverEntidade deveria continuar sendo função após remover");
    }));

    console.table(results);

    const failed = results.filter(function (item) {
      return item.resultado === "FALHOU";
    });

    if (failed.length > 0) {
      console.error("Testes com falha:", failed);
      return { ok: false, results: results };
    }

    console.log("Todos os testes de destravamento do Titã passaram.");
    return { ok: true, results: results };
  }

  global.BossWallUnstuckTests = {
    run: run
  };
})(window);