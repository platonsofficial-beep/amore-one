import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildHostManagerSummary,
  formatHostWorkspaceDateNavLabel,
  getHostWorkspaceReservations,
} from '../../reservations/hostReservationListUtils'
import { buildHostQueueServiceMetricsFromReservations } from '../../../lib/hostQueueServiceMetrics'
import { getHostListEmptyState } from '../../../lib/reservationServiceIntelligence'
import {
  filterMobileHostReservations,
  isMobileHostSplitViewport,
  MOBILE_HOST_TABS,
  resolveHostReservationFormVariant,
} from '../../../lib/mobileHostReservationUtils'
import {
  buildHostQueueAreaOptions,
  buildHostQueueEmptyState,
  buildHostQueueReservationList,
  countActiveHostQueueFilters,
  HOST_QUEUE_ALL_AREAS,
  HOST_QUEUE_SORT_OPTIONS,
  reservationIsVisibleInHostQueue,
  buildHostQueueScopeReservations,
} from '../../../lib/hostQueuePipeline'
import {
  readHostQueueSortPreference,
  writeHostQueueSortPreference,
} from '../../../lib/hostQueuePersistence'
import { usePublishedFloorPlan } from '../../../lib/PublishedFloorPlanContext'
import { MobileReservationHostCard } from './MobileReservationHostCard'
import { HostReservationList } from '../../reservations/HostReservationList'
import { HOST_LIST_HELPERS } from '../../reservations/hostReservationListHelpers'
import {
  MobileHostReservationRowMenu,
  MobileHostReservationStatusMenu,
} from './MobileHostReservationStatusMenu'
import { getReservationDisplayStatus } from '../../../lib/reservationHostStatus'
import { MobileReservationHostEditSheet } from './MobileReservationHostEditSheet'
import { MobileReservationQuickCreateSheet } from './MobileReservationQuickCreateSheet'
import { HostSettingsPanel } from '../../host/HostSettingsPanel'
import { HostQueueToolbar } from './HostQueueToolbar'
import { HostQueueServiceSummary } from './HostQueueServiceSummary'

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
  selectedServiceSeatingId = '',
  selectedSeating = null,
  hasLayout = false,
  onOpenFloorPlanLayout,
  renderRightPane,
  selectedReservationId: controlledSelectedReservationId = null,
  onSelectReservation,
  onClearAssignmentSelection,
  hostSettingsProps = null,
  floorCreatePrefill = null,
  onFloorCreatePrefillConsumed,
  floorEditReservation = null,
  onFloorEditReservationConsumed,
}) {
  const { layout } = usePublishedFloorPlan()
  const [activeTab, setActiveTab] = useState('upcoming')
  const [searchTerm, setSearchTerm] = useState('')
  const [areaFilterId, setAreaFilterId] = useState(HOST_QUEUE_ALL_AREAS)
  const [activeFilterIds, setActiveFilterIds] = useState([])
  const [sortId, setSortId] = useState(() => readHostQueueSortPreference())
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createPrefill, setCreatePrefill] = useState(null)
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

  const areaOptions = useMemo(
    () => buildHostQueueAreaOptions(layout),
    [layout],
  )

  const scopeReservations = useMemo(
    () => buildHostQueueScopeReservations(workspaceReservations, {
      selectedSeating,
      seatings: reservationSeatings,
      dateKey: todayKey,
      areaFilterId,
      layout,
    }),
    [
      areaFilterId,
      layout,
      reservationSeatings,
      selectedSeating,
      todayKey,
      workspaceReservations,
    ],
  )

  const serviceMetrics = useMemo(
    () => buildHostQueueServiceMetricsFromReservations(workspaceReservations, {
      selectedSeating,
      seatings: reservationSeatings,
      dateKey: todayKey,
      areaFilterId,
      layout,
    }),
    [
      areaFilterId,
      layout,
      reservationSeatings,
      selectedSeating,
      todayKey,
      workspaceReservations,
    ],
  )

  const queueReservations = useMemo(
    () => buildHostQueueReservationList(workspaceReservations, {
      selectedSeating,
      seatings: reservationSeatings,
      dateKey: todayKey,
      areaFilterId,
      activeFilterIds,
      searchTerm,
      layout,
      nowMinutes,
      problemFilterOptions: { includeUnassigned: true, includeCapacity: true },
    }),
    [
      activeFilterIds,
      areaFilterId,
      layout,
      nowMinutes,
      reservationSeatings,
      searchTerm,
      selectedSeating,
      todayKey,
      workspaceReservations,
    ],
  )

  const activeFilterCount = countActiveHostQueueFilters(activeFilterIds)
  const selectedAreaLabel = areaOptions.find((entry) => entry.id === areaFilterId)?.label ?? ''

  const tabCounts = useMemo(
    () => MOBILE_HOST_TABS.reduce((counts, tab) => ({
      ...counts,
      [tab.id]: filterMobileHostReservations(queueReservations, { tabId: tab.id }).length,
    }), {}),
    [queueReservations],
  )

  const visibleReservations = useMemo(
    () => filterMobileHostReservations(queueReservations, {
      tabId: activeTab,
      searchTerm: '',
    }),
    [queueReservations, activeTab],
  )

  const summary = useMemo(
    () => buildHostManagerSummary(scopeReservations, nowMinutes, todayKey),
    [scopeReservations, nowMinutes, todayKey],
  )

  const queueEmptyState = useMemo(
    () => buildHostQueueEmptyState({
      selectedSeatingName: selectedSeating?.name ?? '',
      selectedAreaLabel: areaFilterId === HOST_QUEUE_ALL_AREAS ? '' : selectedAreaLabel,
      activeFilterCount,
      searchTerm,
    }),
    [activeFilterCount, areaFilterId, searchTerm, selectedAreaLabel, selectedSeating?.name],
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

  const handleSortChange = useCallback((nextSortId) => {
    setSortId(nextSortId)
    writeHostQueueSortPreference(nextSortId)
  }, [])

  const handleToggleFilter = useCallback((filterId) => {
    setActiveFilterIds((current) => (
      current.includes(filterId)
        ? current.filter((entry) => entry !== filterId)
        : [...current, filterId]
    ))
  }, [])

  const handleClearFilters = useCallback(() => {
    setActiveFilterIds([])
    setSearchTerm('')
    setAreaFilterId(HOST_QUEUE_ALL_AREAS)
  }, [])

  const listTransitionKey = useMemo(
    () => [
      sortId,
      areaFilterId,
      selectedSeating?.id ?? '',
      activeFilterIds.slice().sort().join(','),
    ].join('|'),
    [activeFilterIds, areaFilterId, selectedSeating?.id, sortId],
  )

  useEffect(() => {
    if (!effectiveSelectedReservationId || !onClearAssignmentSelection) return

    const selectedReservation = reservations.find(
      (entry) => String(entry.id) === String(effectiveSelectedReservationId),
    )
    if (!selectedReservation) {
      onClearAssignmentSelection()
      return
    }

    if (!reservationIsVisibleInHostQueue(selectedReservation, queueReservations)) {
      onClearAssignmentSelection()
    }
  }, [
    effectiveSelectedReservationId,
    onClearAssignmentSelection,
    queueReservations,
    reservations,
  ])

  useEffect(() => {
    if (!floorCreatePrefill) return
    setCreatePrefill(floorCreatePrefill)
    setIsCreateOpen(true)
    onFloorCreatePrefillConsumed?.()
  }, [floorCreatePrefill, onFloorCreatePrefillConsumed])

  const handleCreateSubmit = async (form) => {
    const created = await onCreateReservation?.(form)
    if (created !== false) {
      setIsCreateOpen(false)
      setCreatePrefill(null)
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

  useEffect(() => {
    if (!floorEditReservation) return
    handleEditReservation(floorEditReservation)
    onFloorEditReservationConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- open edit when floor day view requests it
  }, [floorEditReservation, onFloorEditReservationConsumed])

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
    ? renderRightPane({
      onEditReservation: handleEditReservation,
      areaFilterId,
    })
    : null

  const listControls = (
    <div className="mobile-host-list-controls">
      <div className="mobile-host-reservations-toolbar host-queue-search-row">
        <label className="mobile-host-reservations-search">
          <span className="sr-only">Search reservations</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search guest, phone, table, area, notes"
          />
        </label>
        <button
          type="button"
          className="mobile-host-reservations-add-btn"
          onClick={() => {
            setCreatePrefill(null)
            setIsCreateOpen(true)
          }}
          disabled={isSaving}
        >
          + Reservation
        </button>
      </div>

      {isSplitLayout ? (
        <div className="host-queue-context-row">
          <HostQueueToolbar
            areaOptions={areaOptions}
            areaFilterId={areaFilterId}
            onAreaFilterChange={setAreaFilterId}
            activeFilterIds={activeFilterIds}
            onToggleFilter={handleToggleFilter}
            onClearFilters={handleClearFilters}
            sortId={sortId}
            onSortChange={handleSortChange}
            sortOptions={HOST_QUEUE_SORT_OPTIONS}
          />
        </div>
      ) : null}

      {!isSplitLayout ? (
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
      ) : null}
    </div>
  )

  const portraitReservationList = isLoading ? (
    <p className="mobile-host-reservations-loading">Loading reservations…</p>
  ) : visibleReservations.length === 0 ? (
    (() => {
      const emptyState = activeFilterCount > 0 || searchTerm.trim()
        ? queueEmptyState
        : getHostListEmptyState({
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
          layout={layout}
          useHostQueuePresentation={isSplitLayout}
        />
      ))}
    </ul>
  )

  const splitReservationList = (
    <HostReservationList
      layout="compactTablet"
      reservations={queueReservations}
      nowMinutes={nowMinutes}
      todayKey={todayKey}
      isLoading={isLoading}
      isSelected={(reservation) => `${effectiveSelectedReservationId}` === `${reservation.id}`}
      hostEditingReservation={editingReservation}
      draggingReservationId={null}
      isSavingStatus={isSaving}
      listFilter="All"
      searchTerm={searchTerm}
      dailySnapshot={summary}
      isViewingToday
      onOpenEdit={handleSelectReservation}
      onStatusChange={handleStatusSelect}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onOpenRowMenu={handleOpenRowMenu}
      helpers={HOST_LIST_HELPERS}
      floorLayout={layout}
      sortId={sortId}
      queueEmptyState={queueEmptyState}
      onClearQueueFilters={handleClearFilters}
      useHostQueuePresentation
    />
  )

  const reservationList = isSplitLayout ? splitReservationList : portraitReservationList

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
        prefill={createPrefill}
        seatings={reservationSeatings}
        reservations={reservations}
        onClose={() => {
          setIsCreateOpen(false)
          setCreatePrefill(null)
        }}
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
    <div className={`mobile-host-reservations is-host-mode${isSplitLayout ? ' is-landscape is-host-queue' : ' is-portrait'}`}>
      <header className="mobile-host-sticky-bar" aria-label="Host mode header">
        <div className="mobile-host-sticky-left">
          <h1 className="mobile-host-sticky-title">Reservations</h1>
          <p className="mobile-host-sticky-date">{dateLabel}</p>
        </div>
        <div className="mobile-host-sticky-center" aria-label="Service summary">
          {isSplitLayout ? (
            <HostQueueServiceSummary {...serviceMetrics} />
          ) : (
            <>
              <span><strong>{summary.totalCovers ?? summary.totalGuests}</strong> covers</span>
              <span><strong>{summary.upcomingArrivals ?? 0}</strong> upcoming</span>
              <span><strong>{summary.seatedGuests ?? summary.inHouse}</strong> seated</span>
            </>
          )}
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
          <section className="mobile-host-reservations-list-pane" aria-label="Host queue">
            {listControls}
            <div className="mobile-host-list-scroll">
              <div key={listTransitionKey} className="host-queue-list-transition">
                {reservationList}
              </div>
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
            prefill={createPrefill}
            seatings={reservationSeatings}
            reservations={reservations}
            onClose={() => {
              setIsCreateOpen(false)
              setCreatePrefill(null)
            }}
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
