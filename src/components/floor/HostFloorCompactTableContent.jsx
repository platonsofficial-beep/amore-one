import { FloorTableSeatingIndicators } from './FloorTableSeatingIndicators'

export function HostFloorCompactTableContent({
  content,
  linkMeta = null,
  seatingIndicators = [],
  diningTimerPresentation = null,
}) {
  if (!content) return null

  return (
    <>
      {linkMeta?.isMultiLinked ? (
        <span className="floor-table-combined-marker" aria-hidden="true" />
      ) : null}
      <div className={`floor-table-content is-tier-${content.tier} is-mode-${content.mode}`}>
        <span className={`floor-table-number ${content.tableLabelClass ?? ''}`.trim()}>{content.tableLabel}</span>
        {content.timeLabel ? (
          <span className="floor-table-time floor-table-reservation-time">{content.timeLabel}</span>
        ) : null}
        {content.partyLabel ? (
          <span className="floor-table-guest-indicator">{content.partyLabel}</span>
        ) : null}
        {diningTimerPresentation ? (
          <span
            className={`floor-table-dining-timer is-urgency-${diningTimerPresentation.urgency}`}
            data-testid="floor-table-dining-timer"
            data-urgency={diningTimerPresentation.urgency}
          >
            {diningTimerPresentation.compactLine ? (
              <span className="floor-table-dining-timer-compact">{diningTimerPresentation.compactLine}</span>
            ) : (
              <>
                <span className="floor-table-dining-timer-elapsed">{diningTimerPresentation.elapsedLabel}</span>
                <span className="floor-table-dining-timer-est-free">{diningTimerPresentation.estimatedFreeLabel}</span>
              </>
            )}
          </span>
        ) : null}
        {content.showChairDots ? (
          <FloorTableSeatingIndicators indicators={seatingIndicators} />
        ) : null}
      </div>
    </>
  )
}
