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
} from '../../../lib/mobileHostReservationUtils'
import { MobileReservationHostCard } from './MobileReservationHostCard'
import { MobileReservationHostEditSheet } from './MobileReservationHostEditSheet'
import { MobileReservationQuickCreateSheet } from './MobileReservationQuickCreateSheet'

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
  renderRightPane,
  selectedReservationId: controlledSelectedReservationId = null,
  onSelectReservation,
}) {
  const [activeTab, setActiveTab] = useState('upcoming')
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [localSelectedReservationId, setLocalSelectedReservationId] = useState(null)
  const [isSplitLayout, setIsSplitLayout] = useState(() => isMobileHostSplitViewport())
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false)

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

  const handleCreateSubmit = async (form) => {
    const created = await onCreateReservation?.(form)
    if (created !== false) {
      setIsCreateOpen(false)
    }
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
          onSelect={handleSelectReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onEdit={handleEditReservation}
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
        {onExitHostMode ? (
          <button
            type="button"
            className="mobile-host-mode-exit-btn"
            onClick={onExitHostMode}
            aria-label="Exit Host Mode"
          >
            Exit Host Mode
          </button>
        ) : null}
      </header>

      {noticeMessage ? (
        <div className="mobile-host-reservations-notice" role="status">{noticeMessage}</div>
      ) : null}

      {isSplitLayout && rightPaneContent ? (
        <div className="mobile-host-reservations-landscape">
          <section className="mobile-host-reservations-list-pane" aria-label="Reservation timeline">
            {listControls}
            <div className="mobile-host-list-scroll">
              {reservationList}
            </div>
          </section>
          <section className="mobile-host-reservations-detail-pane" aria-label="Floor plan and details">
            {rightPaneContent}
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

      <MobileReservationQuickCreateSheet
        isOpen={isCreateOpen}
        todayKey={todayKey}
        isSaving={isSaving}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <MobileReservationHostEditSheet
        reservation={editingReservation}
        todayKey={todayKey}
        reservations={reservations}
        isSaving={isSaving}
        onClose={() => setEditingReservation(null)}
        onSave={onHostEditSave}
        onDelete={onHostEditDelete}
        onValidationError={onReservationNotice}
      />
    </div>
  )
}
