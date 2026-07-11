import { buildHostQueueRowPresentation } from '../../../lib/hostQueuePipeline'

export function HostQueueReservationDetails({
  reservation,
  layout = null,
  className = 'host-queue-row-details',
}) {
  const presentation = buildHostQueueRowPresentation(reservation, layout)

  return (
    <div className={className}>
      <span
        className="host-queue-row-meta-line"
        aria-label={presentation.metaAriaLabel}
      >
        {presentation.metaLine}
      </span>
      {presentation.chips.length > 0 || presentation.overflowCount > 0 ? (
        <div className="host-queue-row-chips" aria-label="Operational requirements">
          {presentation.chips.map((chip) => (
            <span
              key={chip.id}
              className={`host-queue-row-chip tone-${chip.tone ?? 'neutral'}`}
            >
              {chip.label}
            </span>
          ))}
          {presentation.overflowCount > 0 ? (
            <span className="host-queue-row-chip is-overflow tone-neutral">
              +{presentation.overflowCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function HostQueueNameIndicators({ indicators = [] }) {
  if (!indicators.length) return null

  return (
    <span className="host-queue-name-indicators" aria-hidden="true">
      {indicators.map((indicator) => (
        <span
          key={indicator.id}
          className={`host-queue-name-indicator tone-${indicator.id}`}
          title={indicator.label}
        >
          {indicator.icon}
        </span>
      ))}
    </span>
  )
}
