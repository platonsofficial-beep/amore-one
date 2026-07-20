import { useEffect, useState } from 'react'

const COUNT_TYPES = [
  {
    id: 'new',
    title: 'New Count',
    description: 'Complete inventory count for selected locations.',
    icon: '▣',
  },
  {
    id: 'quick',
    title: 'Quick Count',
    description: 'Count only selected inventory items.',
    icon: '✦',
  },
  {
    id: 'partial',
    title: 'Partial Count',
    description: 'Count one department or storage location.',
    icon: '◫',
  },
  {
    id: 'scheduled',
    title: 'Scheduled Count',
    description: 'Create a planned inventory session.',
    icon: '◷',
  },
  {
    id: 'emergency',
    title: 'Emergency Count',
    description: 'Immediate stock verification.',
    icon: '◉',
  },
]

export function InventoryCountWizard({ isOpen, onClose }) {
  const [selectedType, setSelectedType] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setSelectedType(null)
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const canContinue = Boolean(selectedType)

  return (
    <div
      className="employee-modal-backdrop inventory-count-wizard-backdrop"
      onClick={onClose}
    >
      <div
        className="inventory-count-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-count-wizard-title"
        aria-describedby="inventory-count-wizard-subtitle"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="inventory-count-wizard-header">
          <div className="inventory-count-wizard-header-copy">
            <h2 id="inventory-count-wizard-title" className="inventory-count-wizard-title">
              Inventory Count
            </h2>
            <p id="inventory-count-wizard-subtitle" className="inventory-count-wizard-subtitle">
              Create a new inventory counting session.
            </p>
          </div>
          <div className="inventory-count-wizard-header-actions">
            <button
              type="button"
              className="icon-btn inventory-count-wizard-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="inventory-count-wizard-step" aria-label="Wizard progress">
          <p className="inventory-count-wizard-step-label">Step 1 of 4</p>
          <p className="inventory-count-wizard-step-name">Count Type</p>
        </div>

        <div
          className="inventory-count-wizard-body"
          role="radiogroup"
          aria-label="Count Type"
        >
          {COUNT_TYPES.map((countType) => {
            const isSelected = selectedType === countType.id
            return (
              <button
                key={countType.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`inventory-count-type-card${isSelected ? ' is-selected' : ''}`}
                onClick={() => setSelectedType(countType.id)}
              >
                {isSelected ? (
                  <span className="inventory-count-type-card-badge" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
                <span className="inventory-count-type-card-icon" aria-hidden="true">
                  {countType.icon}
                </span>
                <span className="inventory-count-type-card-copy">
                  <span className="inventory-count-type-card-title">{countType.title}</span>
                  <span className="inventory-count-type-card-description">
                    {countType.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <footer className="inventory-count-wizard-footer">
          <button
            type="button"
            className="ghost-btn inventory-count-wizard-nav-btn"
            disabled
            aria-disabled="true"
          >
            Back
          </button>
          <div className="inventory-count-wizard-footer-end">
            <button
              type="button"
              className="ghost-btn inventory-count-wizard-nav-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-btn inventory-count-wizard-nav-btn inventory-count-wizard-continue-btn"
              disabled={!canContinue}
              aria-disabled={!canContinue}
            >
              Continue
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
