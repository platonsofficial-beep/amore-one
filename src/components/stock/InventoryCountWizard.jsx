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

const COUNT_VISIBILITY_OPTIONS = [
  {
    id: 'blind',
    title: 'Blind Count',
    description: 'Hide expected quantities while counting.',
    helper: 'Recommended for accurate stock counts.',
    icon: '◌',
    recommended: true,
  },
  {
    id: 'open',
    title: 'Open Count',
    description: 'Show expected quantities while counting.',
    helper: 'Useful for training or quick verification.',
    icon: '◎',
    recommended: false,
  },
]

const SESSION_NOTE_MAX_LENGTH = 250

const STEP_COPY = {
  1: {
    label: 'Step 1 of 4',
    name: 'Count Type',
    subtitle: 'Create a new inventory counting session.',
  },
  2: {
    label: 'Step 2 of 4',
    name: 'Scope / Locations',
    subtitle: 'Select the locations that will be included in this inventory count.',
  },
  3: {
    label: 'Step 3 of 4',
    name: 'Count Settings',
    subtitle: 'Configure how this inventory session will be performed.',
  },
  4: {
    label: 'Step 4 of 4',
    name: 'Review & Start',
    subtitle: 'Review the session details before starting.',
  },
}

function createInitialWizardState() {
  return {
    step: 1,
    selectedType: null,
    selectedLocations: [],
    countVisibility: 'blind',
    includeZeroStock: true,
    includeInactive: false,
    sessionNote: '',
  }
}

