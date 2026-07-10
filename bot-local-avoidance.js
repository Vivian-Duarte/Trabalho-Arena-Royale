(function (global) {
  if (global.BotLocalAvoidance && typeof global.BotLocalAvoidance.uninstall === "function") {
    try { global.BotLocalAvoidance.uninstall(); } catch (error) {}
  }

  const DEFAULT_CONFIG = {
    entityPadding: 4,
    wallPadding: 2,
    arenaSoftMargin: 14,
    minArenaReturnSpeed: 2,
    bossSpatialValidation: true,
    bossSafetyMargin: 4,
    bossVisualStuckTriggerFrames: 3,
    bossVisualStuckMoveRatio: 0.35,
    bossAreaStuckRadius: 18,
    bossAreaStuckTriggerFrames: 90,
    bossRecentObstacleFrames: 150,
    bossEscapeFrames: 90,
    bossEscapeSpeedMultiplier: 1.10,
    bossEscapeCommitFrames: 50,
    bossRepulsionEscape: true,
    bossRepulsionWallRange: 140,
    bossRepulsionEntityRange: 105,
    bossRepulsionArenaRange: 90,
    bossRepulsionWallWeight: 3.5,
    bossRepulsionEntityWeight: 2.0,
    bossRepulsionArenaWeight: 3,
    bossThreatEscape: true,
    bossThreatEscapeRange: 180,
    bossThreatHardRange: 90,
    bossThreatEscapeFrames: 45,
    bossPanicDirections: 32,
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

  const bossStats = {
    direct: 0,
    avoided: 0,
    wait: 0,
    stuck: 0,
    visualStuck: 0,
    areaStuck: 0,
    escapeBoosts: 0,
    escapeCommits: 0,
    committedEscapes: 0,
    repulsionEscapes: 0,
    threatEscapes: 0,
    panicEscapes: 0,
    physicsBlocked: 0,
    spatialBlocked: 0,
    wallBlocked: 0,
    arenaBlocked: 0,
    softlockEscapes: 0,
    moves: 0,
    lastMoveMode: null,
    lastBlockReason: null,
    lastSpatialStatus: null,
    lastBeforeX: null,
    lastBeforeY: null,
    lastAfterX: null,
    lastAfterY: null,
    lastMovedLength: 0,
    lastIntendedLength: 0,
    lastAnchorFrames: 0,
    lastAnchorDistance: 0,
    lastRecentObstacleFrames: 0,
    lastEscapeMultiplier: 1,
    lastEscapeAngle: null,
    lastCommittedEscapeFrames: 0,
    lastEscapeScore: 0,
    lastRepulsionX: 0,
    lastRepulsionY: 0,
    lastThreatType: null,
    lastEntityThreatDistance: Infinity,
    lastEntityThreatCount: 0,
    lastPanicScore: 0
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
        forceEscapeFrames: 0,
        bossSpatialStatus: null,
        bossStuckFrames: 0,
        bossAnchorX: null,
        bossAnchorY: null,
        bossAnchorFrames: 0,
        bossRecentObstacleFrames: 0,
        bossCommittedEscapeFrames: 0,
        bossCommittedEscapeUnitX: 0,
        bossCommittedEscapeUnitY: 0,
        bossCommittedEscapeReason: null,
        bossLastRepulsionX: 0,
        bossLastRepulsionY: 0,
        bossThreatFrames: 0
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
      const escapeAngles = isTrackedBoss(entity)
        ? [180, 150, 135, 120, 90, 60, 45, 30]
        : [90, 120, 150, 180, 60, 45, 30];

      escapeAngles.forEach(function (angle) {
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

  function isTrackedBoss(entity) {
    const validator = global.BossSpatialValidation;

    if (validator && typeof validator.isBossEntity === "function") {
      return validator.isBossEntity(entity);
    }

    return entity && (entity.id === "boss" || entity.isBoss === true || entity.type === "boss" || entity.kind === "boss");
  }

  function getBossSpatialStatus(entity, dx, dy, context, options) {
    const cfg = mergeConfig(options);
    const validator = global.BossSpatialValidation;

    if (!cfg.bossSpatialValidation) return null;
    if (!validator || typeof validator.validateBossPath !== "function" || typeof validator.isBossEntity !== "function") return null;
    if (!validator.isBossEntity(entity)) return null;

    const status = validator.validateBossPath(entity, dx, dy, normalizeContext(context), {
      safetyMargin: cfg.bossSafetyMargin,
      sampleStep: cfg.probeStep,
      minMoveLength: cfg.minMoveLength
    });

    const state = getEntityState(entity);
    state.bossSpatialStatus = status;
    bossStats.lastSpatialStatus = status;

    return status;
  }

  function mapBossSpatialReason(status) {
    if (!status || status.valid) return null;
    if (status.reason === "arena") return "boss_spatial_arena";
    if (status.reason === "wall") return "boss_spatial_wall";
    return "boss_spatial_" + status.reason;
  }

  function getBlockReason(entity, dx, dy, context, options) {
    if (!isValidEntity(entity)) return "invalid_entity";

    const bossSpatialStatus = getBossSpatialStatus(entity, dx, dy, context, options);

    if (bossSpatialStatus) {
      const bossSpatialReason = mapBossSpatialReason(bossSpatialStatus);
      if (bossSpatialReason) return bossSpatialReason;

      if (bossSpatialStatus.reason === "escaping_softlock") {
        const entityCollisionWhileEscaping = wouldHitEntity(entity, dx, dy, context, options);
        if (entityCollisionWhileEscaping) return entityCollisionWhileEscaping;
        return null;
      }
    }

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

    if (typeof angle === "string") {
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

  function getRectNearestPoint(px, py, rect) {
    const safeRect = {
      x: toNumber(rect && rect.x, 0),
      y: toNumber(rect && rect.y, 0),
      width: Math.max(0, toNumber(rect && rect.width, 0)),
      height: Math.max(0, toNumber(rect && rect.height, 0))
    };

    return {
      x: Math.max(safeRect.x, Math.min(px, safeRect.x + safeRect.width)),
      y: Math.max(safeRect.y, Math.min(py, safeRect.y + safeRect.height)),
      rect: safeRect
    };
  }

  function addWeightedRepulsion(acc, fromX, fromY, weight, fallbackX, fallbackY, type) {
    let length = Math.hypot(fromX, fromY);

    if (length <= 0.0001) {
      fromX = fallbackX || 0;
      fromY = fallbackY || 0;
      length = Math.hypot(fromX, fromY);
    }

    if (length <= 0.0001 || weight <= 0) return;

    acc.x += (fromX / length) * weight;
    acc.y += (fromY / length) * weight;

    if (weight > acc.strongestWeight) {
      acc.strongestWeight = weight;
      acc.threatType = type;
    }
  }

  function getBossEntityThreat(entity, context, cfg) {
    const ctx = normalizeContext(context);
    const x = toNumber(entity.x, 0);
    const y = toNumber(entity.y, 0);
    const radius = Math.max(0, toNumber(entity.radius, 0));
    const range = Math.max(1, toNumber(cfg.bossThreatEscapeRange, 230));
    const hardRange = Math.max(1, toNumber(cfg.bossThreatHardRange, 130));

    let nearestDistance = Infinity;
    let count = 0;
    let awayX = 0;
    let awayY = 0;

    for (let i = 0; i < ctx.entities.length; i++) {
      const other = ctx.entities[i];
      if (!isValidEntity(other) || other === entity || !isAliveEntity(other)) continue;

      const otherX = toNumber(other.x, 0);
      const otherY = toNumber(other.y, 0);
      const otherRadius = Math.max(0, toNumber(other.radius, 0));
      const dx = x - otherX;
      const dy = y - otherY;
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const surfaceDistance = Math.max(0, distance - radius - otherRadius);

      if (surfaceDistance <= range) {
        count += 1;
        const influence = Math.max(0, range - surfaceDistance) / range;
        const hardBonus = surfaceDistance <= hardRange ? 2 : 1;
        const weight = influence * influence * hardBonus;

        awayX += (dx / distance) * weight;
        awayY += (dy / distance) * weight;
      }

      if (surfaceDistance < nearestDistance) {
        nearestDistance = surfaceDistance;
      }
    }

    bossStats.lastEntityThreatDistance = nearestDistance;
    bossStats.lastEntityThreatCount = count;

    const length = Math.hypot(awayX, awayY);
    if (count <= 0 || length <= 0.001) {
      return {
        active: false,
        count: count,
        nearestDistance: nearestDistance,
        x: 0,
        y: 0,
        hard: false
      };
    }

    return {
      active: true,
      count: count,
      nearestDistance: nearestDistance,
      x: awayX / length,
      y: awayY / length,
      hard: nearestDistance <= hardRange
    };
  }

  function getBossDistanceToNearestEntityAt(entity, x, y, context) {
    const ctx = normalizeContext(context);
    const radius = Math.max(0, toNumber(entity.radius, 0));
    let nearest = Infinity;

    for (let i = 0; i < ctx.entities.length; i++) {
      const other = ctx.entities[i];
      if (!isValidEntity(other) || other === entity || !isAliveEntity(other)) continue;

      const otherX = toNumber(other.x, 0);
      const otherY = toNumber(other.y, 0);
      const otherRadius = Math.max(0, toNumber(other.radius, 0));
      const distance = Math.hypot(x - otherX, y - otherY) - radius - otherRadius;

      if (distance < nearest) nearest = distance;
    }

    return nearest;
  }

  function getBossRepulsionVector(entity, context, cfg) {
    const ctx = normalizeContext(context);
    const x = toNumber(entity.x, 0);
    const y = toNumber(entity.y, 0);
    const radius = Math.max(0, toNumber(entity.radius, 0));
    const acc = { x: 0, y: 0, strongestWeight: 0, threatType: null };

    const wallRange = Math.max(1, toNumber(cfg.bossRepulsionWallRange, 140));
    const entityRange = Math.max(1, toNumber(cfg.bossRepulsionEntityRange, 160));
    const arenaRange = Math.max(1, toNumber(cfg.bossRepulsionArenaRange, 90));

    for (let i = 0; i < ctx.walls.length; i++) {
      const nearest = getRectNearestPoint(x, y, ctx.walls[i]);
      const awayX = x - nearest.x;
      const awayY = y - nearest.y;
      const distance = Math.hypot(awayX, awayY);
      const influence = Math.max(0, wallRange - distance) / wallRange;
      const fallbackX = x - (nearest.rect.x + nearest.rect.width / 2);
      const fallbackY = y - (nearest.rect.y + nearest.rect.height / 2);
      const weight = influence * influence * toNumber(cfg.bossRepulsionWallWeight, 3.5);

      addWeightedRepulsion(acc, awayX, awayY, weight, fallbackX, fallbackY, "wall");
    }

    if (ctx.arena) {
      const arena = {
        x: toNumber(ctx.arena.x, 0),
        y: toNumber(ctx.arena.y, 0),
        width: Math.max(0, toNumber(ctx.arena.width, 0)),
        height: Math.max(0, toNumber(ctx.arena.height, 0))
      };

      const leftDistance = x - arena.x;
      const rightDistance = arena.x + arena.width - x;
      const topDistance = y - arena.y;
      const bottomDistance = arena.y + arena.height - y;

      if (leftDistance < arenaRange) {
        const influence = Math.max(0, arenaRange - leftDistance) / arenaRange;
        addWeightedRepulsion(acc, 1, 0, influence * influence * toNumber(cfg.bossRepulsionArenaWeight, 3), 1, 0, "arena");
      }

      if (rightDistance < arenaRange) {
        const influence = Math.max(0, arenaRange - rightDistance) / arenaRange;
        addWeightedRepulsion(acc, -1, 0, influence * influence * toNumber(cfg.bossRepulsionArenaWeight, 3), -1, 0, "arena");
      }

      if (topDistance < arenaRange) {
        const influence = Math.max(0, arenaRange - topDistance) / arenaRange;
        addWeightedRepulsion(acc, 0, 1, influence * influence * toNumber(cfg.bossRepulsionArenaWeight, 3), 0, 1, "arena");
      }

      if (bottomDistance < arenaRange) {
        const influence = Math.max(0, arenaRange - bottomDistance) / arenaRange;
        addWeightedRepulsion(acc, 0, -1, influence * influence * toNumber(cfg.bossRepulsionArenaWeight, 3), 0, -1, "arena");
      }
    }

    for (let e = 0; e < ctx.entities.length; e++) {
      const other = ctx.entities[e];
      if (!isValidEntity(other) || other === entity || !isAliveEntity(other)) continue;

      const otherX = toNumber(other.x, 0);
      const otherY = toNumber(other.y, 0);
      const otherRadius = Math.max(0, toNumber(other.radius, 0));
      const awayX = x - otherX;
      const awayY = y - otherY;
      const distance = Math.max(0.001, Math.hypot(awayX, awayY));
      const personalSpace = radius + otherRadius + toNumber(cfg.entityPadding, 4);
      const effectiveRange = Math.max(entityRange, personalSpace * 2.5);
      const influence = Math.max(0, effectiveRange - distance) / effectiveRange;
      const closeBonus = distance < personalSpace ? 1.5 : 1;
      const weight = influence * influence * toNumber(cfg.bossRepulsionEntityWeight, 4.5) * closeBonus;

      addWeightedRepulsion(acc, awayX, awayY, weight, awayX, awayY, "entity");
    }

    const length = Math.hypot(acc.x, acc.y);

    bossStats.lastRepulsionX = acc.x;
    bossStats.lastRepulsionY = acc.y;
    bossStats.lastThreatType = acc.threatType;

    const state = getEntityState(entity);
    state.bossLastRepulsionX = acc.x;
    state.bossLastRepulsionY = acc.y;

    if (length <= 0.001) {
      return null;
    }

    return {
      x: acc.x / length,
      y: acc.y / length,
      rawX: acc.x,
      rawY: acc.y,
      length: length,
      threatType: acc.threatType
    };
  }

  function setBossCommittedEscape(entity, dx, dy, reason, cfg, state) {
    if (!isTrackedBoss(entity)) return;
    const length = Math.hypot(dx, dy);
    if (length <= cfg.minMoveLength) return;

    const safeState = state || getEntityState(entity);
    safeState.bossCommittedEscapeFrames = Math.max(1, toNumber(cfg.bossEscapeCommitFrames, 18));
    safeState.bossCommittedEscapeUnitX = dx / length;
    safeState.bossCommittedEscapeUnitY = dy / length;
    safeState.bossCommittedEscapeReason = reason || "boss_committed_escape";

    bossStats.escapeCommits += 1;
    bossStats.lastCommittedEscapeFrames = safeState.bossCommittedEscapeFrames;
  }

  function getBossCommittedEscapeMove(entity, moveLength, context, cfg, state, reason) {
    if (!isTrackedBoss(entity)) return null;
    if (!state || state.bossCommittedEscapeFrames <= 0) return null;
    if (moveLength <= cfg.minMoveLength) return null;

    const unitX = toNumber(state.bossCommittedEscapeUnitX, 0);
    const unitY = toNumber(state.bossCommittedEscapeUnitY, 0);
    const unitLength = Math.hypot(unitX, unitY);
    if (unitLength <= cfg.minMoveLength) {
      state.bossCommittedEscapeFrames = 0;
      return null;
    }

    const strongMultiplier = Math.max(1, toNumber(cfg.bossEscapeSpeedMultiplier, 1));
    const mediumMultiplier = Math.max(1, 1 + ((strongMultiplier - 1) / 2));
    const multipliers = [strongMultiplier, mediumMultiplier, 1];

    for (let i = 0; i < multipliers.length; i++) {
      const multiplier = multipliers[i];
      const candidate = {
        dx: (unitX / unitLength) * moveLength * multiplier,
        dy: (unitY / unitLength) * moveLength * multiplier
      };

      const candidateReason = getBlockReason(entity, candidate.dx, candidate.dy, context, cfg);
      if (!candidateReason) {
        state.bossCommittedEscapeFrames -= 1;
        bossStats.committedEscapes += 1;
        bossStats.escapeBoosts += multiplier > 1 ? 1 : 0;
        bossStats.lastEscapeMultiplier = multiplier;
        bossStats.lastEscapeAngle = "committed";
        bossStats.lastCommittedEscapeFrames = state.bossCommittedEscapeFrames;

        return {
          dx: candidate.dx,
          dy: candidate.dy,
          mode: "avoid",
          reason: reason || state.bossCommittedEscapeReason || "boss_committed_escape",
          angle: "committed",
          multiplier: multiplier,
          bossEscape: true,
          committed: true
        };
      }
    }

    state.bossCommittedEscapeFrames = 0;
    bossStats.lastCommittedEscapeFrames = 0;
    return null;
  }

  function getBossEscapeScore(entity, candidate, context, cfg) {
    const status = getBossSpatialStatus(entity, candidate.dx, candidate.dy, context, cfg);
    if (!status) return 0;

    const current = Number.isFinite(status.currentClearance) ? status.currentClearance : 0;
    const final = Number.isFinite(status.finalClearance) ? status.finalClearance : 0;
    const min = Number.isFinite(status.minClearance) ? status.minClearance : 0;

    return (final * 3) + min + Math.max(0, final - current) * 5;
  }

  function getBossPanicEscapeMove(entity, dx, dy, context, cfg, reason, state) {
    if (!isTrackedBoss(entity)) return null;
    if (!cfg.bossThreatEscape) return null;

    const moveLength = Math.hypot(dx, dy);
    if (moveLength <= cfg.minMoveLength) return null;

    const threat = getBossEntityThreat(entity, context, cfg);
    const hardRange = toNumber(cfg.bossThreatHardRange, 130);

    const closeEntityThreat =
      threat.active &&
      Number.isFinite(threat.nearestDistance) &&
      threat.nearestDistance <= hardRange;

    const obstacleAndCloseEntityThreat =
      threat.active &&
      state.bossRecentObstacleFrames > 0 &&
      Number.isFinite(threat.nearestDistance) &&
      threat.nearestDistance <= hardRange * 1.25;

    const shouldPanic = closeEntityThreat || obstacleAndCloseEntityThreat;

    if (!shouldPanic) return null;

    state.forceEscapeFrames = Math.max(state.forceEscapeFrames, toNumber(cfg.bossThreatEscapeFrames, 75));
    state.bossThreatFrames += 1;

    const repulsion = getBossRepulsionVector(entity, context, cfg);
    const baseX = repulsion ? repulsion.x : threat.x;
    const baseY = repulsion ? repulsion.y : threat.y;
    const baseLength = Math.hypot(baseX, baseY);
    if (baseLength <= 0.001) return null;

    const normalizedBaseX = baseX / baseLength;
    const normalizedBaseY = baseY / baseLength;

    const directions = Math.max(8, Math.floor(toNumber(cfg.bossPanicDirections, 32)));
    const strongMultiplier = Math.max(1, toNumber(cfg.bossEscapeSpeedMultiplier, 1));
    const multipliers = [strongMultiplier, Math.max(1, 1 + ((strongMultiplier - 1) / 2)), 1];

    let best = null;
    const currentEntityDistance = getBossDistanceToNearestEntityAt(entity, toNumber(entity.x, 0), toNumber(entity.y, 0), context);

    for (let i = 0; i < directions; i++) {
      const angle = (360 / directions) * i;
      const direction = rotateVector(normalizedBaseX, normalizedBaseY, angle);
      const directionLength = Math.hypot(direction.dx, direction.dy);
      if (directionLength <= 0.001) continue;

      const unitX = direction.dx / directionLength;
      const unitY = direction.dy / directionLength;

      for (let m = 0; m < multipliers.length; m++) {
        const multiplier = multipliers[m];
        const candidate = {
          dx: unitX * moveLength * multiplier,
          dy: unitY * moveLength * multiplier
        };

        const candidateReason = getBlockReason(entity, candidate.dx, candidate.dy, context, cfg);
        if (candidateReason) continue;

        const finalX = toNumber(entity.x, 0) + candidate.dx;
        const finalY = toNumber(entity.y, 0) + candidate.dy;
        const entityDistance = getBossDistanceToNearestEntityAt(entity, finalX, finalY, context);
        const clearanceScore = getBossEscapeScore(entity, candidate, context, cfg);
        const entityImprovement = Number.isFinite(currentEntityDistance) && Number.isFinite(entityDistance)
          ? Math.max(0, entityDistance - currentEntityDistance)
          : 0;

        const threatBonus = threat.count * 150;
        const totalScore = clearanceScore + (Number.isFinite(entityDistance) ? entityDistance * 12 : 0) + entityImprovement * 30 + threatBonus;

        if (!best || totalScore > best.score) {
          best = {
            dx: candidate.dx,
            dy: candidate.dy,
            multiplier: multiplier,
            score: totalScore,
            angle: "panic_" + Math.round(angle),
            entityDistance: entityDistance
          };
        }
      }
    }

    if (!best) return null;

    rememberAvoidance(entity, best.angle, cfg);
    setBossCommittedEscape(entity, best.dx, best.dy, reason || "boss_threat_escape", cfg, state);

    bossStats.panicEscapes += 1;
    bossStats.threatEscapes += 1;
    bossStats.escapeBoosts += best.multiplier > 1 ? 1 : 0;
    bossStats.lastEscapeMultiplier = best.multiplier;
    bossStats.lastEscapeAngle = best.angle;
    bossStats.lastEscapeScore = best.score;
    bossStats.lastPanicScore = best.score;
    bossStats.lastThreatType = "entity";

    return {
      dx: best.dx,
      dy: best.dy,
      mode: "avoid",
      reason: reason || "boss_threat_escape",
      angle: best.angle,
      multiplier: best.multiplier,
      bossEscape: true,
      panic: true,
      source: "panic_entity",
      threatType: "entity"
    };
  }

  function getBossEscapeMove(entity, dx, dy, context, cfg, reason, state) {
    if (!isTrackedBoss(entity)) return null;
    if (!state || state.forceEscapeFrames <= 0) return null;

    const moveLength = Math.hypot(dx, dy);
    if (moveLength <= cfg.minMoveLength) return null;

    const preferredSign = getPreferredSign(entity, state);
    const memoryAngle = state.avoidFramesLeft > 0 ? state.avoidAngle : null;
    const memorySign = memoryAngle && memoryAngle !== 180 ? Math.sign(memoryAngle) : preferredSign;
    const angles = [];
    const baseAngles = [0, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180];

    baseAngles.forEach(function (angle) {
      if (angle === 0) addUnique(angles, 0);
      else if (angle === 180) addUnique(angles, 180);
      else {
        addUnique(angles, angle * memorySign);
        addUnique(angles, -angle * memorySign);
      }
    });

    const strongMultiplier = Math.max(1, toNumber(cfg.bossEscapeSpeedMultiplier, 1));
    const mediumMultiplier = Math.max(1, 1 + ((strongMultiplier - 1) / 2));
    const multipliers = [strongMultiplier, mediumMultiplier, 1];

    let bases = [];

    if (cfg.bossRepulsionEscape) {
      const repulsion = getBossRepulsionVector(entity, context, cfg);
      if (repulsion) {
        bases.push({
          dx: repulsion.x * moveLength,
          dy: repulsion.y * moveLength,
          source: "repulsion",
          threatType: repulsion.threatType
        });
      }
    }

    bases.push({
      dx: dx,
      dy: dy,
      source: "desired",
      threatType: null
    });

    let best = null;

    for (let b = 0; b < bases.length; b++) {
      const base = bases[b];

      for (let m = 0; m < multipliers.length; m++) {
        const multiplier = multipliers[m];
        const scaledDx = base.dx * multiplier;
        const scaledDy = base.dy * multiplier;

        for (let i = 0; i < angles.length; i++) {
          const candidate = rotateVector(scaledDx, scaledDy, angles[i]);
          const candidateReason = getBlockReason(entity, candidate.dx, candidate.dy, context, cfg);

          if (!candidateReason) {
            const score = getBossEscapeScore(entity, candidate, context, cfg);
            const sourceBonus = base.source === "repulsion" ? 500 : 0;
            const totalScore = score + sourceBonus;

            if (!best || totalScore > best.score) {
              best = {
                dx: candidate.dx,
                dy: candidate.dy,
                angle: base.source === "repulsion" ? "repulsion_" + angles[i] : angles[i],
                multiplier: multiplier,
                score: totalScore,
                source: base.source,
                threatType: base.threatType
              };
            }
          }
        }
      }
    }

    if (best) {
      rememberAvoidance(entity, best.angle, cfg);
      setBossCommittedEscape(entity, best.dx, best.dy, reason || "boss_escape", cfg, state);

      bossStats.escapeBoosts += best.multiplier > 1 ? 1 : 0;
      if (best.source === "repulsion") bossStats.repulsionEscapes += 1;
      bossStats.lastEscapeMultiplier = best.multiplier;
      bossStats.lastEscapeAngle = best.angle;
      bossStats.lastEscapeScore = best.score;
      bossStats.lastThreatType = best.threatType || bossStats.lastThreatType;

      return {
        dx: best.dx,
        dy: best.dy,
        mode: "avoid",
        reason: reason || "boss_escape",
        angle: best.angle,
        multiplier: best.multiplier,
        bossEscape: true,
        committed: false,
        source: best.source,
        threatType: best.threatType
      };
    }

    return null;
  }

  function isArenaReason(reason) {
    return reason === "arena" || reason === "boss_spatial_arena";
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

    if (isArenaReason(directReason)) {
      const arenaReturn = getArenaReturnMove(entity, dx, dy, context, cfg);
      if (arenaReturn) {
        rememberAvoidance(entity, arenaReturn.angle, cfg);
        return arenaReturn;
      }
    }

    const softArenaReturn = getArenaReturnMove(entity, dx, dy, context, cfg);
    if (softArenaReturn && directReason !== "wall" && directReason !== "entity" && directReason !== "boss_spatial_wall") {
      rememberAvoidance(entity, softArenaReturn.angle, cfg);
      return softArenaReturn;
    }

    if (!directReason && state.forceEscapeFrames <= 0) {
      const proactiveThreatEscape = getBossPanicEscapeMove(entity, dx, dy, context, cfg, "boss_threat_escape", state);
      if (proactiveThreatEscape) return proactiveThreatEscape;

      clearAvoidanceIfStable(entity);
      return { dx: dx, dy: dy, mode: "direct", reason: null };
    }

    const reason = directReason || "stuck";

    const committedBossEscapeMove = getBossCommittedEscapeMove(entity, moveLength, context, cfg, state, reason);
    if (committedBossEscapeMove) return committedBossEscapeMove;

    const panicBossEscapeMove = getBossPanicEscapeMove(entity, dx, dy, context, cfg, reason, state);
    if (panicBossEscapeMove) return panicBossEscapeMove;

    const bossEscapeMove = getBossEscapeMove(entity, dx, dy, context, cfg, reason, state);
    if (bossEscapeMove) return bossEscapeMove;

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

  function resetBossStats() {
    bossStats.direct = 0;
    bossStats.avoided = 0;
    bossStats.wait = 0;
    bossStats.stuck = 0;
    bossStats.visualStuck = 0;
    bossStats.areaStuck = 0;
    bossStats.escapeBoosts = 0;
    bossStats.escapeCommits = 0;
    bossStats.committedEscapes = 0;
    bossStats.repulsionEscapes = 0;
    bossStats.threatEscapes = 0;
    bossStats.panicEscapes = 0;
    bossStats.physicsBlocked = 0;
    bossStats.spatialBlocked = 0;
    bossStats.wallBlocked = 0;
    bossStats.arenaBlocked = 0;
    bossStats.softlockEscapes = 0;
    bossStats.moves = 0;
    bossStats.lastMoveMode = null;
    bossStats.lastBlockReason = null;
    bossStats.lastSpatialStatus = null;
    bossStats.lastBeforeX = null;
    bossStats.lastBeforeY = null;
    bossStats.lastAfterX = null;
    bossStats.lastAfterY = null;
    bossStats.lastMovedLength = 0;
    bossStats.lastIntendedLength = 0;
    bossStats.lastAnchorFrames = 0;
    bossStats.lastAnchorDistance = 0;
    bossStats.lastRecentObstacleFrames = 0;
    bossStats.lastEscapeMultiplier = 1;
    bossStats.lastEscapeAngle = null;
    bossStats.lastCommittedEscapeFrames = 0;
    bossStats.lastEscapeScore = 0;
    bossStats.lastRepulsionX = 0;
    bossStats.lastRepulsionY = 0;
    bossStats.lastThreatType = null;
    bossStats.lastEntityThreatDistance = Infinity;
    bossStats.lastEntityThreatCount = 0;
    bossStats.lastPanicScore = 0;
  }

  function recordBossMoveStats(entity, result) {
    if (!isTrackedBoss(entity)) return;

    bossStats.moves += 1;

    if (result && result.mode === "direct") bossStats.direct += 1;
    else if (result && result.mode === "avoid") bossStats.avoided += 1;
    else if (result && result.mode === "wait") bossStats.wait += 1;

    const reason = result && result.reason ? String(result.reason) : null;
    bossStats.lastMoveMode = result ? result.mode : null;
    bossStats.lastBlockReason = reason;

    const state = getEntityState(entity);
    bossStats.lastSpatialStatus = state.bossSpatialStatus || bossStats.lastSpatialStatus;

    if (reason && reason.indexOf("boss_spatial") === 0) {
      bossStats.spatialBlocked += 1;
      state.bossRecentObstacleFrames = Math.max(state.bossRecentObstacleFrames, mergeConfig().bossRecentObstacleFrames);

      if (reason.indexOf("wall") !== -1) bossStats.wallBlocked += 1;
      if (reason.indexOf("arena") !== -1) bossStats.arenaBlocked += 1;
      if (reason.indexOf("softlock") !== -1) bossStats.softlockEscapes += 1;
    } else if (result && result.mode === "avoid") {
      state.bossRecentObstacleFrames = Math.max(state.bossRecentObstacleFrames, Math.floor(mergeConfig().bossRecentObstacleFrames / 2));
    } else if (state.bossRecentObstacleFrames > 0) {
      state.bossRecentObstacleFrames -= 1;
    }

    bossStats.lastRecentObstacleFrames = state.bossRecentObstacleFrames;

    if (state.bossSpatialStatus && state.bossSpatialStatus.reason === "escaping_softlock") {
      bossStats.softlockEscapes += 1;
      state.bossRecentObstacleFrames = Math.max(state.bossRecentObstacleFrames, mergeConfig().bossRecentObstacleFrames);
    }
  }

  function updateBossAreaStuck(entity, beforeX, beforeY, afterX, afterY, result, cfg) {
    const state = getEntityState(entity);
    const currentX = toNumber(afterX, toNumber(beforeX, 0));
    const currentY = toNumber(afterY, toNumber(beforeY, 0));

    if (!Number.isFinite(state.bossAnchorX) || !Number.isFinite(state.bossAnchorY)) {
      state.bossAnchorX = currentX;
      state.bossAnchorY = currentY;
      state.bossAnchorFrames = 0;
      bossStats.lastAnchorFrames = 0;
      bossStats.lastAnchorDistance = 0;
      return;
    }

    const anchorDistance = Math.hypot(currentX - state.bossAnchorX, currentY - state.bossAnchorY);
    const radius = Math.max(1, toNumber(cfg.bossAreaStuckRadius, 18));

    if (anchorDistance <= radius) {
      state.bossAnchorFrames += 1;
    } else {
      state.bossAnchorX = currentX;
      state.bossAnchorY = currentY;
      state.bossAnchorFrames = 0;
    }

    bossStats.lastAnchorFrames = state.bossAnchorFrames;
    bossStats.lastAnchorDistance = anchorDistance;

    const nearObstacleRecently = state.bossRecentObstacleFrames > 0 || (result && result.mode === "avoid");
    const areaTrigger = Math.max(1, toNumber(cfg.bossAreaStuckTriggerFrames, 90));

    if (nearObstacleRecently && state.bossAnchorFrames >= areaTrigger) {
      state.forceEscapeFrames = Math.max(state.forceEscapeFrames, toNumber(cfg.bossEscapeFrames, 30));
      state.sideSign = state.sideSign ? -state.sideSign : -1;
      state.avoidFramesLeft = 0;
      state.bossCommittedEscapeFrames = 0;
      state.bossAnchorX = currentX;
      state.bossAnchorY = currentY;
      state.bossAnchorFrames = 0;
      bossStats.areaStuck += 1;
      bossStats.visualStuck += 1;
      bossStats.stuck += 1;
    }
  }

  function registerBossMoveResult(entity, intendedLength, movedLength, beforeX, beforeY, afterX, afterY, result, cfg) {
    if (!isTrackedBoss(entity)) return;

    const state = getEntityState(entity);
    const lowMovement = intendedLength > cfg.minMoveLength && movedLength < intendedLength * cfg.bossVisualStuckMoveRatio;

    bossStats.lastBeforeX = beforeX;
    bossStats.lastBeforeY = beforeY;
    bossStats.lastAfterX = afterX;
    bossStats.lastAfterY = afterY;
    bossStats.lastMovedLength = movedLength;
    bossStats.lastIntendedLength = intendedLength;

    if (result && result.mode === "wait") {
      state.bossStuckFrames += 1;
      state.bossRecentObstacleFrames = Math.max(state.bossRecentObstacleFrames, cfg.bossRecentObstacleFrames);
    } else if (lowMovement) {
      state.bossStuckFrames += 1;
      state.bossRecentObstacleFrames = Math.max(state.bossRecentObstacleFrames, cfg.bossRecentObstacleFrames);
      bossStats.physicsBlocked += 1;
    } else {
      state.bossStuckFrames = 0;
    }

    if (state.bossStuckFrames >= cfg.bossVisualStuckTriggerFrames) {
      state.forceEscapeFrames = Math.max(state.forceEscapeFrames, cfg.bossEscapeFrames);
      state.bossStuckFrames = 0;
      state.sideSign = state.sideSign ? -state.sideSign : -1;
      state.avoidFramesLeft = 0;
      state.bossCommittedEscapeFrames = 0;
      bossStats.visualStuck += 1;
      bossStats.stuck += 1;
    }

    updateBossAreaStuck(entity, beforeX, beforeY, afterX, afterY, result, cfg);
  }

  function registerMoveResult(entity, intendedDx, intendedDy, beforeX, beforeY, afterX, afterY, result, options) {
    if (!isValidEntity(entity)) return;

    const cfg = mergeConfig(options);
    const intendedLength = Math.hypot(toNumber(intendedDx, 0), toNumber(intendedDy, 0));
    const movedLength = Math.hypot(toNumber(afterX, 0) - toNumber(beforeX, 0), toNumber(afterY, 0) - toNumber(beforeY, 0));
    const state = getEntityState(entity);

    registerBossMoveResult(entity, intendedLength, movedLength, beforeX, beforeY, afterX, afterY, result, cfg);

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

      recordBossMoveStats(entity, result);

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
    resetBossStats();
  }

  function resetStates() {
    entityStates = new WeakMap();
  }

  global.BotLocalAvoidance = {
    version: "2.8.2",
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
    resetBossStats: resetBossStats,
    resetStates: resetStates,
    stats: stats,
    bossStats: bossStats
  };
})(window);
