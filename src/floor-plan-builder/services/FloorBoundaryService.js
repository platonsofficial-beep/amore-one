export class FloorBoundaryService {
  clampToFloor(position, size, floorBounds) {
    if (!floorBounds || !size) return position

    const maxX = floorBounds.maxX - size.width
    const maxY = floorBounds.maxY - size.height

    return {
      x: Math.min(
        Math.max(position.x, floorBounds.minX),
        Math.max(floorBounds.minX, maxX),
      ),
      y: Math.min(
        Math.max(position.y, floorBounds.minY),
        Math.max(floorBounds.minY, maxY),
      ),
    }
  }

  isInside(position, size, floorBounds) {
    if (!floorBounds || !size) return true

    const clamped = this.clampToFloor(position, size, floorBounds)
    return clamped.x === position.x && clamped.y === position.y
  }
}

export const floorBoundaryService = new FloorBoundaryService()
