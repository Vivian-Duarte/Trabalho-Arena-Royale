(function (global) {
  if (global.BossWallUnstuck && typeof global.BossWallUnstuck.uninstall === "function") {
    try { global.BossWallUnstuck.uninstall(); } catch (error) {}
  }

  const DEFAULT_CONFIG = {
    enabled: true,

    minMoveLength: 0.001,

    stuckTriggerFrames: 2,
    stuckMoveRatio: 0.35,

    unstuckFrames: 45,
    unstuckCommitFrames: 18,
    unstuckSpeedMultiplier: 1.05,
    minUnstuckSpeed: 1.5,

    entityCrowdingRange: 110,
    entityCrowdingMinCount: 2,
    entityCrowdingSpeedMultiplier: 0.50,

    recoveryMoveRatio: 0.65,
    recoveryFrames: 4,

    anglesDegrees: [90, -90, 135, -135, 180, 45, -45, 60, -60, 120, -120, 150, -150, 30, -30],

    debug: false
  };

  let installed = false;
  let originalMover = null;
  let config = Object.assign({}, DEFAULT_CONFIG);
  let bossStates = new WeakMap();

  const stats = {
    moves: 0,
    ignored: 0,
    bossMoves: 0,

    stuckDetections: 0,
    activations: 0,

    alternativeMoves: 0,
    committedMoves: 0,
    waitMoves: 0,
    recoveries: 0,

    entityCrowdingSlowdowns: 0,
    lastCrowdedByEntities: false,
    lastNearbyEntityCount: 0,
    lastUnstuckSpeed: 0,

    lastMode: null,
    lastReason: null,
    lastBeforeX: null,
    lastBeforeY: null,
    lastAfterX: null,
    lastAfterY: null,
    lastMovedLength: 0,
    lastIntendedLength: 0,
    lastUnstuckFramesLeft: 0
  };

  function mergeConfig(options) {
    return Object.assign({}, DEFAULT_CONFIG, config, options || {});
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getGameValue(expression) {
    try {
      return global.eval(expression);
    } catch (error) {
      return undefined;
    }
  }

  function setMoverFunction(fn) {
    try {
      global.eval("moverEntidade = arguments[0]");
    } catch (error) {
      try {
        global.moverEntidade = fn;
      } catch (innerError) {
        if (config.debug) console.warn("BossWallUnstuck: não foi possível atualizar moverEntidade.", innerError);
      }
    }
  }

  function getGameContext() {
    const gameWalls = getGameValue("typeof walls !== 'undefined' ? walls : undefined");
    const gameArena = getGameValue("typeof arena !== 'undefined' ? arena : undefined");
    const gameBots = getGameValue("typeof bots !== 'undefined' ? bots : undefined");
    const gamePlayer = getGameValue("typeof player !== 'undefined' ? player : undefined");

    const entities = [];

    if (Array.isArray(gameBots)) {
      entities.push.apply(entities, gameBots);
    }

    if (gamePlayer) {
      entities.push(gamePlayer);
    }

    return {
      walls: Array.isArray(gameWalls) ? gameWalls : [],
      arena: gameArena || null,
      entities: entities
    };
  }

  function normalizeContext(context) {
    const safeContext = context || {};

    return {
      walls: Array.isArray(safeContext.walls) ? safeContext.walls : [],
      arena: safeContext.arena || null,
      entities: Array.isArray(safeContext.entities) ? safeContext.entities : []
    };
  }

  function isBossEntity(entity) {
    if (!entity) return false;

    const validator = global.BossSpatialValidation;

    if (validator && typeof validator.isBossEntity === "function") {
      return validator.isBossEntity(entity);
    }

    return (
      entity.id === "boss" ||
      entity.isBoss === true ||
      entity.type === "boss" ||
      entity.kind === "boss"
    );
  }

  function getBossState(entity) {
    let state = bossStates.get(entity);

    if (!state) {
      state = {
        stuckFrames: 0,
        unstuckFramesLeft: 0,

        committedFramesLeft: 0,
        committedDx: 0,
        committedDy: 0,

        recoveryFrames: 0,

        lastReason: null,
        lastMode: null
      };

      bossStates.set(entity, state);
    }

    return state;
  }

  function rotateVector(dx, dy, degrees) {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      dx: dx * cos - dy * sin,
      dy: dx * sin + dy * cos
    };
  }

  function normalizeMove(dx, dy, speed, cfg) {
    const length = Math.hypot(dx, dy);

    if (length <= cfg.minMoveLength) {
      return null;
    }

    return {
      dx: (dx / length) * speed,
      dy: (dy / length) * speed
    };
  }

  function isAliveEntity(entity) {
  return !Object.prototype.hasOwnProperty.call(entity, "hp") || entity.hp > 0;
}

function getNearbyEntityInfo(entity, context, options) {
  const cfg = mergeConfig(options);
  const ctx = normalizeContext(context);

  const x = toNumber(entity.x, 0);
  const y = toNumber(entity.y, 0);
  const radius = toNumber(entity.radius, 0);

  const range = Math.max(0, toNumber(cfg.entityCrowdingRange, 110));
  const minCount = Math.max(1, Math.floor(toNumber(cfg.entityCrowdingMinCount, 2)));

  let count = 0;
  let nearestDistance = Infinity;

  for (let i = 0; i < ctx.entities.length; i++) {
    const other = ctx.entities[i];

    if (!other || other === entity || !isAliveEntity(other)) continue;

    const otherX = toNumber(other.x, NaN);
    const otherY = toNumber(other.y, NaN);
    const otherRadius = toNumber(other.radius, 0);

    if (!Number.isFinite(otherX) || !Number.isFinite(otherY)) continue;

    const centerDistance = Math.hypot(x - otherX, y - otherY);
    const edgeDistance = centerDistance - radius - otherRadius;

    if (edgeDistance <= range) {
      count += 1;
      if (edgeDistance < nearestDistance) nearestDistance = edgeDistance;
    }
  }

  return {
    count: count,
    nearestDistance: nearestDistance,
    crowded: count >= minCount
  };
}

function getUnstuckSpeed(entity, dx, dy, context, options) {
  const cfg = mergeConfig(options);
  const desiredLength = Math.hypot(dx, dy);
  const crowding = getNearbyEntityInfo(entity, context, cfg);

  if (crowding.crowded) {
    const speed = Math.max(
      desiredLength * cfg.entityCrowdingSpeedMultiplier,
      cfg.minMoveLength
    );

    stats.entityCrowdingSlowdowns += 1;
    stats.lastCrowdedByEntities = true;
    stats.lastNearbyEntityCount = crowding.count;
    stats.lastUnstuckSpeed = speed;

    return {
      speed: speed,
      crowded: true,
      nearbyEntityCount: crowding.count
    };
  }

  const speed = Math.max(
    desiredLength * cfg.unstuckSpeedMultiplier,
    cfg.minUnstuckSpeed
  );

  stats.lastCrowdedByEntities = false;
  stats.lastNearbyEntityCount = crowding.count;
  stats.lastUnstuckSpeed = speed;

  return {
    speed: speed,
    crowded: false,
    nearbyEntityCount: crowding.count
  };
}

  function isMoveBlocked(entity, dx, dy, context, options) {
    const avoidance = global.BotLocalAvoidance;

    if (avoidance && typeof avoidance.isMoveBlocked === "function") {
      return avoidance.isMoveBlocked(entity, dx, dy, context, options);
    }

    return false;
  }

  function isDirectlyBlockedByBossValidation(entity, dx, dy, context, options) {
    const validator = global.BossSpatialValidation;

    if (!validator || typeof validator.validateBossPath !== "function") {
      return false;
    }

    const result = validator.validateBossPath(entity, dx, dy, normalizeContext(context), {
      safetyMargin: toNumber(options && options.bossSafetyMargin, 4),
      sampleStep: toNumber(options && options.probeStep, 6),
      minMoveLength: toNumber(options && options.minMoveLength, 0.001)
    });

    return result && result.valid === false;
  }

  function scoreCandidate(entity, candidate, originalDx, originalDy) {
    const originalLength = Math.hypot(originalDx, originalDy);
    const candidateLength = Math.hypot(candidate.dx, candidate.dy);

    if (originalLength <= 0.0001 || candidateLength <= 0.0001) {
      return 0;
    }

    const dot = (candidate.dx * originalDx + candidate.dy * originalDy) / (originalLength * candidateLength);

    /*
      Quanto menor o dot, mais o movimento foge da direção bloqueada.
      - dot perto de 1: continua insistindo na mesma direção.
      - dot perto de 0: movimento lateral.
      - dot negativo: movimento de recuo.
    */
    return 1 - dot;
  }

  function findAlternativeMove(entity, dx, dy, context, options) {
    const cfg = mergeConfig(options);
    const ctx = normalizeContext(context);
    const desiredLength = Math.hypot(dx, dy);

    if (desiredLength <= cfg.minMoveLength) {
      return null;
    }

    const speedInfo = getUnstuckSpeed(entity, dx, dy, ctx, cfg);
    const speed = speedInfo.speed;

    const candidates = [];

    for (let i = 0; i < cfg.anglesDegrees.length; i++) {
      const rotated = rotateVector(dx, dy, cfg.anglesDegrees[i]);
      const normalized = normalizeMove(rotated.dx, rotated.dy, speed, cfg);

      if (!normalized) continue;

      candidates.push({
        dx: normalized.dx,
        dy: normalized.dy,
        angle: cfg.anglesDegrees[i],
        score: scoreCandidate(entity, normalized, dx, dy)
      });
    }

    candidates.sort(function (a, b) {
      return b.score - a.score;
    });

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      if (!isMoveBlocked(entity, candidate.dx, candidate.dy, ctx, cfg)) {
        return {
          dx: candidate.dx,
          dy: candidate.dy,
          mode: "unstuck",
          reason: "boss_wall_unstuck_alternative",
          bossWallUnstuck: true,
          angle: candidate.angle,
          score: candidate.score,
          entityCrowdingSlowdown: speedInfo.crowded,
          nearbyEntityCount: speedInfo.nearbyEntityCount,
          speed: speed
        };
      }
    }

    return null;
  }

  function resolveMove(entity, dx, dy, context, options) {
    const cfg = mergeConfig(options);
    const ctx = normalizeContext(context);

    if (!cfg.enabled || !isBossEntity(entity)) {
      return {
        dx: dx,
        dy: dy,
        mode: "direct",
        reason: "not_boss",
        bossWallUnstuck: false
      };
    }

    const state = getBossState(entity);
    const desiredLength = Math.hypot(dx, dy);

    if (desiredLength <= cfg.minMoveLength) {
      return {
        dx: dx,
        dy: dy,
        mode: "direct",
        reason: "no_movement",
        bossWallUnstuck: false
      };
    }

    if (state.unstuckFramesLeft <= 0) {
      return {
        dx: dx,
        dy: dy,
        mode: "direct",
        reason: "normal_boss_movement",
        bossWallUnstuck: false
      };
    }

    const speedInfo = getUnstuckSpeed(entity, dx, dy, ctx, cfg);
    const speed = speedInfo.speed;

    if (state.committedFramesLeft > 0) {
      const committed = normalizeMove(state.committedDx, state.committedDy, speed, cfg);

      if (committed && !isMoveBlocked(entity, committed.dx, committed.dy, ctx, cfg)) {
        state.committedFramesLeft -= 1;
        stats.committedMoves += 1;

        return {
          dx: committed.dx,
          dy: committed.dy,
          mode: "unstuck",
          reason: "boss_wall_unstuck_committed",
          bossWallUnstuck: true,
          committed: true,
          entityCrowdingSlowdown: speedInfo.crowded,
          nearbyEntityCount: speedInfo.nearbyEntityCount,
          speed: speed
        };
      }

      state.committedFramesLeft = 0;
    }

    const alternative = findAlternativeMove(entity, dx, dy, ctx, cfg);

    if (alternative) {
      state.committedDx = alternative.dx;
      state.committedDy = alternative.dy;
      state.committedFramesLeft = cfg.unstuckCommitFrames;

      stats.alternativeMoves += 1;

      return alternative;
    }

    stats.waitMoves += 1;

    return {
      dx: 0,
      dy: 0,
      mode: "wait",
      reason: "boss_wall_unstuck_no_valid_route",
      bossWallUnstuck: true
    };
  }

  function activateUnstuck(entity, reason, options) {
    const cfg = mergeConfig(options);
    const state = getBossState(entity);

    if (state.unstuckFramesLeft <= 0) {
      stats.activations += 1;
    }

    state.unstuckFramesLeft = Math.max(state.unstuckFramesLeft, cfg.unstuckFrames);
    state.committedFramesLeft = 0;
    state.recoveryFrames = 0;
    state.lastReason = reason || "boss_wall_stuck_detected";
  }
  function isWallOrArenaRelatedResult(result) {
  if (!result || typeof result.reason !== "string") {
    return false;
  }

  const reason = result.reason;

  return (
    reason === "wall" ||
    reason === "arena" ||
    reason === "boss_spatial_wall" ||
    reason === "boss_spatial_arena" ||
    reason.indexOf("wall") !== -1 ||
    reason.indexOf("arena") !== -1 ||
    reason.indexOf("softlock") !== -1
  );
}

  function registerMoveResult(entity, intendedDx, intendedDy, beforeX, beforeY, afterX, afterY, result, options) {
    const cfg = mergeConfig(options);

    if (!isBossEntity(entity)) {
      return;
    }

    const state = getBossState(entity);
    const intendedLength = Math.hypot(intendedDx, intendedDy);
    const movedLength = Math.hypot(afterX - beforeX, afterY - beforeY);

    stats.bossMoves += 1;
    stats.lastBeforeX = beforeX;
    stats.lastBeforeY = beforeY;
    stats.lastAfterX = afterX;
    stats.lastAfterY = afterY;
    stats.lastMovedLength = movedLength;
    stats.lastIntendedLength = intendedLength;
    stats.lastMode = result && result.mode;
    stats.lastReason = result && result.reason;

    if (intendedLength <= cfg.minMoveLength) {
      return;
    }

    const barelyMoved = movedLength < intendedLength * cfg.stuckMoveRatio;
    const wallRelated =
      isWallOrArenaRelatedResult(result) ||
      (result && result.bossWallUnstuck === true) ||
      isDirectlyBlockedByBossValidation(entity, intendedDx, intendedDy, getGameContext(), cfg);

    if (barelyMoved && (wallRelated || state.unstuckFramesLeft > 0)) {
      state.stuckFrames += 1;

      if (state.stuckFrames >= cfg.stuckTriggerFrames) {
        stats.stuckDetections += 1;
        activateUnstuck(entity, "boss_wall_stuck_detected", cfg);
      }
    } else {
      state.stuckFrames = 0;
    }

    if (state.unstuckFramesLeft > 0) {
      if (movedLength >= intendedLength * cfg.recoveryMoveRatio) {
        state.recoveryFrames += 1;

        if (state.recoveryFrames >= cfg.recoveryFrames) {
          state.unstuckFramesLeft = 0;
          state.committedFramesLeft = 0;
          state.recoveryFrames = 0;
          state.stuckFrames = 0;
          stats.recoveries += 1;
        }
      } else {
        state.recoveryFrames = 0;
      }

      if (state.unstuckFramesLeft > 0) {
        state.unstuckFramesLeft -= 1;
      }
    }

    stats.lastUnstuckFramesLeft = state.unstuckFramesLeft;
  }

  function install(options) {
    config = mergeConfig(options);

    if (installed) {
      return {
        ok: true,
        installed: true,
        message: "Destravamento do Titã já estava instalado."
      };
    }

    const avoidance = global.BotLocalAvoidance;

    if (!avoidance || typeof avoidance.isMoveBlocked !== "function") {
      throw new Error("BotLocalAvoidance precisa estar carregado antes do BossWallUnstuck.");
    }

    const mover = getGameValue("typeof moverEntidade !== 'undefined' ? moverEntidade : undefined");

    if (typeof mover !== "function") {
      throw new Error("moverEntidade não foi encontrada. Abra o jogo antes de instalar o destravamento do Titã.");
    }

    originalMover = mover;

    const bossWallUnstuckMover = function bossWallUnstuckMover(entity, movX, movY) {
      stats.moves += 1;

      if (!config.enabled || !isBossEntity(entity)) {
        stats.ignored += 1;
        return originalMover(entity, movX, movY);
      }

      const beforeX = toNumber(entity.x, 0);
      const beforeY = toNumber(entity.y, 0);

      const decision = resolveMove(entity, movX, movY, getGameContext(), config);
      const output = originalMover(entity, decision.dx, decision.dy);

      registerMoveResult(
        entity,
        decision.dx,
        decision.dy,
        beforeX,
        beforeY,
        toNumber(entity.x, beforeX),
        toNumber(entity.y, beforeY),
        decision,
        config
      );

      return output;
    };

    setMoverFunction(bossWallUnstuckMover);

    installed = true;

    return {
      ok: true,
      installed: true,
      message: "Destravamento do Titã instalado."
    };
  }

  function uninstall() {
    if (!installed || typeof originalMover !== "function") {
      return {
        ok: true,
        installed: false,
        message: "Destravamento do Titã não estava instalado."
      };
    }

    setMoverFunction(originalMover);

    installed = false;
    originalMover = null;

    return {
      ok: true,
      installed: false,
      message: "Destravamento do Titã removido."
    };
  }

  function resetStats() {
    stats.moves = 0;
    stats.ignored = 0;
    stats.bossMoves = 0;
    stats.stuckDetections = 0;
    stats.activations = 0;
    stats.alternativeMoves = 0;
    stats.committedMoves = 0;
    stats.waitMoves = 0;
    stats.recoveries = 0;
    stats.entityCrowdingSlowdowns = 0;
    stats.lastCrowdedByEntities = false;
    stats.lastNearbyEntityCount = 0;
    stats.lastUnstuckSpeed = 0;
    stats.lastMode = null;
    stats.lastReason = null;
    stats.lastBeforeX = null;
    stats.lastBeforeY = null;
    stats.lastAfterX = null;
    stats.lastAfterY = null;
    stats.lastMovedLength = 0;
    stats.lastIntendedLength = 0;
    stats.lastUnstuckFramesLeft = 0;
  }

  function resetStates() {
    bossStates = new WeakMap();
  }

  function getStateSnapshot(entity) {
    const state = getBossState(entity);

    return {
      stuckFrames: state.stuckFrames,
      unstuckFramesLeft: state.unstuckFramesLeft,
      committedFramesLeft: state.committedFramesLeft,
      committedDx: state.committedDx,
      committedDy: state.committedDy,
      recoveryFrames: state.recoveryFrames,
      lastReason: state.lastReason,
      lastMode: state.lastMode
    };
  }

  global.BossWallUnstuck = {
    version: "1.0.0",
    install: install,
    uninstall: uninstall,

    resolveMove: resolveMove,
    registerMoveResult: registerMoveResult,
    activateUnstuck: activateUnstuck,

    resetStats: resetStats,
    resetStates: resetStates,
    getStateSnapshot: getStateSnapshot,

    isBossEntity: isBossEntity,
    findAlternativeMove: findAlternativeMove,

    stats: stats
  };
})(window);