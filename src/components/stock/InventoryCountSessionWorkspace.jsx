const DEMO_LOCATIONS = [
  { id: 'main-bar', title: 'Main Bar', state: 'completed', counted: 12, total: 12 },
  { id: 'main-storage', title: 'Main Storage', state: 'current', counted: 18, total: 38 },
  { id: 'coffee-station', title: 'Coffee Station', state: 'not_started', counted: 0, total: 24 },
  { id: 'wine-storage', title: 'Wine Storage', state: 'not_started', counted: 0, total: 41 },
  { id: 'kitchen', title: 'Kitchen', state: 'completed', counted: 29, total: 29 },
  { id: 'freezer', title: 'Freezer', state: 'completed', counted: 22, total: 22 },
  { id: 'other', title: 'Other', state: 'not_started', counted: 0, total: 16 },
]

const DEMO_ITEMS = [
  { id: '1', name: 'Absolut Vodka', unit: 'bottle', expected: '—', counted: '6', status: 'Counted' },
  { id: '2', name: 'Bombay Sapphire', unit: 'bottle', expected: '—', counted: '4', status: 'Counted' },
  { id: '3', name: "Jack Daniel's", unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
  { id: '4', name: 'Coca-Cola', unit: 'case', expected: '—', counted: '8', status: 'Counted' },
  { id: '5', name: 'Lime Juice', unit: 'litre', expected: '—', counted: '', status: 'Pending' },
  { id: '6', name: 'Espresso Beans', unit: 'kg', expected: '—', counted: '2.5', status: 'Counted' },
  { id: '7', name: 'Tonic Water', unit: 'case', expected: '—', counted: '', status: 'Skipped' },
  { id: '8', name: 'Simple Syrup', unit: 'litre', expected: '—', counted: '3', status: 'Counted' },
  { id: '9', name: 'Angostura Bitters', unit: 'bottle', expected: '—', counted: '', status: 'Pending' },
  { id: '10', name: 'Fresh Mint', unit: 'bunch', expected: '—', counted: '12', status: 'Counted' },
]

const LOCATION_STATE_LABEL = {
  completed: 'Completed',
  current: 'Current',
  not_started: 'Not started',
}

export function InventoryCountSessionWorkspace({ onExit }) {
  const currentLocation = DEMO_LOCATIONS.find((location) => location.state === 'current')
    ?? DEMO_LOCATIONS[0]

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
          {DEMO_LOCATIONS.map((location) => (
            <button
              key={location.id}
              type="button"
              className={`inventory-count-session-rail-item is-${location.state}`}
              aria-current={location.state === 'current' ? 'true' : undefined}
              disabled
              aria-disabled="true"
            >
              <span className={`inventory-count-session-rail-badge is-${location.state}`} aria-hidden="true">
                {location.state === 'completed' ? '✓' : location.state === 'current' ? '●' : '○'}
              </span>
              <span className="inventory-count-session-rail-copy">
                <span className="inventory-count-session-rail-title">{location.title}</span>
                <span className="inventory-count-session-rail-state">
                  {LOCATION_STATE_LABEL[location.state]}
                </span>
              </span>
              <span className="inventory-count-session-rail-progress">
                {location.counted} / {location.total}
              </span>
            </button>
          ))}
        </aside>

        <div className="inventory-count-session-main">
          <div className="inventory-count-session-toolbar">
            <div className="inventory-count-session-toolbar-left">
              <label className="inventory-count-session-search">
                <span className="sr-only">Search items</span>
                <input
                  type="search"
                  className="inventory-count-session-search-input"
                  placeholder={`Search ${currentLocation.title} items…`}
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
              <p className="inventory-count-session-progress-percent">63%</p>
              <p className="inventory-count-session-progress-primary">147 / 232 counted</p>
              <p className="inventory-count-session-progress-secondary">3 / 7 locations complete</p>
              <p className="inventory-count-session-progress-secondary">8 skipped</p>
            </article>
          </div>

          <div className="inventory-count-session-table-wrap" aria-label={`${currentLocation.title} items`}>
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
                {DEMO_ITEMS.map((item) => (
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
          <span className="inventory-count-session-footer-value">In Progress · {currentLocation.title}</span>
        </div>
        <div className="inventory-count-session-footer-middle">
          <span className="inventory-count-session-footer-label">Unsaved changes</span>
          <span className="inventory-count-session-footer-value">None (demo)</span>
        </div>
        <div className="inventory-count-session-footer-right">
          <button type="button" className="ghost-btn inventory-count-session-action-btn" disabled aria-disabled="true">
            Previous
          </button>
          <button type="button" className="ghost-btn inventory-count-session-action-btn" disabled aria-disabled="true">
            Next
          </button>
          <button type="button" className="primary-btn inventory-count-session-action-btn" disabled aria-disabled="true">
            Complete Location
          </button>
        </div>
      </footer>
    </section>
  )
}
