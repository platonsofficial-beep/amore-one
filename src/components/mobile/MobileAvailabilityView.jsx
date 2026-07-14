import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EMPLOYEE_AVAILABILITY_STATUS,
  normalizeAvailabilityWeek,
  setAvailabilityForDay,
} from '../../lib/employeeAvailabilityUtils'
import {
  cloneAvailabilityWeek,
  getFriendlyAvailabilityError,
  getMobileAvailabilityDayTitle,
  isAvailabilityWeekDirty,
  MOBILE_AVAILABILITY_STATUS_OPTIONS,
} from '../../lib/mobileAvailabilityPresentation'
import {
  getEmployeeAvailabilityWeek,
  saveEmployeeAvailabilityWeek,
} from '../../services/availabilityService'

function normalizeTimeInputValue(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return null
  return raw.slice(0, 5)
}

export function MobileAvailabilityView({
  workspaceId = '',
  employeeId = '',
  weekStartDate = '',
  weekLabel = '',
  needsEmployeeLink = false,
  isContextLoading = false,
  contextError = '',
  onRetryContext,
  onDirtyChange,
}) {
  const [savedWeek, setSavedWeek] = useState(null)
  const [draftWeek, setDraftWeek] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const isDirty = useMemo(() => {
    if (!savedWeek || !draftWeek) return false
    return isAvailabilityWeekDirty(savedWeek, draftWeek)
  }, [savedWeek, draftWeek])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const loadWeek = useCallback(async () => {
    if (needsEmployeeLink || !employeeId || !workspaceId || !weekStartDate) {
      setSavedWeek(null)
      setDraftWeek(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError('')
    setSuccessMessage('')

    try {
      const week = await getEmployeeAvailabilityWeek({
        workspaceId,
        employeeId,
        weekStartDate,
      })
      const normalizedWeek = normalizeAvailabilityWeek(week)
      setSavedWeek(normalizedWeek)
      setDraftWeek(cloneAvailabilityWeek(normalizedWeek))
    } catch (error) {
      setLoadError(getFriendlyAvailabilityError(error, 'Unable to load availability right now.'))
      setSavedWeek(null)
      setDraftWeek(null)
    } finally {
      setIsLoading(false)
    }
  }, [employeeId, needsEmployeeLink, weekStartDate, workspaceId])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  const handleDayStatusChange = (dayOfWeek, status) => {
    setDraftWeek((current) => setAvailabilityForDay(current ?? { days: [] }, dayOfWeek, { status }))
    setSaveError('')
    setSuccessMessage('')
  }

  const handleDayFieldChange = (dayOfWeek, patch) => {
    setDraftWeek((current) => setAvailabilityForDay(current ?? { days: [] }, dayOfWeek, patch))
    setSaveError('')
    setSuccessMessage('')
  }

  const handleSave = async () => {
    if (!draftWeek || needsEmployeeLink || !employeeId || !workspaceId || !weekStartDate) return

    setIsSaving(true)
    setSaveError('')
    setSuccessMessage('')

    try {
      const saved = await saveEmployeeAvailabilityWeek({
        workspaceId,
        employeeId,
        weekStartDate,
        week: draftWeek,
      })
      const normalizedWeek = normalizeAvailabilityWeek(saved)
      setSavedWeek(normalizedWeek)
      setDraftWeek(cloneAvailabilityWeek(normalizedWeek))
      setSuccessMessage('Availability updated successfully.')
    } catch (error) {
      setSaveError(getFriendlyAvailabilityError(error))
    } finally {
      setIsSaving(false)
    }
  }

  if (needsEmployeeLink) {
    return (
      <div className="mobile-screen mobile-availability">
        <header className="mobile-screen-header">
          <p className="mobile-screen-eyebrow">My availability</p>
          <h1 className="mobile-screen-title">Weekly availability</h1>
        </header>
        <section className="mobile-card tone-neutral">
          <p className="mobile-card-detail">Link your employee profile to submit availability.</p>
        </section>
      </div>
    )
  }

  if (isContextLoading) {
    return (
      <div className="mobile-screen mobile-availability">
        <header className="mobile-screen-header">
          <p className="mobile-screen-eyebrow">My availability</p>
          <h1 className="mobile-screen-title">Weekly availability</h1>
        </header>
        <section className="mobile-card tone-neutral" aria-live="polite">
          <p className="mobile-card-detail">Loading availability…</p>
        </section>
      </div>
    )
  }

  if (contextError) {
    return (
      <div className="mobile-screen mobile-availability">
        <header className="mobile-screen-header">
          <p className="mobile-screen-eyebrow">My availability</p>
          <h1 className="mobile-screen-title">Weekly availability</h1>
        </header>
        <section className="mobile-availability-banner mobile-availability-banner-error" role="alert">
          <p>{getFriendlyAvailabilityError(new Error(contextError))}</p>
          {onRetryContext ? (
            <button type="button" className="mobile-secondary-btn" onClick={onRetryContext}>
              Retry
            </button>
          ) : null}
        </section>
      </div>
    )
  }

  return (
    <div className="mobile-screen mobile-availability">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">My availability</p>
        <h1 className="mobile-screen-title">Weekly availability</h1>
        {weekLabel ? <p className="mobile-screen-subtitle">{weekLabel}</p> : null}
      </header>

      {isLoading ? (
        <section className="mobile-card tone-neutral" aria-live="polite">
          <p className="mobile-card-detail">Loading availability…</p>
        </section>
      ) : null}

      {loadError ? (
        <section className="mobile-availability-banner mobile-availability-banner-error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="mobile-secondary-btn" onClick={loadWeek}>
            Retry
          </button>
        </section>
      ) : null}

      {successMessage ? (
        <section className="mobile-availability-banner mobile-availability-banner-success" role="status">
          <p>{successMessage}</p>
        </section>
      ) : null}

      {saveError ? (
        <section className="mobile-availability-banner mobile-availability-banner-error" role="alert">
          <p>{saveError}</p>
          <button type="button" className="mobile-secondary-btn" onClick={handleSave} disabled={isSaving}>
            Retry
          </button>
        </section>
      ) : null}

      {!isLoading && !loadError && draftWeek ? (
        <div className="mobile-availability-days">
          {draftWeek.days.map((entry) => (
            <article key={entry.dayOfWeek} className="mobile-card mobile-availability-day-card">
              <div className="mobile-availability-day-head">
                <h2 className="mobile-availability-day-title">{getMobileAvailabilityDayTitle(entry.dayOfWeek)}</h2>
              </div>

              <label className="mobile-availability-field">
                <span className="mobile-availability-field-label">Availability status</span>
                <select
                  className="mobile-availability-select"
                  value={entry.status}
                  onChange={(event) => handleDayStatusChange(entry.dayOfWeek, event.target.value)}
                  disabled={isSaving}
                >
                  {MOBILE_AVAILABILITY_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mobile-availability-time-grid">
                <label className="mobile-availability-field">
                  <span className="mobile-availability-field-label">Start time (optional)</span>
                  <input
                    type="time"
                    className="mobile-availability-input"
                    value={entry.startTime ?? ''}
                    onChange={(event) => handleDayFieldChange(entry.dayOfWeek, {
                      startTime: normalizeTimeInputValue(event.target.value),
                    })}
                    disabled={isSaving}
                  />
                </label>

                <label className="mobile-availability-field">
                  <span className="mobile-availability-field-label">End time (optional)</span>
                  <input
                    type="time"
                    className="mobile-availability-input"
                    value={entry.endTime ?? ''}
                    onChange={(event) => handleDayFieldChange(entry.dayOfWeek, {
                      endTime: normalizeTimeInputValue(event.target.value),
                    })}
                    disabled={isSaving}
                  />
                </label>
              </div>

              <label className="mobile-availability-field">
                <span className="mobile-availability-field-label">Note (optional)</span>
                <textarea
                  className="mobile-availability-textarea"
                  rows={2}
                  value={entry.note ?? ''}
                  placeholder="Add a note for this day"
                  onChange={(event) => handleDayFieldChange(entry.dayOfWeek, {
                    note: `${event.target.value ?? ''}`.trim() || null,
                  })}
                  disabled={isSaving}
                />
              </label>

              {entry.status === EMPLOYEE_AVAILABILITY_STATUS.UNAVAILABLE.key ? (
                <p className="mobile-availability-day-hint">Marked unavailable for scheduling reference.</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && !loadError && draftWeek ? (
        <div className="mobile-availability-actions">
          <button
            type="button"
            className="mobile-primary-btn mobile-availability-save-btn"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            {isSaving ? 'Saving…' : 'Save Availability'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
