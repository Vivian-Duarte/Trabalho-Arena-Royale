(function (global) {
  if (global.BotLocalAvoidance && typeof global.BotLocalAvoidance.uninstall === "function") {
    try { global.BotLocalAvoidance.uninstall(); } catch (error) {}
  }

  const DEFAULT_CONFIG = {
    entityPadding: 4,
    wallPadding: 2,
    arenaSoftMargin: 14,
    minArenaReturnSpeed: 2,
    minMoveLength: 0.001,
    anglesDegrees: [30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180],
    memoryFrames: 18,
    escapeFrames: 12,
    stuckTriggerFrames: 2,
    stuckMoveRatio: 0.25,
    probeStep: 6,
    wallLookAheadMultiplier: 2.5,
    wallLookAheadRadiusMultiplier: 1.25,
    maxWallLookAheadDistance: 36,
    entityLookAheadMultiplier: 1.6,
    maxEntityLookAheadDistance: 28,
    enabled: true,
    debug: false
  };

  let installed = false;
  let originalMover = null;
  let config = Object.assign({}, DEFAULT_CONFIG);
  let entityStates = new WeakMap();

  const stats = {
    direct: 0,
    avoided: 0,
    wait: 0,
    ignored: 0,
    stuck: 0,
    installs: 0
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

  function getGameContext() {
    const gameWalls = getGameValue("typeof walls !== 'undefined' ? walls : undefined");
    const gameArena = getGameValue("typeof arena !== 'undefined' ? arena : undefined");
    const gameBots = getGameValue("typeof bots !== 'undefined' ? bots : undefined");
    const gamePlayer = getGameValue("typeof player !== 'undefined' ? player : undefined");

    const entities = [];
    if (Array.isArray(gameBots)) entities.push.apply(entities, gameBots);
    if (gamePlayer) entities.push(gamePlayer);

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

  function getEntityState(entity) {
    let state = entityStates.get(entity);
    if (!state) {
      state = {
        avoidAngle: null,
        avoidFramesLeft: 0,
        sideSign: 0,
        stuckFrames: 0,
        forceEscapeFrames: 0
      };
      entityStates.set(entity, state);
    }
    return state;
  }

  function normalizeAngle(angle) {
    const rounded = Math.round(toNumber(angle, 0));
    if (Math.abs(rounded) === 180) return 180;
    return rounded;
  }

  function addUnique(list, angle) {
    const normalized = normalizeAngle(angle);
    if (list.indexOf(normalized) === -1) list.push(normalized);
  }

  function getPreferredSign(entity, state) {
    if (state && state.sideSign) return state.sideSign;
    if (entity && Number(entity.strafeDir) < 0) return -1;
    return 1;
  }

  function getOrderedAngles(entity, state, cfg) {
    const ordered = [];
    const preferredSign = getPreferredSign(entity, state);
    const memoryAngle = state && state.avoidFramesLeft > 0 ? state.avoidAngle : null;
    const memorySign = memoryAngle && memoryAngle !== 180 ? Math.sign(memoryAngle) : preferredSign;

    if (state && state.forceEscapeFrames > 0) {
      [90, 120, 150, 180, 60, 45, 30].forEach(function (angle) {
        if (angle === 180) addUnique(ordered, 180);
        else {
          addUnique(ordered, angle * memorySign);
          addUnique(ordered, -angle * memorySign);
        }
      });
    }

    if (memoryAngle !== null) {
      addUnique(ordered, memoryAngle);
      [45, 60, 75, 90, 120, 150].forEach(function (angle) {
        addUnique(ordered, angle * memorySign);
      });
      [45, 60, 75, 90, 120, 150].forEach(function (angle) {
        addUnique(ordered, -angle * memorySign);
      });
      addUnique(ordered, 180);
    }

    [30, 45, 60, 75, 90, 120, 150, 180].forEach(function (angle) {
      if (angle === 180) addUnique(ordered, 180);
      else {
        addUnique(ordered, angle * preferredSign);
        addUnique(ordered, -angle * preferredSign);
      }
    });

    cfg.anglesDegrees.forEach(function (angle) {
      addUnique(ordered, angle);
    });

    return ordered;
  }

  function circleRectCollision(circle, rect) {
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return dx * dx + dy * dy < circle.radius * circle.radius;
  }

  function getArenaBounds(entity, arena) {
    if (!arena) return null;

    const radius = toNumber(entity.radius, 0);
    const left = toNumber(arena.x, 0) + radius;
    const top = toNumber(arena.y, 0) + radius;
    const right = toNumber(arena.x, 0) + toNumber(arena.width, 0) - radius;
    const bottom = toNumber(arena.y, 0) + toNumber(arena.height, 0) - radius;

    return { left: left, top: top, right: right, bottom: bottom };
  }

  function isInsideArena(entity, nextX, nextY, arena) {
    const bounds = getArenaBounds(entity, arena);
    if (!bounds) return true;

    return nextX >= bounds.left && nextX <= bounds.right && nextY >= bounds.top && nextY <= bounds.bottom;
  }

  function isValidEntity(entity) {
    return entity && Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y));
  }

  function isAliveEntity(entity) {
    return !Object.prototype.hasOwnProperty.call(entity, "hp") || entity.hp > 0;
  }

  function isBotEntity(entity) {
    if (!isValidEntity(entity)) return false;
    if (entity.id === "player") return false;

    const id = typeof entity.id === "string" ? entity.id : "";
    return (
      id.indexOf("bot") === 0 ||
      id.indexOf("ally") === 0 ||
      id === "boss" ||
      entity.isBoss === true ||
      Object.prototype.hasOwnProperty.call(entity, "shootCooldown") ||
      Object.prototype.hasOwnProperty.call(entity, "stuckCounter")
    );
  }

  function getProbePoints(entity, dx, dy, cfg, kind) {
    const x = toNumber(entity.x, 0);
    const y = toNumber(entity.y, 0);
    const radius = toNumber(entity.radius, 0);
    const moveLength = Math.hypot(dx, dy);

    if (moveLength <= cfg.minMoveLength) {
      return [{ x: x, y: y }];
    }

    const dirX = dx / moveLength;
    const dirY = dy / moveLength;
    const maxDistance = kind === "entity" ? cfg.maxEntityLookAheadDistance : cfg.maxWallLookAheadDistance;
    const multiplier = kind === "entity" ? cfg.entityLookAheadMultiplier : cfg.wallLookAheadMultiplier;
    const radiusDistance = kind === "entity" ? radius * 0.8 : radius * cfg.wallLookAheadRadiusMultiplier;
    const distance = Math.min(maxDistance, Math.max(moveLength, moveLength * multiplier, radiusDistance));
    const steps = Math.max(1, Math.ceil(distance / cfg.probeStep));
    const points = [];

    for (let i = 1; i <= steps; i++) {
      const stepDistance = Math.min(distance, i * cfg.probeStep);
      points.push({
        x: x + dirX * stepDistance,
        y: y + dirY * stepDistance
      });
    }

    return points;
  }

  function wouldHitWallOrArena(entity, dx, dy, context, options) {
    const cfg = mergeConfig(options);
    const ctx = normalizeContext(context);
    const radius = toNumber(entity.radius, 0);
    const points = getProbePoints(entity, dx, dy, cfg, "wall");

    for (let p = 0; p < points.length; p++) {
      const point = points[p];

      if (!isInsideArena(entity, point.x, point.y, ctx.arena)) {
        return "arena";
      }

      const probeCircle = {
        x: point.x,
        y: point.y,
        radius: radius + cfg.wallPadding
      };

      for (let i = 0; i < ctx.walls.length; i++) {
        if (circleRectCollision(probeCircle, ctx.walls[i])) {
          return "wall";
        }
      }
    }

    return null;
  }

  function wouldHitEntity(entity, dx, dy, context, options) {
    const cfg = mergeConfig(options);
    const ctx = normalizeContext(context);
    const radius = toNumber(entity.radius, 0);
    const points = getProbePoints(entity, dx, dy, cfg, "entity");
    const currentX = toNumber(entity.x, 0);
    const currentY = toNumber(entity.y, 0);

    for (let i = 0; i < ctx.entities.length; i++) {
      const other = ctx.entities[i];
      if (!isValidEntity(other) || other === entity || !isAliveEntity(other)) continue;

      const otherX = toNumber(other.x, 0);
      const otherY = toNumber(other.y, 0);
      const otherRadius = toNumber(other.radius, 0);
      const minDistance = radius + otherRadius + cfg.entityPadding;
      const currentDistance = Math.hypot(currentX - otherX, currentY - otherY);

      for (let p = 0; p < points.length; p++) {
        const nextDistance = Math.hypot(points[p].x - otherX, points[p].y - otherY);

        if (currentDistance < minDistance && nextDistance > currentDistance + 0.05) {
          continue;
        }

        if (nextDistance < minDistance) {
          return "entity";
        }
      }
    }

    return null;
  }

  function getBlockReason(entity, dx, dy, context, options) {
    if (!isValidEntity(entity)) return "invalid_entity";

    const wallOrArena = wouldHitWallOrArena(entity, dx, dy, context, options);
    if (wallOrArena) return wallOrArena;

    const entityCollision = wouldHitEntity(entity, dx, dy, context, options);
    if (entityCollision) return entityCollision;

    return null;
  }

  function isMoveBlocked(entity, dx, dy, context, options) {
    return getBlockReason(entity, dx, dy, context, options) !== null;
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

  function getArenaReturnMove(entity, dx, dy, context, options) {
    const cfg = mergeConfig(options);
    const ctx = normalizeContext(context);
    const bounds = getArenaBounds(entity, ctx.arena);
    if (!bounds) return null;

    const x = toNumber(entity.x, 0);
    const y = toNumber(entity.y, 0);
    const moveLength = Math.hypot(dx, dy);
    if (moveLength <= cfg.minMoveLength) return null;

    const nextX = x + dx;
    const nextY = y + dy;
    const margin = Math.max(0, toNumber(cfg.arenaSoftMargin, 0));

    let inwardX = 0;
    let inwardY = 0;

    if ((nextX < bounds.left + margin && dx < 0) || x < bounds.left) inwardX = 1;
    else if ((nextX > bounds.right - margin && dx > 0) || x > bounds.right) inwardX = -1;

    if ((nextY < bounds.top + margin && dy < 0) || y < bounds.top) inwardY = 1;
    else if ((nextY > bounds.bottom - margin && dy > 0) || y > bounds.bottom) inwardY = -1;

    if (!inwardX && !inwardY) return null;

    let rawX = inwardX || (dx / moveLength);
    let rawY = inwardY || (dy / moveLength);
    const rawLength = Math.hypot(rawX, rawY);
    if (rawLength <= cfg.minMoveLength) return null;

    const speed = Math.max(moveLength, toNumber(cfg.minArenaReturnSpeed, 2));

    const primary = {
      dx: (rawX / rawLength) * speed,
      dy: (rawY / rawLength) * speed
    };

    if (!getBlockReason(entity, primary.dx, primary.dy, context, cfg)) {
      return {
        dx: primary.dx,
        dy: primary.dy,
        mode: "avoid",
        reason: "arena",
        angle: "arena_return"
      };
    }

    const fallbackAngles = [20, -20, 35, -35, 50, -50, 70, -70, 90, -90, 120, -120, 150, -150, 180];
    for (let i = 0; i < fallbackAngles.length; i++) {
      const candidate = rotateVector(primary.dx, primary.dy, fallbackAngles[i]);
      if (!getBlockReason(entity, candidate.dx, candidate.dy, context, cfg)) {
        return {
          dx: candidate.dx,
          dy: candidate.dy,
          mode: "avoid",
          reason: "arena",
          angle: "arena_return"
        };
      }
    }

    return null;
  }

  function rememberAvoidance(entity, angle, cfg) {
    const state = getEntityState(entity);
    if (angle === "arena_return") {
      state.avoidAngle = null;
      state.avoidFramesLeft = Math.max(state.avoidFramesLeft, Math.ceil(cfg.memoryFrames / 2));
      return;
    }

    state.avoidAngle = normalizeAngle(angle);
    state.avoidFramesLeft = cfg.memoryFrames;
    if (state.avoidAngle !== 180) state.sideSign = Math.sign(state.avoidAngle) || state.sideSign || 1;
  }

  function clearAvoidanceIfStable(entity) {
    const state = getEntityState(entity);
    if (state.avoidFramesLeft > 0) state.avoidFramesLeft -= 1;
    if (state.forceEscapeFrames > 0) state.forceEscapeFrames -= 1;
  }

  function resolveMove(entity, desiredDx, desiredDy, context, options) {
    const cfg = mergeConfig(options);
    const dx = toNumber(desiredDx, 0);
    const dy = toNumber(desiredDy, 0);
    const moveLength = Math.hypot(dx, dy);
    const state = getEntityState(entity);

    if (moveLength <= cfg.minMoveLength) {
      return { dx: 0, dy: 0, mode: "wait", reason: "no_movement" };
    }

    const directReason = getBlockReason(entity, dx, dy, context, cfg);

    if (directReason === "arena") {
      const arenaReturn = getArenaReturnMove(entity, dx, dy, context, cfg);
      if (arenaReturn) {
        rememberAvoidance(entity, arenaReturn.angle, cfg);
        return arenaReturn;
      }
    }

    const softArenaReturn = getArenaReturnMove(entity, dx, dy, context, cfg);
    if (softArenaReturn && directReason !== "wall" && directReason !== "entity") {
      rememberAvoidance(entity, softArenaReturn.angle, cfg);
      return softArenaReturn;
    }

    if (!directReason && state.forceEscapeFrames <= 0) {
      clearAvoidanceIfStable(entity);
      return { dx: dx, dy: dy, mode: "direct", reason: null };
    }

    const reason = directReason || "stuck";
    const angles = getOrderedAngles(entity, state, cfg);

    for (let i = 0; i < angles.length; i++) {
      const candidate = rotateVector(dx, dy, angles[i]);
      const candidateReason = getBlockReason(entity, candidate.dx, candidate.dy, context, cfg);

      if (!candidateReason) {
        rememberAvoidance(entity, angles[i], cfg);
        return {
          dx: candidate.dx,
          dy: candidate.dy,
          mode: "avoid",
          reason: reason,
          angle: angles[i]
        };
      }
    }

    state.avoidFramesLeft = 0;
    return { dx: 0, dy: 0, mode: "wait", reason: reason };
  }

  function registerMoveResult(entity, intendedDx, intendedDy, beforeX, beforeY, afterX, afterY, result, options) {
    if (!isValidEntity(entity)) return;

    const cfg = mergeConfig(options);
    const intendedLength = Math.hypot(toNumber(intendedDx, 0), toNumber(intendedDy, 0));
    const movedLength = Math.hypot(toNumber(afterX, 0) - toNumber(beforeX, 0), toNumber(afterY, 0) - toNumber(beforeY, 0));
    const state = getEntityState(entity);

    if (result && result.mode === "wait") {
      state.stuckFrames += 1;
    } else if (intendedLength > cfg.minMoveLength && movedLength < intendedLength * cfg.stuckMoveRatio) {
      state.stuckFrames += 1;
    } else {
      state.stuckFrames = 0;
    }

    if (state.stuckFrames >= cfg.stuckTriggerFrames) {
      state.forceEscapeFrames = cfg.escapeFrames;
      state.stuckFrames = 0;
      stats.stuck += 1;
    }
  }

  function setMoverFunction(newMover) {
    global.__BotLocalAvoidanceMover = newMover;
    global.moverEntidade = newMover;

    try {
      global.eval("moverEntidade = globalThis.__BotLocalAvoidanceMover");
    } catch (error) {
      if (config.debug) console.warn("BotLocalAvoidance: não foi possível atualizar moverEntidade via eval.", error);
    }
  }

  function install(options) {
    config = mergeConfig(options);

    if (installed) {
      return { ok: true, installed: true, message: "Desvio local já estava instalado." };
    }

    const mover = getGameValue("typeof moverEntidade !== 'undefined' ? moverEntidade : undefined");

    if (typeof mover !== "function") {
      throw new Error("moverEntidade não foi encontrada. Abra o jogo antes de instalar o desvio local.");
    }

    originalMover = mover;

    const patchedMover = function patchedMover(entity, movX, movY) {
      if (!config.enabled || !isBotEntity(entity)) {
        stats.ignored += 1;
        return originalMover(entity, movX, movY);
      }

      const beforeX = toNumber(entity.x, 0);
      const beforeY = toNumber(entity.y, 0);
      const result = resolveMove(entity, movX, movY, getGameContext(), config);

      if (result.mode === "direct") stats.direct += 1;
      else if (result.mode === "avoid") stats.avoided += 1;
      else if (result.mode === "wait") stats.wait += 1;

      const output = originalMover(entity, result.dx, result.dy);
      registerMoveResult(entity, result.dx, result.dy, beforeX, beforeY, entity.x, entity.y, result, config);
      return output;
    };

    setMoverFunction(patchedMover);
    installed = true;
    stats.installs += 1;

    return { ok: true, installed: true, message: "Desvio local instalado." };
  }

  function uninstall() {
    if (!installed || typeof originalMover !== "function") {
      return { ok: true, installed: false, message: "Desvio local não estava instalado." };
    }

    setMoverFunction(originalMover);
    installed = false;
    originalMover = null;

    return { ok: true, installed: false, message: "Desvio local removido." };
  }

  function resetStats() {
    stats.direct = 0;
    stats.avoided = 0;
    stats.wait = 0;
    stats.ignored = 0;
    stats.stuck = 0;
  }

  function resetStates() {
    entityStates = new WeakMap();
  }

  global.BotLocalAvoidance = {
    version: "2.1.0",
    install: install,
    uninstall: uninstall,
    resolveMove: resolveMove,
    isMoveBlocked: isMoveBlocked,
    getBlockReason: getBlockReason,
    registerMoveResult: registerMoveResult,
    circleRectCollision: circleRectCollision,
    isBotEntity: isBotEntity,
    getGameContext: getGameContext,
    resetStats: resetStats,
    resetStates: resetStates,
    stats: stats
  };
})(window);
