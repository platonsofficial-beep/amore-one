export const DEFAULT_GRID_SIZE = 20

export class SnapService {
  constructor(gridSize = DEFAULT_GRID_SIZE) {
    this.gridSize = gridSize
  }

  snapValue(value, gridSize = this.gridSize) {
    return Math.round(value / gridSize) * gridSize
  }

  snapPosition(position, gridSize = this.gridSize) {
    return {
      x: this.snapValue(position.x, gridSize),
      y: this.snapValue(position.y, gridSize),
    }
  }

  applyIfEnabled(position, enabled) {
    return enabled ? this.snapPosition(position) : position
  }
}

export const snapService = new SnapService()
