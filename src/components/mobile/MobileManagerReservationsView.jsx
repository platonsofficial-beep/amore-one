import { useEffect, useMemo, useRef, useState } from 'react'
import { usePublishedFloorPlan } from '../../lib/PublishedFloorPlanContext'
import { getReservationDateKey } from '../../lib/floorAssignmentMapping'
import { listPortraitSeatingLeftovers } from '../../lib/managerPortrait'
import { filterReservationsBySelectedSeating, reservationMatchesHostQueueOperationalFilter } from '../../lib/hostQueuePipeline'
import { getActiveSeatingsForDate } from '../../lib/reservationSeatings'
import { HostLoadNotice } from '../reservations/HostLoadNotice'
import { isHostLoadFailureMessage } from '../../lib/hostLoadNotice'
import { sortMobileHostReservations } from '../../lib/mobileHostReservationUtils'
import { formatPartialSeatLabel, getHostListCompactStatusLabel, getHostStatusMeta, normalizeReservationStatus } from '../../lib/reservationHostStatus'
import { getHostQueueNameIndicators } from '../../lib/hostQueuePipeline'
import {
  HostQueueNameIndicators,
  HostQueueReservationDetails,
  HostReservationGuestTypeBadge,
  HostReservationPurposeLabel,
} from './reservations/HostQueueReservationDetails'
import { HostReservationStatusPicker } from '../reservations/HostReservationStatusPicker'
import { HOST_LIST_HELPERS } from '../reservations/hostReservationListHelpers'
import { getHostNameGuestTypeBadgeMeta } from '../reservations/hostReservationListUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { addCalendarDays, formatScheduleDayHeader } from '../../lib/weekUtils'
import { buildHostQueueServiceMetrics } from '../../lib/hostQueueServiceMetrics'
import { HostQueueServiceSummary } from './reservations/HostQueueServiceSummary'
import { MobileReservationQuickCreateSheet } from './reservations/MobileReservationQuickCreateSheet'
import { GuestDirectory, GuestsButton } from '../reservations/GuestHistory'
import { claimGuestPreview, guestPreviewPhone } from '../../lib/guestHistoryPreview'
import { t } from '../../i18n/i18n'

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

