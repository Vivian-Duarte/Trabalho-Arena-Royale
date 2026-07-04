(function (global) {
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function nearlyEqual(a, b, tolerance) {
    return Math.abs(a - b) <= (tolerance || 0.0001);
  }

  function sameSign(a, b) {
    if (a === 180 || b === 180) return true;
    return Math.sign(a) === Math.sign(b);
  }

  function baseContext(extra) {
    return Object.assign({
      arena: { x: 0, y: 0, width: 200, height: 200 },
      walls: [],
      entities: []
    }, extra || {});
  }

  function runCase(name, fn) {
    try {
      fn();
      return { teste: name, resultado: "PASSOU" };
    } catch (error) {
      return { teste: name, resultado: "FALHOU", erro: error.message };
    }
  }

  function requireModule() {
    assert(global.BotLocalAvoidance, "BotLocalAvoidance não foi carregado.");
    if (typeof global.BotLocalAvoidance.resetStates === "function") global.BotLocalAvoidance.resetStates();
    return global.BotLocalAvoidance;
  }

  function run() {
    const A = requireModule();
    const results = [];

    results.push(runCase("movimento livre mantém vetor original", function () {
      const bot = { id: "bot0", x: 50, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, 5, 0, context);

      assert(result.mode === "direct", "o movimento livre deveria continuar direto");
      assert(nearlyEqual(result.dx, 5), "dx deveria permanecer 5");
      assert(nearlyEqual(result.dy, 0), "dy deveria permanecer 0");
    }));

    results.push(runCase("parede bloqueia movimento direto e gera desvio", function () {
      const bot = { id: "bot0", x: 50, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({
        walls: [{ x: 60, y: 35, width: 20, height: 30 }],
        entities: [bot]
      });

      const directBlocked = A.isMoveBlocked(bot, 20, 0, context);
      const result = A.resolveMove(bot, 20, 0, context);

      assert(directBlocked, "a parede deveria bloquear o movimento direto");
      assert(result.mode === "avoid", "o módulo deveria encontrar um desvio local");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o desvio encontrado deveria ser válido");
    }));

    results.push(runCase("borda da arena bloqueia saída e gera desvio", function () {
      const bot = { id: "bot0", x: 15, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, -10, 0, context);

      assert(result.mode === "avoid", "a saída da arena deveria gerar desvio");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o desvio de borda deveria ser válido");
    }));

    results.push(runCase("borda esquerda força retorno para dentro da arena", function () {
      const bot = { id: "bot0", x: 12, y: 100, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, -8, 0, context);

      assert(result.mode === "avoid", "a borda esquerda deveria acionar desvio");
      assert(result.dx > 0, "na borda esquerda, o dx corrigido deveria apontar para dentro da arena");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o retorno para dentro da arena deveria ser válido");
    }));

    results.push(runCase("borda direita força retorno para dentro da arena", function () {
      const bot = { id: "bot0", x: 188, y: 100, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, 8, 0, context);

      assert(result.mode === "avoid", "a borda direita deveria acionar desvio");
      assert(result.dx < 0, "na borda direita, o dx corrigido deveria apontar para dentro da arena");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o retorno para dentro da arena deveria ser válido");
    }));

    results.push(runCase("borda superior força retorno para dentro da arena", function () {
      const bot = { id: "bot0", x: 100, y: 12, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, 0, -8, context);

      assert(result.mode === "avoid", "a borda superior deveria acionar desvio");
      assert(result.dy > 0, "na borda superior, o dy corrigido deveria apontar para dentro da arena");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o retorno para dentro da arena deveria ser válido");
    }));

    results.push(runCase("borda inferior força retorno para dentro da arena", function () {
      const bot = { id: "bot0", x: 100, y: 188, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, 0, 8, context);

      assert(result.mode === "avoid", "a borda inferior deveria acionar desvio");
      assert(result.dy < 0, "na borda inferior, o dy corrigido deveria apontar para dentro da arena");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o retorno para dentro da arena deveria ser válido");
    }));

    results.push(runCase("canto da arena força correção diagonal para dentro", function () {
      const bot = { id: "bot0", x: 12, y: 12, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot] });
      const result = A.resolveMove(bot, -6, -6, context);

      assert(result.mode === "avoid", "o canto deveria acionar desvio");
      assert(result.dx > 0, "no canto superior esquerdo, o dx deveria apontar para dentro");
      assert(result.dy > 0, "no canto superior esquerdo, o dy deveria apontar para dentro");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "a correção diagonal para dentro deveria ser válida");
    }));

    results.push(runCase("outra entidade bloqueia movimento direto e gera desvio", function () {
      const bot = { id: "bot0", x: 50, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const other = { id: "bot1", x: 75, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot, other] });
      const result = A.resolveMove(bot, 15, 0, context);

      assert(result.mode === "avoid", "a entidade à frente deveria gerar desvio");
      assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o desvio contra entidade deveria ser válido");
    }));

    results.push(runCase("sem desvio possível retorna espera", function () {
      const bot = { id: "bot0", x: 10, y: 10, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = {
        arena: { x: 0, y: 0, width: 20, height: 20 },
        walls: [],
        entities: [bot]
      };
      const result = A.resolveMove(bot, 5, 0, context);

      assert(result.mode === "wait", "sem saída válida, o bot deveria esperar");
      assert(result.dx === 0 && result.dy === 0, "o movimento de espera deveria ser zero");
    }));

    results.push(runCase("entidade encostada pode se afastar", function () {
      const bot = { id: "bot0", x: 50, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const other = { id: "bot1", x: 68, y: 50, radius: 10, hp: 100, shootCooldown: 1000 };
      const context = baseContext({ entities: [bot, other] });
      const result = A.resolveMove(bot, -5, 0, context);

      assert(result.mode === "direct", "ao se afastar, o movimento deveria continuar direto");
      assert(nearlyEqual(result.dx, -5), "dx deveria permanecer -5");
    }));

    results.push(runCase("memória curta mantém lado de desvio contra parede", function () {
      const bot = { id: "bot0", x: 50, y: 100, radius: 10, hp: 100, shootCooldown: 1000, strafeDir: 1 };
      const context = baseContext({
        walls: [{ x: 62, y: 40, width: 25, height: 120 }],
        entities: [bot]
      });

      const first = A.resolveMove(bot, 10, 0, context);
      const second = A.resolveMove(bot, 10, 0, context);

      assert(first.mode === "avoid", "o primeiro movimento deveria desviar");
      assert(second.mode === "avoid", "o segundo movimento ainda deveria desviar");
      assert(sameSign(first.angle, second.angle), "o desvio deveria manter o mesmo lado por alguns frames");
    }));

    results.push(runCase("parede longa permite sequência curta de contorno", function () {
      const bot = { id: "bot0", x: 45, y: 100, radius: 10, hp: 100, shootCooldown: 1000, strafeDir: 1 };
      const context = baseContext({
        walls: [{ x: 62, y: 35, width: 24, height: 130 }],
        entities: [bot]
      });

      for (let i = 0; i < 8; i++) {
        const result = A.resolveMove(bot, 6, 0, context);
        assert(result.mode === "avoid" || result.mode === "direct", "o bot deveria encontrar movimento válido no passo " + i);
        assert(!A.isMoveBlocked(bot, result.dx, result.dy, context), "o movimento do passo " + i + " não deveria ser bloqueado");
        bot.x += result.dx;
        bot.y += result.dy;
      }
    }));

    results.push(runCase("pós-movimento travado força tentativa de escape", function () {
      const bot = { id: "bot0", x: 50, y: 100, radius: 10, hp: 100, shootCooldown: 1000, strafeDir: 1 };
      const context = baseContext({
        walls: [{ x: 62, y: 35, width: 24, height: 130 }],
        entities: [bot]
      });

      const beforeStuck = A.stats.stuck;
      A.registerMoveResult(bot, 6, 0, 50, 100, 50.5, 100, { mode: "direct" });
      A.registerMoveResult(bot, 6, 0, 50.5, 100, 50.6, 100, { mode: "direct" });
      const result = A.resolveMove(bot, 6, 0, context);

      assert(A.stats.stuck > beforeStuck, "o travamento deveria ser registrado");
      assert(result.mode === "avoid" || result.mode === "wait", "após travar, o módulo deveria evitar ou aguardar");
    }));

    results.push(runCase("jogo aberto expõe funções necessárias", function () {
      const moverType = global.eval("typeof moverEntidade");
      const wallsType = global.eval("typeof walls");
      const arenaType = global.eval("typeof arena");

      assert(moverType === "function", "moverEntidade não foi encontrada no jogo aberto");
      assert(wallsType !== "undefined", "walls não foi encontrado no jogo aberto");
      assert(arenaType !== "undefined", "arena não foi encontrado no jogo aberto");
    }));

    console.table(results);

    const failed = results.filter(function (item) { return item.resultado === "FALHOU"; });
    if (failed.length > 0) {
      console.error("Testes com falha:", failed);
      return { ok: false, results: results };
    }

    console.log("Todos os testes passaram.");
    return { ok: true, results: results };
  }

  global.BotLocalAvoidanceTests = {
    run: run
  };
})(window);
