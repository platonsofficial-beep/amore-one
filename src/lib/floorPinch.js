/**
 * Two-finger pinch on the host floor plan (Platon t405u).
 * Pure helpers so the maths is testable; App.jsx wires the touch events.
 */
export function touchDistance(a, b) {
  const dx = (Number(a?.clientX) || 0) - (Number(b?.clientX) || 0)
  const dy = (Number(a?.clientY) || 0) - (Number(b?.clientY) || 0)
  return Math.hypot(dx, dy)
}

export function touchMidpoint(a, b) {
  return {
    x: ((Number(a?.clientX) || 0) + (Number(b?.clientX) || 0)) / 2,
    y: ((Number(a?.clientY) || 0) + (Number(b?.clientY) || 0)) / 2,
  }
}

/** Zoom for the current finger spread, clamped to the plan's min/max. */
export function pinchZoom({ startZoom, startDistance, distance, min, max }) {
  const base = Number(startZoom) || 1
  const from = Number(startDistance) || 0
  if (from < 1) return Math.min(max, Math.max(min, base))
  const next = base * ((Number(distance) || 0) / from)
  return Math.min(max, Math.max(min, next))
}

/**
 * Scroll change that keeps the content point under the pinch midpoint in
 * place. `before`/`after` are the layout's visual left/top (getBoundingClientRect)
 * at the old and new zoom; independent of transform-origin.
 */
export function anchorScrollDelta({ mid, before, after, fromZoom, toZoom }) {
  const z0 = Number(fromZoom) || 1
  const z1 = Number(toZoom) || 1
  const ux = (mid.x - before.left) / z0
  const uy = (mid.y - before.top) / z0
  return {
    dx: after.left + ux * z1 - mid.x,
    dy: after.top + uy * z1 - mid.y,
  }
}

/** Thumb size and offset (px) for an edge scrollbar track. */
export function edgeThumb({ client, scroll, offset, track, minThumb = 24 }) {
  const view = Math.max(0, Number(client) || 0)
  const full = Math.max(view, Number(scroll) || 0)
  const room = Math.max(0, Number(track) || 0)
  if (!view || full <= view + 1 || !room) return null
  const size = Math.max(minThumb, Math.min(room, (view / full) * room))
  const maxOffset = Math.max(0, full - view)
  const ratio = maxOffset ? Math.min(1, Math.max(0, (Number(offset) || 0) / maxOffset)) : 0
  return { size: Math.round(size), start: Math.round((room - size) * ratio) }
}
