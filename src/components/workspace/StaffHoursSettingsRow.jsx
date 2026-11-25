import { useEffect, useState } from 'react'
import { t } from '../../i18n/i18n'
import { pendingReviewCount, weekBounds } from '../../lib/hoursReview'
import { loadAttendanceEntries } from '../../services/attendanceService'

export function StaffHoursSettingsRow({
  workspaceId = '',
  timeZone = '',
  pendingCount,
  onOpen,
}) {
  const [loadedCount, setLoadedCount] = useState(0)
  const count = Number.isFinite(pendingCount) ? pendingCount : loadedCount

  useEffect(() => {
    if (Number.isFinite(pendingCount)) return undefined
    const id = `${workspaceId ?? ''}`.trim()
    if (!id) return undefined
    let cancelled = false
    const bounds = weekBounds(new Date(), timeZone)
    loadAttendanceEntries(id, bounds)
      .then((entries) => {
        if (!cancelled) setLoadedCount(pendingReviewCount(entries))
      })
      .catch(() => {
        if (!cancelled) setLoadedCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [pendingCount, timeZone, workspaceId])

  return (
    <section className="panel staff-panel workspace-panel" aria-label={t("Staff")}>
      <p className="eyebrow">{t("Staff")}</p>
      <button type="button" className="staff-hours-link" onClick={onOpen}>
        <span className="staff-hours-link-label">{t("Staff hours")}</span>
        {count > 0 ? <span className="hours-review-count">{count}</span> : null}
        <span className="staff-hours-link-chevron" aria-hidden="true">›</span>
      </button>
    </section>
  )
}
