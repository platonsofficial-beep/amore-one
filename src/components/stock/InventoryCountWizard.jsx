import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  createInventoryCountSessionWithSnapshot,
  listInventoryCountStorageLocations,
} from '../../services/inventoryCountService'
import { t } from '../../i18n/i18n'

const COUNT_TYPES = [
  {
    id: 'new',
    title: t("New count"),
    description: t("Complete inventory count for selected locations."),
    icon: '▣',
  },
  {
    id: 'quick',
    title: t("Quick count"),
    description: t("Count only selected inventory items."),
    icon: '✦',
  },
  {
    id: 'partial',
    title: t("Partial count"),
    description: t("Count one department or storage location."),
    icon: '◫',
  },
  {
    id: 'scheduled',
    title: t("Scheduled count"),
    description: t("Create a planned inventory session."),
    icon: '◷',
  },
  {
    id: 'emergency',
    title: t("Emergency count"),
    description: t("Immediate stock verification."),
    icon: '◉',
  },
]

const LOCATION_CARD_ICON = '▦'

const COUNT_VISIBILITY_OPTIONS = [
  {
    id: 'blind',
    title: t("Blind count"),
    description: t("Hide expected quantities while counting."),
    helper: t("Recommended for accurate stock counts."),
    icon: '◌',
    recommended: true,
  },
  {
    id: 'open',
    title: t("Open count"),
    description: t("Show expected quantities while counting."),
    helper: t("Useful for training or quick verification."),
    icon: '◎',
    recommended: false,
  },
]

const SESSION_NOTE_MAX_LENGTH = 250

