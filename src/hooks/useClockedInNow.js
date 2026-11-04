import { startVisibleInterval } from '../lib/visibleInterval'
import { useEffect, useState } from 'react'
import { countClockedInNow } from '../lib/attendance'
import { attendanceRange, loadAttendanceEntries } from '../services/attendanceService'

const REFRESH_MS = 60000

/**
 * How many people are clocked in right now (forgotten clock-ins excluded).
 * Uses the same entries query as the On shift sheet so both show the same number.
 * Returns null while unknown or when the reader cannot see attendance.
 */
export function useClockedInNow(workspaceId = '', timeZone = '', enabled = true) {
  const [count, setCount] = useState(null)

  useEffect(() => {
    const id = `${workspaceId ?? ''}`.trim()
    if (!enabled || !id) {
      setCount(null)
      return undefined
    }
    let cancelled = false
    const load = () => {
      const range = attendanceRange(new Date(), timeZone)
      loadAttendanceEntries(id, { fromDate: range.fromDate, toDate: range.toDate })
        .then((entries) => { if (!cancelled) setCount(countClockedInNow(entries, new Date())) })
        .catch(() => { if (!cancelled) setCount(null) })
    }
    load()
    const stopInterval = startVisibleInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      stopInterval()
    }
  }, [enabled, timeZone, workspaceId])

  return count
}
