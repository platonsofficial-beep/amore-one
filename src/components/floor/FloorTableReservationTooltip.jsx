import { useLayoutEffect, useRef, useState } from 'react'

const TOOLTIP_GAP = 6
const BOUNDARY_PADDING = 6

function resolveBoundary(node) {
  return node.closest('.floor-plan-layout-space')
    ?? node.closest('.floor-plan-canvas')
    ?? node.closest('.floor-plan-viewport')
}

function computeTooltipStyle(node, tooltip, boundary) {
  const nodeRect = node.getBoundingClientRect()
  const boundaryRect = boundary.getBoundingClientRect()

  const tooltipWidth = tooltip.offsetWidth
  const tooltipHeight = tooltip.offsetHeight

  let vertical = 'top'
  let top = -tooltipHeight - TOOLTIP_GAP
  const spaceAbove = nodeRect.top - boundaryRect.top
  const spaceBelow = boundaryRect.bottom - nodeRect.bottom

  if (spaceAbove < tooltipHeight + TOOLTIP_GAP + BOUNDARY_PADDING && spaceBelow > spaceAbove) {
    vertical = 'bottom'
    top = nodeRect.height + TOOLTIP_GAP
  }

  let left = (nodeRect.width - tooltipWidth) / 2
  const absoluteLeft = nodeRect.left + left
  const absoluteRight = absoluteLeft + tooltipWidth

  if (absoluteLeft < boundaryRect.left + BOUNDARY_PADDING) {
    left += boundaryRect.left + BOUNDARY_PADDING - absoluteLeft
  } else if (absoluteRight > boundaryRect.right - BOUNDARY_PADDING) {
    left -= absoluteRight - (boundaryRect.right - BOUNDARY_PADDING)
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
    bottom: 'auto',
    right: 'auto',
    transform: 'none',
    '--floor-tooltip-placement': vertical,
  }
}

export function FloorTableReservationTooltip({
  guestName,
  scheduleLabel,
  metaLabel,
  statusLabel,
  guestType,
  isLinked = false,
  isVisible = false,
  nodeRef,
}) {
  const tooltipRef = useRef(null)
  const [tooltipStyle, setTooltipStyle] = useState(null)

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) return undefined

    if (!isVisible || !guestName) {
      tooltip.style.visibility = ''
      tooltip.style.opacity = ''
      return undefined
    }

    const node = nodeRef?.current
    if (!node) return undefined

    const boundary = resolveBoundary(node)
    if (!boundary) return undefined

    const measure = () => {
      const previousVisibility = tooltip.style.visibility
      const previousOpacity = tooltip.style.opacity
      tooltip.style.visibility = 'hidden'
      tooltip.style.opacity = '1'
      setTooltipStyle(computeTooltipStyle(node, tooltip, boundary))
      tooltip.style.visibility = previousVisibility
      tooltip.style.opacity = previousOpacity
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(boundary)
    observer.observe(node)

    return () => observer.disconnect()
  }, [guestName, guestType, isLinked, isVisible, metaLabel, nodeRef, scheduleLabel, statusLabel])

  if (!guestName) return null

  return (
    <div
      ref={tooltipRef}
      className={`floor-table-tooltip${isVisible ? ' is-visible' : ''}${isLinked ? ' is-linked-reservation' : ''}`}
      style={tooltipStyle ?? undefined}
      role="tooltip"
    >
      <span className="floor-table-tooltip-guest">{guestName}</span>
      {scheduleLabel ? (
        <span className="floor-table-tooltip-schedule">{scheduleLabel}</span>
      ) : null}
      {metaLabel ? (
        <span className={`floor-table-tooltip-meta${guestType === 'VIP' ? ' is-vip' : ''}`}>
          {metaLabel}
        </span>
      ) : null}
      {statusLabel ? (
        <span className="floor-table-tooltip-status">{statusLabel}</span>
      ) : null}
    </div>
  )
}
