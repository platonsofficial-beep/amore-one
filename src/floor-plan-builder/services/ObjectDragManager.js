const DRAG_COMMIT_THRESHOLD = 0.5

export class ObjectDragManager {
  constructor({
    snapService,
    boundaryService,
    getClientToWorld,
    onMoveObject,
    onDragComplete,
  }) {
    this.snapService = snapService
    this.boundaryService = boundaryService
    this.getClientToWorld = getClientToWorld
    this.onMoveObject = onMoveObject
    this.onDragComplete = onDragComplete

    this.session = null
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

  hasPositionChanged(from, to) {
    if (!from || !to) return false
    return Math.abs(to.x - from.x) > DRAG_COMMIT_THRESHOLD
      || Math.abs(to.y - from.y) > DRAG_COMMIT_THRESHOLD
  }

  clearDragSurface() {
    if (!this.element) return

    this.element.style.transform = ''
    this.element.style.willChange = ''
    this.element.style.zIndex = ''
    this.element.classList.remove('is-dragging')
  }

  attachWindowListeners() {
    if (this.boundMove) return

    this.boundMove = (event) => this.move(event)
    this.boundEnd = (event) => this.end(event)
    this.boundTouchMove = (event) => {
      if (!this.session) return
      event.preventDefault()
    }

    const captureOptions = { capture: true }
    window.addEventListener('pointermove', this.boundMove, captureOptions)
    window.addEventListener('pointerup', this.boundEnd, captureOptions)
    window.addEventListener('pointercancel', this.boundEnd, captureOptions)
    window.addEventListener('touchmove', this.boundTouchMove, { capture: true, passive: false })
  }

  detachWindowListeners() {
    if (!this.boundMove) return

    window.removeEventListener('pointermove', this.boundMove, true)
    window.removeEventListener('pointerup', this.boundEnd, true)
    window.removeEventListener('pointercancel', this.boundEnd, true)
    window.removeEventListener('touchmove', this.boundTouchMove, true)
    this.boundMove = null
    this.boundEnd = null
    this.boundTouchMove = null
  }

  start(event, object, { snapEnabled, floorBounds }) {
    if (event.pointerType === 'mouse' && event.button !== 0) return false

    if (event.cancelable) {
      event.preventDefault()
    }

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

    try {
      this.element.setPointerCapture?.(event.pointerId)
    } catch {
      // iPad Safari may reject capture; window listeners handle the drag.
    }

    this.attachWindowListeners()
    return true
  }

  move(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    if (event.cancelable) {
      event.preventDefault()
    }

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

    session.previewPosition = nextPosition
    session.moved = session.moved
      || this.hasPositionChanged(session.originPosition, nextPosition)

    this.onMoveObject?.(session.objectId, nextPosition)
  }

  end(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return false

    const finalPosition = this.resolvePosition(
      session.previewPosition ?? session.originPosition,
      session.snapEnabled,
      session.floorBounds,
      session.objectSize,
    )

    const moved = session.moved
      || this.hasPositionChanged(session.originPosition, finalPosition)

    if (moved) {
      this.onMoveObject?.(session.objectId, finalPosition)
    }

    try {
      if (this.element?.hasPointerCapture?.(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore capture release failures on touch browsers.
    }

    this.detachWindowListeners()
    this.clearDragSurface()

    const objectId = session.objectId
    this.session = null
    this.element = null

    this.onDragComplete?.({ objectId, moved })

    return moved
  }

  cancel() {
    this.detachWindowListeners()
    this.clearDragSurface()
    this.session = null
    this.element = null
  }

  dispose() {
    this.detachWindowListeners()
    this.clearDragSurface()
    this.cancel()
  }
}

export function createObjectDragManager(options) {
  return new ObjectDragManager(options)
}
