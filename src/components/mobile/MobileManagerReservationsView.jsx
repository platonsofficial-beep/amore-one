import { useMemo, useState } from 'react'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { getReservationDateKey } from '../../lib/floorAssignmentMapping'
import { buildPortraitFloorTables, portraitTableStatusLabel } from '../../lib/managerPortrait'
import { sortMobileHostReservations } from '../../lib/mobileHostReservationUtils'
import { getHostListCompactStatusLabel } from '../../lib/reservationHostStatus'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { addCalendarDays, formatScheduleDayHeader } from '../../lib/weekUtils'
import { ManagerPortraitBanner } from './ManagerPortraitBanner'
import { MobileReservationQuickCreateSheet } from './reservations/MobileReservationQuickCreateSheet'

function reservationOnDate(reservation, dateKey) {
  return getReservationDateKey(reservation) === dateKey
}

export function MobileManagerReservationsView({
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
    () => sortMobileHostReservations(
      (reservations ?? []).filter((reservation) => reservationOnDate(reservation, selectedDate)),
    ),
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
    <div className="mobile-screen manager-portrait-reservations">
      <ManagerPortraitBanner area="floor" />
      <header className="manager-portrait-screen-header">
        <div>
          <p className="mobile-screen-eyebrow">Reservations</p>
          <h1>{dayLabel.weekdayLabel}</h1>
          <p className="manager-portrait-date-label">{dayLabel.calendarLabel}</p>
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
                className="manager-portrait-reservation"
                onClick={() => {
                  if (canManage) setEditingReservation(reservation)
                }}
                disabled={!canManage}
              >
                <span className="manager-portrait-reservation-time">
                  {formatTime24(reservation.time, '—')}
                </span>
                <span className="manager-portrait-reservation-copy">
                  <strong>{reservation.guestName || 'Guest'}</strong>
                  <span>
                    {Number(reservation.guests) || 0} guests
                    {reservation.tableNumber ? ` · ${reservation.tableNumber}` : ''}
                    {reservation.status ? ` · ${getHostListCompactStatusLabel(reservation.status)}` : ''}
                  </span>
                </span>
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
            {tables.map((table) => (
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
