import { Fragment } from 'react'
import { reservationHasAssignedTables } from '../../../lib/floorAssignmentMapping'
import { getReservationSeatingAssignment } from '../../../lib/seatingAssignment'
import {
  buildHostQueueRowPresentation,
  formatHostQueueTableSegment,
  getReservationExplicitAreaLabel,
} from '../../../lib/hostQueuePipeline'

const HOST_QUEUE_META_SEPARATOR = '  •  '
const HOST_LIST_META_SEPARATOR = ' • '

function splitLegacyMetaItemContent(item) {
  const trimmed = `${item ?? ''}`.trim()
  if (!trimmed) {
    return { icon: '', text: '' }
  }

  const emojiMatch = trimmed.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u)
  if (emojiMatch) {
    return {
      icon: emojiMatch[1],
      text: emojiMatch[2],
    }
  }

  return {
    icon: '',
    text: trimmed,
  }
}

function buildLegacyMetaGroups(metaLine = '') {
  const separator = metaLine.includes(HOST_QUEUE_META_SEPARATOR)
    ? HOST_QUEUE_META_SEPARATOR
    : HOST_LIST_META_SEPARATOR

  return `${metaLine ?? ''}`
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const { icon, text } = splitLegacyMetaItemContent(entry)
      return {
        id: `legacy-${index}`,
        icon,
        text,
      }
    })
}

export function buildHostQueueMetaGroups(reservation, layout = null) {
  const partySize = Number(reservation?.guests) || 0
  const assignment = getReservationSeatingAssignment(reservation)
  const tableSegment = formatHostQueueTableSegment(reservation)
  const areaLabel = getReservationExplicitAreaLabel(reservation, layout)
  const hasAssignedTables = reservationHasAssignedTables(reservation)
  const extraChairs = assignment?.extraChairs ?? 0
  const standingGuests = assignment?.standingGuests ?? 0

  const groups = [{
    id: 'guests',
    icon: '👤',
    text: `${partySize} guest${partySize === 1 ? '' : 's'}`,
  }]

  if (areaLabel && !hasAssignedTables) {
    groups.push({
      id: 'area',
      icon: '📍',
      text: areaLabel,
    })
  }

  groups.push({
    id: 'table',
    icon: '🍽',
    text: tableSegment,
  })

  if (extraChairs > 0) {
    groups.push({
      id: 'extra-chair',
      icon: '🪑',
      text: `+${extraChairs}`,
    })
  }

  if (standingGuests > 0) {
    groups.push({
      id: 'standing',
      icon: '',
      text: `Standing +${standingGuests}`,
    })
  }

  return groups
}

export function HostReservationMetaGroups({
  groups = [],
  ariaLabel = '',
  className = 'host-queue-row-meta-line',
}) {
  if (!groups.length) return null

  return (
    <div className={className} aria-label={ariaLabel || undefined}>
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? (
            <span className="host-queue-row-meta-bullet" aria-hidden="true">•</span>
          ) : null}
          <span className="host-queue-row-meta-group">
            {group.icon ? (
              <span className="host-queue-row-meta-icon" aria-hidden="true">{group.icon}</span>
            ) : null}
            <span className="host-queue-row-meta-text">{group.text}</span>
          </span>
        </Fragment>
      ))}
    </div>
  )
}

export function HostReservationMetaLine({
  metaLine = '',
  ariaLabel = '',
  className = 'host-queue-row-meta-line',
}) {
  const groups = buildLegacyMetaGroups(metaLine)
  return (
    <HostReservationMetaGroups
      groups={groups}
      ariaLabel={ariaLabel}
      className={className}
    />
  )
}

export function HostQueueReservationDetails({
  reservation,
  layout = null,
  className = 'host-queue-row-details',
}) {
  const presentation = buildHostQueueRowPresentation(reservation, layout)
  const metaGroups = buildHostQueueMetaGroups(reservation, layout)

  return (
    <div className={className}>
      <HostReservationMetaGroups
        groups={metaGroups}
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

export function HostReservationGuestTypeBadge({ badge = null }) {
  if (!badge?.label) return null

  return (
    <span
      className={`host-reservation-guest-type-badge ${badge.className}`}
      aria-label={`Guest type: ${badge.label}`}
    >
      {badge.label}
    </span>
  )
}
