import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FloorPlanLegend } from './FloorPlanLegend'
import { formatHostQueueSeatingChipMetricsLine } from '../../lib/hostQueueServiceMetrics'
import { useMediaQuery } from '../../lib/useMediaQuery'
import {
  formatHostSeatingTableAvailabilityAccessible,
  formatHostSeatingTableAvailabilityDisplay,
} from '../../lib/tableAvailability'

const COMPACT_LEGEND_QUERY = '(orientation: landscape) and (max-height: 520px)'

export function FloorSeatingSelector({
  seatings = [],
  dateKey,
  selectedSeatingId = null,
  onSelect,
  summaries = {},
  legendItems = null,
}) {
  const compactLegend = useMediaQuery(COMPACT_LEGEND_QUERY)
  const [legendOpen, setLegendOpen] = useState(false)
  const [legendBox, setLegendBox] = useState(null)
  const scrollRef = useRef(null)
  const legendButtonRef = useRef(null)

  useEffect(() => {
    const chip = scrollRef.current?.querySelector('.floor-seating-selector-chip.is-active')
    if (typeof chip?.scrollIntoView === 'function') {
      chip.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [selectedSeatingId, seatings])

  useEffect(() => {
    if (!legendOpen || !legendButtonRef.current) {
      setLegendBox(null)
      return undefined
    }
    const place = () => {
      const rect = legendButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(280, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
      const top = Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 120))
      setLegendBox({ left, top, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [legendOpen])

  if (!seatings.length) return null

  return (
    <section className="floor-seating-selector-shell" aria-label="Today's seatings">
      <p className="floor-seating-selector-label">Today&apos;s seatings</p>
      <div className="floor-seating-selector-toolbar">
        <div className="floor-seating-selector-scroll" role="group" aria-label="Service seating" ref={scrollRef}>
          {seatings.map((seating) => {
            const summary = summaries[seating.id]
            const tableAvailability = summary?.tableAvailability
            const summaryCount = tableAvailability
              ? formatHostSeatingTableAvailabilityDisplay(tableAvailability)
              : summary?.bookedCovers != null && summary?.totalCapacity != null
                ? `${summary.bookedCovers}/${summary.totalCapacity}`
                : ''
            const summaryAccessibleLabel = tableAvailability
              ? formatHostSeatingTableAvailabilityAccessible(tableAvailability)
              : ''
            const metricsLine = summary?.operationalMetrics
              ? formatHostQueueSeatingChipMetricsLine(summary.operationalMetrics)
              : ''

            return (
              <button
                key={seating.id}
                type="button"
                className={`floor-seating-selector-chip${selectedSeatingId === seating.id ? ' is-active' : ''}`}
                onClick={() => onSelect?.(seating.id)}
                aria-pressed={selectedSeatingId === seating.id}
              >
                <span className="floor-seating-selector-chip-name">{seating.name}</span>
                <span className="floor-seating-selector-chip-time">{seating.startTime}</span>
                {summaryCount ? (
                  <span
                    className="floor-seating-selector-chip-count"
                    aria-label={summaryAccessibleLabel || undefined}
                  >
                    {summaryCount}
                  </span>
                ) : null}
                {metricsLine ? (
                  <span className="floor-seating-selector-chip-metrics">{metricsLine}</span>
                ) : null}
              </button>
            )
          })}
        </div>
        {legendItems?.length ? (
          <div className="floor-seating-legend-slot">
            {compactLegend ? (
              <>
                <details
                  className="floor-seating-legend-disclosure"
                  onToggle={(event) => setLegendOpen(event.currentTarget.open)}
                >
                  <summary
                    ref={legendButtonRef}
                    className="floor-seating-legend-disclosure-btn"
                    aria-label="Table colors"
                    data-help="reservations.legend"
                  >
                    i
                  </summary>
                </details>
                {legendOpen && legendBox ? createPortal(
                  <FloorPlanLegend
                    items={legendItems}
                    variant="compact"
                    className="floor-seating-legend-popover is-open"
                    ariaLabel="Floor plan table colors"
                    style={{ left: legendBox.left, top: legendBox.top, width: legendBox.width }}
                  />,
                  document.body,
                ) : null}
              </>
            ) : (
              <FloorPlanLegend
                items={legendItems}
                variant="compact"
                className="floor-seating-selector-legend"
                ariaLabel="Floor plan table colors"
              />
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