export function MobileManagerReservationsView({
  className = '',
  reservations = [],
  todayKey = '',
  dateKey = '',
  nowMinutes = null,
  isLoading = false,
  isSaving = false,
  noticeMessage = '',
  onRetryLoad = null,
  canManage = false,
  seatings = [],
  selectedSeatingId: controlledSeatingId = undefined,
  onSelectedSeatingChange = null,
  onDateChange,
  onOpenReservationServices = null,
  onCreateReservation,
  onEditReservation,
  onQuickStatusUpdate = null,
  role = '',
  workspaceId = '',
}) {
  const { layout } = usePublishedFloorPlan()
  const selectedDate = dateKey || todayKey
  const [createOpen, setCreateOpen] = useState(false)
  const [createMode, setCreateMode] = useState('create')
  const [createPrefill, setCreatePrefill] = useState(null)
  const [guestsOpen, setGuestsOpen] = useState(false)
  const [guestFocus, setGuestFocus] = useState('')
  const [blacklistOpen, setBlacklistOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [uncontrolledSeatingId, setUncontrolledSeatingId] = useState(null)
  const seatingFilterControlled = typeof onSelectedSeatingChange === 'function'
  const selectedSeatingId = seatingFilterControlled
    ? (controlledSeatingId || null)
    : uncontrolledSeatingId
  const setSelectedSeatingId = (nextId) => {
    if (seatingFilterControlled) onSelectedSeatingChange(nextId || '')
    else setUncontrolledSeatingId(nextId || null)
  }
  const [editingReservation, setEditingReservation] = useState(null)
  const [statusPicker, setStatusPicker] = useState(null)
  const canChangeStatus = canManage && typeof onQuickStatusUpdate === 'function'
  // Same flow as the landscape card (MobileReservationsHostView handleStatusSelect).
  const handleStatusSelect = async (reservation, status, options) => {
    if (isSaving) return
    await onQuickStatusUpdate?.(reservation, status, options)
    setStatusPicker(null)
  }
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

  const seatingLeftovers = useMemo(
    () => listPortraitSeatingLeftovers(reservations, selectedDate),
    [reservations, selectedDate],
  )
  const activeSeatings = useMemo(
    () => getActiveSeatingsForDate(seatings, selectedDate),
    [seatings, selectedDate],
  )
  const selectedSeating = activeSeatings.find((seating) => seating.id === selectedSeatingId) ?? null
  useEffect(() => {
    if (selectedSeatingId && activeSeatings.length > 0 && !selectedSeating) setSelectedSeatingId(null)
  }, [activeSeatings.length, selectedSeating, selectedSeatingId])
  const visibleReservations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const bySeating = filterReservationsBySelectedSeating(
      dayReservations,
      selectedSeating,
      activeSeatings,
      selectedDate,
    )
    return bySeating.filter((reservation) => {
      if (query && !`${reservation.guestName ?? ''}`.toLowerCase().includes(query)) return false
      if (!problemsOnly) return true
      return reservationMatchesHostQueueOperationalFilter(reservation, 'problems', {
        nowMinutes: nowMinutes ?? 0,
        todayKey: selectedDate,
      })
    })
  }, [activeSeatings, dayReservations, nowMinutes, problemsOnly, searchTerm, selectedDate, selectedSeating])
  const loadFailed = isHostLoadFailureMessage(noticeMessage)
  const summaryUnavailable = loadFailed && dayReservations.length === 0
  const daySummary = useMemo(() => (
    summaryUnavailable ? 'Bookings unavailable' : summarizePortraitDay(dayReservations)
  ), [dayReservations, summaryUnavailable])
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

  useEffect(() => {
    const mode = claimGuestPreview(true)
    if (!mode) return
    const phone = guestPreviewPhone(mode)
    if (mode === 'list' || mode === 'history' || mode === 'blacklist') {
      setGuestsOpen(true)
      if (mode !== 'list') setGuestFocus('+35799111222')
      if (mode === 'blacklist') setBlacklistOpen(true)
      return
    }
    setCreateMode(mode === 'walkin' ? 'walk-in' : 'create')
    setCreatePrefill({ phone, date: todayKey })
    setCreateOpen(true)
  }, [todayKey])

  const openCreate = (mode) => {
    setCreateMode(mode)
    setCreatePrefill(selectedSeating
      ? { seatingId: selectedSeating.id, date: selectedDate }
      : null)
    setCreateOpen(true)
  }

  const handleCreate = async (form) => {
    const created = await onCreateReservation?.(form)
    if (created !== false) setCreateOpen(false)
    return created
  }

  const closeLeftovers = async () => {
    if (typeof onQuickStatusUpdate !== 'function') return
    for (const reservation of seatingLeftovers) {
      await onQuickStatusUpdate(reservation, 'Checked Out')
    }
  }

  const handleEdit = async (reservation, form) => {
    const result = await onEditReservation?.(reservation, form, selectedDate)
    const saved = result?.saved === true
    if (saved) setEditingReservation(null)
    return saved
  }

  return (
    <div className={`mobile-screen manager-portrait-reservations${className ? ` ${className}` : ''}`}>
      <div
        className={`manager-portrait-sticky-day${showStickyDay ? ' is-visible' : ''}`}
        aria-hidden={showStickyDay ? undefined : 'true'}
        data-testid="portrait-sticky-day"
      >
        <button type="button" onClick={() => shiftDate(-1)} aria-label={t("Previous day")} tabIndex={showStickyDay ? 0 : -1}>‹</button>
        <span className="manager-portrait-sticky-day-label">{formatPortraitStickyDay(selectedDate)}</span>
        <button type="button" onClick={() => shiftDate(1)} aria-label={t("Next day")} tabIndex={showStickyDay ? 0 : -1}>›</button>
      </div>
      <header className="manager-portrait-screen-header" ref={headerRef}>
        <div>
          <p className="mobile-screen-eyebrow">{t("Reservations")}</p>
          <h1>{dayLabel.weekdayLabel}</h1>
          <p className="manager-portrait-date-label">{dayLabel.calendarLabel}</p>
          {!isLoading ? <p className="manager-portrait-day-summary">{daySummary}</p> : null}
          {!isLoading && summaryUnavailable ? (
            <p className="manager-portrait-day-summary" role="status">{t("Service summary unavailable until reservations load.")}</p>
          ) : null}
          {!isLoading && !summaryUnavailable ? (
            <HostQueueServiceSummary {...dayMetrics} className="manager-portrait-day-metrics" />
          ) : null}
        </div>
        {canManage ? (
          <div className="manager-portrait-create-actions">
            <button type="button" className="manager-portrait-add" onClick={() => openCreate('walk-in')}>
              {t("Walk-in")}
            </button>
            <button type="button" className="manager-portrait-add" onClick={() => openCreate('create')}>
              {t("Add")}
            </button>
            <GuestsButton onClick={() => setGuestsOpen(true)} />
          </div>
        ) : null}
      </header>

      {onOpenReservationServices ? (
        <button
          type="button"
          className="manager-portrait-hours"
          onClick={onOpenReservationServices}
          aria-label={t("Seating hours")}
        >
          {t("Seating hours")}
        </button>
      ) : null}

      <div className="manager-portrait-find">
        <label className="manager-portrait-search">
          <span className="sr-only">{t("Search guest")}</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("Search guest")}
            data-testid="portrait-reservation-search"
          />
        </label>
        <button
          type="button"
          className={`manager-portrait-problems${problemsOnly ? ' is-active' : ''}`}
          aria-pressed={problemsOnly}
          onClick={() => setProblemsOnly((current) => !current)}
        >
          {t("Problems")}
        </button>
      </div>

      {activeSeatings.length > 0 ? (
        <div
          className="manager-portrait-seatings"
          role="group"
          aria-label={t("Seatings")}
          data-testid="portrait-seatings"
          data-seating-filter={selectedSeatingId || 'all'}
        >
          <button
            type="button"
            className={!selectedSeating ? 'is-active' : ''}
            aria-pressed={!selectedSeating}
            onClick={() => setSelectedSeatingId(null)}
          >
            {t("All")}
          </button>
          {activeSeatings.map((seating) => (
            <button
              key={seating.id}
              type="button"
              className={selectedSeating?.id === seating.id ? 'is-active' : ''}
              aria-pressed={selectedSeating?.id === seating.id}
              onClick={() => setSelectedSeatingId(seating.id)}
            >
              <span>{seating.name}</span>
              {seating.startTime ? <span>{seating.startTime}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="manager-portrait-date-nav" aria-label={t("Reservation day")}>
        <button type="button" onClick={() => shiftDate(-1)} aria-label={t("Previous day")}>‹</button>
        <button type="button" onClick={() => onDateChange?.(todayKey)} disabled={!todayKey || isToday}>
          {t("Today")}
        </button>
        <button type="button" onClick={() => shiftDate(1)} aria-label={t("Next day")}>›</button>
      </div>

      <HostLoadNotice message={noticeMessage} onRetry={onRetryLoad} className="manager-portrait-notice" />

      {seatingLeftovers.length > 0 ? (
        <div className="manager-portrait-stale" role="alert" data-testid="portrait-stale-seated">
          <p>{t("Still seated from yesterday — close?")}</p>
          {typeof onQuickStatusUpdate === 'function' ? (
            <button type="button" onClick={closeLeftovers} disabled={isSaving}>
              {t("Close")}
            </button>
          ) : null}
        </div>
      ) : null}

      <section aria-label={t("Bookings")}>
        <h2>{t("Bookings")}</h2>
        {isLoading ? <p className="manager-portrait-empty">{t("Loading reservations…")}</p> : null}
        {!isLoading && visibleReservations.length === 0 ? (
          <div className="manager-portrait-empty">
            <p>{loadFailed
              ? "Couldn't load reservations"
              : searchTerm.trim() || problemsOnly || selectedSeating
                ? 'No bookings match.'
                : 'No bookings for this day.'}</p>
            {loadFailed ? <p>{t("Retry to load the queue. An empty list is not confirmed.")}</p> : null}
            {canManage && !loadFailed && !searchTerm.trim() && !problemsOnly && !selectedSeating ? (
              <div className="manager-portrait-create-actions">
                <button type="button" className="manager-portrait-add" onClick={() => openCreate('walk-in')}>
                  {t("Walk-in")}
                </button>
                <button type="button" className="manager-portrait-add" onClick={() => openCreate('create')}>
                  + Reservation
                </button>
                <GuestsButton onClick={() => setGuestsOpen(true)} />
              </div>
            ) : null}
          </div>
        ) : null}
        <ul className="manager-portrait-reservation-list">
          {visibleReservations.map((reservation) => (
            <li key={reservation.id} className="manager-portrait-reservation-item">
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
              </button>
              {reservation.status ? (() => {
                const statusClassName = `manager-portrait-reservation-status host-reservation-card-status-pill is-compact tone-${getHostStatusMeta(normalizeReservationStatus(reservation.status)).tone}`
                const statusLabel = normalizeReservationStatus(reservation.status) === 'Checked In (Partial)'
                  ? formatPartialSeatLabel(reservation)
                  : getHostListCompactStatusLabel(reservation.status)
                if (!canChangeStatus) {
                  return <span className={statusClassName}>{statusLabel}</span>
                }
                const isOpen = statusPicker?.reservation?.id === reservation.id
                return (
                  <button
                    type="button"
                    className={`${statusClassName} is-interactive`}
                    aria-label={`Status: ${getHostStatusMeta(normalizeReservationStatus(reservation.status)).label}. Change status.`}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    disabled={isSaving}
                    onClick={(event) => {
                      event.stopPropagation()
                      setStatusPicker({
                        reservation,
                        currentStatusId: normalizeReservationStatus(reservation.status),
                        anchorRect: event.currentTarget.getBoundingClientRect(),
                      })
                    }}
                  >
                    {statusLabel}
                    <span className="manager-portrait-reservation-status-caret" aria-hidden="true">▾</span>
                  </button>
                )
              })() : null}
            </li>
          ))}
        </ul>
      </section>

      <HostReservationStatusPicker
        variant="sheet"
        reservation={statusPicker?.reservation}
        currentStatusId={statusPicker?.currentStatusId}
        anchorRect={statusPicker?.anchorRect}
        isOpen={Boolean(statusPicker)}
        isSaving={isSaving}
        onClose={() => setStatusPicker(null)}
        onSelectStatus={handleStatusSelect}
      />

      <MobileReservationQuickCreateSheet
        isOpen={createOpen}
        mode={createMode}
        prefill={createPrefill}
        todayKey={selectedDate}
        isSaving={isSaving}
        seatings={seatings}
        reservations={reservations}
        role={role}
        workspaceId={workspaceId}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        onOpenSeatingHours={onOpenReservationServices}
      />
      <MobileReservationQuickCreateSheet
        isOpen={Boolean(editingReservation)}
        mode="edit"
        reservation={editingReservation}
        todayKey={selectedDate}
        isSaving={isSaving}
        seatings={seatings}
        reservations={reservations}
        role={role}
        workspaceId={workspaceId}
        onClose={() => setEditingReservation(null)}
        onSubmit={handleEdit}
      />
      {guestsOpen ? (
        <GuestDirectory
          workspaceId={workspaceId}
          reservations={reservations}
          role={role}
          initialPhone={guestFocus}
          startWithBlacklist={blacklistOpen}
          onClose={() => setGuestsOpen(false)}
        />
      ) : null}
    </div>
  )
}
