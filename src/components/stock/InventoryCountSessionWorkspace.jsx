import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getInventoryCountSessionItems,
  getInventoryCountSessionLocations,
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
  const status = formatLineStatus(item.lineStatus)
  return {
    id: item.id,
    name: item.itemName || 'Untitled item',
    unit: item.unit || '—',
    expected: formatQuantity(item.expectedSnapshot),
    counted: item.countedQuantity === null || item.countedQuantity === undefined
      ? ''
      : formatQuantity(item.countedQuantity),
    status,
    storageLocation: item.storageLocation || 'Other',
    lineStatus: `${item.lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending',
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
    const countedItems = items.filter((item) => (
      item.lineStatus === 'counted' || item.lineStatus === 'skipped'
    )).length
    const totalItems = items.length

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
      id: locationKey,
      name: locationKey,
      status,
      countedItems,
      totalItems,
      items,
    })
  })

  itemsByLocation.forEach((items, locationKey) => {
    if (seen.has(locationKey)) return
    const countedItems = items.filter((item) => (
      item.lineStatus === 'counted' || item.lineStatus === 'skipped'
    )).length
    locations.push({
      id: locationKey,
      name: locationKey,
      status: 'not_started',
      countedItems,
      totalItems: items.length,
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
  const loadRequestIdRef = useRef(0)

  useEffect(() => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId

    let cancelled = false

    const loadSessionItems = async () => {
      setIsLoading(true)
      setLoadError('')
      setCompletionMessage('')

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

    return () => {
      cancelled = true
    }
  }, [sessionIdProp, workspaceIdProp, workspace?.id])

  const selectedIndex = locations.findIndex((location) => location.id === selectedLocationId)
  const selectedLocation = locations[selectedIndex] ?? locations[0] ?? null
  const progress = getSessionProgress(locations)

  const canGoPrevious = selectedIndex > 0
  const canGoNext = selectedIndex >= 0 && selectedIndex < locations.length - 1
  const canCompleteLocation = Boolean(selectedLocation) && selectedLocation.status !== 'completed'

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

  const handleCompleteLocation = () => {
    if (!selectedLocation || selectedLocation.status === 'completed') return

    const nextIncomplete = locations.find((location) => (
      location.id !== selectedLocation.id && location.status !== 'completed'
    ))

    setLocations((current) => current.map((location) => {
      if (location.id === selectedLocation.id) {
        return {
          ...location,
          status: 'completed',
          countedItems: location.totalItems,
          items: location.items.map((item) => ({
            ...item,
            status: 'Counted',
            lineStatus: 'counted',
            counted: item.counted || '0',
          })),
        }
      }

      if (nextIncomplete && location.id === nextIncomplete.id) {
        return {
          ...location,
          status: 'current',
        }
      }

      if (location.status === 'current' && location.id !== nextIncomplete?.id) {
        return {
          ...location,
          status: 'not_started',
        }
      }

      return location
    }))

    if (nextIncomplete) {
      setSelectedLocationId(nextIncomplete.id)
      setCompletionMessage('')
      return
    }

    setCompletionMessage('All locations are complete. Finish Count will be added next.')
  }

  const selectedLocationName = selectedLocation?.name ?? 'Location'

  return (
    <section className="inventory-count-session" aria-label="Inventory Count Session Workspace">
      <header className="inventory-count-session-header">
        <div className="inventory-count-session-header-copy">
          <p className="inventory-count-session-eyebrow">Inventory Count Session</p>
          <div className="inventory-count-session-meta">
            <span className="inventory-count-session-pill is-status">In Progress</span>
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
          <button type="button" className="ghost-btn inventory-count-session-action-btn" disabled aria-disabled="true">
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

      {loadError ? (
        <div className="staff-status-banner" role="alert">
          {loadError}
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
                          <td>{item.counted || '—'}</td>
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
                In Progress · {selectedLocationName}
              </span>
            </div>
            <div className="inventory-count-session-footer-middle">
              <span className="inventory-count-session-footer-label">Unsaved changes</span>
              <span className="inventory-count-session-footer-value">All changes saved</span>
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
                onClick={handleCompleteLocation}
              >
                Complete Location
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
