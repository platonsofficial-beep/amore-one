import { useEffect, useMemo, useState } from 'react'
import {
  actualWorkedMinutes,
  attendanceErrorMessage,
  canDecideOwnAttendance,
  entryReviewStatus,
  formatClockTime,
  formatHoursMinutes,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../lib/attendance'
import {
  approvedHoursCsv,
  filterReviewEntries,
  groupReviewDays,
  isUnscheduledEntry,
  monthKey,
  monthPersonRows,
  reviewRangeBounds,
  scheduledEntryIds,
} from '../../lib/hoursReview'
import {
  editEntry,
  loadAttendanceBreaks,
  loadAttendanceEntries,
  reviewBulkApprove,
  reviewEntry,
  reviewReopen,
} from '../../services/attendanceService'
import { t, uiLocale } from '../../i18n/i18n'

function personLabel(entry, employees) {
  const memberName = `${entry?.member?.display_name ?? entry?.personName ?? ''}`.trim()
  const match = (employees ?? []).find((employee) => `${employee?.id ?? ''}` === `${entry?.employee_id ?? ''}`)
  const employeeName = `${match?.name ?? match?.full_name ?? match?.fullName ?? ''}`.trim()
  return employeeName || memberName || t("Team member")
}

const STATUSES = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
  ['all', 'All'],
]

const RANGES = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['custom', 'Custom'],
]

