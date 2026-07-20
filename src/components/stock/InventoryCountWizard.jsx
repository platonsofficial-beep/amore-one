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

const DEMO_LOCATIONS = [
  { id: 'main-bar', title: 'Main Bar', subtitle: 'Front-of-house bar stock', icon: '⌂' },
  { id: 'back-bar', title: 'Back Bar', subtitle: 'Secondary bar storage', icon: '▥' },
  { id: 'main-storage', title: 'Main Storage', subtitle: 'Primary dry storage', icon: '▦' },
  { id: 'kitchen', title: 'Kitchen', subtitle: 'Prep and line inventory', icon: '◈' },
  { id: 'coffee-station', title: 'Coffee Station', subtitle: 'Coffee and tea supplies', icon: '◎' },
  { id: 'wine-storage', title: 'Wine Storage', subtitle: 'Cellar and wine fridge', icon: '◇' },
  { id: 'freezer', title: 'Freezer', subtitle: 'Frozen goods', icon: '❅' },
  { id: 'other', title: 'Other', subtitle: 'Additional locations', icon: '▢' },
]

export function InventoryCountWizard({ isOpen, onClose }) {
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedLocations, setSelectedLocations] = useState([])
  const [showStep3Placeholder, setShowStep3Placeholder] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setSelectedType(null)
      setSelectedLocations([])
      setShowStep3Placeholder(false)
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

  const isStep1 = step === 1
  const canContinue = isStep1
    ? Boolean(selectedType)
    : selectedLocations.length > 0 && !showStep3Placeholder

  const toggleLocation = (locationId) => {
    setShowStep3Placeholder(false)
    setSelectedLocations((current) => (
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId]
    ))
  }

  const handleBack = () => {
    if (!isStep1) {
      setShowStep3Placeholder(false)
      setStep(1)
    }
  }

  const handleContinue = () => {
    if (isStep1) {
      if (!selectedType) return
      setStep(2)
      return
    }

    if (selectedLocations.length === 0) return
    setShowStep3Placeholder(true)
  }

  const subtitle = isStep1
    ? 'Create a new inventory counting session.'
    : 'Select the locations that will be included in this inventory count.'

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
              {subtitle}
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
          <p className="inventory-count-wizard-step-label">
            {isStep1 ? 'Step 1 of 4' : 'Step 2 of 4'}
          </p>
          <p className="inventory-count-wizard-step-name">
            {isStep1 ? 'Count Type' : 'Scope / Locations'}
          </p>
        </div>

        {isStep1 ? (
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
        ) : (
          <div className="inventory-count-wizard-step2">
            {showStep3Placeholder ? (
              <p className="inventory-count-wizard-placeholder" role="status">
                Step 3 coming next
              </p>
            ) : null}
            <div
              className="inventory-count-wizard-body inventory-count-wizard-body-locations"
              role="group"
              aria-label="Scope / Locations"
            >
              {DEMO_LOCATIONS.map((location) => {
                const isSelected = selectedLocations.includes(location.id)
                return (
                  <button
                    key={location.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    className={`inventory-count-type-card inventory-count-location-card${isSelected ? ' is-selected' : ''}`}
                    onClick={() => toggleLocation(location.id)}
                  >
                    {isSelected ? (
                      <span className="inventory-count-type-card-badge" aria-hidden="true">
                        ✓
                      </span>
                    ) : (
                      <span className="inventory-count-location-checkbox" aria-hidden="true" />
                    )}
                    <span className="inventory-count-type-card-icon" aria-hidden="true">
                      {location.icon}
                    </span>
                    <span className="inventory-count-type-card-copy">
                      <span className="inventory-count-type-card-title">{location.title}</span>
                      <span className="inventory-count-type-card-description">
                        {location.subtitle}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <footer className="inventory-count-wizard-footer">
          <button
            type="button"
            className="ghost-btn inventory-count-wizard-nav-btn"
            disabled={isStep1}
            aria-disabled={isStep1}
            onClick={handleBack}
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
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
