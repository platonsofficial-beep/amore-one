import { buildHostQueueRowPresentation } from '../../../lib/hostQueuePipeline'

const HOST_QUEUE_META_SEPARATOR = '  •  '
const HOST_LIST_META_SEPARATOR = ' • '

export function HostReservationMetaLine({
  metaLine = '',
  ariaLabel = '',
  className = 'host-queue-row-meta-line',
}) {
  const separator = metaLine.includes(HOST_QUEUE_META_SEPARATOR)
    ? HOST_QUEUE_META_SEPARATOR
    : HOST_LIST_META_SEPARATOR
  const items = `${metaLine ?? ''}`
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (items.length === 0) return null

  return (
    <span className={className} aria-label={ariaLabel || undefined}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="host-queue-row-meta-segment">
          {index > 0 ? (
            <span className="host-queue-row-meta-bullet" aria-hidden="true">•</span>
          ) : null}
          <span className="host-queue-row-meta-item">{item}</span>
        </span>
      ))}
    </span>
  )
}

export function HostQueueReservationDetails({
  reservation,
  layout = null,
  className = 'host-queue-row-details',
}) {
  const presentation = buildHostQueueRowPresentation(reservation, layout)

  return (
    <div className={className}>
      <HostReservationMetaLine
        metaLine={presentation.metaLine}
        ariaLabel={presentation.metaAriaLabel}
      />
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
