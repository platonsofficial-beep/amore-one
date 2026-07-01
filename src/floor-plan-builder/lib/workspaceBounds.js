import { floorBoundaryService } from '../services/FloorBoundaryService'

export { FloorBoundaryService, floorBoundaryService } from '../services/FloorBoundaryService'

/** @deprecated use FloorBoundaryService.clampToFloor */
export function clampPositionToWorkspace(position, size, floorBounds) {
  return floorBoundaryService.clampToFloor(position, size, floorBounds)
}

/** @deprecated use floorBounds */
export function clampPositionToFloor(position, size, floorBounds) {
  return floorBoundaryService.clampToFloor(position, size, floorBounds)
}
