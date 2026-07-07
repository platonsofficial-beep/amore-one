import { formatTime24 } from '../../lib/timeFormatUtils'

function formatReservationGuestName(name) {
  const trimmed = `${name ?? ''}`.trim()
  if (!trimmed) return 'Guest'
  return trimmed
}

export function HostServiceHealthStrip({
  metrics = null,
  insights = [],
  arrivalWaves = [],
  isLoading = false,
  onSelectReservation,
  isReservationSelected,
}) {
  if (isLoading) {
    return (
      <section className="host-service-health-strip is-loading" aria-label="Tonight service" aria-busy="true">
        <p className="host-service-health-loading">Loading service status…</p>
      </section>
    )
  }

  if (!metrics) return null

  const nextInsight = insights.find((insight) => insight.tone === 'next') ?? null
  const arrivalWave = arrivalWaves[0] ?? null
  const lateCount = Number(metrics.lateReservations) || 0
  const expectedArrivals = Number(metrics.expectedArrivals) || 0
  const guestsInHouse = Number(metrics.guestsInHouse) || 0
  const isSelected = isReservationSelected ?? (() => false)

  const handleSelect = (reservation) => {
    onSelectReservation?.(reservation, {
      scrollTimeline: true,
      scrollFloor: true,
      openGuestProfile: false,
    })
  }

  return (
    <section className="host-service-health-strip" aria-label="Tonight service">
      <div className="host-service-health-status">
        <span className="service-health-live-dot" aria-hidden="true" />
        <strong className={`host-service-health-status-label tone-${metrics.overallTone}`}>
          {metrics.overallStatus}
        </strong>
      </div>

      <div className="host-service-health-metrics" role="list">
        <div className="host-service-health-metric" role="listitem">
          <span>Late</span>
          <strong className={lateCount > 0 ? 'tone-alert' : ''}>{lateCount}</strong>
        </div>
        <div className="host-service-health-metric" role="listitem">
          <span>Arrivals</span>
          <strong>{expectedArrivals}</strong>
        </div>
        <div className="host-service-health-metric" role="listitem">
          <span>In house</span>
          <strong>{guestsInHouse > 0 ? guestsInHouse : '—'}</strong>
        </div>
      </div>

      {nextInsight?.reservation ? (
        <button
          type="button"
          className={`host-service-health-next${isSelected(nextInsight.reservation) ? ' is-selected' : ''}`}
          onClick={() => handleSelect(nextInsight.reservation)}
        >
          {nextInsight.text}
        </button>
      ) : null}

      {arrivalWave ? (
        <p className="host-service-health-wave" role="status">
          Heavy wave {arrivalWave.windowLabel} · {arrivalWave.count} guests
        </p>
      ) : null}

      {metrics.alerts?.length > 0 ? (
        <div className="host-service-health-alerts" aria-label="Late guests">
          {metrics.alerts.slice(0, 2).map((alert) => (
            <button
              key={alert.id}
              type="button"
              className={`host-service-health-alert tone-${alert.tone}${isSelected(alert.reservation) ? ' is-selected' : ''}`}
              onClick={() => handleSelect(alert.reservation)}
            >
              {alert.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function formatHostNextArrivalHint(reservation, nowMinutes) {
  if (!reservation) return ''

  const guestName = formatReservationGuestName(reservation.guestName)
  const timeLabel = formatTime24(reservation.time) || '—'
  const rawTime = `${reservation.time ?? ''}`.trim()
  const match = rawTime.match(/^(\d{1,2}):(\d{2})/)
  const arrivalMinutes = match
    ? (Number(match[1]) * 60) + Number(match[2])
    : null

  if (arrivalMinutes === null) {
    return `Next: ${guestName} · ${timeLabel}`
  }

  const diff = arrivalMinutes - nowMinutes
  if (diff <= 0) return `Next: ${guestName} · now`
  if (diff <= 90) return `Next: ${guestName} · ${timeLabel} (${diff} min)`
  return `Next: ${guestName} · ${timeLabel}`
}
