import {
  computeResizeFromHandle,
  computeRotationFromPointer,
  normalizeRotation,
} from '../lib/tableTransformUtils'
import { OBJECT_BODY_SELECTOR } from '../lib/canvasObjectDom'

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

  getObjectBody(element = this.element) {
    return element?.querySelector(OBJECT_BODY_SELECTOR) ?? element
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
      const body = this.getObjectBody(this.element)
      body.style.transform = `rotate(${rotation}deg)`
    }
  }

  clearPreviewElementStyles(element = this.element) {
    if (!element) return
    element.style.left = ''
    element.style.top = ''
    element.style.width = ''
    element.style.height = ''
    element.style.willChange = ''
    element.classList.remove('is-transforming')

    const body = this.getObjectBody(element)
    if (body && body !== element) {
      body.style.transform = ''
      body.style.willChange = ''
    }
  }

  clearPreview() {
    this.clearPreviewElementStyles(this.element)
  }

  flushPreviewFrame() {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    if (this.session?.preview) {
      this.applyPreview(this.session.preview)
    }
  }

  scheduleClearPreview(element) {
    window.requestAnimationFrame(() => {
      this.clearPreviewElementStyles(element)
    })
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

  beginSession(event, element, session) {
    if (event.pointerType === 'mouse' && event.button !== 0) return false

    if (event.cancelable) {
      event.preventDefault()
    }

    this.element = element
    this.session = session

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Window listeners handle touch sessions when capture fails.
    }

    this.attachWindowListeners()
    return true
  }

  startResize(event, object, handle, { floorBounds }) {
    const element = event.currentTarget.closest('.fpb-canvas-object')
    if (!element) return false

    element.classList.add('is-transforming')
    element.style.willChange = 'left, top, width, height'
    const body = this.getObjectBody(element)
    if (body) {
      body.style.willChange = 'transform'
    }

    const started = this.beginSession(event, element, {
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
    })

    if (!started) {
      element.classList.remove('is-transforming')
      element.style.willChange = ''
      const body = this.getObjectBody(element)
      if (body) body.style.willChange = ''
      this.element = null
      this.session = null
    }

    return started
  }

  startRotate(event, object) {
    const element = event.currentTarget.closest('.fpb-canvas-object')
    if (!element) return false

    const pointerWorld = this.getClientToWorld(event.clientX, event.clientY)
    const center = {
      x: object.position.x + (object.size.width / 2),
      y: object.position.y + (object.size.height / 2),
    }
    const startPointerAngle = Math.atan2(pointerWorld.y - center.y, pointerWorld.x - center.x)

    element.classList.add('is-transforming')
    const body = this.getObjectBody(element)
    if (body) {
      body.style.willChange = 'transform'
    }

    const started = this.beginSession(event, element, {
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
    })

    if (!started) {
      element.classList.remove('is-transforming')
      const body = this.getObjectBody(element)
      if (body) body.style.willChange = ''
      this.element = null
      this.session = null
    }

    return started
  }

  move(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    if (event.cancelable) {
      event.preventDefault()
    }

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

    this.flushPreviewFrame()

    const preview = session.preview
      ? {
        position: { ...session.preview.position },
        size: { ...session.preview.size },
        rotation: session.preview.rotation,
      }
      : null
    const element = this.element
    const objectId = session.objectId

    try {
      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } else if (this.element?.hasPointerCapture?.(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore capture release failures on touch browsers.
    }

    this.detachWindowListeners()
    this.session = null
    this.element = null
    this.rafId = null

    if (preview) {
      this.onTransformTable(objectId, preview)
    }

    this.scheduleClearPreview(element)
  }

  cancel() {
    this.detachWindowListeners()
    this.clearPreview()
    this.session = null
    this.element = null

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  dispose() {
    this.detachWindowListeners()
    this.clearPreview()
    this.cancel()
  }
}

export function createTableTransformManager(options) {
  return new TableTransformManager(options)
}
