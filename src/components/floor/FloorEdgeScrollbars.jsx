import { useEffect, useState } from 'react'
import { edgeThumb } from '../../lib/floorPinch.js'

/**
 * Thin scroll indicators drawn on the very right and bottom edges of the
 * host floor plan (Platon t405u). The native iOS bars sat inside the plan,
 * over the tables, so they are hidden in CSS and these replace them.
 */
export function FloorEdgeScrollbars({ viewportRef, epoch }) {
  const [box, setBox] = useState(null)

  useEffect(() => {
    const viewport = viewportRef?.current
    if (!viewport) return undefined
    let frame = 0
    let idleTimer = 0
    const measure = (active) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = {
          left: viewport.offsetLeft,
          top: viewport.offsetTop,
          width: viewport.clientWidth,
          height: viewport.clientHeight,
          v: edgeThumb({ client: viewport.clientHeight, scroll: viewport.scrollHeight, offset: viewport.scrollTop, track: viewport.clientHeight - 8 }),
          h: edgeThumb({ client: viewport.clientWidth, scroll: viewport.scrollWidth, offset: viewport.scrollLeft, track: viewport.clientWidth - 8 }),
          active: Boolean(active),
        }
        setBox((current) => (
          current
          && current.left === next.left && current.top === next.top
          && current.width === next.width && current.height === next.height
          && current.active === next.active
          && JSON.stringify(current.v) === JSON.stringify(next.v)
          && JSON.stringify(current.h) === JSON.stringify(next.h)
            ? current
            : next
        ))
      })
    }
    const onScroll = () => {
      measure(true)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => measure(false), 900)
    }
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure(false)) : null
    resize?.observe(viewport)
    const content = viewport.querySelector('.floor-plan-canvas-stage')
    if (content) resize?.observe(content)
    const mutation = typeof MutationObserver === 'function'
      ? new MutationObserver(() => measure(false))
      : null
    if (content) mutation?.observe(content, { attributes: true, attributeFilter: ['style'] })
    viewport.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    measure(false)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(idleTimer)
      resize?.disconnect()
      mutation?.disconnect()
      viewport.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [viewportRef, epoch])

  if (!box || (!box.v && !box.h)) return null
  return (
    <div
      className={`floor-edge-scrollbars${box.active ? ' is-active' : ''}`}
      aria-hidden="true"
      data-testid="floor-edge-scrollbars"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      {box.v ? (
        <span className="floor-edge-scrollbar is-vertical" style={{ top: 4 + box.v.start, height: box.v.size }} />
      ) : null}
      {box.h ? (
        <span className="floor-edge-scrollbar is-horizontal" style={{ left: 4 + box.h.start, width: box.h.size }} />
      ) : null}
    </div>
  )
}
