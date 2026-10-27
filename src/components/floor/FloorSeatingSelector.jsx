import { useState } from 'react'
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
  if (!seatings.length) return null

  return (
    <section className="floor-seating-selector-shell" aria-label="Today's seatings">
      <p className="floor-seating-selector-label">Today&apos;s seatings</p>
      <div className="floor-seating-selector-toolbar">
        <div className="floor-seating-selector-scroll" role="group" aria-label="Service seating">
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
              <details
                className="floor-seating-legend-disclosure"
                onToggle={(event) => setLegendOpen(event.currentTarget.open)}
              >
                <summary className="floor-seating-legend-disclosure-btn" aria-label="Table colors">
                  i
                </summary>
                {legendOpen ? (
                  <FloorPlanLegend
                    items={legendItems}
                    variant="compact"
                    className="floor-seating-legend-popover"
                    ariaLabel="Floor plan table colors"
                  />
                ) : null}
              </details>
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
