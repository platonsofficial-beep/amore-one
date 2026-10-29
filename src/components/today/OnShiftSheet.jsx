import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_LATE_GRACE_MINUTES, attendanceErrorMessage, formatHoursMinutes } from '../../lib/attendance'
import { buildOnShiftBoard, groupOnShiftRows } from '../../lib/onShiftNowRows'
import {
  attendanceRange,
  loadAttendanceBreaks,
  loadAttendanceEntries,
  loadAttendanceSettings,
} from '../../services/attendanceService'
import { PersonAvatar } from '../identity/PersonAvatar'
import './onShiftSheet.css'

const SORT_OPTIONS = [
  { id: 'shift', label: 'Βάρδια' },
  { id: 'department', label: 'Τμήμα' },
  { id: 'name', label: 'Όνομα' },
]

function ArrivalBadge({ row }) {
  if (row.status === 'late') {
    return <span className="on-shift-badge is-late">Καθυστέρηση {formatHoursMinutes(row.lateMinutes)}</span>
  }
  if (row.status === 'upcoming') {
    return row.startsInMinutes > 0
      ? <span className="on-shift-badge is-soft">Σε {formatHoursMinutes(row.startsInMinutes)}</span>
      : null
  }
  if (row.arrival?.kind === 'late') {
    return <span className="on-shift-badge is-late">Αργά {formatHoursMinutes(row.arrival.minutes)}</span>
  }
  if (row.arrival?.kind === 'early') {
    return <span className="on-shift-badge is-early">Νωρίς {formatHoursMinutes(row.arrival.minutes)}</span>
  }
  return null
}

function PersonRow({ row, tone, onOpen }) {
  const isIn = row.status === 'in'
  return (
    <li>
      <button type="button" className={`on-shift-person tone-${tone}`} onClick={() => onOpen(row)}>
        <span className="on-shift-avatar" aria-hidden="true">
          <PersonAvatar employeeId={row.employeeId} memberId={row.memberId} name={row.fullName} />
          {isIn ? <span className={`on-shift-dot${row.onBreak ? ' is-break' : ''}`} /> : null}
        </span>
        <span className="on-shift-person-copy">
          <strong>{row.name}</strong>
          <span className="on-shift-person-meta">
            {isIn
              ? <>Μέσα {row.clockInLabel} · <b>{row.workedLabel}</b></>
              : <>Βάρδια {row.scheduledLabel}</>}
          </span>
        </span>
        <span className="on-shift-person-badges">
          {row.onBreak ? <span className="on-shift-badge is-break">☕ Διάλειμμα</span> : null}
          <ArrivalBadge row={row} />
        </span>
        <span className="on-shift-chevron" aria-hidden="true">›</span>
      </button>
    </li>
  )
}

function DetailSheet({ row, onClose }) {
  const isIn = row.status === 'in'
  const items = [
    ['Τμήμα', row.department || '—'],
    ['Πόστο', row.position || '—'],
    ['Βάρδια σήμερα', row.scheduledLabel],
    ['Είσοδος', isIn ? row.clockInLabel : 'Δεν έχει χτυπήσει κάρτα'],
    ['Δουλεύει', isIn ? row.workedLabel : '—'],
    ['Διαλείμματα', isIn ? (row.breakCount ? `${row.breakCount} · ${row.breakLabel}` : 'Κανένα') : '—'],
  ]
  return (
    <div
      className="on-shift-detail-backdrop"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        className="on-shift-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="on-shift-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="on-shift-detail-head">
          <span className="on-shift-avatar is-large" aria-hidden="true">
            <PersonAvatar employeeId={row.employeeId} memberId={row.memberId} name={row.fullName} />
          </span>
          <div>
            <h3 id="on-shift-detail-title">{row.fullName}</h3>
            <p className="on-shift-detail-status">
              {isIn ? (row.onBreak ? '☕ Σε διάλειμμα' : '● Μέσα τώρα') : row.status === 'late' ? 'Δεν ήρθε ακόμα · καθυστέρηση' : 'Δεν ήρθε ακόμα'}
            </p>
          </div>
          <button type="button" className="on-shift-close" onClick={onClose} aria-label="Κλείσιμο">✕</button>
        </header>
        <dl className="on-shift-detail-grid">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="on-shift-detail-badges"><ArrivalBadge row={row} /></div>
      </div>
    </div>
  )
}

