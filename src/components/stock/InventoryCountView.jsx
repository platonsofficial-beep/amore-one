import { useState } from 'react'
import { InventoryCountWizard } from './InventoryCountWizard'
import { InventoryCountSessionWorkspace } from './InventoryCountSessionWorkspace'

export function InventoryCountView() {
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isSessionOpen, setIsSessionOpen] = useState(false)

  if (isSessionOpen) {
    return (
      <InventoryCountSessionWorkspace
        onExit={() => setIsSessionOpen(false)}
      />
    )
  }

  return (
    <section className="inventory-count-page" aria-label="Inventory Count">
      <header className="inventory-count-header">
        <div className="inventory-count-header-copy">
          <h2 className="inventory-count-title">Inventory Count</h2>
          <p className="inventory-count-subtitle">
            Count inventory by location, review variances, and post verified stock levels.
          </p>
        </div>
        <button
          type="button"
          className="primary-btn inventory-count-start-btn"
          onClick={() => setIsWizardOpen(true)}
        >
          Start new count
        </button>
      </header>

      <div className="inventory-count-foundation-grid" aria-label="Inventory count status">
        <article className="panel staff-panel inventory-count-panel">
          <h3 className="inventory-count-panel-title">Active counts</h3>
          <div className="stock-empty-state">
            <h4>No active counts</h4>
            <p>No counts are currently in progress.</p>
          </div>
        </article>

        <article className="panel staff-panel inventory-count-panel">
          <h3 className="inventory-count-panel-title">Paused counts</h3>
          <div className="stock-empty-state">
            <h4>No paused counts</h4>
            <p>No paused counts.</p>
          </div>
        </article>

        <article className="panel staff-panel inventory-count-panel">
          <h3 className="inventory-count-panel-title">Recent counts</h3>
          <div className="stock-empty-state">
            <h4>No recent counts</h4>
            <p>Completed inventory counts will appear here.</p>
          </div>
        </article>
      </div>

      <aside className="panel staff-panel inventory-count-howto" aria-label="How Inventory Count will work">
        <h3 className="inventory-count-panel-title">How Inventory Count will work</h3>
        <ol className="inventory-count-howto-steps">
          <li>Choose locations or items</li>
          <li>Count and review variances</li>
          <li>Post verified stock levels</li>
        </ol>
      </aside>

      <InventoryCountWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onStartSession={() => {
          setIsWizardOpen(false)
          setIsSessionOpen(true)
        }}
      />
    </section>
  )
}
