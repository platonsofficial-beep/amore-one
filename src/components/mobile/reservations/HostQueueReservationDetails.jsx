import { buildHostQueueRowPresentation } from '../../../lib/hostQueuePipeline'

export function HostQueueReservationDetails({
  reservation,
  layout = null,
  className = 'host-queue-row-details',
}) {
  const presentation = buildHostQueueRowPresentation(reservation, layout)

  return (
    <div className={className}>
      <span className="host-queue-row-meta-line">{presentation.metaLine}</span>
      {presentation.chips.length > 0 || presentation.overflowCount > 0 ? (
        <div className="host-queue-row-chips" aria-label="Operational requirements">
          {presentation.chips.map((chip) => (
            <span key={chip.id} className="host-queue-row-chip">{chip.label}</span>
          ))}
          {presentation.overflowCount > 0 ? (
            <span className="host-queue-row-chip is-overflow">+{presentation.overflowCount}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
