import { useCallback, useEffect, useState } from 'react'
import { readPersistedMobileWeekStart } from '../../lib/mobileNavigationPersistence'
import { getCurrentWeekStartDate, getWeekDays } from '../../lib/weekUtils'
import { resolveEmployeeWorkspaceId } from '../../services/availabilityService'
import { MobileAvailabilityView } from './MobileAvailabilityView'

function formatAvailabilityWeekLabel(weekStartDate = '') {
  const normalized = `${weekStartDate ?? ''}`.trim()
  if (!normalized) return ''

  const days = getWeekDays(normalized)
  if (days.length === 0) return ''

  const startLabel = days[0]?.shortDate ?? ''
  const endLabel = days[days.length - 1]?.shortDate ?? ''
  if (!startLabel || !endLabel) return normalized
  if (startLabel === endLabel) return startLabel
  return `${startLabel} – ${endLabel}`
}

export function StaffWeekScreen({
  employeeId = '',
  needsEmployeeLink = false,
  onDirtyChange,
}) {
  const [availabilityContext, setAvailabilityContext] = useState({
    workspaceId: '',
    weekStartDate: '',
    weekLabel: '',
  })
  const [availabilityContextError, setAvailabilityContextError] = useState('')
  const [isAvailabilityContextLoading, setIsAvailabilityContextLoading] = useState(false)
  const resolvedEmployeeId = `${employeeId ?? ''}`.trim()

  const loadAvailabilityContext = useCallback(async () => {
    if (!resolvedEmployeeId || needsEmployeeLink) {
      setAvailabilityContext({ workspaceId: '', weekStartDate: '', weekLabel: '' })
      setAvailabilityContextError('')
      setIsAvailabilityContextLoading(false)
      return
    }

    const weekStartDate = readPersistedMobileWeekStart(getCurrentWeekStartDate())
    setIsAvailabilityContextLoading(true)

    try {
      const workspaceId = await resolveEmployeeWorkspaceId(resolvedEmployeeId)
      setAvailabilityContext({
        workspaceId,
        weekStartDate,
        weekLabel: formatAvailabilityWeekLabel(weekStartDate),
      })
      setAvailabilityContextError('')
    } catch (error) {
      setAvailabilityContext({
        workspaceId: '',
        weekStartDate,
        weekLabel: formatAvailabilityWeekLabel(weekStartDate),
      })
      setAvailabilityContextError(error?.message || 'Unable to load availability context right now.')
    } finally {
      setIsAvailabilityContextLoading(false)
    }
  }, [needsEmployeeLink, resolvedEmployeeId])

  useEffect(() => {
    loadAvailabilityContext()
  }, [loadAvailabilityContext])

  return (
    <MobileAvailabilityView
      workspaceId={availabilityContext.workspaceId}
      employeeId={resolvedEmployeeId}
      weekStartDate={availabilityContext.weekStartDate}
      weekLabel={availabilityContext.weekLabel}
      needsEmployeeLink={needsEmployeeLink}
      isContextLoading={isAvailabilityContextLoading}
      contextError={availabilityContextError}
      onRetryContext={loadAvailabilityContext}
      onDirtyChange={onDirtyChange}
    />
  )
}
