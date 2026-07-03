import {
  computeResizeFromHandle,
  computeRotationFromPointer,
  normalizeRotation,
} from '../lib/tableTransformUtils'

export class TableTransformManager {
  constructor({ getClientToWorld, onTransformTable }) {
    this.getClientToWorld = getClientToWorld
    this.onTransformTable = onTransformTable
    this.session = null
    this.element = null
    this.rafId = null
  }

  isActive() {
    return Boolean(this.session)
  }

  getActiveObjectId() {
    return this.session?.objectId ?? null
  }

  applyPreview({ position, size, rotation }) {
    if (!this.element || !this.session) return

    if (position) {
      this.element.style.left = `${position.x}px`
      this.element.style.top = `${position.y}px`
    }

    if (size) {
      this.element.style.width = `${size.width}px`
      this.element.style.height = `${size.height}px`
    }

    if (rotation !== undefined) {
      this.element.style.transform = `rotate(${rotation}deg)`
    }
  }

  clearPreview() {
    if (!this.element) return
    this.element.style.willChange = ''
    this.element.classList.remove('is-transforming')
  }

  schedulePreview(preview) {
    if (!this.session) return

    this.session.preview = preview
    if (this.rafId !== null) return

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null
      if (this.session?.preview) {
        this.applyPreview(this.session.preview)
      }
    })
  }

  startResize(event, object, handle, { floorBounds }) {
    this.element = event.currentTarget.closest('.fpb-canvas-object')
    if (!this.element) return false

    this.element.classList.add('is-transforming')
    this.element.style.willChange = 'left, top, width, height, transform'

    this.session = {
      mode: 'resize',
      objectId: object.id,
      pointerId: event.pointerId,
      handle,
      object,
      shape: object.properties.shape ?? 'round',
      floorBounds,
      origin: {
        position: { ...object.position },
        size: { ...object.size },
        rotation: object.rotation ?? 0,
      },
      preview: {
        position: { ...object.position },
        size: { ...object.size },
        rotation: object.rotation ?? 0,
      },
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    return true
  }

  startRotate(event, object) {
    this.element = event.currentTarget.closest('.fpb-canvas-object')
    if (!this.element) return false

    const pointerWorld = this.getClientToWorld(event.clientX, event.clientY)
    const center = {
      x: object.position.x + (object.size.width / 2),
      y: object.position.y + (object.size.height / 2),
    }
    const startPointerAngle = Math.atan2(pointerWorld.y - center.y, pointerWorld.x - center.x)

    this.element.classList.add('is-transforming')
    this.element.style.willChange = 'transform'

    this.session = {
      mode: 'rotate',
      objectId: object.id,
      pointerId: event.pointerId,
      object,
      floorBounds: null,
      startPointerAngle,
      startRotation: normalizeRotation(object.rotation ?? 0),
      preview: {
        position: { ...object.position },
        size: { ...object.size },
        rotation: normalizeRotation(object.rotation ?? 0),
      },
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    return true
  }

  move(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    const pointerWorld = this.getClientToWorld(event.clientX, event.clientY)

    if (session.mode === 'resize') {
      const next = computeResizeFromHandle({
        handle: session.handle,
        pointerWorld,
        origin: session.origin,
        shape: session.shape,
        floorBounds: session.floorBounds,
      })

      this.schedulePreview({
        position: next.position,
        size: next.size,
        rotation: session.preview.rotation,
      })
      return
    }

    if (session.mode === 'rotate') {
      const rotation = computeRotationFromPointer(
        pointerWorld,
        session.object,
        session.startPointerAngle,
        session.startRotation,
        event.shiftKey,
      )

      this.schedulePreview({
        position: session.preview.position,
        size: session.preview.size,
        rotation,
      })
    }
  }

  end(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    const preview = session.preview
    if (preview) {
      this.onTransformTable(session.objectId, preview)
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    this.clearPreview()
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
    this.clearPreview()
    this.cancel()
  }
}

export function createTableTransformManager(options) {
  return new TableTransformManager(options)
}
