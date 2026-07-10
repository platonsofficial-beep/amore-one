import {
  computeResizeFromHandle,
  computeRotationFromPointer,
  getResizeAnchorWorld,
  normalizeRotation,
} from '../lib/tableTransformUtils'
import { normalizeTableBounds } from '../lib/tableDimensions'
import { OBJECT_BODY_SELECTOR } from '../lib/canvasObjectDom'

function previewsEqual(a, b) {
  if (!a || !b) return false
  return a.position.x === b.position.x
    && a.position.y === b.position.y
    && a.size.width === b.size.width
    && a.size.height === b.size.height
    && a.rotation === b.rotation
}

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

  commitPreview(session = this.session) {
    if (!session?.preview) return false

    const preview = session.preview
    if (previewsEqual(preview, session.lastCommitted)) {
      return false
    }

    this.onTransformTable(session.objectId, {
      position: { ...preview.position },
      size: { ...preview.size },
      rotation: preview.rotation,
    })

    session.lastCommitted = {
      position: { ...preview.position },
      size: { ...preview.size },
      rotation: preview.rotation,
    }
    return true
  }

  scheduleCommit(preview) {
    if (!this.session) return

    this.session.preview = preview
    if (this.rafId !== null) return

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null
      if (this.session) {
        this.commitPreview(this.session)
      }
    })
  }

  flushCommit() {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.commitPreview()
  }

  clearSessionSurface(element = this.element) {
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

    const shape = object.properties.shape ?? 'round'
    const normalized = normalizeTableBounds({
      position: object.position,
      size: object.size,
      shape,
    })
    const resizeOrigin = {
      position: { ...normalized.position },
      size: { ...normalized.size },
      rotation: object.rotation ?? 0,
    }
    const initialPreview = {
      position: { ...resizeOrigin.position },
      size: { ...resizeOrigin.size },
      rotation: resizeOrigin.rotation,
    }
    const anchorWorld = getResizeAnchorWorld(handle, resizeOrigin)

    const started = this.beginSession(event, element, {
      mode: 'resize',
      objectId: object.id,
      pointerId: event.pointerId,
      handle,
      object,
      shape,
      floorBounds,
      anchorWorld,
      origin: resizeOrigin,
      preview: initialPreview,
      lastCommitted: initialPreview,
    })

    if (!started) {
      this.clearSessionSurface(element)
      this.element = null
      this.session = null
      return false
    }

    if (!previewsEqual(initialPreview, {
      position: object.position,
      size: object.size,
      rotation: object.rotation ?? 0,
    })) {
      this.commitPreview(this.session)
    }

    return true
  }

  startRotate(event, object) {
    const element = event.currentTarget.closest('.fpb-canvas-object')
    if (!element) return false

    const pointerWorld = this.getClientToWorld(event.clientX, event.clientY)
    if (!pointerWorld) return false

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

    const initialPreview = {
      position: { ...object.position },
      size: { ...object.size },
      rotation: normalizeRotation(object.rotation ?? 0),
    }

    const started = this.beginSession(event, element, {
      mode: 'rotate',
      objectId: object.id,
      pointerId: event.pointerId,
      object,
      floorBounds: null,
      startPointerAngle,
      startRotation: normalizeRotation(object.rotation ?? 0),
      preview: initialPreview,
      lastCommitted: initialPreview,
    })

    if (!started) {
      this.clearSessionSurface(element)
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
        anchorWorld: session.anchorWorld,
      })

      if (!next) return

      this.scheduleCommit({
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

      this.scheduleCommit({
        position: session.preview.position,
        size: session.preview.size,
        rotation,
      })
    }
  }

  end(event) {
    const session = this.session
    if (!session || event.pointerId !== session.pointerId) return

    this.flushCommit()

    const element = this.element

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
    this.clearSessionSurface(element)
  }

  cancel() {
    this.detachWindowListeners()
    this.clearSessionSurface(this.element)
    this.session = null
    this.element = null

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  dispose() {
    this.detachWindowListeners()
    this.clearSessionSurface(this.element)
    this.cancel()
  }
}

export function createTableTransformManager(options) {
  return new TableTransformManager(options)
}
