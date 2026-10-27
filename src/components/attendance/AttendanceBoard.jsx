import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LATE_GRACE_MINUTES,
  actualWorkedMinutes,
  attendanceErrorMessage,
  canDecideOwnAttendance,
  classifyUnclockedShift,
  countsForLateToday,
  dateKeyInZone,
  exceptionKindLabel,
  formatClockTime,
  formatHoursMinutes,
  formatSignedHours,
  fromDateTimeLocalValue,
  indexBreaksByEntry,
  isOpenBreak,
  isOpenEntry,
  lateTodayDetail,
  minutesAfterShiftStart,
  shiftStartsBeforeAttendanceLive,
  personKeyForEntry,
  shiftDateKey,
  summarizeHours,
  toDateTimeLocalValue,
} from '../../lib/attendance'
import {
  attendanceRange,
  decideException,
  editEntry,
  loadAttendanceAudit,
  loadAttendanceBreaks,
  loadAttendanceEntries,
  loadAttendanceExceptions,
  loadAttendanceSettings,
  loadAttendanceShifts,
} from '../../services/attendanceService'
import { PersonAvatar } from '../identity/PersonAvatar'

function AttendanceFace({ employeeId = '', memberId = '', name = '' }) {
  return (
    <span className="attendance-person-line">
      <span className="attendance-avatar" aria-hidden="true">
        <PersonAvatar employeeId={employeeId} memberId={memberId} name={name} />
      </span>
      <strong>{name}</strong>
    </span>
  )
}

function personName(employees, employeeId, fallback = 'Team member') {
  const match = (employees ?? []).find((employee) => `${employee?.id ?? ''}` === `${employeeId ?? ''}`)
  const name = `${match?.name ?? match?.full_name ?? match?.fullName ?? ''}`.trim()
  return name || fallback
}

function entryPersonName(entry, employees) {
  if (entry?.employee_id) return personName(employees, entry.employee_id)
  return 'Team member'
}

