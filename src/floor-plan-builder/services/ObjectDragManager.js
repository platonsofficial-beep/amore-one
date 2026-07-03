const DRAG_COMMIT_THRESHOLD = 0.5

export class ObjectDragManager {
  constructor({
    snapService,
    boundaryService,
    getClientToWorld,
    onMoveObject,
  }) {
    this.snapService = snapService
    this.boundaryService = boundaryService
    this.getClientToWorld = getClientToWorld
    this.onMoveObject = onMoveObject

    this.session = null
    this.rafId = null
    this.element = null
  }

  isActive() {
    return Boolean(this.session)
  }

  getActiveObjectId() {
    return this.session?.objectId ?? null
  }

  resolvePosition(position, snapEnabled, floorBounds, objectSize) {
    const snapped = this.snapService.applyIfEnabled(position, snapEnabled)
    return this.boundaryService.clampToFloor(snapped, objectSize, floorBounds)
  }

  applyTransform(position) {
    if (!this.element || !this.session) return

    const deltaX = position.x - this.session.originPosition.x
    const deltaY = position.y - this.session.originPosition.y
    const rotation = this.session.rotation ?? 0
    this.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${rotation}deg)`
  }

  clearTransform() {
    if (!this.element) return

    this.element.style.transform = ''
    this.element.style.willChange = ''
    this.element.style.zIndex = ''
    this.element.classList.remove('is-dragging')
  }

  schedulePreview(position) {
    if (!this.session) return

    this.session.previewPosition = position
    if (this.rafId !== null) return

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null
      if (this.session?.previewPosition) {
        this.applyTransform(this.session.previewPosition)
      }
    })
  }

  start(event, object, { snapEnabled, floorBounds }) {
    const world = this.getClientToWorld(event.clientX, event.clientY)

    this.element = event.currentTarget
    this.element.classList.add('is-dragging')
    this.element.style.willChange = 'transform'
    this.element.style.zIndex = '20'

    this.session = {
      objectId: object.id,
      pointerId: event.pointerId,
      objectSize: { ...object.size },
      rotation: object.rotation ?? 0,
      offsetX: world.x - object.position.x,
      offsetY: world.y - object.position.y,
      originPosition: { ...object.position },
      previewPosition: { ...object.position },
      snapEnabled,
      floorBounds,
      moved: false,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    this.applyTransform(this.session.previewPosition)
    return true
  }

  move(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    const world = this.getClientToWorld(event.clientX, event.clientY)
    const nextPosition = this.resolvePosition(
      {
        x: world.x - session.offsetX,
        y: world.y - session.offsetY,
      },
      session.snapEnabled,
      session.floorBounds,
      session.objectSize,
    )

    session.moved = session.moved
      || Math.abs(nextPosition.x - session.originPosition.x) > DRAG_COMMIT_THRESHOLD
      || Math.abs(nextPosition.y - session.originPosition.y) > DRAG_COMMIT_THRESHOLD

    this.schedulePreview(nextPosition)
  }

  end(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    const finalPosition = this.resolvePosition(
      session.previewPosition ?? session.originPosition,
      session.snapEnabled,
      session.floorBounds,
      session.objectSize,
    )

    if (session.moved) {
      this.onMoveObject(session.objectId, finalPosition)
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    this.clearTransform()
    this.cancel()
  }

  cancel() {
    this.session = null
    this.element = null

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  dispose() {
    this.clearTransform()
    this.cancel()
  }
}

export function createObjectDragManager(options) {
  return new ObjectDragManager(options)
}
