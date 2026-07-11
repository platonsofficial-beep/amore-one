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
        <div className="floor-table-chrome">
          <span className="floor-table-linked-badge" aria-hidden="true" />
        </div>
      ) : null}
      <div className="floor-table-content">
        <span className="floor-table-number">{content.tableLabel}</span>
        {content.timeLabel ? (
          <span className="floor-table-time floor-table-reservation-time">{content.timeLabel}</span>
        ) : null}
        {content.partyLabel ? (
          <span className={content.mode === 'available' ? 'floor-table-capacity-label' : 'floor-table-pax'}>
            {content.partyLabel}
          </span>
        ) : null}
        {content.showChairDots ? (
          <FloorTableSeatingIndicators indicators={seatingIndicators} />
        ) : null}
      </div>
    </>
  )
}