export function AttendanceBoard({
  workspaceId = '',
  actorMemberId = '',
  isOwner = false,
  timeZone = 'Europe/Nicosia',
  employees = [],
}) {
  const [entries, setEntries] = useState([])
  const [breaks, setBreaks] = useState([])
  const [exceptions, setExceptions] = useState([])
  const [shifts, setShifts] = useState([])
  const [graceMinutes, setGraceMinutes] = useState(DEFAULT_LATE_GRACE_MINUTES)
  const [settingsRow, setSettingsRow] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notes, setNotes] = useState({})
  const [selectedKey, setSelectedKey] = useState('')
  const [fixEntry, setFixEntry] = useState(null)
  const [fixClockIn, setFixClockIn] = useState('')
  const [fixClockOut, setFixClockOut] = useState('')
  const [fixNote, setFixNote] = useState('')
  const [audit, setAudit] = useState([])
  const [now, setNow] = useState(() => new Date())

  const reload = useCallback(async () => {
    if (!`${workspaceId ?? ''}`.trim()) return
    const range = attendanceRange(new Date(), timeZone)
    const [settings, nextEntries, nextExceptions, nextShifts] = await Promise.all([
      loadAttendanceSettings(workspaceId),
      loadAttendanceEntries(workspaceId, { fromDate: range.fromDate, toDate: range.toDate }),
      loadAttendanceExceptions(workspaceId, { status: 'pending' }),
      loadAttendanceShifts(workspaceId, range.fromDate, range.toDate),
    ])
    const nextBreaks = await loadAttendanceBreaks(nextEntries.map((entry) => entry.id))
    setEntries(nextEntries)
    setBreaks(nextBreaks)
    setExceptions(nextExceptions)
    setShifts(nextShifts)
    setSettingsRow(settings ?? null)
    setGraceMinutes(Number.isFinite(Number(settings?.late_grace_minutes))
      ? Number(settings.late_grace_minutes)
      : DEFAULT_LATE_GRACE_MINUTES)
    setLoadError('')
  }, [timeZone, workspaceId])

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

  const breaksByEntry = useMemo(() => indexBreaksByEntry(breaks), [breaks])
  const todayKey = dateKeyInZone(now, timeZone)
  const range = attendanceRange(now, timeZone)

  const workingNow = entries.filter((entry) => isOpenEntry(entry))

  const lateRows = useMemo(() => {
    const rows = []
    for (const entry of entries) {
      if (`${entry.work_date ?? ''}`.slice(0, 10) === todayKey && entry.is_late) {
        rows.push({
          id: `late-${entry.id}`,
          name: entryPersonName(entry, employees),
          employeeId: entry.employee_id,
          memberId: entry.member_id,
          detail: `Late by ${entry.late_minutes ?? 0} min`,
        })
      }
    }
    const seenShift = new Set(entries.map((entry) => `${entry.shift_id ?? ''}`).filter(Boolean))
    for (const shift of shifts) {
      if (!countsForLateToday(shift, todayKey)) continue
      if (shiftStartsBeforeAttendanceLive(shift, {
        settings: settingsRow,
        entries,
        todayKey,
        timeZone,
      })) continue
      if (seenShift.has(`${shift.id}`)) continue
      const covered = entries.some((entry) => (
        `${entry.employee_id ?? ''}` === `${shift.employee_id ?? ''}`
        && `${entry.work_date ?? ''}`.slice(0, 10) === shiftDateKey(shift)
      ))
      if (covered) continue
      const status = classifyUnclockedShift(shift, { now, graceMinutes, timeZone })
      if (status !== 'not-clocked-in' && status !== 'no-show') continue
      rows.push({
        id: `shift-${shift.id}`,
        name: personName(employees, shift.employee_id),
        employeeId: shift.employee_id,
        detail: lateTodayDetail(shift, status, minutesAfterShiftStart(shift, now, timeZone)),
      })
    }
    return rows
  }, [employees, entries, graceMinutes, now, settingsRow, shifts, timeZone, todayKey])

  const people = useMemo(() => {
    const keys = new Map()
    for (const shift of shifts) {
      if (!range.dates.includes(shiftDateKey(shift))) continue
      const key = `${shift.employee_id ?? ''}`
      if (!key) continue
      keys.set(key, { name: personName(employees, key), employeeId: shift.employee_id, memberId: '' })
    }
    for (const entry of entries) {
      if (!range.dates.includes(`${entry.work_date ?? ''}`.slice(0, 10)) && !isOpenEntry(entry)) continue
      const key = personKeyForEntry(entry)
      if (!key || keys.has(key)) continue
      keys.set(key, {
        name: entryPersonName(entry, employees),
        employeeId: entry.employee_id,
        memberId: entry.member_id,
      })
    }
    return [...keys.entries()].map(([id, person]) => ({ id, ...person })).sort((left, right) => left.name.localeCompare(right.name))
  }, [employees, entries, range.dates, shifts])

  const activeKey = selectedKey || people[0]?.id || ''
  const personShifts = shifts.filter((shift) => `${shift.employee_id ?? ''}` === activeKey && range.dates.includes(shiftDateKey(shift)))
  const personEntries = entries.filter((entry) => personKeyForEntry(entry) === activeKey && (
    range.dates.includes(`${entry.work_date ?? ''}`.slice(0, 10)) || isOpenEntry(entry)
  ))
  const hours = summarizeHours({
    shifts: personShifts,
    entries: personEntries.filter((entry) => range.dates.includes(`${entry.work_date ?? ''}`.slice(0, 10))),
    breaksByEntryId: breaksByEntry,
    now,
  })

  async function decide(exception, approve) {
    const note = `${notes[exception.id] ?? ''}`.trim()
    if (!note) {
      setNotice('Add a note before you approve or reject.')
      return
    }
    if (!canDecideOwnAttendance({ isOwner, actorMemberId, targetMemberId: exception.member_id })) {
      setNotice('You cannot approve your own request. The owner can.')
      return
    }
    setBusyId(exception.id)
    setNotice('')
    try {
      await decideException({ exceptionId: exception.id, approve, note })
      setNotice(approve ? 'Request approved.' : 'Request rejected.')
      await reload()
    } catch (error) {
      setNotice(attendanceErrorMessage(error))
    } finally {
      setBusyId('')
    }
  }

  function openFix(entry) {
    if (!canDecideOwnAttendance({ isOwner, actorMemberId, targetMemberId: entry.member_id })) {
      setNotice('You cannot change your own time. The owner can.')
      return
    }
    setFixEntry(entry)
    setFixClockIn(toDateTimeLocalValue(entry.clock_in_at, timeZone))
    setFixClockOut(toDateTimeLocalValue(entry.clock_out_at, timeZone))
    setFixNote('')
    setAudit([])
    loadAttendanceAudit(entry.id).then(setAudit).catch(() => setAudit([]))
  }

  async function saveFix(event) {
    event.preventDefault()
    const note = fixNote.trim()
    if (!note) {
      setNotice('Add a note so the change is recorded.')
      return
    }
    setBusyId(fixEntry.id)
    try {
      await editEntry({
        entryId: fixEntry.id,
        clockInAt: fromDateTimeLocalValue(fixClockIn, timeZone),
        clockOutAt: fixClockOut ? fromDateTimeLocalValue(fixClockOut, timeZone) : null,
        note,
      })
      setNotice('Time updated.')
      setFixEntry(null)
      await reload()
    } catch (error) {
      setNotice(attendanceErrorMessage(error))
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="attendance-board" aria-label="Time clock">
      {loadError ? <p className="attendance-clock-banner is-alert" role="alert">{loadError}</p> : null}
      {notice ? <p className="attendance-clock-message" role="status">{notice}</p> : null}

      <div className="attendance-board-grid">
        <article className="attendance-panel" aria-label="Working now">
          <h3>▶ Working now</h3>
          {workingNow.length === 0 ? <p className="attendance-empty">Nobody is clocked in.</p> : null}
          <ul className="attendance-list">
            {workingNow.map((entry) => {
              const onBreak = (breaksByEntry[entry.id] ?? []).some((item) => isOpenBreak(item))
              return (
                <li key={entry.id}>
                  <AttendanceFace
                    employeeId={entry.employee_id}
                    memberId={entry.member_id}
                    name={entryPersonName(entry, employees)}
                  />
                  <span>Since {formatClockTime(entry.clock_in_at, timeZone)}</span>
                  {onBreak ? <span className="attendance-pill">☕ On break</span> : null}
                  <span>{formatHoursMinutes(actualWorkedMinutes(entry, breaksByEntry[entry.id] ?? [], now))}</span>
                </li>
              )
            })}
          </ul>
        </article>

        <article className="attendance-panel" aria-label="Late today">
          <h3>⏱ Late today</h3>
          {lateRows.length === 0 ? <p className="attendance-empty">No late arrivals or no-shows.</p> : null}
          <ul className="attendance-list">
            {lateRows.map((row) => (
              <li key={row.id}>
                <AttendanceFace employeeId={row.employeeId} memberId={row.memberId} name={row.name} />
                <span>{row.detail}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="attendance-panel" aria-label="Requests">
          <h3>✉ Requests</h3>
          {exceptions.length === 0 ? <p className="attendance-empty">No requests waiting.</p> : null}
          <ul className="attendance-list">
            {exceptions.map((exception) => {
              const allowed = canDecideOwnAttendance({
                isOwner,
                actorMemberId,
                targetMemberId: exception.member_id,
              })
              return (
                <li key={exception.id}>
                  <AttendanceFace
                    employeeId={exception.employee_id}
                    memberId={exception.member_id}
                    name={entryPersonName(exception, employees)}
                  />
                  <span>{exceptionKindLabel(exception.kind)}</span>
                  {exception.distance_m != null ? <span>About {exception.distance_m} m away</span> : null}
                  {exception.reason ? <span>{exception.reason}</span> : null}
                  {allowed ? (
                    <>
                      <label className="attendance-field">
                        Note
                        <textarea
                          value={notes[exception.id] ?? ''}
                          onChange={(event) => setNotes((current) => ({ ...current, [exception.id]: event.target.value }))}
                          rows={2}
                        />
                      </label>
                      <div className="attendance-row-actions">
                        <button type="button" className="attendance-choice" onClick={() => decide(exception, true)} disabled={busyId === exception.id}>
                          ✓ Approve
                        </button>
                        <button type="button" className="attendance-choice" onClick={() => decide(exception, false)} disabled={busyId === exception.id}>
                          ✕ Reject
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="attendance-empty">Your own request. The owner can decide it.</p>
                  )}
                </li>
              )
            })}
          </ul>
        </article>
      </div>

      <article className="attendance-panel attendance-timesheet" aria-label="Weekly timesheet">
        <h3>◷ Hours this week</h3>
        {people.length === 0 ? <p className="attendance-empty">No shifts or clock times this week.</p> : null}
        <div className="attendance-person-row" role="tablist" aria-label="People">
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              role="tab"
              aria-selected={person.id === activeKey}
              className={`attendance-choice${person.id === activeKey ? ' is-selected' : ''}`}
              onClick={() => setSelectedKey(person.id)}
            >
              <span className="attendance-avatar attendance-avatar-small" aria-hidden="true">
                <PersonAvatar employeeId={person.employeeId || person.id} memberId={person.memberId} name={person.name} />
              </span>
              {person.name}
            </button>
          ))}
        </div>
        {activeKey ? (
          <>
            <dl className="attendance-hours-inline">
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
            <ul className="attendance-list">
              {personEntries.map((entry) => (
                <li key={entry.id}>
                  <strong>{formatClockTime(entry.clock_in_at, timeZone)}–{entry.clock_out_at ? formatClockTime(entry.clock_out_at, timeZone) : 'now'}</strong>
                  <span>{formatHoursMinutes(actualWorkedMinutes(entry, breaksByEntry[entry.id] ?? [], now))}</span>
                  <button type="button" className="attendance-text-btn" onClick={() => openFix(entry)}>
                    ✎ Fix time
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </article>

      {fixEntry ? (
        <div className="attendance-consent" role="dialog" aria-modal="true" aria-labelledby="attendance-fix-title">
          <form className="attendance-consent-card" onSubmit={saveFix}>
            <h3 id="attendance-fix-title">✎ Fix time</h3>
            <label className="attendance-field">
              Clock in
              <input type="datetime-local" value={fixClockIn} onChange={(event) => setFixClockIn(event.target.value)} required />
            </label>
            <label className="attendance-field">
              Clock out
              <input type="datetime-local" value={fixClockOut} onChange={(event) => setFixClockOut(event.target.value)} />
            </label>
            <label className="attendance-field">
              Note
              <textarea value={fixNote} onChange={(event) => setFixNote(event.target.value)} rows={3} required />
            </label>
            {audit.length > 0 ? (
              <ul className="attendance-audit" aria-label="Change history">
                {audit.map((row) => (
                  <li key={row.id}>
                    <span>{row.field}</span>
                    <span>{row.old_value || '—'} → {row.new_value || '—'}</span>
                    <span>{row.note}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="attendance-empty">No changes recorded yet.</p>}
            <div className="attendance-consent-actions">
              <button type="submit" className="attendance-action attendance-action-in" disabled={busyId === fixEntry.id}>
                Save
              </button>
              <button type="button" className="attendance-action attendance-action-break" onClick={() => setFixEntry(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
