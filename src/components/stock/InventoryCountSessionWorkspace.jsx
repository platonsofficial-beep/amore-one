import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  completeInventoryCountLocation,
  getInventoryCountSessionItems,
  getInventoryCountSessionLocations,
  updateInventoryCountItem,
} from '../../services/inventoryCountService'

const LOCATION_STATE_LABEL = {
  completed: 'Completed',
  current: 'Current',
  not_started: 'Not started',
}

const LINE_STATUS_LABEL = {
  pending: 'Pending',
  counted: 'Counted',
  skipped: 'Skipped',
}

const AUTOSAVE_DEBOUNCE_MS = 400

const COUNTED_INPUT_STYLE = {
  boxSizing: 'border-box',
  width: '100%',
  minWidth: '72px',
  minHeight: '44px',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(255, 247, 232, 0.16)',
  background: 'rgba(8, 8, 9, 0.72)',
  color: '#fff7e8',
  fontSize: '0.95rem',
  fontWeight: 650,
}

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  if (Number.isInteger(numeric)) {
    return `${numeric}`
  }
  return `${numeric}`
}

function formatLineStatus(lineStatus) {
  const normalized = `${lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending'
  return LINE_STATUS_LABEL[normalized] ?? 'Pending'
}

function mapItemForDisplay(item) {
  const lineStatus = `${item.lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending'
  return {
    id: item.id,
    name: item.itemName || 'Untitled item',
    unit: item.unit || '—',
    expected: formatQuantity(item.expectedSnapshot),
    counted: item.countedQuantity === null || item.countedQuantity === undefined
      ? ''
      : formatQuantity(item.countedQuantity),
    status: formatLineStatus(lineStatus),
    storageLocation: item.storageLocation || 'Other',
    lineStatus,
  }
}

function recountLocationItems(items) {
  const countedItems = items.filter((item) => (
    item.lineStatus === 'counted' || item.lineStatus === 'skipped'
  )).length
  return {
    countedItems,
    totalItems: items.length,
  }
}

function buildLocationsFromSession(sessionLocations, sessionItems) {
  const itemsByLocation = new Map()

  sessionItems.forEach((item) => {
    const key = item.storageLocation || 'Other'
    if (!itemsByLocation.has(key)) {
      itemsByLocation.set(key, [])
    }
    itemsByLocation.get(key).push(mapItemForDisplay(item))
  })

  const orderedKeys = sessionLocations.length > 0
    ? sessionLocations.map((location) => location.locationKey)
    : Array.from(itemsByLocation.keys()).sort((a, b) => a.localeCompare(b))

  const seen = new Set()
  const locations = []

  orderedKeys.forEach((locationKey, index) => {
    if (!locationKey || seen.has(locationKey)) return
    seen.add(locationKey)

    const sessionLocation = sessionLocations.find((location) => location.locationKey === locationKey)
    const items = itemsByLocation.get(locationKey) ?? []
    const { countedItems, totalItems } = recountLocationItems(items)

    let status = sessionLocation?.status ?? 'not_started'
    if (!sessionLocation) {
      if (totalItems > 0 && countedItems >= totalItems) {
        status = 'completed'
      } else if (index === 0) {
        status = 'current'
      } else {
        status = 'not_started'
      }
    }

    locations.push({
      id: sessionLocation?.id || locationKey,
      name: locationKey,
      locationKey,
      status,
      countedItems,
      totalItems,
      items,
    })
  })

  itemsByLocation.forEach((items, locationKey) => {
    if (seen.has(locationKey)) return
    const { countedItems, totalItems } = recountLocationItems(items)
    locations.push({
      id: locationKey,
      name: locationKey,
      locationKey,
      status: 'not_started',
      countedItems,
      totalItems,
      items,
    })
  })

  return locations
}

function getSessionProgress(locations) {
  const totalCounted = locations.reduce((sum, location) => sum + location.countedItems, 0)
  const totalIncluded = locations.reduce((sum, location) => sum + location.totalItems, 0)
  const completedLocations = locations.filter((location) => location.status === 'completed').length
  const percentage = totalIncluded === 0
    ? 0
    : Math.round((totalCounted / totalIncluded) * 100)

  return {
    totalCounted,
    totalIncluded,
    completedLocations,
    totalLocations: locations.length,
    remainingItems: Math.max(0, totalIncluded - totalCounted),
    percentage,
    skipped: locations.reduce((sum, location) => (
      sum + location.items.filter((item) => item.lineStatus === 'skipped').length
    ), 0),
  }
}

function pickInitialLocationId(locations) {
  const current = locations.find((location) => location.status === 'current')
  if (current) return current.id
  const incomplete = locations.find((location) => location.status !== 'completed')
  return incomplete?.id ?? locations[0]?.id ?? ''
}

function findItemSnapshot(locations, itemId) {
  for (const location of locations) {
    const item = location.items.find((entry) => entry.id === itemId)
    if (item) {
      return {
        counted: item.counted,
        lineStatus: item.lineStatus,
        status: item.status,
      }
    }
  }
  return null
}

function parseCountedDraft(rawValue) {
  const trimmed = `${rawValue ?? ''}`.trim()
  if (trimmed === '') {
    return { ready: true, countedQuantity: null }
  }

  if (!/^\d*(\.\d*)?$/.test(trimmed)) {
    return { ready: false, invalid: true }
  }

  if (trimmed === '.' || trimmed.endsWith('.')) {
    return { ready: false, invalid: false }
  }

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { ready: false, invalid: true }
  }

  return { ready: true, countedQuantity: numeric }
}