export function OnShiftSheet({
  workspaceId = '',
  employees = [],
  todayShifts = [],
  timeZone = '',
  dateLabel = '',
  onClose,
}) {
  const [entries, setEntries] = useState([])
  const [breaks, setBreaks] = useState([])
  const [graceMinutes, setGraceMinutes] = useState(DEFAULT_LATE_GRACE_MINUTES)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [chosenFilter, setFilter] = useState('')
  const [sort, setSort] = useState('shift')
  const [selected, setSelected] = useState(null)
  const [now, setNow] = useState(() => new Date())

  const reload = useCallback(async () => {
    if (!`${workspaceId ?? ''}`.trim()) return
    const range = attendanceRange(new Date(), timeZone)
    const [settings, nextEntries] = await Promise.all([
      loadAttendanceSettings(workspaceId).catch(() => null),
      loadAttendanceEntries(workspaceId, { fromDate: range.fromDate, toDate: range.toDate }),
    ])
    const nextBreaks = await loadAttendanceBreaks(nextEntries.filter((entry) => !entry.clock_out_at).map((entry) => entry.id))
    setEntries(nextEntries)
    setBreaks(nextBreaks)
    if (Number.isFinite(Number(settings?.late_grace_minutes))) setGraceMinutes(Number(settings.late_grace_minutes))
    setNow(new Date())
    setState('ready')
    setError('')
  }, [timeZone, workspaceId])

  useEffect(() => {
    let cancelled = false
    reload().catch((loadError) => {
      if (cancelled) return
      setError(attendanceErrorMessage(loadError))
      setState('error')
    })
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [reload])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (selected) setSelected(null)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selected])

  const board = useMemo(() => buildOnShiftBoard({
    entries, breaks, employees, todayShifts, now, timeZone, graceMinutes,
  }), [entries, breaks, employees, todayShifts, now, timeZone, graceMinutes])

  // Default: who is in, or the not-in list when nobody has clocked in.
  const filter = chosenFilter || (state === 'ready' && board.counts.inNow === 0 ? 'not-in' : 'in')
  const rows = useMemo(() => {
    if (filter === 'break') return board.inNow.filter((row) => row.onBreak)
    if (filter === 'not-in') return board.notIn
    return board.inNow
  }, [board, filter])
  const groups = useMemo(() => {
    const list = groupOnShiftRows(rows, sort)
    if (filter !== 'not-in') return list
    // Late people first, inside each group and across groups.
    const lateFirst = (a, b) => Number(b.status === 'late') - Number(a.status === 'late')
    list.forEach((group) => group.rows.sort(lateFirst))
    return list.sort((a, b) => lateFirst(a.rows[0], b.rows[0]))
  }, [rows, sort, filter])
  const emptyText = {
    in: 'Κανείς δεν έχει χτυπήσει κάρτα τώρα.',
    break: 'Κανείς δεν είναι σε διάλειμμα τώρα.',
    'not-in': 'Όλοι όσοι έχουν βάρδια σήμερα έχουν έρθει.',
  }[filter]

  const sheet = (
    <div className="on-shift-backdrop" onClick={onClose}>
      <section
        className="on-shift-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="on-shift-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="on-shift-handle" aria-hidden="true" />
        <header className="on-shift-head">
          <div>
            {dateLabel ? <p className="on-shift-eyebrow">{dateLabel}</p> : null}
            <h2 id="on-shift-title">Σε βάρδια</h2>
          </div>
          <button type="button" className="on-shift-close" onClick={onClose} aria-label="Κλείσιμο">✕</button>
        </header>

        <div className="on-shift-summary" role="tablist" aria-label="Φίλτρο">
          {[
            { id: 'in', tone: 'is-in', value: board.counts.inNow, label: 'Μέσα τώρα' },
            { id: 'break', tone: 'is-break', value: board.counts.onBreak, label: 'Διάλειμμα' },
            {
              id: 'not-in',
              tone: board.counts.late ? 'is-late' : '',
              value: board.counts.notIn,
              label: board.counts.late ? `Δεν ήρθαν · ${board.counts.late} αργούν` : 'Δεν ήρθαν',
            },
          ].map((card) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              aria-selected={filter === card.id}
              className={`${card.tone}${filter === card.id ? ' is-active' : ''}`}
              onClick={() => setFilter(card.id)}
            >
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </button>
          ))}
        </div>

        <div className="on-shift-sort" role="radiogroup" aria-label="Ταξινόμηση">
          <span>Ταξινόμηση</span>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={sort === option.id}
              className={sort === option.id ? 'is-active' : ''}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="on-shift-body">
          {state === 'loading' ? <p className="on-shift-empty">Φόρτωση…</p> : null}
          {state === 'error' ? <p className="on-shift-empty is-alert" role="alert">{error}</p> : null}
          {state === 'ready' && groups.length === 0 ? (
            <p className="on-shift-empty">
              {emptyText}
            </p>
          ) : null}
          {state === 'ready' ? groups.map((group) => (
            <section key={group.key} className={`on-shift-group tone-${group.tone}`}>
              <header>
                <span className="on-shift-group-dot" aria-hidden="true" />
                <h3>{group.title}</h3>
                {group.subtitle ? <span className="on-shift-group-time">{group.subtitle}</span> : null}
                <span className="on-shift-group-count">{group.rows.length}</span>
              </header>
              <ul>
                {group.rows.map((row) => (
                  <PersonRow key={row.id} row={row} tone={group.tone} onOpen={setSelected} />
                ))}
              </ul>
            </section>
          )) : null}
        </div>
      </section>
      {selected ? <DetailSheet row={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
}
