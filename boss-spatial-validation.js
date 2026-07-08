(function (global) {
  const DEFAULT_CONFIG = {
    safetyMargin: 4,
    sampleStep: 6,
    minMoveLength: 0.001,
    softlockTolerance: 0.05,
    maxSamples: 32
  };

  function mergeConfig(options) {
    return Object.assign({}, DEFAULT_CONFIG, options || {});
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRect(rect) {
    return {
      x: toNumber(rect && rect.x, 0),
      y: toNumber(rect && rect.y, 0),
      width: Math.max(0, toNumber(rect && rect.width, 0)),
      height: Math.max(0, toNumber(rect && rect.height, 0))
    };
  }

  function normalizeContext(ctx) {
    const safeCtx = ctx || {};
    return {
      arena: safeCtx.arena || null,
      walls: Array.isArray(safeCtx.walls) ? safeCtx.walls : []
    };
  }

  function isBossEntity(entity) {
    if (!entity) return false;

    const id = typeof entity.id === "string" ? entity.id : "";
    return (
      id === "boss" ||
      entity.isBoss === true ||
      entity.type === "boss" ||
      entity.kind === "boss"
    );
  }

  function getBossRadius(entity) {
    if (!entity) return 0;

    const radius = toNumber(entity.radius, NaN);
    if (Number.isFinite(radius) && radius > 0) return radius;

    const width = toNumber(entity.width, NaN);
    const height = toNumber(entity.height, NaN);

    if (Number.isFinite(width) && Number.isFinite(height)) {
      return Math.max(width, height) / 2;
    }

    if (Number.isFinite(width)) return width / 2;
    if (Number.isFinite(height)) return height / 2;

    return 0;
  }

  function getRequiredClearance(entity, options) {
    const cfg = mergeConfig(options);
    return getBossRadius(entity) + Math.max(0, toNumber(cfg.safetyMargin, 0));
  }

  function distancePointToRect(px, py, rect) {
    const r = normalizeRect(rect);

    const closestX = Math.max(r.x, Math.min(px, r.x + r.width));
    const closestY = Math.max(r.y, Math.min(py, r.y + r.height));

    const dx = px - closestX;
    const dy = py - closestY;

    return Math.hypot(dx, dy);
  }

  function getArenaClearance(entity, x, y, arena) {
    if (!arena) return Infinity;

    const left = toNumber(arena.x, 0);
    const top = toNumber(arena.y, 0);
    const right = left + toNumber(arena.width, 0);
    const bottom = top + toNumber(arena.height, 0);

    return Math.min(
      x - left,
      right - x,
      y - top,
      bottom - y
    );
  }

  function getWallClearance(entity, x, y, walls) {
    if (!Array.isArray(walls) || walls.length === 0) return Infinity;

    let minDistance = Infinity;

    for (let i = 0; i < walls.length; i++) {
      const distance = distancePointToRect(x, y, walls[i]);
      if (distance < minDistance) minDistance = distance;
    }

    return minDistance;
  }

  function getPointClearance(entity, x, y, ctx) {
    const safeCtx = normalizeContext(ctx);
    const arenaClearance = getArenaClearance(entity, x, y, safeCtx.arena);
    const wallClearance = getWallClearance(entity, x, y, safeCtx.walls);

    return Math.min(arenaClearance, wallClearance);
  }

  function getClearanceReason(entity, x, y, ctx) {
    const safeCtx = normalizeContext(ctx);
    const arenaClearance = getArenaClearance(entity, x, y, safeCtx.arena);
    const wallClearance = getWallClearance(entity, x, y, safeCtx.walls);

    if (arenaClearance <= wallClearance) return "arena";
    return "wall";
  }

  function getSamplePoints(entity, dx, dy, options) {
    const cfg = mergeConfig(options);
    const x = toNumber(entity && entity.x, 0);
    const y = toNumber(entity && entity.y, 0);
    const moveX = toNumber(dx, 0);
    const moveY = toNumber(dy, 0);
    const moveLength = Math.hypot(moveX, moveY);

    if (moveLength <= cfg.minMoveLength) {
      return [{ x: x, y: y, t: 0 }];
    }

    const step = Math.max(1, toNumber(cfg.sampleStep, 6));
    const maxSamples = Math.max(2, Math.floor(toNumber(cfg.maxSamples, 32)));
    const sampleCount = Math.min(maxSamples, Math.max(2, Math.ceil(moveLength / step) + 1));
    const points = [];

    for (let i = 0; i < sampleCount; i++) {
      const t = sampleCount === 1 ? 1 : i / (sampleCount - 1);
      points.push({
        x: x + moveX * t,
        y: y + moveY * t,
        t: t
      });
    }

    return points;
  }

  function validateBossPath(entity, dx, dy, ctx, options) {
    const cfg = mergeConfig(options);
    const safeCtx = normalizeContext(ctx);
    const moveX = toNumber(dx, 0);
    const moveY = toNumber(dy, 0);
    const moveLength = Math.hypot(moveX, moveY);
    const requiredClearance = getRequiredClearance(entity, cfg);

    if (!isBossEntity(entity)) {
      return {
        valid: true,
        reason: "not_boss",
        minClearance: Infinity,
        requiredClearance: requiredClearance
      };
    }

    if (moveLength <= cfg.minMoveLength) {
      const currentClearance = getPointClearance(entity, toNumber(entity.x, 0), toNumber(entity.y, 0), safeCtx);
      return {
        valid: true,
        reason: "no_movement",
        minClearance: currentClearance,
        requiredClearance: requiredClearance,
        currentClearance: currentClearance,
        finalClearance: currentClearance
      };
    }

    const currentX = toNumber(entity.x, 0);
    const currentY = toNumber(entity.y, 0);
    const finalX = currentX + moveX;
    const finalY = currentY + moveY;

    const currentClearance = getPointClearance(entity, currentX, currentY, safeCtx);
    const finalClearance = getPointClearance(entity, finalX, finalY, safeCtx);
    const points = getSamplePoints(entity, moveX, moveY, cfg);

    let minClearance = Infinity;
    let minReason = "clear";

    for (let i = 0; i < points.length; i++) {
      const clearance = getPointClearance(entity, points[i].x, points[i].y, safeCtx);

      if (clearance < minClearance) {
        minClearance = clearance;
        minReason = getClearanceReason(entity, points[i].x, points[i].y, safeCtx);
      }
    }

    if (currentClearance < requiredClearance) {
      const improvesClearance = finalClearance > currentClearance + cfg.softlockTolerance;
      const doesNotAggravate = minClearance >= currentClearance - cfg.softlockTolerance;

      if (improvesClearance && doesNotAggravate) {
        return {
          valid: true,
          reason: "escaping_softlock",
          minClearance: minClearance,
          requiredClearance: requiredClearance,
          currentClearance: currentClearance,
          finalClearance: finalClearance
        };
      }

      return {
        valid: false,
        reason: "softlock_aggravation",
        minClearance: minClearance,
        requiredClearance: requiredClearance,
        currentClearance: currentClearance,
        finalClearance: finalClearance
      };
    }

    if (minClearance < requiredClearance) {
      return {
        valid: false,
        reason: minReason,
        minClearance: minClearance,
        requiredClearance: requiredClearance,
        currentClearance: currentClearance,
        finalClearance: finalClearance
      };
    }

    return {
      valid: true,
      reason: "clear",
      minClearance: minClearance,
      requiredClearance: requiredClearance,
      currentClearance: currentClearance,
      finalClearance: finalClearance
    };
  }

  global.BossSpatialValidation = {
    version: "1.0.0",
    isBossEntity: isBossEntity,
    getBossRadius: getBossRadius,
    getRequiredClearance: getRequiredClearance,
    distancePointToRect: distancePointToRect,
    getArenaClearance: getArenaClearance,
    getWallClearance: getWallClearance,
    validateBossPath: validateBossPath
  };
})(window);
