import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LOCATION_CONSENT_TEXT,
  NO_VENUE_LOCATION_MESSAGE,
  OFFLINE_MESSAGE,
  POOR_ACCURACY_MESSAGE,
  actualWorkedMinutes,
  attendanceErrorMessage,
  clockInMessage,
  clockOutMessage,
  dateKeyInZone,
  describeTodayShift,
  failureMessage,
  formatHoursMinutes,
  formatSignedHours,
  formatWorkingLabel,
  fromDateTimeLocalValue,
  hasLocationConsent,
  indexBreaksByEntry,
  isOffline,
  isOpenBreak,
  isOpenEntry,
  needsManagerRequest,
  saveLocationConsent,
  summarizeHours,
  toDateTimeLocalValue,
  venueLocationIsSet,
} from '../../lib/attendance'
import { readCurrentPosition } from '../../lib/attendanceLocation'
import {
  attendanceRange,
  clockIn,
  clockOut,
  endBreak,
  loadAttendanceBreaks,
  loadAttendanceEntries,
  loadAttendanceSettings,
  loadAttendanceShifts,
  requestEdit,
  startBreak,
} from '../../services/attendanceService'
import { PersonAvatar } from '../identity/PersonAvatar'

function emptySnapshot() {
  return {
    settings: null,
    entries: [],
    breaks: [],
    shifts: [],
  }
}

