import { FloorTableSeatingIndicators } from './FloorTableSeatingIndicators'

export function HostFloorCompactTableContent({
  content,
  linkMeta = null,
  seatingIndicators = [],
}) {
  if (!content) return null

  return (
    <>
      {linkMeta?.isMultiLinked ? (
        <span className="floor-table-combined-marker" aria-hidden="true" />
      ) : null}
      <div className={`floor-table-content is-tier-${content.tier} is-mode-${content.mode}`}>
        <span className="floor-table-number">{content.tableLabel}</span>
        {content.timeLabel ? (
          <span className="floor-table-time floor-table-reservation-time">{content.timeLabel}</span>
        ) : null}
        {content.partyLabel ? (
          <span className="floor-table-guest-indicator">{content.partyLabel}</span>
        ) : null}
        {content.showChairDots ? (
          <FloorTableSeatingIndicators indicators={seatingIndicators} />
        ) : null}
      </div>
    </>
  )
}
