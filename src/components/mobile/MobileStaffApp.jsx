import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readPersistedMobileWeekStart } from '../../lib/mobileNavigationPersistence'
import { getCurrentWeekStartDate, getWeekDays } from '../../lib/weekUtils'
import { resolveEmployeeWorkspaceId } from '../../services/availabilityService'
import { MobileAvailabilityView } from './MobileAvailabilityView'
import { MobileBottomNav } from './MobileBottomNav'
import { MobileHomeView } from './MobileHomeView'
import { MobileMenuView } from './MobileMenuView'
import { MobileProfileView } from './MobileProfileView'
import { MobileScheduleView } from './MobileScheduleView'
import { MobileTasksView } from './MobileTasksView'

const STAFF_BOTTOM_TABS = [
  { id: 'home', label: 'Home', icon: '◈' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'availability', label: 'Avail', ariaLabel: 'My Availability', icon: '◔' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Profile', icon: '☺' },
]

const HOST_BOTTOM_TABS = [
  { id: 'home', label: 'Home', icon: '◈' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'reservations', label: 'Bookings', ariaLabel: 'Reservations', icon: '▣' },
  { id: 'menu', label: 'Profile', icon: '☺' },
]

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

export function MobileStaffApp({
  activeTab,
  onTabChange,
  noticeMessage = '',
  onDismissNotice,
  homeProps,
  scheduleProps,
  tasksProps,
  menuProps,
  expandedView = null,
  expandedTitle = '',
  onBackFromExpanded,
  expandedModuleContent = null,
  bottomTabs,
  shellVariant = 'staff',
  hostStationContent = null,
  notificationBell = null,
  clockOpenToken = 0,
}) {
  const isStaffShell = shellVariant === 'staff'
  const isHostShell = shellVariant === 'host'
  const usesInternalTabs = isStaffShell || isHostShell
  const [staffTab, setStaffTab] = useState(activeTab)
  const [clockOpen, setClockOpen] = useState(false)
  const [pendingTab, setPendingTab] = useState(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [availabilityContext, setAvailabilityContext] = useState({
    workspaceId: '',
    weekStartDate: '',
    weekLabel: '',
  })
  const [availabilityContextError, setAvailabilityContextError] = useState('')
  const [isAvailabilityContextLoading, setIsAvailabilityContextLoading] = useState(false)
  const availabilityDirtyRef = useRef(false)

  useEffect(() => {
    const syncedTabs = isHostShell
      ? ['home', 'schedule', 'tasks', 'menu', 'reservations']
      : ['home', 'schedule', 'tasks', 'menu']
    if (syncedTabs.includes(activeTab)) {
      setStaffTab(activeTab)
    }
  }, [activeTab, isHostShell])

  useEffect(() => {
    if (!clockOpenToken) return
    setClockOpen(true)
  }, [clockOpenToken])

  const resolvedBottomTabs = isHostShell
    ? HOST_BOTTOM_TABS
    : isStaffShell
      ? STAFF_BOTTOM_TABS
      : bottomTabs
  const resolvedActiveTab = usesInternalTabs ? staffTab : activeTab
  const employeeId = `${tasksProps?.currentEmployeeId ?? ''}`.trim()
  const needsEmployeeLink = Boolean(tasksProps?.needsEmployeeLink)

  const loadAvailabilityContext = useCallback(async () => {
    if (!employeeId || needsEmployeeLink) {
      setAvailabilityContext({ workspaceId: '', weekStartDate: '', weekLabel: '' })
      setAvailabilityContextError('')
      setIsAvailabilityContextLoading(false)
      return
    }

    const weekStartDate = readPersistedMobileWeekStart(getCurrentWeekStartDate())
    setIsAvailabilityContextLoading(true)

    try {
      const workspaceId = await resolveEmployeeWorkspaceId(employeeId)
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
  }, [employeeId, needsEmployeeLink])

  useEffect(() => {
    if (staffTab !== 'availability') return
    loadAvailabilityContext()
  }, [staffTab, loadAvailabilityContext])

  const applyTabChange = useCallback((tab) => {
    setClockOpen(false)
    if (tab === 'availability') {
      setStaffTab('availability')
      return
    }

    setStaffTab(tab)
    onTabChange?.(tab)
  }, [onTabChange])

  const handleTabChange = useCallback((tab) => {
    if (staffTab === 'availability' && tab !== 'availability' && availabilityDirtyRef.current) {
      setPendingTab(tab)
      setShowLeaveConfirm(true)
      return
    }

    applyTabChange(tab)
  }, [applyTabChange, staffTab])

  const handleConfirmLeave = useCallback(() => {
    const nextTab = pendingTab
    setShowLeaveConfirm(false)
    setPendingTab(null)
    availabilityDirtyRef.current = false
    if (nextTab) applyTabChange(nextTab)
  }, [applyTabChange, pendingTab])

  const handleCancelLeave = useCallback(() => {
    setShowLeaveConfirm(false)
    setPendingTab(null)
  }, [])

  const handleAvailabilityDirtyChange = useCallback((isDirty) => {
    availabilityDirtyRef.current = Boolean(isDirty)
  }, [])

  const noticeBanner = noticeMessage ? (
    <div className="mobile-notice-banner auth-banner auth-banner-error" role="alert">
      <p>{noticeMessage}</p>
      {onDismissNotice ? (
        <button type="button" className="mobile-notice-dismiss" onClick={onDismissNotice} aria-label="Dismiss">
          ✕
        </button>
      ) : null}
    </div>
  ) : null

  const showBottomNav = Array.isArray(resolvedBottomTabs) && resolvedBottomTabs.length > 0

  const availabilityView = useMemo(() => (
    <MobileAvailabilityView
      workspaceId={availabilityContext.workspaceId}
      employeeId={employeeId}
      weekStartDate={availabilityContext.weekStartDate}
      weekLabel={availabilityContext.weekLabel}
      needsEmployeeLink={needsEmployeeLink}
      isContextLoading={isAvailabilityContextLoading}
      contextError={availabilityContextError}
      onRetryContext={loadAvailabilityContext}
      onDirtyChange={handleAvailabilityDirtyChange}
    />
  ), [
    availabilityContext.weekLabel,
    availabilityContext.weekStartDate,
    availabilityContext.workspaceId,
    availabilityContextError,
    employeeId,
    handleAvailabilityDirtyChange,
    isAvailabilityContextLoading,
    loadAvailabilityContext,
    needsEmployeeLink,
  ])

  if (expandedView) {
    return (
      <div className="mobile-app mobile-app-expanded">
        {notificationBell ? <div className="mobile-shell-bell">{notificationBell}</div> : null}
        {noticeBanner}
        <div className="mobile-expanded-scroll">
          <header className="mobile-expanded-header">
            <button type="button" className="mobile-back-btn" onClick={onBackFromExpanded}>
              ‹ Back
            </button>
            <h1>{expandedTitle}</h1>
          </header>
          {expandedModuleContent ? (
            <div className="mobile-workspace-module is-mobile-expanded">
              {expandedModuleContent}
            </div>
          ) : null}
        </div>
        {showBottomNav ? (
          <MobileBottomNav activeTab={resolvedActiveTab} onTabChange={handleTabChange} tabs={resolvedBottomTabs} />
        ) : null}
      </div>
    )
  }

  const showHostStation = isHostShell && resolvedActiveTab === 'reservations'

  return (
    <div className={`mobile-app${showHostStation ? ' mobile-app-host-mode mobile-app-host-station is-reservations-host-mode' : ''}`}>
      {notificationBell ? <div className="mobile-shell-bell">{notificationBell}</div> : null}
      {noticeBanner}
      {showLeaveConfirm ? (
        <div className="mobile-availability-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-availability-leave-title">
          <div className="mobile-availability-leave-dialog-card">
            <h2 id="mobile-availability-leave-title">Discard unsaved changes?</h2>
            <p>Your availability changes have not been saved.</p>
            <div className="mobile-availability-leave-dialog-actions">
              <button type="button" className="mobile-secondary-btn" onClick={handleCancelLeave}>
                Keep editing
              </button>
              <button type="button" className="mobile-primary-btn" onClick={handleConfirmLeave}>
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {clockOpen ? (
        <div className="mobile-app-content attendance-clock-screen">
          <button type="button" className="mobile-back-btn" onClick={() => setClockOpen(false)}>
            ‹ Back
          </button>
          {homeProps?.clockCard}
        </div>
      ) : showHostStation ? (
        <div className="mobile-host-mode-screen">
          {hostStationContent ? (
            <div className="mobile-workspace-module is-host-mode-module">
              {hostStationContent}
            </div>
          ) : null}
        </div>
      ) : (
      <div className="mobile-app-content">
        {resolvedActiveTab === 'home' ? <MobileHomeView {...homeProps} /> : null}
        {resolvedActiveTab === 'schedule' ? <MobileScheduleView {...scheduleProps} /> : null}
        {resolvedActiveTab === 'availability' ? availabilityView : null}
        {resolvedActiveTab === 'tasks' ? <MobileTasksView {...tasksProps} /> : null}
        {resolvedActiveTab === 'menu' ? (
          menuProps?.screen === 'profile' ? (
            <MobileProfileView {...(menuProps.profileProps ?? {})} onBack={menuProps.onBackFromProfile} />
          ) : menuProps?.screen === 'notifications' ? (
            <div className="mobile-screen mobile-notification-settings">
              <button type="button" className="mobile-back-btn" onClick={menuProps.onBackFromNotifications}>
                ‹ Back
              </button>
              {menuProps.notificationSettings}
            </div>
          ) : (
            <MobileMenuView
              {...menuProps}
              onOpenClock={homeProps?.clockCard ? () => setClockOpen(true) : undefined}
              onOpenAvailability={isHostShell ? () => handleTabChange('availability') : undefined}
            />
          )
        ) : null}
      </div>
      )}
      {showBottomNav ? (
        <MobileBottomNav activeTab={resolvedActiveTab} onTabChange={handleTabChange} tabs={resolvedBottomTabs} />
      ) : null}
    </div>
  )
}
