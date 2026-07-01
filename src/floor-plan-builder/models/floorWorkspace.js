export const DEFAULT_FLOOR_SIZE = {
  width: 2200,
  height: 1400,
}

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