export function AttendanceClockScreen({
  workspaceId = '',
  memberId = '',
  employeeId = '',
  employeeName = '',
  timeZone = 'Europe/Nicosia',
}) {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [pendingAction, setPendingAction] = useState('')
  const [request, setRequest] = useState(null)
  const [note, setNote] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [showEdit, setShowEdit] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [editClockIn, setEditClockIn] = useState('')
  const [editClockOut, setEditClockOut] = useState('')

  const reload = useCallback(async () => {
    if (!`${workspaceId ?? ''}`.trim()) return
    const range = attendanceRange(new Date(), timeZone)
    const [settings, entries, shifts] = await Promise.all([
      loadAttendanceSettings(workspaceId),
      loadAttendanceEntries(workspaceId, {
        fromDate: range.fromDate,
        toDate: range.toDate,
        memberId,
      }),
      employeeId
        ? loadAttendanceShifts(workspaceId, range.fromDate, range.toDate)
        : Promise.resolve([]),
    ])
    const breaks = await loadAttendanceBreaks(entries.map((entry) => entry.id))
    setSnapshot({ settings, entries, breaks, shifts })
    setSettingsLoaded(true)
    setLoadError('')
  }, [employeeId, memberId, timeZone, workspaceId])

  useEffect(() => {
    let cancelled = false
    reload().catch((error) => {
      if (!cancelled) setLoadError(attendanceErrorMessage(error))
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const breaksByEntry = useMemo(() => indexBreaksByEntry(snapshot.breaks), [snapshot.breaks])
  const openEntry = snapshot.entries.find((entry) => isOpenEntry(entry)) ?? null
  const openBreak = openEntry
    ? (breaksByEntry[openEntry.id] ?? []).find((item) => isOpenBreak(item)) ?? null
    : null
  const todayKey = dateKeyInZone(now, timeZone)
  const shiftSummary = describeTodayShift(snapshot.shifts, {
    employeeId,
    todayKey,
    now,
    timeZone,
  })
  const range = attendanceRange(now, timeZone)
  const weekEntries = snapshot.entries.filter((entry) => range.dates.includes(`${entry.work_date ?? ''}`.slice(0, 10)))
  const weekShifts = snapshot.shifts.filter((shift) => (
    `${shift.employee_id ?? ''}` === `${employeeId ?? ''}`
    && range.dates.includes(`${shift.shift_date ?? ''}`.slice(0, 10))
  ))
  const hours = summarizeHours({
    shifts: weekShifts,
    entries: weekEntries,
    breaksByEntryId: breaksByEntry,
    now,
  })
  const worked = openEntry ? actualWorkedMinutes(openEntry, breaksByEntry[openEntry.id] ?? [], now) : 0
  const venueReady = venueLocationIsSet(snapshot.settings)

  async function locateOrOfferRequest(action) {
    try {
      return await readCurrentPosition()
    } catch (error) {
      setRequest({
        action,
        coords: null,
        message: error?.code === 'no_location' ? failureMessage({ ok: false, reason: 'no_location' }) : POOR_ACCURACY_MESSAGE,
      })
      setNote('')
      return null
    }
  }

  async function runClock(action, coords, requestNote = null) {
    const payload = {
      workspaceId,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      accuracy: coords?.accuracy ?? null,
      note: requestNote,
    }
    const result = action === 'out' ? await clockOut(payload) : await clockIn(payload)
    if (!result?.ok && needsManagerRequest(result)) {
      setRequest({
        action,
        coords,
        message: failureMessage(result),
      })
      setNote('')
      return
    }
    if (!result?.ok) {
      setMessage(failureMessage(result))
      setRequest(null)
      await reload()
      return
    }
    const stamped = { ...result, clockedAt: new Date() }
    setMessage(action === 'out' ? clockOutMessage(stamped) : clockInMessage(stamped, stamped.clockedAt, timeZone))
    setRequest(null)
    setNote('')
    await reload()
  }

  async function performClock(action) {
    if (isOffline()) {
      setMessage(OFFLINE_MESSAGE)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (settingsLoaded && !venueLocationIsSet(snapshot.settings)) {
        await runClock(action, null, null)
        return
      }
      const coords = await locateOrOfferRequest(action)
      if (!coords) return
      await runClock(action, coords, null)
    } catch (error) {
      setMessage(attendanceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function beginClock(action) {
    setPendingAction(action)
    if (settingsLoaded && !venueLocationIsSet(snapshot.settings)) {
      performClock(action)
      return
    }
    if (!hasLocationConsent()) {
      setShowConsent(true)
      return
    }
    performClock(action)
  }

  function agreeToLocation() {
    saveLocationConsent()
    setShowConsent(false)
    const action = pendingAction || 'in'
    performClock(action)
  }

  async function sendRequest() {
    const trimmed = note.trim()
    if (!trimmed) {
      setMessage('Add a short note for your manager.')
      return
    }
    if (isOffline()) {
      setMessage(OFFLINE_MESSAGE)
      return
    }
    setBusy(true)
    try {
      await runClock(request?.action || 'in', request?.coords ?? null, trimmed)
    } catch (error) {
      setMessage(attendanceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function toggleBreak() {
    if (isOffline()) {
      setMessage(OFFLINE_MESSAGE)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const result = openBreak ? await endBreak(workspaceId) : await startBreak(workspaceId)
      if (!result?.ok) {
        setMessage(failureMessage(result))
      } else {
        setMessage(openBreak ? 'Break ended.' : 'Break started.')
      }
      await reload()
    } catch (error) {
      setMessage(attendanceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit(event) {
    event.preventDefault()
    if (!openEntry && snapshot.entries.length === 0) return
    const entry = snapshot.entries[0]
    const reason = editReason.trim()
    if (!reason) {
      setMessage('Add a short note for your manager.')
      return
    }
    setBusy(true)
    try {
      await requestEdit({
        entryId: entry.id,
        clockInAt: fromDateTimeLocalValue(editClockIn, timeZone),
        clockOutAt: editClockOut ? fromDateTimeLocalValue(editClockOut, timeZone) : null,
        reason,
      })
      setShowEdit(false)
      setEditReason('')
      setMessage('Sent to your manager for approval.')
    } catch (error) {
      setMessage(attendanceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const latestEntry = snapshot.entries[0] ?? null

  return (
    <section className="attendance-clock" aria-label="Clock in and out">
      <header className="attendance-clock-header">
        <p className="attendance-clock-kicker">⏱ Clock</p>
        <div className="attendance-clock-identity">
          <span className="attendance-avatar" aria-hidden="true">
            <PersonAvatar employeeId={employeeId} memberId={memberId} name={employeeName} />
          </span>
          <h2 className="attendance-clock-title">{employeeName || 'Your shift'}</h2>
        </div>
        <p className="attendance-clock-shift">{shiftSummary.label}</p>
      </header>

      {openEntry ? (
        <p className="attendance-clock-timer" aria-live="polite">
          {openBreak ? '☕ On break' : formatWorkingLabel(worked)}
        </p>
      ) : null}

      {!venueReady && !loadError ? (
        <p className="attendance-clock-banner" role="status">{NO_VENUE_LOCATION_MESSAGE}</p>
      ) : null}
      {loadError ? <p className="attendance-clock-banner is-alert" role="alert">{loadError}</p> : null}
      {message ? <p className="attendance-clock-message" role="status">{message}</p> : null}

      <div className="attendance-clock-actions">
        {!openEntry ? (
          <button type="button" className="attendance-action attendance-action-in" onClick={() => beginClock('in')} disabled={busy || !settingsLoaded}>
            ▶ Clock in
          </button>
        ) : (
          <>
            <button type="button" className="attendance-action attendance-action-break" onClick={toggleBreak} disabled={busy || !settingsLoaded}>
              {openBreak ? '▶ End break' : '☕ Start break'}
            </button>
            <button type="button" className="attendance-action attendance-action-out" onClick={() => beginClock('out')} disabled={busy || !settingsLoaded}>
              ■ Clock out
            </button>
          </>
        )}
      </div>

      {request ? (
        <form
          className="attendance-request"
          onSubmit={(event) => {
            event.preventDefault()
            sendRequest()
          }}
        >
          <p>{request.message}</p>
          <label className="attendance-field">
            Note for your manager
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="The GPS does not work inside"
            />
          </label>
          <button type="submit" className="attendance-action attendance-action-send" disabled={busy}>
            ✉ Send to manager
          </button>
        </form>
      ) : null}

      <div className="attendance-hours" aria-label="My hours">
        <h3>My hours</h3>
        <p>This week</p>
        <dl>
          <div>
            <dt>Scheduled</dt>
            <dd>{formatHoursMinutes(hours.scheduled)}</dd>
          </div>
          <div>
            <dt>Actual</dt>
            <dd>{formatHoursMinutes(hours.actual)}</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>{formatSignedHours(hours.difference)}</dd>
          </div>
        </dl>
        {latestEntry ? (
          <button
            type="button"
            className="attendance-text-btn"
            onClick={() => {
              setEditClockIn(toDateTimeLocalValue(latestEntry.clock_in_at, timeZone))
              setEditClockOut(toDateTimeLocalValue(latestEntry.clock_out_at, timeZone))
              setShowEdit((open) => !open)
            }}
          >
            ✎ Request a time change
          </button>
        ) : null}
        {showEdit && latestEntry ? (
          <form className="attendance-request" onSubmit={submitEdit}>
            <p>Your manager will approve this note before the time changes.</p>
            <label className="attendance-field">
              Clock in
              <input type="datetime-local" value={editClockIn} onChange={(event) => setEditClockIn(event.target.value)} required />
            </label>
            <label className="attendance-field">
              Clock out
              <input type="datetime-local" value={editClockOut} onChange={(event) => setEditClockOut(event.target.value)} />
            </label>
            <label className="attendance-field">
              Note
              <textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} rows={3} required />
            </label>
            <button type="submit" className="attendance-action attendance-action-send" disabled={busy}>
              ✉ Send to manager
            </button>
          </form>
        ) : null}
      </div>

      {showConsent ? (
        <div className="attendance-consent" role="dialog" aria-modal="true" aria-labelledby="attendance-consent-title">
          <div className="attendance-consent-card">
            <h3 id="attendance-consent-title">📍 Location check</h3>
            <p>{LOCATION_CONSENT_TEXT}</p>
            <div className="attendance-consent-actions">
              <button type="button" className="attendance-action attendance-action-in" onClick={agreeToLocation}>
                ✓ I agree
              </button>
              <button type="button" className="attendance-action attendance-action-break" onClick={() => setShowConsent(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