export function InventoryCountWizard({ isOpen, onClose, onStartSession }) {
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedLocations, setSelectedLocations] = useState([])
  const [countVisibility, setCountVisibility] = useState('blind')
  const [includeZeroStock, setIncludeZeroStock] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [sessionNote, setSessionNote] = useState('')

  useEffect(() => {
    if (!isOpen) {
      const initial = createInitialWizardState()
      setStep(initial.step)
      setSelectedType(initial.selectedType)
      setSelectedLocations(initial.selectedLocations)
      setCountVisibility(initial.countVisibility)
      setIncludeZeroStock(initial.includeZeroStock)
      setIncludeInactive(initial.includeInactive)
      setSessionNote(initial.sessionNote)
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

  const stepCopy = STEP_COPY[step] ?? STEP_COPY[1]
  const selectedCountType = COUNT_TYPES.find((type) => type.id === selectedType) ?? null
  const selectedVisibility = COUNT_VISIBILITY_OPTIONS.find((option) => option.id === countVisibility)
    ?? COUNT_VISIBILITY_OPTIONS[0]
  const selectedLocationItems = DEMO_LOCATIONS.filter((location) => (
    selectedLocations.includes(location.id)
  ))
  const trimmedNote = sessionNote.trim()
  const isStep4Valid = Boolean(selectedType)
    && selectedLocations.length > 0
    && (countVisibility === 'blind' || countVisibility === 'open')

  const canContinue = step === 1
    ? Boolean(selectedType)
    : step === 2
      ? selectedLocations.length > 0
      : step === 3
        ? true
        : isStep4Valid

  const primaryActionLabel = step === 4 ? 'Start Inventory Count Session' : 'Continue'

  const toggleLocation = (locationId) => {
    setSelectedLocations((current) => (
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId]
    ))
  }

  const handleBack = () => {
    if (step > 1) {
      setStep((current) => current - 1)
    }
  }

  const handleContinue = () => {
    if (step === 1) {
      if (!selectedType) return
      setStep(2)
      return
    }

    if (step === 2) {
      if (selectedLocations.length === 0) return
      setStep(3)
      return
    }

    if (step === 3) {
      setStep(4)
      return
    }

    if (step === 4) {
      if (!isStep4Valid) return
      onStartSession?.()
    }
  }

  const handleSessionNoteChange = (event) => {
    setSessionNote(event.target.value.slice(0, SESSION_NOTE_MAX_LENGTH))
  }

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
              {stepCopy.subtitle}
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
          <p className="inventory-count-wizard-step-label">{stepCopy.label}</p>
          <p className="inventory-count-wizard-step-name">{stepCopy.name}</p>
        </div>

        {step === 1 ? (
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
        ) : null}

        {step === 2 ? (
          <div className="inventory-count-wizard-step2">
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
        ) : null}

        {step === 3 ? (
          <div className="inventory-count-wizard-step3">
            <div
              className="inventory-count-wizard-body inventory-count-wizard-body-visibility"
              role="radiogroup"
              aria-label="Count Visibility"
            >
              {COUNT_VISIBILITY_OPTIONS.map((option) => {
                const isSelected = countVisibility === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`inventory-count-type-card inventory-count-visibility-card${isSelected ? ' is-selected' : ''}${option.recommended ? ' is-recommended' : ''}`}
                    onClick={() => setCountVisibility(option.id)}
                  >
                    {isSelected ? (
                      <span className="inventory-count-type-card-badge" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                    <span className="inventory-count-type-card-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span className="inventory-count-type-card-copy">
                      <span className="inventory-count-visibility-title-row">
                        <span className="inventory-count-type-card-title">{option.title}</span>
                        {option.recommended ? (
                          <span className="inventory-count-recommended-pill">Recommended</span>
                        ) : null}
                      </span>
                      <span className="inventory-count-type-card-description">
                        {option.description}
                      </span>
                      <span className="inventory-count-visibility-helper">
                        {option.helper}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="inventory-count-wizard-options" aria-label="Inventory options">
              <button
                type="button"
                role="switch"
                aria-checked={includeZeroStock}
                className={`inventory-count-option-toggle${includeZeroStock ? ' is-on' : ''}`}
                onClick={() => setIncludeZeroStock((current) => !current)}
              >
                <span className="inventory-count-option-toggle-copy">
                  <span className="inventory-count-option-toggle-title">Include zero-stock items</span>
                  <span className="inventory-count-option-toggle-description">
                    Include items currently expected to be zero.
                  </span>
                </span>
                <span className="inventory-count-option-switch" aria-hidden="true">
                  <span className="inventory-count-option-switch-thumb" />
                </span>
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={includeInactive}
                className={`inventory-count-option-toggle${includeInactive ? ' is-on' : ''}`}
                onClick={() => setIncludeInactive((current) => !current)}
              >
                <span className="inventory-count-option-toggle-copy">
                  <span className="inventory-count-option-toggle-title">Include inactive items</span>
                  <span className="inventory-count-option-toggle-description">
                    Include archived or inactive inventory items.
                  </span>
                </span>
                <span className="inventory-count-option-switch" aria-hidden="true">
                  <span className="inventory-count-option-switch-thumb" />
                </span>
              </button>
            </div>

            <label className="inventory-count-session-note">
              <span className="inventory-count-session-note-label">Session note</span>
              <textarea
                className="inventory-count-session-note-input"
                value={sessionNote}
                onChange={handleSessionNoteChange}
                maxLength={SESSION_NOTE_MAX_LENGTH}
                rows={3}
                placeholder="Add an optional note for this inventory session..."
              />
              <span className="inventory-count-session-note-count">
                {sessionNote.length}/{SESSION_NOTE_MAX_LENGTH}
              </span>
            </label>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="inventory-count-wizard-step4">
            <div className="inventory-count-review-grid">
              <section className="inventory-count-review-card" aria-label="Count Type summary">
                <div className="inventory-count-review-card-header">
                  <h3 className="inventory-count-review-card-title">Count Type</h3>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-review-change-btn"
                    onClick={() => {
                      setStep(1)
                    }}
                  >
                    Change
                  </button>
                </div>
                {selectedCountType ? (
                  <div className="inventory-count-review-type">
                    <span className="inventory-count-type-card-icon" aria-hidden="true">
                      {selectedCountType.icon}
                    </span>
                    <span className="inventory-count-type-card-copy">
                      <span className="inventory-count-type-card-title">{selectedCountType.title}</span>
                      <span className="inventory-count-type-card-description">
                        {selectedCountType.description}
                      </span>
                    </span>
                  </div>
                ) : null}
              </section>

              <section className="inventory-count-review-card" aria-label="Locations summary">
                <div className="inventory-count-review-card-header">
                  <h3 className="inventory-count-review-card-title">Locations</h3>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-review-change-btn"
                    onClick={() => {
                      setStep(2)
                    }}
                  >
                    Change
                  </button>
                </div>
                <p className="inventory-count-review-meta">
                  {selectedLocationItems.length} location{selectedLocationItems.length === 1 ? '' : 's'}
                </p>
                <div className="inventory-count-review-chips">
                  {selectedLocationItems.map((location) => (
                    <span key={location.id} className="inventory-count-review-chip">
                      {location.title}
                    </span>
                  ))}
                </div>
              </section>

              <section className="inventory-count-review-card" aria-label="Count Settings summary">
                <div className="inventory-count-review-card-header">
                  <h3 className="inventory-count-review-card-title">Count Settings</h3>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-review-change-btn"
                    onClick={() => {
                      setStep(3)
                    }}
                  >
                    Change
                  </button>
                </div>
                <dl className="inventory-count-review-dl">
                  <div>
                    <dt>Visibility</dt>
                    <dd>{selectedVisibility.title}</dd>
                  </div>
                  <div>
                    <dt>Include zero-stock items</dt>
                    <dd>{includeZeroStock ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt>Include inactive items</dt>
                    <dd>{includeInactive ? 'Yes' : 'No'}</dd>
                  </div>
                  {trimmedNote ? (
                    <div className="inventory-count-review-note-row">
                      <dt>Session note</dt>
                      <dd>{trimmedNote}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="inventory-count-review-card inventory-count-review-card-meta" aria-label="Session meta">
                <div className="inventory-count-review-meta-grid">
                  <div>
                    <p className="inventory-count-review-meta-label">Estimated items</p>
                    <p className="inventory-count-review-meta-value">—</p>
                    <p className="inventory-count-review-meta-hint">
                      The exact item total will be calculated when the session starts.
                    </p>
                  </div>
                  <div>
                    <p className="inventory-count-review-meta-label">Operator</p>
                    <p className="inventory-count-review-meta-value">Current signed-in operator</p>
                  </div>
                  <div>
                    <p className="inventory-count-review-meta-label">Start time</p>
                    <p className="inventory-count-review-meta-value">Starts when confirmed</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="inventory-count-review-info" aria-label="Snapshot explanation">
              <span className="inventory-count-review-info-icon" aria-hidden="true">ℹ</span>
              <div className="inventory-count-review-info-copy">
                <p>
                  ONE will freeze the expected stock quantities when this session starts.
                </p>
                <p>
                  Stock received or used while counting will be reconciled against the time each item is counted, so posting will not double-count or overwrite later movements.
                </p>
              </div>
            </aside>

            {countVisibility === 'open' || includeInactive ? (
              <div className="inventory-count-review-warnings" aria-label="Session warnings">
                {countVisibility === 'open' ? (
                  <p className="inventory-count-review-warning">
                    Expected quantities will be visible while counting.
                  </p>
                ) : null}
                {includeInactive ? (
                  <p className="inventory-count-review-warning">
                    Inactive inventory items will be included.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <footer className="inventory-count-wizard-footer">
          <button
            type="button"
            className="ghost-btn inventory-count-wizard-nav-btn"
            disabled={step === 1}
            aria-disabled={step === 1}
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
              {primaryActionLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
