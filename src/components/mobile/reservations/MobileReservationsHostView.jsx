import { useEffect, useMemo, useState } from 'react'
import {
  buildHostManagerSummary,
  formatHostWorkspaceDateNavLabel,
  getHostWorkspaceReservations,
} from '../../reservations/hostReservationListUtils'
import {
  countMobileHostReservationsByTab,
  filterMobileHostReservations,
  isMobileHostLandscapeViewport,
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
  onOpenFullWorkspace,
}) {
  const [activeTab, setActiveTab] = useState('upcoming')
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [selectedReservationId, setSelectedReservationId] = useState(null)
  const [isLandscape, setIsLandscape] = useState(() => isMobileHostLandscapeViewport())

  useEffect(() => {
    const updateOrientation = () => setIsLandscape(isMobileHostLandscapeViewport())
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

  const selectedReservation = useMemo(
    () => workspaceReservations.find(
      (reservation) => `${reservation.id}` === `${selectedReservationId}`,
    ) ?? null,
    [workspaceReservations, selectedReservationId],
  )

  const landscapeDetailReservation = editingReservation ?? selectedReservation

  const handleCreateSubmit = async (form) => {
    const created = await onCreateReservation?.(form)
    if (created !== false) {
      setIsCreateOpen(false)
    }
  }

  const handleSelectReservation = (reservation) => {
    setSelectedReservationId(reservation.id)
    if (isLandscape) {
      setEditingReservation(null)
    }
  }

  const handleEditReservation = (reservation) => {
    setEditingReservation(reservation)
    setSelectedReservationId(reservation.id)
  }

  const listPanel = (
  <>
    <header className="mobile-host-reservations-header" aria-label="Host reservations header">
      <div className="mobile-host-reservations-heading">
        <h1 className="mobile-host-reservations-title">Reservations</h1>
        <p className="mobile-host-reservations-date">{dateLabel}</p>
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
            isSelected={`${selectedReservationId}` === `${reservation.id}`}
            onSelect={handleSelectReservation}
            onQuickStatusUpdate={onQuickStatusUpdate}
            onEdit={handleEditReservation}
            isSaving={isSaving}
          />
        ))}
      </ul>
    )}

    {onOpenFullWorkspace ? (
      <button
        type="button"
        className="mobile-host-reservations-full-btn"
        onClick={onOpenFullWorkspace}
      >
        Open full reservations workspace
      </button>
    ) : null}
  </>
  )

  return (
    <div className={`mobile-screen mobile-host-reservations${isLandscape ? ' is-landscape' : ''}`}>
      {isLandscape ? (
        <div className="mobile-host-reservations-landscape">
          <section className="mobile-host-reservations-list-pane" aria-label="Reservation list">
            {listPanel}
          </section>
          <section className="mobile-host-reservations-detail-pane" aria-label="Reservation details">
            {landscapeDetailReservation ? (
              <div className="mobile-host-reservations-detail-card">
                <header className="mobile-host-reservations-detail-header">
                  <h2>{landscapeDetailReservation.guestName || 'Reservation'}</h2>
                  <button
                    type="button"
                    className="mobile-host-reservations-detail-edit-btn"
                    onClick={() => handleEditReservation(landscapeDetailReservation)}
                  >
                    Edit
                  </button>
                </header>
                <div className="mobile-host-reservations-detail-body">
                  <HostReservationDetailSummary
                    reservation={landscapeDetailReservation}
                    todayKey={todayKey}
                    nowMinutes={nowMinutes}
                  />
                  <p className="mobile-host-reservations-detail-hint">
                    Tap Edit for table assignment, notes, and full guest details.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mobile-host-reservations-detail-empty">
                <p>Select a reservation to review details.</p>
                <p className="mobile-host-reservations-detail-hint">
                  Floor plan and advanced seating tools are available in the full workspace.
                </p>
              </div>
            )}
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

function HostReservationDetailSummary({ reservation, todayKey, nowMinutes }) {
  const partySize = Number(reservation?.guests) || 0
  const phone = `${reservation?.phone ?? ''}`.trim()
  const notes = `${reservation?.notes ?? ''}`.trim()

  return (
    <dl className="mobile-host-reservation-detail-grid">
      <div>
        <dt>Time</dt>
        <dd>{reservation?.time || '—'}</dd>
      </div>
      <div>
        <dt>Party</dt>
        <dd>{partySize}</dd>
      </div>
      <div>
        <dt>Phone</dt>
        <dd>{phone || '—'}</dd>
      </div>
      <div>
        <dt>Table</dt>
        <dd>{reservation?.tableNumber || 'Unassigned'}</dd>
      </div>
      <div>
        <dt>Area</dt>
        <dd>{reservation?.area || '—'}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{reservation?.status || '—'}</dd>
      </div>
      {notes ? (
        <div className="is-full">
          <dt>Notes</dt>
          <dd>{notes}</dd>
        </div>
      ) : null}
    </dl>
  )
}
