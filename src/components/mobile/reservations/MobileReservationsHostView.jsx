import { useEffect, useMemo, useState } from 'react'
import {
  buildHostManagerSummary,
  formatHostWorkspaceDateNavLabel,
  getHostWorkspaceReservations,
} from '../../reservations/hostReservationListUtils'
import { getHostListEmptyState } from '../../../lib/reservationServiceIntelligence'
import {
  countMobileHostReservationsByTab,
  filterMobileHostReservations,
  isMobileHostSplitViewport,
  MOBILE_HOST_TABS,
  resolveHostReservationFormVariant,
} from '../../../lib/mobileHostReservationUtils'
import { MobileReservationHostCard } from './MobileReservationHostCard'
import {
  MobileHostReservationRowMenu,
  MobileHostReservationStatusMenu,
} from './MobileHostReservationStatusMenu'
import { getReservationDisplayStatus } from '../../../lib/reservationHostStatus'
import { MobileReservationHostEditSheet } from './MobileReservationHostEditSheet'
import { MobileReservationQuickCreateSheet } from './MobileReservationQuickCreateSheet'
import { HostSettingsPanel } from '../../host/HostSettingsPanel'

export function MobileReservationsHostView({
  reservations = [],
  workspaceTimeZone = '',
  todayKey = '',
  nowMinutes = 0,
  isLoading = false,
  isSaving = false,
  noticeMessage = '',
  onQuickStatusUpdate,
  onHostEditSave,
  onHostEditDelete,
  onReservationNotice,
  onCreateReservation,
  onExitHostMode,
  canEditFloorPlan = false,
  reservationSeatings = [],
  hasLayout = false,
  onOpenFloorPlanLayout,
  renderRightPane,
  selectedReservationId: controlledSelectedReservationId = null,
  onSelectReservation,
  hostSettingsProps = null,
}) {
  const [activeTab, setActiveTab] = useState('upcoming')
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [localSelectedReservationId, setLocalSelectedReservationId] = useState(null)
  const [isSplitLayout, setIsSplitLayout] = useState(() => isMobileHostSplitViewport())
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false)
  const [statusMenu, setStatusMenu] = useState(null)
  const [rowMenu, setRowMenu] = useState(null)

  useEffect(() => {
    const updateOrientation = () => setIsSplitLayout(isMobileHostSplitViewport())
    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)
    return () => {
      window.removeEventListener('resize', updateOrientation)
      window.removeEventListener('orientationchange', updateOrientation)
    }
  }, [])

  const workspaceReservations = useMemo(
    () => getHostWorkspaceReservations(reservations, todayKey, workspaceTimeZone),
    [reservations, todayKey, workspaceTimeZone],
  )

  const tabCounts = useMemo(
    () => countMobileHostReservationsByTab(workspaceReservations),
    [workspaceReservations],
  )

  const visibleReservations = useMemo(
    () => filterMobileHostReservations(workspaceReservations, {
      tabId: activeTab,
      searchTerm,
    }),
    [workspaceReservations, activeTab, searchTerm],
  )

  const summary = useMemo(
    () => buildHostManagerSummary(workspaceReservations, nowMinutes, todayKey),
    [workspaceReservations, nowMinutes, todayKey],
  )

  const dateLabel = useMemo(
    () => formatHostWorkspaceDateNavLabel(todayKey, todayKey),
    [todayKey],
  )

  const effectiveSelectedReservationId = isSplitLayout && controlledSelectedReservationId != null
    ? controlledSelectedReservationId
    : localSelectedReservationId

  const formVariant = resolveHostReservationFormVariant({ isSplitLayout })
  const useInlineDetailPane = isSplitLayout && (isCreateOpen || editingReservation)

  const handleCreateSubmit = async (form) => {
    const created = await onCreateReservation?.(form)
    if (created !== false) {
      setIsCreateOpen(false)
    }
    return created
  }

  const handleSelectReservation = (reservation) => {
    if (isSplitLayout && onSelectReservation) {
      onSelectReservation(reservation)
      setEditingReservation(null)
      return
    }

    setLocalSelectedReservationId(reservation.id)
  }

  const handleEditReservation = (reservation) => {
    setEditingReservation(reservation)
    if (isSplitLayout && onSelectReservation) {
      onSelectReservation(reservation)
      return
    }
    setLocalSelectedReservationId(reservation.id)
  }

  const handleOpenStatusMenu = (reservation, event) => {
    setRowMenu(null)
    setStatusMenu({
      reservation,
      anchorRect: event.currentTarget.getBoundingClientRect(),
      currentStatusId: getReservationDisplayStatus(reservation, nowMinutes, todayKey),
    })
  }

  const handleOpenRowMenu = (reservation, event) => {
    setStatusMenu(null)
    setRowMenu({
      reservation,
      anchorRect: event.currentTarget.getBoundingClientRect(),
    })
  }

  const handleStatusSelect = async (reservation, status) => {
    if (isSaving) return
    await onQuickStatusUpdate?.(reservation, status)
    setStatusMenu(null)
  }

  const rightPaneContent = renderRightPane
    ? renderRightPane({ onEditReservation: handleEditReservation })
    : null

  const listControls = (
    <div className="mobile-host-list-controls">
      <div className="mobile-host-reservations-toolbar">
        <label className="mobile-host-reservations-search">
          <span className="sr-only">Search reservations</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search guest, phone, table"
          />
        </label>
        <button
          type="button"
          className="mobile-host-reservations-add-btn"
          onClick={() => setIsCreateOpen(true)}
          disabled={isSaving}
        >
          + Reservation
        </button>
      </div>

      <div className="mobile-host-reservations-tabs" role="tablist" aria-label="Service tabs">
        {MOBILE_HOST_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`mobile-host-reservations-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            <span className="mobile-host-reservations-tab-count">{tabCounts[tab.id] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const reservationList = isLoading ? (
    <p className="mobile-host-reservations-loading">Loading reservations…</p>
  ) : visibleReservations.length === 0 ? (
    (() => {
      const emptyState = getHostListEmptyState({
        filter: activeTab === 'upcoming' ? 'Upcoming'
          : activeTab === 'in-house' ? 'In House'
            : activeTab === 'completed' ? 'Completed'
              : activeTab === 'problems' ? 'Problems'
                : 'All',
        searchTerm,
        snapshot: summary,
        isViewingToday: true,
      })

      return (
        <div className="mobile-host-reservations-empty" role="status">
          <p className="mobile-host-reservations-empty-title">{emptyState.title}</p>
          <p className="mobile-host-reservations-empty-copy">{emptyState.copy}</p>
        </div>
      )
    })()
  ) : (
    <ul className="mobile-host-reservation-list" role="list">
      {visibleReservations.map((reservation) => (
        <MobileReservationHostCard
          key={reservation.id}
          reservation={reservation}
          groupId={activeTab}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          isSelected={`${effectiveSelectedReservationId}` === `${reservation.id}`}
          isLandscapeLayout={isSplitLayout}
          isStatusMenuOpen={statusMenu?.reservation?.id === reservation.id}
          onSelect={handleSelectReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onEdit={handleEditReservation}
          onOpenStatusMenu={handleOpenStatusMenu}
          onOpenRowMenu={handleOpenRowMenu}
          isSaving={isSaving}
        />
      ))}
    </ul>
  )

  const portraitFloorSection = !isSplitLayout && rightPaneContent ? (
    <div className="mobile-host-floor-collapsible">
      <button
        type="button"
        className="mobile-host-floor-toggle"
        onClick={() => setIsFloorPlanOpen((current) => !current)}
        aria-expanded={isFloorPlanOpen}
      >
        <span>Floor plan</span>
        <span className="mobile-host-floor-toggle-icon" aria-hidden="true">
          {isFloorPlanOpen ? '▲' : '▼'}
        </span>
      </button>
      {isFloorPlanOpen ? (
        <div className="mobile-host-floor-collapsible-body">
          {rightPaneContent}
        </div>
      ) : null}
    </div>
  ) : null

  const detailPaneContent = useInlineDetailPane ? (
    isCreateOpen ? (
      <MobileReservationQuickCreateSheet
        isOpen
        variant="inline"
        todayKey={todayKey}
        isSaving={isSaving}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />
    ) : (
      <MobileReservationHostEditSheet
        reservation={editingReservation}
        variant="inline"
        todayKey={todayKey}
        reservations={reservations}
        seatings={reservationSeatings}
        isSaving={isSaving}
        onClose={() => setEditingReservation(null)}
        onSave={onHostEditSave}
        onDelete={onHostEditDelete}
        onValidationError={onReservationNotice}
      />
    )
  ) : rightPaneContent

  const splitDetailFallback = (
    <div className="mobile-host-reservations-detail-empty" role="status">
      <p className="mobile-host-reservations-detail-empty-title">Select a reservation</p>
      <p className="mobile-host-reservations-detail-empty-copy">
        Choose a guest from the list or tap + Reservation to create one.
      </p>
    </div>
  )

  return (
    <div className={`mobile-host-reservations is-host-mode${isSplitLayout ? ' is-landscape' : ' is-portrait'}`}>
      <header className="mobile-host-sticky-bar" aria-label="Host mode header">
        <div className="mobile-host-sticky-left">
          <h1 className="mobile-host-sticky-title">Reservations</h1>
          <p className="mobile-host-sticky-date">{dateLabel}</p>
        </div>
        <div className="mobile-host-sticky-center" aria-label="Service totals">
          <span><strong>{summary.totalCovers ?? summary.totalGuests}</strong> covers</span>
          <span><strong>{summary.upcomingArrivals ?? 0}</strong> upcoming</span>
          <span><strong>{summary.seatedGuests ?? summary.inHouse}</strong> seated</span>
        </div>
        <div className="mobile-host-sticky-actions">
          {hostSettingsProps ? (
            <button
              type="button"
              className="mobile-host-settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Host settings"
            >
              ⚙ Settings
            </button>
          ) : null}
          {onExitHostMode ? (
            <button
              type="button"
              className="mobile-host-mode-exit-btn"
              onClick={onExitHostMode}
              aria-label="Exit Host Mode"
            >
              Exit
            </button>
          ) : null}
        </div>
      </header>

      {noticeMessage ? (
        <div className="mobile-host-reservations-notice" role="status">{noticeMessage}</div>
      ) : null}

      {isSplitLayout ? (
        <div className="mobile-host-reservations-landscape">
          <section className="mobile-host-reservations-list-pane" aria-label="Reservation timeline">
            {listControls}
            <div className="mobile-host-list-scroll">
              {reservationList}
            </div>
          </section>
          <section className="mobile-host-reservations-detail-pane host-station-form-pane" aria-label="Reservation details">
            {detailPaneContent ?? splitDetailFallback}
          </section>
        </div>
      ) : (
        <div className="mobile-host-portrait-body">
          {listControls}
          <div className="mobile-host-list-scroll">
            {reservationList}
            {portraitFloorSection}
          </div>
        </div>
      )}

      {!useInlineDetailPane ? (
        <>
          <MobileReservationQuickCreateSheet
            isOpen={isCreateOpen}
            variant={formVariant === 'inline' ? 'panel' : formVariant}
            todayKey={todayKey}
            isSaving={isSaving}
            onClose={() => setIsCreateOpen(false)}
            onSubmit={handleCreateSubmit}
          />

          <MobileReservationHostEditSheet
            reservation={editingReservation}
            variant={formVariant === 'inline' ? 'panel' : formVariant}
            todayKey={todayKey}
            reservations={reservations}
            seatings={reservationSeatings}
            isSaving={isSaving}
            onClose={() => setEditingReservation(null)}
            onSave={onHostEditSave}
            onDelete={onHostEditDelete}
            onValidationError={onReservationNotice}
          />
        </>
      ) : null}

      <MobileHostReservationStatusMenu
        reservation={statusMenu?.reservation}
        currentStatusId={statusMenu?.currentStatusId}
        anchorRect={statusMenu?.anchorRect}
        isOpen={Boolean(statusMenu)}
        isSaving={isSaving}
        onClose={() => setStatusMenu(null)}
        onSelectStatus={handleStatusSelect}
      />

      <MobileHostReservationRowMenu
        reservation={rowMenu?.reservation}
        anchorRect={rowMenu?.anchorRect}
        isOpen={Boolean(rowMenu)}
        isSaving={isSaving}
        onClose={() => setRowMenu(null)}
        onEdit={handleEditReservation}
      />

      {isSettingsOpen && hostSettingsProps ? (
        <div className="mobile-host-settings-overlay" role="presentation">
          <button
            type="button"
            className="mobile-host-settings-backdrop"
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close settings"
          />
          <HostSettingsPanel
            {...hostSettingsProps}
            onClose={() => setIsSettingsOpen(false)}
          />
        </div>
      ) : null}
    </div>
  )
}
