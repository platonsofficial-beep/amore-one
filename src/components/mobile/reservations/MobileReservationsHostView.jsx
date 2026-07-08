import { useEffect, useMemo, useState } from 'react'
import {
  buildHostManagerSummary,
  formatHostWorkspaceDateNavLabel,
  getHostWorkspaceReservations,
} from '../../reservations/hostReservationListUtils'
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

  const listPanel = (
    <>
      <header className="mobile-host-reservations-header mobile-host-mode-header" aria-label="Host mode header">
        <div className="mobile-host-mode-header-top">
          <div className="mobile-host-reservations-heading">
            <h1 className="mobile-host-reservations-title">Reservations Host Mode</h1>
            <p className="mobile-host-reservations-date">{dateLabel}</p>
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
        </div>
        <p className="mobile-host-reservations-stats">
          <strong>{summary.totalReservations}</strong> reservations
          <span aria-hidden="true"> · </span>
          <strong>{summary.totalGuests}</strong> guests
        </p>

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
      </header>

      {noticeMessage ? (
        <div className="mobile-host-reservations-notice" role="status">{noticeMessage}</div>
      ) : null}

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

      {isLoading ? (
        <p className="mobile-host-reservations-loading">Loading reservations…</p>
      ) : visibleReservations.length === 0 ? (
        <div className="mobile-host-reservations-empty" role="status">
          <p className="mobile-host-reservations-empty-title">No reservations in this list</p>
          <p className="mobile-host-reservations-empty-copy">
            {searchTerm
              ? 'Try another search or switch tabs.'
              : 'Add a reservation to start service.'}
          </p>
        </div>
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
      )}

      {!isSplitLayout && rightPaneContent ? (
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
      ) : null}
    </>
  )

  return (
    <div className={`mobile-screen mobile-host-reservations is-host-mode${isSplitLayout ? ' is-landscape' : ''}`}>
      {isSplitLayout && rightPaneContent ? (
        <div className="mobile-host-reservations-landscape">
          <section className="mobile-host-reservations-list-pane" aria-label="Reservation list">
            {listPanel}
          </section>
          <section className="mobile-host-reservations-detail-pane" aria-label="Floor plan and details">
            {rightPaneContent}
          </section>
        </div>
      ) : (
        listPanel
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
      />
    </div>
  )
}
