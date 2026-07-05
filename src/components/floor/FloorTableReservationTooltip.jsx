import { useLayoutEffect, useRef, useState } from 'react'

const TOOLTIP_GAP = 6
const BOUNDARY_PADDING = 6

function resolveBoundary(node) {
  return node.closest('.floor-plan-layout-space')
    ?? node.closest('.floor-plan-canvas')
    ?? node.closest('.floor-plan-viewport')
}

function computeTooltipStyle(node, tooltip, boundary) {
  if (!node || !tooltip || !boundary) return null

  const nodeRect = node.getBoundingClientRect()
  const boundaryRect = boundary.getBoundingClientRect()
  const tooltipWidth = tooltip.offsetWidth
  const tooltipHeight = tooltip.offsetHeight

  if (!tooltipWidth || !tooltipHeight) return null

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

function normalizeScheduleEntries(scheduleEntries) {
  if (!Array.isArray(scheduleEntries)) return []

  return scheduleEntries.filter((entry) => (
    entry
    && entry.id
    && entry.time
    && entry.guestName
  ))
}

export function FloorTableReservationTooltip({
  tableLabel = '',
  scheduleEntries = [],
  emptyMessage = '',
  guestName = '',
  scheduleLabel = '',
  metaLabel = '',
  statusLabel = '',
  guestType = 'Regular',
  isLinked = false,
  isVisible = false,
  nodeRef,
}) {
  const tooltipRef = useRef(null)
  const [tooltipStyle, setTooltipStyle] = useState(null)
  const safeScheduleEntries = normalizeScheduleEntries(scheduleEntries)
  const isScheduleMode = safeScheduleEntries.length > 0 || Boolean(emptyMessage)
  const hasContent = isScheduleMode
    ? safeScheduleEntries.length > 0 || Boolean(emptyMessage)
    : Boolean(guestName)

  useLayoutEffect(() => {
    if (isScheduleMode || !isVisible || !hasContent) {
      setTooltipStyle(null)
      return undefined
    }

    const tooltip = tooltipRef.current
    if (!tooltip) return undefined

    const node = nodeRef?.current
    if (!node) return undefined

    const boundary = resolveBoundary(node)
    if (!boundary) return undefined

    let cancelled = false

    const measure = () => {
      if (cancelled || !tooltipRef.current) return

      const previousVisibility = tooltip.style.visibility
      try {
        tooltip.style.visibility = 'hidden'
        const nextStyle = computeTooltipStyle(node, tooltip, boundary)
        if (nextStyle) setTooltipStyle(nextStyle)
      } catch {
        setTooltipStyle(null)
      } finally {
        tooltip.style.visibility = previousVisibility
      }
    }

    measure()

    return () => {
      cancelled = true
    }
  }, [
    guestName,
    hasContent,
    isScheduleMode,
    isVisible,
    metaLabel,
    nodeRef,
    scheduleLabel,
    statusLabel,
  ])

  if (!isVisible || !hasContent) return null

  if (isScheduleMode) {
    return (
      <div
        ref={tooltipRef}
        className={`floor-table-tooltip floor-table-tooltip-schedule-panel is-static${isVisible ? ' is-visible' : ''}${isLinked ? ' is-linked-reservation' : ''}`}
        role="tooltip"
      >
        {tableLabel ? (
          <strong className="floor-table-tooltip-table-label">{tableLabel}</strong>
        ) : null}
        {safeScheduleEntries.length > 0 ? (
          <div className="floor-table-tooltip-schedule-list">
            {safeScheduleEntries.map((entry) => (
              <div
                key={entry.id}
                className={`floor-table-tooltip-schedule-item${entry.isHighlighted ? ' is-active' : ''}${entry.isVip ? ' is-vip' : ''}`}
              >
                <div className="floor-table-tooltip-schedule-primary">
                  <span className="floor-table-tooltip-schedule-time">{entry.time}</span>
                  <span className="floor-table-tooltip-schedule-sep" aria-hidden="true">·</span>
                  <span className="floor-table-tooltip-schedule-guest">{entry.guestName}</span>
                  <span className="floor-table-tooltip-schedule-sep" aria-hidden="true">·</span>
                  <span className="floor-table-tooltip-schedule-guests">{entry.guests} guests</span>
                </div>
                <div className="floor-table-tooltip-schedule-secondary">
                  <span className="floor-table-tooltip-schedule-tables">{entry.tablesLabel || '—'}</span>
                  <span className="floor-table-tooltip-schedule-sep" aria-hidden="true">·</span>
                  <span className="floor-table-tooltip-schedule-status">{entry.statusLabel}</span>
                </div>
              </div>
            ))}
          </div>
        ) : emptyMessage ? (
          <span className="floor-table-tooltip-empty">{emptyMessage}</span>
        ) : null}
      </div>
    )
  }

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