const STEP_COPY = {
  1: {
    label: t("Step 1 of 4"),
    name: t("Count type"),
    subtitle: t("Create a new inventory counting session."),
  },
  2: {
    label: t("Step 2 of 4"),
    name: 'Storages',
    subtitle: t("Select the locations that will be included in this inventory count."),
  },
  3: {
    label: t("Step 3 of 4"),
    name: t("Count settings"),
    subtitle: t("Configure how this inventory session will be performed."),
  },
  4: {
    label: t("Step 4 of 4"),
    name: t("Review & start"),
    subtitle: t("Review the session details before starting."),
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
  const { workspace } = useAuth()
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedLocations, setSelectedLocations] = useState([])
  const [availableLocations, setAvailableLocations] = useState([])
  const [locationsStatus, setLocationsStatus] = useState('idle')
  const [locationsError, setLocationsError] = useState('')
  const [countVisibility, setCountVisibility] = useState('blind')
  const [includeZeroStock, setIncludeZeroStock] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [sessionNote, setSessionNote] = useState('')
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [startError, setStartError] = useState('')
  const startRequestIdRef = useRef(0)
  const startInFlightRef = useRef(false)
  const locationsRequestIdRef = useRef(0)

  useEffect(() => {
    if (!isOpen) {
      startRequestIdRef.current += 1
      startInFlightRef.current = false
      locationsRequestIdRef.current += 1
      const initial = createInitialWizardState()
      setStep(initial.step)
      setSelectedType(initial.selectedType)
      setSelectedLocations(initial.selectedLocations)
      setAvailableLocations([])
      setLocationsStatus('idle')
      setLocationsError('')
      setCountVisibility(initial.countVisibility)
      setIncludeZeroStock(initial.includeZeroStock)
      setIncludeInactive(initial.includeInactive)
      setSessionNote(initial.sessionNote)
      setIsStartingSession(false)
      setStartError('')
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isStartingSession) {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, isStartingSession])

  useEffect(() => {
    if (!isOpen) return undefined

    const workspaceId = `${workspace?.id ?? ''}`.trim()
    const requestId = locationsRequestIdRef.current + 1
    locationsRequestIdRef.current = requestId
    setLocationsStatus('loading')
    setLocationsError('')

    if (!workspaceId) {
      setAvailableLocations([])
      setSelectedLocations([])
      setLocationsStatus('error')
      setLocationsError('Workspace is required.')
      return undefined
    }

    void listInventoryCountStorageLocations(workspaceId)
      .then((locations) => {
        if (locationsRequestIdRef.current !== requestId) return
        const nextLocations = Array.isArray(locations) ? locations : []
        setAvailableLocations(nextLocations)
        setSelectedLocations((current) => current.filter((location) => nextLocations.includes(location)))
        setLocationsStatus('ready')
        setLocationsError('')
      })
      .catch((error) => {
        if (locationsRequestIdRef.current !== requestId) return
        setAvailableLocations([])
        setSelectedLocations([])
        setLocationsStatus('error')
        setLocationsError(error?.message || t("Unable to load storage locations right now."))
      })

    return undefined
  }, [isOpen, workspace?.id])

  if (!isOpen) return null

  const stepCopy = STEP_COPY[step] ?? STEP_COPY[1]
  const selectedCountType = COUNT_TYPES.find((type) => type.id === selectedType) ?? null
  const selectedVisibility = COUNT_VISIBILITY_OPTIONS.find((option) => option.id === countVisibility)
    ?? COUNT_VISIBILITY_OPTIONS[0]
  const selectedLocationItems = availableLocations
    .filter((location) => selectedLocations.includes(location))
    .map((location) => ({ id: location, title: location }))
  const trimmedNote = sessionNote.trim()
  const locationsReady = locationsStatus === 'ready' && availableLocations.length > 0
  const isStep4Valid = Boolean(selectedType)
    && selectedLocationItems.length > 0
    && (countVisibility === 'blind' || countVisibility === 'open')

  const canContinue = step === 1
    ? Boolean(selectedType)
    : step === 2
      ? locationsReady && selectedLocations.length > 0
      : step === 3
        ? true
        : isStep4Valid

  const primaryActionLabel = step === 4
    ? (isStartingSession ? 'Starting…' : t("Start count"))
    : 'Continue'
  const isPrimaryDisabled = !canContinue || isStartingSession

  const handleClose = () => {
    if (isStartingSession) return
    onClose?.()
  }

  const toggleLocation = (locationId) => {
    setSelectedLocations((current) => (
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId]
    ))
  }

  const handleBack = () => {
    if (isStartingSession) return
    if (step > 1) {
      setStartError('')
      setStep((current) => current - 1)
    }
  }

  const handleContinue = () => {
    if (isStartingSession) return

    if (step === 1) {
      if (!selectedType) return
      setStep(2)
      return
    }

    if (step === 2) {
      if (!(locationsStatus === 'ready' && availableLocations.length > 0 && selectedLocations.length > 0)) {
        return
      }
      setStep(3)
      return
    }

    if (step === 3) {
      setStartError('')
      setStep(4)
      return
    }

    if (step === 4) {
      if (!isStep4Valid) return
      void startInventoryCountSession()
    }
  }

  const startInventoryCountSession = async () => {
    if (startInFlightRef.current || !isStep4Valid) return

    const workspaceId = `${workspace?.id ?? ''}`.trim()
    if (!workspaceId) {
      setStartError('Workspace is required.')
      return
    }

    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId
    startInFlightRef.current = true
    setIsStartingSession(true)
    setStartError('')

    try {
      const { session, snapshot } = await createInventoryCountSessionWithSnapshot({
        workspaceId,
        countType: selectedType,
        visibility: countVisibility,
        includeZeroStock,
        includeInactive,
        note: trimmedNote,
        locations: selectedLocationItems.map((location) => location.id),
      })

      if (startRequestIdRef.current !== requestId) return

      onStartSession?.({
        sessionId: session.id,
        session,
        snapshot,
      })
    } catch (error) {
      if (startRequestIdRef.current !== requestId) return
      setStartError(error?.message || t("Unable to start inventory count session right now."))
    } finally {
      if (startRequestIdRef.current === requestId) {
        startInFlightRef.current = false
        setIsStartingSession(false)
      }
    }
  }

  const handleSessionNoteChange = (event) => {
    setSessionNote(event.target.value.slice(0, SESSION_NOTE_MAX_LENGTH))
  }

  return (
    <div
      className="employee-modal-backdrop inventory-count-wizard-backdrop"
      onClick={handleClose}
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
              {t("New count")}
            </h2>
            <p id="inventory-count-wizard-subtitle" className="inventory-count-wizard-subtitle">
              {stepCopy.subtitle}
            </p>
          </div>
          <div className="inventory-count-wizard-header-actions">
            <button
              type="button"
              className="icon-btn inventory-count-wizard-close-btn"
              onClick={handleClose}
              aria-label={t("Close")}
              disabled={isStartingSession}
              aria-disabled={isStartingSession}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="inventory-count-wizard-step" aria-label={t("Wizard progress")}>
          <p className="inventory-count-wizard-step-label">{stepCopy.label}</p>
          <p className="inventory-count-wizard-step-name">{stepCopy.name}</p>
        </div>

        {startError ? (
          <div className="staff-status-banner" role="alert">
            {startError}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="inventory-count-wizard-body">
            <div className="inventory-count-front-door">
              {COUNT_TYPES.filter((countType) => countType.id === 'new' || countType.id === 'partial').map((countType) => (
                <button
                  key={countType.id}
                  type="button"
                  className={`inventory-count-door-choice${selectedType === countType.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedType(countType.id)}
                >
                  <span className="inventory-count-door-icon" aria-hidden="true">{countType.icon}</span>
                  <span className="inventory-count-door-copy">
                    <span className="inventory-count-type-card-title">
                      {countType.title}
                    </span>
                    <span className="inventory-count-type-card-description">
                      {countType.id === 'new'
                        ? t("Count every storage.")
                        : t("Count one storage.")}
                    </span>
                    <span className="inventory-count-door-effort">
                      {countType.id === 'new' ? t("Takes longer") : t("Usually faster")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <details className="inventory-count-more-types">
              <summary>{t("More options")}</summary>
          <div
            role="radiogroup"
            aria-label={t("Count type")}
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
            </details>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="inventory-count-wizard-step2">
            {locationsStatus === 'loading' ? (
              <div className="staff-status-banner" role="status">
                {t("Loading storage locations…")}
              </div>
            ) : null}

            {locationsStatus === 'error' ? (
              <div className="staff-status-banner" role="alert">
                {locationsError || t("Unable to load storage locations right now.")}
              </div>
            ) : null}

            {locationsStatus === 'ready' && availableLocations.length === 0 ? (
              <div className="stock-empty-state inventory-count-wizard-locations-empty" role="status">
                <h4>{t("No storage locations available")}</h4>
                <p>
                  {t('Stock items need a storage location before a count can begin. Add storage locations to your stock items, then start a new count.')}
                </p>
              </div>
            ) : null}

            {locationsStatus === 'ready' && availableLocations.length > 0 ? (
              <div
                className="inventory-count-wizard-body inventory-count-wizard-body-locations"
                role="group"
                aria-label={t("Storages")}
              >
                <p className="inventory-count-wizard-location-note">
                  {t("Only storages that already have products are listed. Empty storages are not part of a count.")}
                </p>
                {availableLocations.map((location) => {
                  const isSelected = selectedLocations.includes(location)
                  return (
                    <button
                      key={location}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      className={`inventory-count-type-card inventory-count-location-card${isSelected ? ' is-selected' : ''}`}
                      onClick={() => toggleLocation(location)}
                    >
                      {isSelected ? (
                        <span className="inventory-count-type-card-badge" aria-hidden="true">
                          ✓
                        </span>
                      ) : (
                        <span className="inventory-count-location-checkbox" aria-hidden="true" />
                      )}
                      <span className="inventory-count-type-card-icon" aria-hidden="true">
                        {LOCATION_CARD_ICON}
                      </span>
                      <span className="inventory-count-type-card-copy">
                        <span className="inventory-count-type-card-title">{location}</span>
                        <span className="inventory-count-type-card-description">
                          {t("Venue stock location")}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="inventory-count-wizard-step3">
            <div
              className="inventory-count-wizard-body inventory-count-wizard-body-visibility"
              role="radiogroup"
              aria-label={t("Count Visibility")}
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
                          <span className="inventory-count-recommended-pill">{t("Recommended")}</span>
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

            <div className="inventory-count-wizard-options" aria-label={t("Inventory options")}>
              <button
                type="button"
                role="switch"
                aria-checked={includeZeroStock}
                className={`inventory-count-option-toggle${includeZeroStock ? ' is-on' : ''}`}
                onClick={() => setIncludeZeroStock((current) => !current)}
              >
                <span className="inventory-count-option-toggle-copy">
                  <span className="inventory-count-option-toggle-title">{t("Include zero-stock items")}</span>
                  <span className="inventory-count-option-toggle-description">
                    {t("Include items currently expected to be zero.")}
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
                  <span className="inventory-count-option-toggle-title">{t("Include inactive items")}</span>
                  <span className="inventory-count-option-toggle-description">
                    {t("Include archived or inactive inventory items.")}
                  </span>
                </span>
                <span className="inventory-count-option-switch" aria-hidden="true">
                  <span className="inventory-count-option-switch-thumb" />
                </span>
              </button>
            </div>

            <label className="inventory-count-session-note">
              <span className="inventory-count-session-note-label">{t("Session note")}</span>
              <textarea
                className="inventory-count-session-note-input"
                value={sessionNote}
                onChange={handleSessionNoteChange}
                maxLength={SESSION_NOTE_MAX_LENGTH}
                rows={3}
                placeholder={t("Add an optional note for this inventory session...")}
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
              <section className="inventory-count-review-card" aria-label={t("Count type summary")}>
                <div className="inventory-count-review-card-header">
                  <h3 className="inventory-count-review-card-title">{t("Count type")}</h3>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-review-change-btn"
                    disabled={isStartingSession}
                    aria-disabled={isStartingSession}
                    onClick={() => {
                      if (isStartingSession) return
                      setStartError('')
                      setStep(1)
                    }}
                  >
                    {t("Change")}
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

              <section className="inventory-count-review-card" aria-label={t("Locations summary")}>
                <div className="inventory-count-review-card-header">
                  <h3 className="inventory-count-review-card-title">{t("Locations")}</h3>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-review-change-btn"
                    disabled={isStartingSession}
                    aria-disabled={isStartingSession}
                    onClick={() => {
                      if (isStartingSession) return
                      setStartError('')
                      setStep(2)
                    }}
                  >
                    {t("Change")}
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

              <section className="inventory-count-review-card" aria-label={t("Count settings summary")}>
                <div className="inventory-count-review-card-header">
                  <h3 className="inventory-count-review-card-title">{t("Count settings")}</h3>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-review-change-btn"
                    disabled={isStartingSession}
                    aria-disabled={isStartingSession}
                    onClick={() => {
                      if (isStartingSession) return
                      setStartError('')
                      setStep(3)
                    }}
                  >
                    {t("Change")}
                  </button>
                </div>
                <dl className="inventory-count-review-dl">
                  <div>
                    <dt>{t("Visibility")}</dt>
                    <dd>
                      {selectedVisibility.title}
                      <span className="inventory-count-review-plain">
                        {selectedVisibility.id === 'blind'
                          ? "Counters don't see expected quantities."
                          : t("Counters see expected quantities.")}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Include zero-stock items")}</dt>
                    <dd>{includeZeroStock ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt>{t("Include inactive items")}</dt>
                    <dd>{includeInactive ? 'Yes' : 'No'}</dd>
                  </div>
                  {trimmedNote ? (
                    <div className="inventory-count-review-note-row">
                      <dt>{t("Session note")}</dt>
                      <dd>{trimmedNote}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="inventory-count-review-card inventory-count-review-card-meta" aria-label={t("Session meta")}>
                <div className="inventory-count-review-meta-grid">
                  <div>
                    <p className="inventory-count-review-meta-label">{t("Estimated items")}</p>
                    <p className="inventory-count-review-meta-value">—</p>
                    <p className="inventory-count-review-meta-hint">
                      {t("The exact item total will be calculated when the session starts.")}
                    </p>
                  </div>
                  <div>
                    <p className="inventory-count-review-meta-label">{t("Operator")}</p>
                    <p className="inventory-count-review-meta-value">{t("Current signed-in operator")}</p>
                  </div>
                  <div>
                    <p className="inventory-count-review-meta-label">{t("Start time")}</p>
                    <p className="inventory-count-review-meta-value">{t("Starts when confirmed")}</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="inventory-count-review-info" aria-label={t("Snapshot explanation")}>
              <span className="inventory-count-review-info-icon" aria-hidden="true">ℹ</span>
              <div className="inventory-count-review-info-copy">
                <p>
                  {t("ONE will freeze the expected stock quantities when this session starts.")}
                </p>
                <p>
                  {t("Stock received or used while counting will be reconciled against the time each item is counted, so posting will not double-count or overwrite later movements.")}
                </p>
              </div>
            </aside>

            {countVisibility === 'open' || includeInactive ? (
              <div className="inventory-count-review-warnings" aria-label={t("Session warnings")}>
                {countVisibility === 'open' ? (
                  <p className="inventory-count-review-warning">
                    {t("Expected quantities will be visible while counting.")}
                  </p>
                ) : null}
                {includeInactive ? (
                  <p className="inventory-count-review-warning">
                    {t("Inactive inventory items will be included.")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <footer className="inventory-count-wizard-footer">
          {step > 1 ? (
            <button
              type="button"
              className="ghost-btn inventory-count-wizard-nav-btn"
              disabled={isStartingSession}
              aria-disabled={isStartingSession}
              onClick={handleBack}
            >
              {t("Back")}
            </button>
          ) : null}
          <div className="inventory-count-wizard-footer-end">
            <button
              type="button"
              className="ghost-btn inventory-count-wizard-nav-btn"
              onClick={handleClose}
              disabled={isStartingSession}
              aria-disabled={isStartingSession}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="primary-btn inventory-count-wizard-nav-btn inventory-count-wizard-continue-btn"
              disabled={isPrimaryDisabled}
              aria-disabled={isPrimaryDisabled}
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
