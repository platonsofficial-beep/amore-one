import { useState } from 'react'

const LOCATION_STATE_LABEL = {
  completed: 'Completed',
  current: 'Current',
  not_started: 'Not started',
}

function createDemoLocations() {
  return [
    {
      id: 'main-bar',
      name: 'Main Bar',
      status: 'completed',
      countedItems: 5,
      totalItems: 5,
      items: [
        { id: 'mb-1', name: 'Absolut Vodka', unit: 'bottle', expected: '—', counted: '6', status: 'Counted' },
        { id: 'mb-2', name: 'Bombay Sapphire', unit: 'bottle', expected: '—', counted: '4', status: 'Counted' },
        { id: 'mb-3', name: "Jack Daniel's", unit: 'bottle', expected: '—', counted: '3', status: 'Counted' },
        { id: 'mb-4', name: 'Tonic Water', unit: 'case', expected: '—', counted: '8', status: 'Counted' },
        { id: 'mb-5', name: 'Lime Juice', unit: 'litre', expected: '—', counted: '2', status: 'Counted' },
      ],
    },
    {
      id: 'main-storage',
      name: 'Main Storage',
      status: 'current',
      countedItems: 2,
      totalItems: 5,
      items: [
        { id: 'ms-1', name: 'Coca-Cola', unit: 'case', expected: '—', counted: '10', status: 'Counted' },
        { id: 'ms-2', name: 'Sprite', unit: 'case', expected: '—', counted: '6', status: 'Counted' },
        { id: 'ms-3', name: 'San Pellegrino', unit: 'case', expected: '—', counted: '', status: 'Pending' },
        { id: 'ms-4', name: 'Napkins', unit: 'pack', expected: '—', counted: '', status: 'Pending' },
        { id: 'ms-5', name: 'Paper Straws', unit: 'box', expected: '—', counted: '', status: 'Pending' },
      ],
    },
    {
      id: 'coffee-station',
      name: 'Coffee Station',
      status: 'not_started',
      countedItems: 0,
      totalItems: 5,
      items: [
        { id: 'cs-1', name: 'Espresso Beans', unit: 'kg', expected: '—', counted: '', status: 'Pending' },
        { id: 'cs-2', name: 'Decaf Beans', unit: 'kg', expected: '—', counted: '', status: 'Pending' },
        { id: 'cs-3', name: 'Oat Milk', unit: 'litre', expected: '—', counted: '', status: 'Pending' },
        { id: 'cs-4', name: 'Sugar Sachets', unit: 'box', expected: '—', counted: '', status: 'Pending' },
        { id: 'cs-5', name: 'Tea Bags', unit: 'box', expected: '—', counted: '', status: 'Pending' },
      ],
    },
    {
      id: 'wine-storage',
      name: 'Wine Storage',
      status: 'not_started',
      countedItems: 0,
      totalItems: 5,
      items: [
        { id: 'ws-1', name: 'Prosecco', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
        { id: 'ws-2', name: 'Sauvignon Blanc', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
        { id: 'ws-3', name: 'Rosé', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
        { id: 'ws-4', name: 'Cabernet Sauvignon', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
        { id: 'ws-5', name: 'Champagne', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
      ],
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      status: 'completed',
      countedItems: 5,
      totalItems: 5,
      items: [
        { id: 'k-1', name: 'Olive Oil', unit: 'litre', expected: '—', counted: '4', status: 'Counted' },
        { id: 'k-2', name: 'Sea Salt', unit: 'kg', expected: '—', counted: '2', status: 'Counted' },
        { id: 'k-3', name: 'Chicken Fillet', unit: 'kg', expected: '—', counted: '8', status: 'Counted' },
        { id: 'k-4', name: 'Potatoes', unit: 'kg', expected: '—', counted: '12', status: 'Counted' },
        { id: 'k-5', name: 'Butter', unit: 'kg', expected: '—', counted: '3', status: 'Counted' },
      ],
    },
    {
      id: 'freezer',
      name: 'Freezer',
      status: 'completed',
      countedItems: 5,
      totalItems: 5,
      items: [
        { id: 'f-1', name: 'Frozen Berries', unit: 'kg', expected: '—', counted: '5', status: 'Counted' },
        { id: 'f-2', name: 'Ice Cream', unit: 'tub', expected: '—', counted: '6', status: 'Counted' },
        { id: 'f-3', name: 'Frozen Fries', unit: 'kg', expected: '—', counted: '10', status: 'Counted' },
        { id: 'f-4', name: 'Ice Bags', unit: 'bag', expected: '—', counted: '20', status: 'Counted' },
        { id: 'f-5', name: 'Frozen Bread', unit: 'loaf', expected: '—', counted: '8', status: 'Counted' },
      ],
    },
    {
      id: 'other',
      name: 'Other',
      status: 'not_started',
      countedItems: 0,
      totalItems: 5,
      items: [
        { id: 'o-1', name: 'Cleaning Liquid', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
        { id: 'o-2', name: 'Gloves', unit: 'box', expected: '—', counted: '', status: 'Pending' },
        { id: 'o-3', name: 'Bin Bags', unit: 'roll', expected: '—', counted: '', status: 'Pending' },
        { id: 'o-4', name: 'Foil', unit: 'roll', expected: '—', counted: '', status: 'Pending' },
        { id: 'o-5', name: 'Paper Towels', unit: 'pack', expected: '—', counted: '', status: 'Pending' },
      ],
    },
  ]
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
    skipped: 0,
  }
}

export function InventoryCountSessionWorkspace({ onExit }) {
  const [locations, setLocations] = useState(createDemoLocations)
  const [selectedLocationId, setSelectedLocationId] = useState('main-storage')
  const [completionMessage, setCompletionMessage] = useState('')

  const selectedIndex = locations.findIndex((location) => location.id === selectedLocationId)
  const selectedLocation = locations[selectedIndex] ?? locations[0]
  const progress = getSessionProgress(locations)

  const canGoPrevious = selectedIndex > 0
  const canGoNext = selectedIndex >= 0 && selectedIndex < locations.length - 1
  const canCompleteLocation = selectedLocation?.status !== 'completed'

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

      <div className="inventory-count-session-body">
        <aside className="inventory-count-session-rail" aria-label="Locations">
          {locations.map((location) => {
            const isSelected = location.id === selectedLocation.id
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
                  placeholder={`Search ${selectedLocation.name} items...`}
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

          <div className="inventory-count-session-table-wrap" aria-label={`${selectedLocation.name} items`}>
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
                {selectedLocation.items.map((item) => (
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
          </div>
        </div>
      </div>

      <footer className="inventory-count-session-footer">
        <div className="inventory-count-session-footer-left">
          <span className="inventory-count-session-footer-label">Session status</span>
          <span className="inventory-count-session-footer-value">
            In Progress · {selectedLocation.name}
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

      {completionMessage ? (
        <p className="inventory-count-session-completion-message" role="status">
          {completionMessage}
        </p>
      ) : null}
    </section>
  )
}
