import { useState } from 'react'
import {
  buildTimelineEventRows,
  formatTimelineEventRow,
  partitionTimelineEvents,
  shouldShowTimelineNowMarker,
  TIMELINE_LEGEND_ITEMS,
  TIMELINE_PREVIEW_LIMIT,
  TIMELINE_SCROLL_LIMIT,
} from '../../lib/todayDashboardUtils'
import { buildReservationTimelinePresentation } from '../../lib/todayTimelinePresentationUtils'

function TodayTimelineNowRow({ row }) {
  return (
    <li key={row.key} className="today-timeline-now-row" aria-label={`Current time ${row.label}`}>
      <div className="today-timeline-now">
        <span>Now {row.label}</span>
      </div>
    </li>
  )
}

function TodayTimelineReservationCard({ event, eventRow }) {
  const presentation = buildReservationTimelinePresentation(event, eventRow)
  const isCompletedItem = eventRow.isCompletedItem

  return (
    <article className={`today-timeline-service-card${isCompletedItem ? ' is-completed' : ''}`}>
      <div className="today-timeline-service-card-head">
        <span className="today-timeline-status" aria-hidden="true">{eventRow.status.icon}</span>
        {eventRow.timeLabel ? (
          <span className="today-timeline-time">{eventRow.timeLabel}</span>
        ) : null}
      </div>

      <div className="today-timeline-service-card-body">
        <strong className="today-timeline-guest-name">{presentation.guestName}</strong>
        {presentation.guestsLine ? (
          <span className="today-timeline-service-meta today-timeline-guests-line">{presentation.guestsLine}</span>
        ) : null}
        {presentation.tablesLine ? (
          <span className="today-timeline-service-meta today-timeline-tables-line">{presentation.tablesLine}</span>
        ) : null}
        {presentation.fallbackLine ? (
          <span className="today-timeline-service-meta">{presentation.fallbackLine}</span>
        ) : null}
        {isCompletedItem && eventRow.meta ? (
          <span className="today-timeline-service-meta is-muted">{eventRow.meta}</span>
        ) : null}
      </div>
    </article>
  )
}

function TodayTimelineGenericCard({ eventRow }) {
  const secondaryLine = eventRow.detail || eventRow.subtitle || ''
  const metaLine = eventRow.meta || ''

  return (
    <article
      className={[
        'today-timeline-service-card',
        eventRow.isCompletedItem ? 'is-completed' : '',
        eventRow.isFinishedShift ? 'is-finished-shift' : '',
        eventRow.status?.state === 'working' ? 'is-working-shift' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="today-timeline-service-card-head">
        <span className="today-timeline-status" aria-hidden="true">{eventRow.status.icon}</span>
        {eventRow.timeLabel ? (
          <span className="today-timeline-time">{eventRow.timeLabel}</span>
        ) : null}
      </div>

      <div className="today-timeline-service-card-body">
        <strong className="today-timeline-event-title">{eventRow.title}</strong>
        {secondaryLine ? (
          <span className="today-timeline-service-meta">{secondaryLine}</span>
        ) : null}
        {metaLine ? (
          <span className={`today-timeline-service-meta${eventRow.isCompletedItem ? ' is-muted' : ''}`}>{metaLine}</span>
        ) : null}
      </div>
    </article>
  )
}

function TodayTimelineEventRow({ row, nowMinutes }) {
  const eventRow = formatTimelineEventRow(row.event, nowMinutes)
  const itemClassName = [
    'today-timeline-item',
    `type-${eventRow.type}`,
    `tone-${eventRow.status?.tone ?? 'upcoming'}`,
    eventRow.isFinishedShift ? 'is-finished-shift' : '',
    eventRow.isCompletedItem ? 'is-completed-item' : '',
    eventRow.status?.state === 'working' ? 'is-working-shift' : '',
    eventRow.isCompactRow ? 'is-compact-row' : '',
  ].filter(Boolean).join(' ')

  return (
    <li key={row.key} className={itemClassName}>
      {eventRow.type === 'reservation' ? (
        <TodayTimelineReservationCard event={row.event} eventRow={eventRow} />
      ) : (
        <TodayTimelineGenericCard eventRow={eventRow} />
      )}
    </li>
  )
}

export function TodayServiceTimeline({ events, isLoading, now = new Date(), todayKey = '' }) {
  const [showAll, setShowAll] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const { activeAndUpcoming, completed } = partitionTimelineEvents(events, now)
  const totalActiveCount = activeAndUpcoming.length
  const completedCount = completed.length
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const visibleActiveEvents = showAll
    ? activeAndUpcoming
    : activeAndUpcoming.slice(0, TIMELINE_PREVIEW_LIMIT)
  const showNowMarker = shouldShowTimelineNowMarker({ todayKey, currentDateKey: todayKey })
  const activeRows = buildTimelineEventRows(visibleActiveEvents, { now, showNow: showNowMarker })
  const completedRows = showCompleted
    ? buildTimelineEventRows(completed, { now, showNow: false })
    : []
  const isScrollable = showAll && totalActiveCount > TIMELINE_SCROLL_LIMIT

  if (isLoading) {
    return <p className="today-empty-note">Loading timeline…</p>
  }

  if (totalActiveCount === 0 && completedCount === 0) {
    return <p className="today-empty-note">No upcoming events for today.</p>
  }

  const hasActiveRows = activeRows.length > 0

  return (
    <div className={`today-timeline-scroll${isScrollable ? ' is-scrollable' : ''}`}>
      {hasActiveRows ? (
        <ul className="today-timeline-list today-timeline-flow">
          {activeRows.map((row) => (
            row.kind === 'now'
              ? <TodayTimelineNowRow key={row.key} row={row} />
              : <TodayTimelineEventRow key={row.key} row={row} nowMinutes={nowMinutes} />
          ))}
        </ul>
      ) : (
        <p className="today-empty-note">Nothing active right now.</p>
      )}
      {completedCount > 0 ? (
        <button
          type="button"
          className="today-timeline-completed-toggle"
          onClick={() => setShowCompleted((current) => !current)}
          aria-expanded={showCompleted}
        >
          {showCompleted ? 'Hide completed' : `Show completed (${completedCount})`}
        </button>
      ) : null}
      {showCompleted && completedRows.length > 0 ? (
        <ul className="today-timeline-list today-timeline-flow today-timeline-completed-list">
          {completedRows.map((row) => (
            row.kind === 'now'
              ? <TodayTimelineNowRow key={row.key} row={row} />
              : <TodayTimelineEventRow key={row.key} row={row} nowMinutes={nowMinutes} />
          ))}
        </ul>
      ) : null}
      {totalActiveCount > TIMELINE_PREVIEW_LIMIT && !showAll ? (
        <button
          type="button"
          className="today-timeline-show-all"
          onClick={() => setShowAll(true)}
        >
          Show all ({totalActiveCount})
        </button>
      ) : null}
      <div className="today-timeline-legend" aria-label="Timeline legend">
        {TIMELINE_LEGEND_ITEMS.map((item) => (
          <span key={item.key} className="today-timeline-legend-item">
            <span className="today-timeline-legend-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export { TodayServiceTimeline as TodayTimeline }
