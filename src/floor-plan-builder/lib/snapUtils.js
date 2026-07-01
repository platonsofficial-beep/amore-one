import { DEFAULT_GRID_SIZE, snapService } from '../services/SnapService'

export { DEFAULT_GRID_SIZE as BUILDER_GRID_SIZE, SnapService, snapService } from '../services/SnapService'

/** @deprecated use SnapService.snapValue */
export function snapToGrid(value, gridSize = DEFAULT_GRID_SIZE) {
  return snapService.snapValue(value, gridSize)
}

/** @deprecated use SnapService.snapPosition */
export function snapPosition(position, gridSize = DEFAULT_GRID_SIZE) {
  return snapService.snapPosition(position, gridSize)
}
