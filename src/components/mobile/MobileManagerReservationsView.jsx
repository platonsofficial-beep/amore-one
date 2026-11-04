import { useEffect, useMemo, useRef, useState } from 'react'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { getReservationDateKey } from '../../lib/floorAssignmentMapping'
import { buildPortraitFloorTables, portraitTableStatusLabel } from '../../lib/managerPortrait'
import { sortMobileHostReservations } from '../../lib/mobileHostReservationUtils'
import { getHostListCompactStatusLabel, getHostStatusMeta, normalizeReservationStatus } from '../../lib/reservationHostStatus'
import { getHostQueueNameIndicators } from '../../lib/hostQueuePipeline'
import {
  HostQueueNameIndicators,
  HostQueueReservationDetails,
  HostReservationGuestTypeBadge,
  HostReservationPurposeLabel,
} from './reservations/HostQueueReservationDetails'
import { HOST_LIST_HELPERS } from '../reservations/hostReservationListHelpers'
import { getHostNameGuestTypeBadgeMeta } from '../reservations/hostReservationListUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { addCalendarDays, formatScheduleDayHeader } from '../../lib/weekUtils'
import { ManagerPortraitBanner } from './ManagerPortraitBanner'
import { buildHostQueueServiceMetrics } from '../../lib/hostQueueServiceMetrics'
import { HostQueueServiceSummary } from './reservations/HostQueueServiceSummary'
import { MobileReservationQuickCreateSheet } from './reservations/MobileReservationQuickCreateSheet'

function reservationOnDate(reservation, dateKey) {
  return getReservationDateKey(reservation) === dateKey
}

const NOT_COMING_STATUSES = new Set(['Cancelled', 'Not Shown', 'Rejected'])

export function isNotComingReservation(reservation) {
  return NOT_COMING_STATUSES.has(normalizeReservationStatus(reservation?.status))
}

// "19 bookings · 75 guests · 1 cancelled" — same rule as the database count:
// cancelled, no-show and rejected bookings are not expected guests.
export function summarizePortraitDay(dayReservations = []) {
  let bookings = 0
  let guests = 0
  let cancelled = 0
  dayReservations.forEach((reservation) => {
    if (NOT_COMING_STATUSES.has(normalizeReservationStatus(reservation?.status))) {
      cancelled += 1
      return
    }
    bookings += 1
    guests += Math.max(0, Number(reservation?.guests) || 0)
  })
  const parts = [
    `${bookings} booking${bookings === 1 ? '' : 's'}`,
    `${guests} guest${guests === 1 ? '' : 's'}`,
  ]
  if (cancelled) parts.push(`${cancelled} cancelled`)
  return parts.join(' · ')
}

/** "Mon 2 Nov" for the sticky day bar (the app is English for now). */
export function formatPortraitStickyDay(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(`${dateKey ?? ''}`)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return ''
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' })
  const month = date.toLocaleDateString('en-GB', { month: 'short' })
  return `${weekday} ${date.getDate()} ${month}`
}

const tableLabelCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function MobileManagerReservationsView({
  className = '',
  reservations = [],
  todayKey = '',
  dateKey = '',
  nowMinutes = null,
  isLoading = false,
  isSaving = false,
  noticeMessage = '',
  canManage = false,
  seatings = [],
  onDateChange,
  onCreateReservation,
  onEditReservation,
}) {
  const { layout } = usePublishedFloorPlan()
  const selectedDate = dateKey || todayKey
  const [createOpen, setCreateOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const dayLabel = formatScheduleDayHeader(selectedDate)
  const isToday = selectedDate === todayKey

  const dayReservations = useMemo(
    () => {
      const sorted = sortMobileHostReservations(
        (reservations ?? []).filter((reservation) => reservationOnDate(reservation, selectedDate)),
      )
      // Cancelled / no-show / rejected go to the bottom of the day.
      return [
        ...sorted.filter((reservation) => !isNotComingReservation(reservation)),
        ...sorted.filter((reservation) => isNotComingReservation(reservation)),
      ]
    },
    [reservations, selectedDate],
  )

  const tables = useMemo(
    () => buildPortraitFloorTables({
      layout,
      reservations,
      dateKey: selectedDate,
      nowMinutes: isToday ? nowMinutes : null,
    }),
    [layout, reservations, selectedDate, isToday, nowMinutes],
  )
  // T9, T10, T11… instead of the order tables were drawn in.
  const sortedTables = useMemo(
    () => [...tables].sort((left, right) => tableLabelCollator.compare(left.label, right.label)),
    [tables],
  )
  const daySummary = useMemo(() => summarizePortraitDay(dayReservations), [dayReservations])
  // Same emoji + word metrics as the landscape header, for the whole day.
  const dayMetrics = useMemo(() => buildHostQueueServiceMetrics(dayReservations, {
    layout,
    dateKey: selectedDate,
    nowMinutes: isToday ? nowMinutes : null,
  }), [dayReservations, layout, selectedDate, isToday, nowMinutes])

  // Platon t409u: once the day header scrolls away, a small bar under the
  // top band keeps showing which day this is, with the same ‹ › buttons.
  const headerRef = useRef(null)
  const [showStickyDay, setShowStickyDay] = useState(false)
  useEffect(() => {
    const header = headerRef.current
    if (!header || typeof IntersectionObserver !== 'function') return undefined
    const band = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--one-portrait-band'),
    )
    // The band is a calc() token; fall back to where the header starts (8px under it).
    const top = Number.isFinite(band) && band > 0 ? band : Math.max(0, header.getBoundingClientRect().top - 8)
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyDay(!entry.isIntersecting && entry.boundingClientRect.top < top),
      { rootMargin: `-${Math.round(top)}px 0px 0px 0px`, threshold: 0 },
    )
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const shiftDate = (days) => {
    onDateChange?.(addCalendarDays(selectedDate, days))
  }

  const handleCreate = async (form) => {
    const created = await onCreateReservation?.(form)
    if (created !== false) setCreateOpen(false)
    return created
  }

  const handleEdit = async (reservation, form) => {
    const result = await onEditReservation?.(reservation, form, selectedDate)
    const saved = result?.saved === true
    if (saved) setEditingReservation(null)
    return saved
  }

  return (
    <div className={`mobile-screen manager-portrait-reservations${className ? ` ${className}` : ''}`}>
      <ManagerPortraitBanner area="floor" />
      <div
        className={`manager-portrait-sticky-day${showStickyDay ? ' is-visible' : ''}`}
        aria-hidden={showStickyDay ? undefined : 'true'}
        data-testid="portrait-sticky-day"
      >
        <button type="button" onClick={() => shiftDate(-1)} aria-label="Previous day" tabIndex={showStickyDay ? 0 : -1}>‹</button>
        <span className="manager-portrait-sticky-day-label">{formatPortraitStickyDay(selectedDate)}</span>
        <button type="button" onClick={() => shiftDate(1)} aria-label="Next day" tabIndex={showStickyDay ? 0 : -1}>›</button>
      </div>
      <header className="manager-portrait-screen-header" ref={headerRef}>
        <div>
          <p className="mobile-screen-eyebrow">Reservations</p>
          <h1>{dayLabel.weekdayLabel}</h1>
          <p className="manager-portrait-date-label">{dayLabel.calendarLabel}</p>
          {!isLoading ? <p className="manager-portrait-day-summary">{daySummary}</p> : null}
          {!isLoading ? (
            <HostQueueServiceSummary {...dayMetrics} className="manager-portrait-day-metrics" />
          ) : null}
        </div>
        {canManage ? (
          <button type="button" className="manager-portrait-add" onClick={() => setCreateOpen(true)}>
            Add
          </button>
        ) : null}
      </header>

      <div className="manager-portrait-date-nav" aria-label="Reservation day">
        <button type="button" onClick={() => shiftDate(-1)} aria-label="Previous day">‹</button>
        <button type="button" onClick={() => onDateChange?.(todayKey)} disabled={!todayKey || isToday}>
          Today
        </button>
        <button type="button" onClick={() => shiftDate(1)} aria-label="Next day">›</button>
      </div>

      {noticeMessage ? <p className="manager-portrait-notice" role="status">{noticeMessage}</p> : null}

      <section aria-label="Bookings">
        <h2>Bookings</h2>
        {isLoading ? <p className="manager-portrait-empty">Loading reservations…</p> : null}
        {!isLoading && dayReservations.length === 0 ? (
          <p className="manager-portrait-empty">No bookings for this day.</p>
        ) : null}
        <ul className="manager-portrait-reservation-list">
          {dayReservations.map((reservation) => (
            <li key={reservation.id}>
              <button
                type="button"
                className={`manager-portrait-reservation${isNotComingReservation(reservation) ? ' is-not-coming' : ''}`}
                onClick={() => {
                  if (canManage) setEditingReservation(reservation)
                }}
                disabled={!canManage}
              >
                <span className="manager-portrait-reservation-time">
                  {formatTime24(reservation.time, '—')}
                </span>
                <span className="manager-portrait-reservation-copy">
                  <span className="manager-portrait-reservation-title">
                    <strong>{reservation.guestName || 'Guest'}</strong>
                    <HostQueueNameIndicators indicators={getHostQueueNameIndicators(reservation)} />
                    <HostReservationGuestTypeBadge
                      badge={getHostNameGuestTypeBadgeMeta(reservation, HOST_LIST_HELPERS.getGuestCustomerType)}
                    />
                    <HostReservationPurposeLabel reservation={reservation} />
                  </span>
                  <HostQueueReservationDetails
                    reservation={reservation}
                    layout={layout}
                    className="host-queue-row-details manager-portrait-reservation-details"
                  />
                </span>
                {reservation.status ? (
                  <span
                    className={`manager-portrait-reservation-status host-reservation-card-status-pill is-compact tone-${getHostStatusMeta(normalizeReservationStatus(reservation.status)).tone}`}
                  >
                    {getHostListCompactStatusLabel(reservation.status)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Tables">
        <h2>Tables</h2>
        {tables.length === 0 ? (
          <p className="manager-portrait-empty">No published tables yet.</p>
        ) : (
          <ul className="manager-portrait-table-list">
            {sortedTables.map((table) => (
              <li key={table.id} className={`manager-portrait-table is-${table.status || 'available'}`}>
                <span className="manager-portrait-table-name">
                  {table.label}
                  {table.seats ? <span>{table.seats} seats</span> : null}
                </span>
                <span className="manager-portrait-table-meta">
                  {table.guest ? <span>{table.guest}</span> : null}
                  <span className={`manager-portrait-status is-${table.status || 'available'}`}>
                    {portraitTableStatusLabel(table.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MobileReservationQuickCreateSheet
        isOpen={createOpen}
        mode="create"
        todayKey={selectedDate}
        isSaving={isSaving}
        seatings={seatings}
        reservations={reservations}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <MobileReservationQuickCreateSheet
        isOpen={Boolean(editingReservation)}
        mode="edit"
        reservation={editingReservation}
        todayKey={selectedDate}
        isSaving={isSaving}
        seatings={seatings}
        reservations={reservations}
        onClose={() => setEditingReservation(null)}
        onSubmit={handleEdit}
      />
    </div>
  )
}
