export const DEFAULT_FLOOR_SIZE = {
  width: 2200,
  height: 1400,
}

/** Pixels added per +Width / +Height click in Edit Layout. */
export const WORKSPACE_EXPAND_STEP = 200

/** @deprecated use DEFAULT_FLOOR_SIZE */
export const DEFAULT_WORKSPACE_SIZE = DEFAULT_FLOOR_SIZE

export function createDefaultFloor(overrides = {}) {
  return {
    width: overrides.width ?? DEFAULT_FLOOR_SIZE.width,
    height: overrides.height ?? DEFAULT_FLOOR_SIZE.height,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
  }
}

/** @deprecated use createDefaultFloor */
export function createDefaultWorkspace(overrides = {}) {
  return createDefaultFloor(overrides)
}

export function expandFloorWorkspace(workspace, { widthDelta = 0, heightDelta = 0 } = {}) {
  const current = {
    ...createDefaultFloor(),
    ...(workspace ?? {}),
  }

  return {
    ...current,
    width: Math.max(DEFAULT_FLOOR_SIZE.width, current.width + widthDelta),
    height: Math.max(DEFAULT_FLOOR_SIZE.height, current.height + heightDelta),
  }
}

export function resetFloorWorkspace(workspace) {
  const current = {
    ...createDefaultFloor(),
    ...(workspace ?? {}),
  }

  return createDefaultFloor({
    x: current.x ?? 0,
    y: current.y ?? 0,
  })
}

export function getFloorBounds(floor) {
  return {
    minX: floor.x,
    minY: floor.y,
    maxX: floor.x + floor.width,
    maxY: floor.y + floor.height,
    width: floor.width,
    height: floor.height,
    centerX: floor.x + floor.width / 2,
    centerY: floor.y + floor.height / 2,
  }
}

/** @deprecated use getFloorBounds */
export function getWorkspaceBounds(workspace) {
  return getFloorBounds(workspace)
}