function formatDay(date) {
  const [year, month, day] = `${date}`.split('-').map(Number)
  if (!year) return date
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(uiLocale('en-GB'), {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

function formatWhen(value, timeZone) {
  if (!value) return ''
  return new Date(value).toLocaleString(uiLocale('en-GB'), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timeZone || 'UTC',
  })
}

function statusLabel(status) {
  if (status === 'approved') return t("Approved")
  if (status === 'declined') return t("Declined")
  return t("Waiting")
}

export function HoursReview({
  workspaceId = '',
  actorMemberId = '',
  isOwner = false,
  timeZone = 'Europe/Nicosia',
  employees = [],
  fixture = null,
  onPendingCount,
  now = new Date(),
}) {
  const [entries, setEntries] = useState(fixture?.entries ?? [])
  const [breaks, setBreaks] = useState(fixture?.breaks ?? [])
  const [status, setStatus] = useState('pending')
  const [range, setRange] = useState(fixture?.range ?? 'today')
  const [month, setMonth] = useState(fixture?.month ?? monthKey(new Date(), timeZone))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [declineEntry, setDeclineEntry] = useState(fixture?.openDecline ? (fixture.entries?.[0] ?? null) : null)
  const [declineNote, setDeclineNote] = useState('')
  const [reopenEntry, setReopenEntry] = useState(null)
  const [reopenNote, setReopenNote] = useState('')
  const [fixEntry, setFixEntry] = useState(null)
  const [fixClockIn, setFixClockIn] = useState('')
  const [fixClockOut, setFixClockOut] = useState('')
  const [fixNote, setFixNote] = useState('')
  const [rangeOpen, setRangeOpen] = useState(false)

  const bounds = reviewRangeBounds({ range, now, timeZone, customFrom, customTo, month })

  useEffect(() => {
    if (fixture) {
      setEntries(fixture.entries ?? [])
      setBreaks(fixture.breaks ?? [])
      return undefined
    }
    if (!`${workspaceId ?? ''}`.trim() || !bounds.fromDate) return undefined
    let cancelled = false
    loadAttendanceEntries(workspaceId, { fromDate: bounds.fromDate, toDate: bounds.toDate })
      .then(async (next) => {
        const nextBreaks = await loadAttendanceBreaks(next.map((entry) => entry.id))
        if (cancelled) return
        setEntries(next)
        setBreaks(nextBreaks)
        setLoadError('')
      })
      .catch((error) => {
        if (!cancelled) setLoadError(attendanceErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [bounds.fromDate, bounds.toDate, fixture, workspaceId])

  const breaksByEntry = useMemo(() => {
    const map = {}
    for (const item of breaks) {
      const id = `${item.entry_id ?? ''}`
      if (!map[id]) map[id] = []
      map[id].push(item)
    }
    return map
  }, [breaks])

  const named = useMemo(() => entries.map((entry) => ({
    ...entry,
    personName: entry.personName || personLabel(entry, employees),
  })), [employees, entries])

  const visible = filterReviewEntries(named, { status, fromDate: bounds.fromDate, toDate: bounds.toDate })
  const days = groupReviewDays(visible)
  const pendingCount = named.filter((entry) => (
    entryReviewStatus(entry) === 'pending' && entryInRange(entry, bounds)
  )).length

  useEffect(() => {
    onPendingCount?.(pendingCount)
  }, [onPendingCount, pendingCount])

  const monthRows = monthPersonRows(named.filter((entry) => entryInRange(entry, bounds)), breaksByEntry)
  const pendingInView = monthRows.some((row) => row.waiting > 0) || named.some((entry) => (
    entryReviewStatus(entry) === 'pending' && entryInRange(entry, bounds)
  ))
  const inBounds = named.filter((entry) => entryInRange(entry, bounds))
  const statusCounts = {
    pending: inBounds.filter((entry) => entryReviewStatus(entry) === 'pending').length,
    approved: inBounds.filter((entry) => entryReviewStatus(entry) === 'approved').length,
    declined: inBounds.filter((entry) => entryReviewStatus(entry) === 'declined').length,
    all: inBounds.length,
  }
  const rangeLabel = RANGES.find(([id]) => id === range)?.[1] || 'Today'

  async function run(id, task) {
    setBusyId(id)
    setNotice('')
    try {
      await task()
      if (!fixture) {
        const next = await loadAttendanceEntries(workspaceId, bounds)
        setEntries(next)
      }
    } catch (error) {
      setNotice(attendanceErrorMessage(error))
    } finally {
      setBusyId('')
    }
  }

  function approve(entry) {
    if (!entry.clock_out_at) return
    if (!canDecideOwnAttendance({ isOwner, actorMemberId, targetMemberId: entry.member_id })) {
      setNotice(t("You cannot approve your own hours. The owner can."))
      return
    }
    run(entry.id, () => reviewEntry({ entryId: entry.id, approve: true }))
  }

  function submitDecline(event) {
    event.preventDefault()
    const note = declineNote.trim()
    if (!note || !declineEntry) {
      setNotice(t("Add a note before you decline."))
      return
    }
    const entry = declineEntry
    setDeclineEntry(null)
    setDeclineNote('')
    run(entry.id, () => reviewEntry({ entryId: entry.id, approve: false, note }))
  }

  function submitReopen(event) {
    event.preventDefault()
    const note = reopenNote.trim()
    if (!note || !reopenEntry) {
      setNotice(t("Add a note so the change is recorded."))
      return
    }
    const entry = reopenEntry
    setReopenEntry(null)
    setReopenNote('')
    run(entry.id, () => reviewReopen({ entryId: entry.id, note }))
  }

  function approveScheduled(rows) {
    const ids = scheduledEntryIds(rows, { actorMemberId, isOwner })
    if (!ids.length) {
      setNotice(t("Unscheduled hours need their own approval."))
      return
    }
    run('bulk', () => reviewBulkApprove({ workspaceId, entryIds: ids, includeUnscheduled: false }))
  }

  function openFix(entry) {
    setFixEntry(entry)
    setFixClockIn(toDateTimeLocalValue(entry.clock_in_at, timeZone))
    setFixClockOut(toDateTimeLocalValue(entry.clock_out_at, timeZone))
    setFixNote('')
  }

  async function saveFix(event) {
    event.preventDefault()
    const note = fixNote.trim()
    if (!note || !fixEntry) {
      setNotice(t("Add a note so the change is recorded."))
      return
    }
    const entry = fixEntry
    setFixEntry(null)
    await run(entry.id, () => editEntry({
      entryId: entry.id,
      clockInAt: fromDateTimeLocalValue(fixClockIn, timeZone),
      clockOutAt: fixClockOut ? fromDateTimeLocalValue(fixClockOut, timeZone) : null,
      note,
    }))
  }

  function exportCsv() {
    const csv = approvedHoursCsv(named.filter((entry) => entryInRange(entry, bounds)).map((entry) => ({
      ...entry,
      clockInLabel: formatClockTime(entry.clock_in_at, timeZone),
      clockOutLabel: formatClockTime(entry.clock_out_at, timeZone),
    })), { breaksByEntryId: breaksByEntry })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `approved-hours-${bounds.fromDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="hours-review">
      {loadError ? <p className="attendance-clock-banner is-alert" role="alert">{loadError}</p> : null}
      {notice ? <p className="attendance-clock-message" role="status">{notice}</p> : null}
      {pendingInView ? (
        <p className="attendance-clock-message hours-review-banner" role="status">{t("Some hours are still waiting for approval.")}</p>
      ) : null}

      <div className="hours-review-toolbar">
        <div className="hours-review-status" role="tablist" aria-label={t("Status")}>
          {STATUSES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`attendance-choice${status === id ? ' is-selected' : ''}`}
              aria-selected={status === id}
              onClick={function pickStatus() { setStatus(id) }}
            >
              <span>{t(label)}</span>
              <span className="hours-review-count">{statusCounts[id]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="attendance-choice hours-review-range"
          aria-haspopup="dialog"
          aria-expanded={rangeOpen}
          onClick={function openRange() { setRangeOpen(true) }}
        >
          {t(rangeLabel)}
        </button>
      </div>
      {range === 'month' ? (
        <label className="attendance-field">
          {t("Month")}
          <input type="month" value={month} onChange={function changeMonth(event) { setMonth(event.target.value) }} />
        </label>
      ) : null}
      {rangeOpen ? (
        <div className="attendance-consent" role="presentation">
          <div className="attendance-consent-card" role="dialog" aria-modal="true" aria-label={t("Dates")}>
            <h3>{t("Dates")}</h3>
            <div className="hours-review-range-options">
              {RANGES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`attendance-choice${range === id ? ' is-selected' : ''}`}
                  aria-pressed={range === id}
                  onClick={function pickRange() {
                    setRange(id)
                    if (id !== 'custom') setRangeOpen(false)
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {range === 'custom' ? (
              <div className="hours-review-dates">
                <label className="attendance-field">
                  {t("From")}
                  <input type="date" value={customFrom} onChange={function changeFrom(event) { setCustomFrom(event.target.value) }} />
                </label>
                <label className="attendance-field">
                  {t("To")}
                  <input type="date" value={customTo} onChange={function changeTo(event) { setCustomTo(event.target.value) }} />
                </label>
              </div>
            ) : null}
            <button type="button" className="attendance-action attendance-action-break" onClick={function closeRange() { setRangeOpen(false) }}>
              {t("Close")}
            </button>
          </div>
        </div>
      ) : null}

      {range === 'month' ? (
        <article className="attendance-panel" aria-label={t("Month")}>
          <div className="hours-review-day-head">
            <h3>{t("Approved hours")}</h3>
            <button type="button" className="attendance-choice" onClick={exportCsv}>{t("Export approved hours")}</button>
          </div>
          <div className="hours-review-table-wrap">
            <table className="hours-review-table">
              <thead>
                <tr>
                  <th>{t("Name")}</th>
                  <th>{t("Approved")}</th>
                  <th>{t("Waiting")}</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t("Name")}>{row.name}</td>
                    <td data-label={t("Approved")}>{formatHoursMinutes(row.approved)}</td>
                    <td data-label={t("Waiting")}>{row.waiting > 0 ? t("+{{hours}} waiting", { hours: formatHoursMinutes(row.waiting) }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {monthRows.length === 0 ? <p className="attendance-empty">{t("No approved or waiting hours in this month.")}</p> : null}
        </article>
      ) : days.map((day) => (
        <article key={day.date} className="attendance-panel" aria-label={formatDay(day.date)}>
          <div className="hours-review-day-head">
            <h3>
              {formatDay(day.date)}
              {day.pending > 0 ? <span className="attendance-pill">{day.pending} {t("pending")}</span> : null}
            </h3>
            <button type="button" className="attendance-choice" onClick={function approveDay() { approveScheduled(day.rows) }} disabled={busyId === 'bulk'}>
              {t("Approve all scheduled")}
            </button>
          </div>
          <ul className="attendance-list">
            {day.rows.map((entry) => {
              const review = entryReviewStatus(entry)
              const minutes = entry.clock_out_at
                ? actualWorkedMinutes(entry, breaksByEntry[entry.id] ?? [])
                : 0
              const missingOut = !entry.clock_out_at
              const decided = entry.reviewed_at
                ? t("{{status}} {{when}}", {
                  status: entry.reviewerName || t("Manager"),
                  when: formatWhen(entry.reviewed_at, timeZone),
                })
                : ''
              return (
                <li key={entry.id} className="hours-review-row">
                  <strong>{entry.personName}</strong>
                  <span>
                    {entry.scheduledLabel || t("No scheduled shift")}
                    {' · '}
                    {formatClockTime(entry.clock_in_at, timeZone)}–{entry.clock_out_at ? formatClockTime(entry.clock_out_at, timeZone) : t("now")}
                  </span>
                  {entry.is_late ? <span>{t("Late by {{count}} min", { count: entry.late_minutes ?? 0 })}</span> : null}
                  <span>{t("Worked {{hours}}", { hours: formatHoursMinutes(minutes) })}</span>
                  {isUnscheduledEntry(entry) ? <span className="attendance-pill is-gold">{t("Unscheduled")}</span> : null}
                  {missingOut ? <span className="attendance-clock-banner is-alert">{t("Missing clock-out")}</span> : null}
                  <span className={`attendance-pill is-${review}`}>{statusLabel(review)}</span>
                  {decided ? <span>{decided}</span> : null}
                  <div className="hours-review-actions">
                    {review === 'pending' ? (
                      <button type="button" className="attendance-choice" onClick={function doApprove() { approve(entry) }} disabled={busyId === entry.id || missingOut}>
                        {t("Approve")}
                      </button>
                    ) : null}
                    {review === 'pending' ? (
                      <button type="button" className="attendance-choice" onClick={function openDecline() { setDeclineEntry(entry); setDeclineNote('') }} disabled={busyId === entry.id || missingOut}>
                        {t("Decline")}
                      </button>
                    ) : null}
                    <button type="button" className="attendance-choice" onClick={function doFix() { openFix(entry) }}>
                      {t("Fix time")}
                    </button>
                    {review !== 'pending' ? (
                      <button type="button" className="attendance-choice" onClick={function openReopen() { setReopenEntry(entry); setReopenNote('') }}>
                        {t("Reopen")}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </article>
      ))}
      {range !== 'month' && days.length === 0 ? <p className="attendance-empty">{t("Nothing to review in this range.")}</p> : null}

      {declineEntry ? (
        <div className="attendance-consent" role="presentation">
          <form className="attendance-consent-card" onSubmit={submitDecline}>
            <h3>{t("Decline hours")}</h3>
            <p>{declineEntry.personName}</p>
            <label className="attendance-field">
              {t("Note")}
              <textarea value={declineNote} onChange={function editNote(event) { setDeclineNote(event.target.value) }} rows={3} required />
            </label>
            <div className="attendance-consent-actions">
              <button type="submit" className="attendance-action attendance-action-in">{t("Decline")}</button>
              <button type="button" className="attendance-action attendance-action-break" onClick={function closeDecline() { setDeclineEntry(null) }}>{t("Cancel")}</button>
            </div>
          </form>
        </div>
      ) : null}
      {reopenEntry ? (
        <div className="attendance-consent" role="presentation">
          <form className="attendance-consent-card" onSubmit={submitReopen}>
            <h3>{t("Reopen hours")}</h3>
            <label className="attendance-field">
              {t("Note")}
              <textarea value={reopenNote} onChange={function editReopen(event) { setReopenNote(event.target.value) }} rows={3} required />
            </label>
            <div className="attendance-consent-actions">
              <button type="submit" className="attendance-action attendance-action-in">{t("Reopen")}</button>
              <button type="button" className="attendance-action attendance-action-break" onClick={function closeReopen() { setReopenEntry(null) }}>{t("Cancel")}</button>
            </div>
          </form>
        </div>
      ) : null}
      {fixEntry ? (
        <div className="attendance-consent" role="presentation">
          <form className="attendance-consent-card" onSubmit={saveFix}>
            <h3>{t("Fix time")}</h3>
            <label className="attendance-field">
              {t("Clock in")}
              <input type="datetime-local" value={fixClockIn} onChange={function editIn(event) { setFixClockIn(event.target.value) }} required />
            </label>
            <label className="attendance-field">
              {t("Clock out")}
              <input type="datetime-local" value={fixClockOut} onChange={function editOut(event) { setFixClockOut(event.target.value) }} />
            </label>
            <label className="attendance-field">
              {t("Note")}
              <textarea value={fixNote} onChange={function editFixNote(event) { setFixNote(event.target.value) }} rows={3} required />
            </label>
            <div className="attendance-consent-actions">
              <button type="submit" className="attendance-action attendance-action-in">{t("Save")}</button>
              <button type="button" className="attendance-action attendance-action-break" onClick={function closeFix() { setFixEntry(null) }}>{t("Cancel")}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function entryInRange(entry, bounds) {
  const key = `${entry?.work_date ?? ''}`.slice(0, 10)
  return key >= bounds.fromDate && key <= bounds.toDate
}