function patchItemInLocations(locations, itemId, patch) {
  return locations.map((location) => {
    const itemIndex = location.items.findIndex((item) => item.id === itemId)
    if (itemIndex < 0) return location

    const items = location.items.map((item, index) => (
      index === itemIndex
        ? { ...item, ...patch }
        : item
    ))
    const { countedItems, totalItems } = recountLocationItems(items)
    return {
      ...location,
      items,
      countedItems,
      totalItems,
    }
  })
}

export function InventoryCountSessionWorkspace({
  onExit,
  sessionId: sessionIdProp = '',
  workspaceId: workspaceIdProp = '',
}) {
  const { workspace } = useAuth()
  const [locations, setLocations] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [completionMessage, setCompletionMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isCompletingLocation, setIsCompletingLocation] = useState(false)
  const [sessionStatus, setSessionStatus] = useState('in_progress')
  const loadRequestIdRef = useRef(0)
  const locationsRef = useRef(locations)
  const debounceTimersRef = useRef(new Map())
  const inFlightRef = useRef(new Map())
  const queuedSaveRef = useRef(new Map())
  const rollbackRef = useRef(new Map())
  const savingCountRef = useRef(0)

  useEffect(() => {
    locationsRef.current = locations
  }, [locations])

  useEffect(() => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId

    let cancelled = false

    const loadSessionItems = async () => {
      setIsLoading(true)
      setLoadError('')
      setSaveError('')
      setCompletionMessage('')
      setSessionStatus('in_progress')
      setIsCompletingLocation(false)

      try {
        const sessionId = `${sessionIdProp || ''}`.trim()
        if (!sessionId) {
          setLocations([])
          setSelectedLocationId('')
          setLoadError('Inventory count session was not found.')
          return
        }

        const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
        if (!workspaceId) {
          throw new Error('Workspace is required.')
        }

        const [sessionLocations, sessionItems] = await Promise.all([
          getInventoryCountSessionLocations({ workspaceId, sessionId }),
          getInventoryCountSessionItems({ workspaceId, sessionId }),
        ])

        if (cancelled || loadRequestIdRef.current !== requestId) return

        const nextLocations = buildLocationsFromSession(sessionLocations, sessionItems)
        setLocations(nextLocations)
        setSelectedLocationId(pickInitialLocationId(nextLocations))
      } catch (error) {
        if (cancelled || loadRequestIdRef.current !== requestId) return
        setLocations([])
        setSelectedLocationId('')
        setLoadError(error?.message || 'Unable to load inventory count items right now.')
      } finally {
        if (!cancelled && loadRequestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    }

    void loadSessionItems()

    const debounceTimers = debounceTimersRef.current

    return () => {
      cancelled = true
      debounceTimers.forEach((timerId) => clearTimeout(timerId))
      debounceTimers.clear()
    }
  }, [sessionIdProp, workspaceIdProp, workspace?.id])

  const beginSaving = () => {
    savingCountRef.current += 1
    setIsSaving(true)
  }

  const endSaving = () => {
    savingCountRef.current = Math.max(0, savingCountRef.current - 1)
    if (savingCountRef.current === 0) {
      setIsSaving(false)
    }
  }

  const persistCountedQuantity = async (itemId, countedQuantity) => {
    if (inFlightRef.current.get(itemId)) {
      queuedSaveRef.current.set(itemId, countedQuantity)
      return
    }

    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setSaveError('Unable to save counted quantity right now.')
      return
    }

    inFlightRef.current.set(itemId, true)
    beginSaving()
    setSaveError('')

    try {
      const saved = await updateInventoryCountItem({
        workspaceId,
        sessionId,
        sessionItemId: itemId,
        countedQuantity,
      })

      const nextLineStatus = saved.lineStatus
      const nextCounted = saved.countedQuantity === null || saved.countedQuantity === undefined
        ? ''
        : formatQuantity(saved.countedQuantity)

      setLocations((current) => patchItemInLocations(current, itemId, {
        counted: nextCounted,
        lineStatus: nextLineStatus,
        status: formatLineStatus(nextLineStatus),
      }))
      rollbackRef.current.delete(itemId)
    } catch (error) {
      const rollback = rollbackRef.current.get(itemId)
      if (rollback) {
        setLocations((current) => patchItemInLocations(current, itemId, rollback))
      }
      setSaveError(error?.message || 'Unable to save counted quantity right now.')
    } finally {
      inFlightRef.current.set(itemId, false)
      endSaving()

      if (queuedSaveRef.current.has(itemId)) {
        const queuedValue = queuedSaveRef.current.get(itemId)
        queuedSaveRef.current.delete(itemId)
        void persistCountedQuantity(itemId, queuedValue)
      }
    }
  }

  const scheduleCountedSave = (itemId, rawValue) => {
    const existingTimer = debounceTimersRef.current.get(itemId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timerId = setTimeout(() => {
      debounceTimersRef.current.delete(itemId)
      const parsed = parseCountedDraft(rawValue)
      if (!parsed.ready) {
        if (parsed.invalid) {
          const rollback = rollbackRef.current.get(itemId)
          if (rollback) {
            setLocations((current) => patchItemInLocations(current, itemId, rollback))
          }
          setSaveError('Counted quantity must be a valid non-negative number.')
        }
        return
      }

      void persistCountedQuantity(itemId, parsed.countedQuantity)
    }, AUTOSAVE_DEBOUNCE_MS)

    debounceTimersRef.current.set(itemId, timerId)
  }

  const handleCountedChange = (itemId, nextValue) => {
    if (!rollbackRef.current.has(itemId)) {
      const snapshot = findItemSnapshot(locationsRef.current, itemId)
      if (snapshot) {
        rollbackRef.current.set(itemId, snapshot)
      }
    }

    const trimmed = `${nextValue ?? ''}`
    if (trimmed !== '' && !/^\d*\.?\d*$/.test(trimmed)) {
      return
    }

    const parsed = parseCountedDraft(trimmed)
    const optimisticLineStatus = parsed.ready && parsed.countedQuantity === null
      ? 'pending'
      : parsed.ready
        ? 'counted'
        : (findItemSnapshot(locationsRef.current, itemId)?.lineStatus ?? 'pending')

    setLocations((current) => patchItemInLocations(current, itemId, {
      counted: trimmed,
      lineStatus: optimisticLineStatus,
      status: formatLineStatus(optimisticLineStatus),
    }))
    setSaveError('')
    scheduleCountedSave(itemId, trimmed)
  }

  const selectedIndex = locations.findIndex((location) => location.id === selectedLocationId)
  const selectedLocation = locations[selectedIndex] ?? locations[0] ?? null
  const progress = getSessionProgress(locations)

  const canGoPrevious = selectedIndex > 0
  const canGoNext = selectedIndex >= 0 && selectedIndex < locations.length - 1
  const canCompleteLocation = Boolean(selectedLocation)
    && selectedLocation.status === 'current'
    && sessionStatus === 'in_progress'
    && !isCompletingLocation
  const bannerError = saveError || loadError
  const unsavedLabel = isSaving
    ? 'Saving…'
    : saveError
      ? 'Save failed'
      : 'All changes saved'
  const sessionStatusLabel = sessionStatus === 'counting_complete'
    ? 'Counting Complete'
    : 'In Progress'
  const canOpenFinishCount = sessionStatus === 'counting_complete'

  const selectLocation = (locationId) => {
    setSelectedLocationId(locationId)
    setCompletionMessage('')
  }

  const handlePrevious = () => {
    if (!canGoPrevious) return
    selectLocation(locations[selectedIndex - 1].id)
  }

  const handleNext = () => {
    if (!canGoNext) return
    selectLocation(locations[selectedIndex + 1].id)
  }

  const handleCompleteLocation = async () => {
    if (!canCompleteLocation || !selectedLocation) return

    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setSaveError('Unable to complete inventory count location right now.')
      return
    }

    setIsCompletingLocation(true)
    setSaveError('')
    setCompletionMessage('')

    try {
      const result = await completeInventoryCountLocation({
        workspaceId,
        sessionId,
        locationId: selectedLocation.id,
      })

      setSessionStatus(result.sessionStatus || 'in_progress')
      setLocations((current) => current.map((location) => {
        if (location.id === result.completedLocationId) {
          return {
            ...location,
            status: 'completed',
          }
        }
        if (result.nextLocationId && location.id === result.nextLocationId) {
          return {
            ...location,
            status: 'current',
          }
        }
        if (
          location.status === 'current'
          && location.id !== result.completedLocationId
          && location.id !== result.nextLocationId
        ) {
          return {
            ...location,
            status: 'not_started',
          }
        }
        return location
      }))

      if (result.nextLocationId) {
        setSelectedLocationId(result.nextLocationId)
        setCompletionMessage('')
        return
      }

      setCompletionMessage('All locations are complete. Finish Count will be added next.')
    } catch (error) {
      setSaveError(error?.message || 'Unable to complete inventory count location right now.')
    } finally {
      setIsCompletingLocation(false)
    }
  }

  const selectedLocationName = selectedLocation?.name ?? 'Location'

  return (
    <section className="inventory-count-session" aria-label="Inventory Count Session Workspace">
      <header className="inventory-count-session-header">
        <div className="inventory-count-session-header-copy">
          <p className="inventory-count-session-eyebrow">Inventory Count Session</p>
          <div className="inventory-count-session-meta">
            <span className="inventory-count-session-pill is-status">{sessionStatusLabel}</span>
            <span className="inventory-count-session-meta-item">
              <span className="inventory-count-session-meta-label">Count Type</span>
              <span className="inventory-count-session-meta-value">New Count</span>
            </span>
            <span className="inventory-count-session-meta-item">
              <span className="inventory-count-session-meta-label">Mode</span>
              <span className="inventory-count-session-meta-value">Blind Count</span>
            </span>
            <span className="inventory-count-session-meta-item">
              <span className="inventory-count-session-meta-label">Started</span>
              <span className="inventory-count-session-meta-value">Just now</span>
            </span>
            <span className="inventory-count-session-meta-item">
              <span className="inventory-count-session-meta-label">Operator</span>
              <span className="inventory-count-session-meta-value">Current signed-in operator</span>
            </span>
          </div>
        </div>
        <div className="inventory-count-session-header-actions">
          <button type="button" className="ghost-btn inventory-count-session-action-btn" disabled aria-disabled="true">
            Pause
          </button>
          <button
            type="button"
            className="ghost-btn inventory-count-session-action-btn"
            disabled={!canOpenFinishCount}
            aria-disabled={!canOpenFinishCount}
          >
            Finish Count
          </button>
          <button
            type="button"
            className="ghost-btn inventory-count-session-action-btn"
            onClick={onExit}
          >
            Exit
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="staff-status-banner" role="status">
          Loading inventory count…
        </div>
      ) : null}

      {bannerError ? (
        <div className="staff-status-banner" role="alert">
          {bannerError}
        </div>
      ) : null}

      {!isLoading && !loadError && locations.length === 0 ? (
        <div className="stock-empty-state">
          <h4>No items in this session</h4>
          <p>This inventory count has no snapshot items yet.</p>
        </div>
      ) : null}

      {!isLoading && !loadError && locations.length > 0 ? (
        <>
          <div className="inventory-count-session-body">
            <aside className="inventory-count-session-rail" aria-label="Locations">
              {locations.map((location) => {
                const isSelected = location.id === selectedLocation?.id
                return (
                  <button
                    key={location.id}
                    type="button"
                    className={`inventory-count-session-rail-item is-${location.status}${isSelected ? ' is-selected' : ''}`}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-pressed={isSelected}
                    onClick={() => selectLocation(location.id)}
                  >
                    <span className={`inventory-count-session-rail-badge is-${location.status}`} aria-hidden="true">
                      {location.status === 'completed' ? '✓' : location.status === 'current' ? '●' : '○'}
                    </span>
                    <span className="inventory-count-session-rail-copy">
                      <span className="inventory-count-session-rail-title">{location.name}</span>
                      <span className="inventory-count-session-rail-state">
                        {LOCATION_STATE_LABEL[location.status]}
                      </span>
                    </span>
                    <span className="inventory-count-session-rail-progress">
                      {location.countedItems} / {location.totalItems}
                    </span>
                  </button>
                )
              })}
            </aside>

            <div className="inventory-count-session-main">
              <div className="inventory-count-session-toolbar">
                <div className="inventory-count-session-toolbar-left">
                  <label className="inventory-count-session-search">
                    <span className="sr-only">Search items</span>
                    <input
                      type="search"
                      className="inventory-count-session-search-input"
                      placeholder={`Search ${selectedLocationName} items...`}
                      disabled
                      aria-disabled="true"
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-session-filter-btn"
                    disabled
                    aria-disabled="true"
                  >
                    Filter
                  </button>
                </div>

                <article className="inventory-count-session-progress-card" aria-label="Session progress">
                  <p className="inventory-count-session-progress-percent">{progress.percentage}%</p>
                  <p className="inventory-count-session-progress-primary">
                    {progress.totalCounted} / {progress.totalIncluded} counted
                  </p>
                  <p className="inventory-count-session-progress-secondary">
                    {progress.completedLocations} / {progress.totalLocations} locations complete
                  </p>
                  <p className="inventory-count-session-progress-secondary">
                    {progress.skipped} skipped
                  </p>
                </article>
              </div>

              <div className="inventory-count-session-table-wrap" aria-label={`${selectedLocationName} items`}>
                {selectedLocation?.items.length === 0 ? (
                  <div className="stock-empty-state">
                    <h4>No items in this location</h4>
                    <p>No snapshot items were found for {selectedLocationName}.</p>
                  </div>
                ) : (
                  <table className="inventory-count-session-table">
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Unit</th>
                        <th scope="col">Expected</th>
                        <th scope="col">Counted</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedLocation?.items ?? []).map((item) => (
                        <tr key={item.id} className={`is-status-${item.status.toLowerCase()}`}>
                          <td className="inventory-count-session-item-name">{item.name}</td>
                          <td>{item.unit}</td>
                          <td>{item.expected}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Counted quantity for ${item.name}`}
                              value={item.counted}
                              onChange={(event) => handleCountedChange(item.id, event.target.value)}
                              style={COUNTED_INPUT_STYLE}
                              autoComplete="off"
                            />
                          </td>
                          <td>
                            <span className={`inventory-count-session-status-pill is-${item.status.toLowerCase()}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <footer className="inventory-count-session-footer">
            <div className="inventory-count-session-footer-left">
              <span className="inventory-count-session-footer-label">Session status</span>
              <span className="inventory-count-session-footer-value">
                {sessionStatusLabel} · {selectedLocationName}
              </span>
            </div>
            <div className="inventory-count-session-footer-middle">
              <span className="inventory-count-session-footer-label">Unsaved changes</span>
              <span className="inventory-count-session-footer-value">{unsavedLabel}</span>
            </div>
            <div className="inventory-count-session-footer-right">
              <button
                type="button"
                className="ghost-btn inventory-count-session-action-btn"
                disabled={!canGoPrevious}
                aria-disabled={!canGoPrevious}
                onClick={handlePrevious}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost-btn inventory-count-session-action-btn"
                disabled={!canGoNext}
                aria-disabled={!canGoNext}
                onClick={handleNext}
              >
                Next
              </button>
              <button
                type="button"
                className="primary-btn inventory-count-session-action-btn"
                disabled={!canCompleteLocation}
                aria-disabled={!canCompleteLocation}
                onClick={() => {
                  void handleCompleteLocation()
                }}
              >
                {isCompletingLocation ? 'Completing…' : 'Complete Location'}
              </button>
            </div>
          </footer>
        </>
      ) : null}

      {completionMessage ? (
        <p className="inventory-count-session-completion-message" role="status">
          {completionMessage}
        </p>
      ) : null}
    </section>
  )
}
