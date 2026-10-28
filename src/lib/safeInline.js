export function readCssPx(name, fallback = 0) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

/** Landscape usable inset. The same value on both sides, so the island can sit left or right. */
export function readSafeInlinePx() {
  return Math.max(readCssPx('--safe-l'), readCssPx('--safe-r'))
}

export function clampOverlayLeft(left, width, viewportWidth, minimum = 8) {
  const edge = Math.max(minimum, readSafeInlinePx())
  const span = Math.max(0, Number(width) || 0)
  const view = Math.max(0, Number(viewportWidth) || 0)
  const maxLeft = Math.max(edge, view - span - edge)
  return Math.min(Math.max(edge, Number(left) || 0), maxLeft)
}
