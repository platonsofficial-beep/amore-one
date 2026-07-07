import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PRIORITIES,
  announcementToForm,
  buildEmptyAnnouncementForm,
  getAnnouncementAudienceLabel,
  getAnnouncementPriorityLabel,
  hasAdvancedAnnouncementOptions,
  validateAnnouncementForm,
} from '../../lib/operationsAnnouncementUtils'
import { combineDateAndTime } from '../../lib/timeFormatUtils'
import { TimeSelect } from '../TimeSelect'

const PRIORITY_OPTIONS = ANNOUNCEMENT_PRIORITIES.map((id) => ({
  id,
  label: getAnnouncementPriorityLabel(id),
}))

const AUDIENCE_OPTIONS = ANNOUNCEMENT_AUDIENCES.map((id) => ({
  id,
  label: getAnnouncementAudienceLabel(id),
}))

export function OperationsAnnouncementFormModal({
  isOpen,
  announcement = null,
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => (
    announcement ? announcementToForm(announcement) : buildEmptyAnnouncementForm()
  ))
  const [showMoreOptions, setShowMoreOptions] = useState(() => (
    hasAdvancedAnnouncementOptions(announcement)
  ))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateAnnouncementForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setError('')
      await onSubmit({
        title: form.title.trim(),
        message: form.message.trim(),
        priority: form.priority,
        audience: form.audience || 'all',
        active: form.active,
        startsAt: combineDateAndTime(form.startsAtDate, form.startsAtTime),
        endsAt: combineDateAndTime(form.endsAtDate, form.endsAtTime),
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to publish right now.')
    }
  }

  return createPortal(
    <div
      className="employee-modal-backdrop task-modal-backdrop operations-form-backdrop"
      onClick={onClose}
    >
      <div
        className="employee-modal task-form-modal is-responsive-sheet operations-form-modal operations-announcement-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-announcement-form-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Announcements</p>
            <h3 id="operations-announcement-form-title">
              {announcement ? 'Edit' : 'New'}
            </h3>
          </div>
          <button type="button" className="icon-btn operations-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form
          className="employee-form operations-form operations-announcement-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className={`operations-announcement-form-content${showMoreOptions ? ' is-expanded' : ''}`}>
            <label className="form-field full-width">
              <span>Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => {
                  setError('')
                  setForm((current) => ({ ...current, title: event.target.value }))
                }}
                placeholder="Staff meeting Friday 20:00"
                autoFocus
              />
            </label>

            <label className="form-field full-width">
              <span>Message</span>
              <textarea
                rows={2}
                value={form.message}
                onChange={(event) => {
                  setError('')
                  setForm((current) => ({ ...current, message: event.target.value }))
                }}
                placeholder="New menu starts Monday"
              />
            </label>

            <fieldset className="operations-announcement-toggle-fieldset full-width">
              <legend>Priority</legend>
              <div className="operations-announcement-toggle-group" role="group" aria-label="Priority">
                {PRIORITY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`operations-announcement-toggle${form.priority === option.id ? ' active' : ''}`}
                    aria-pressed={form.priority === option.id}
                    onClick={() => setForm((current) => ({ ...current, priority: option.id }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              className="ghost-btn operations-announcement-more-toggle"
              onClick={() => setShowMoreOptions((current) => !current)}
              aria-expanded={showMoreOptions}
            >
              {showMoreOptions ? 'Hide options' : 'More options'}
            </button>

            {showMoreOptions ? (
              <div className="operations-announcement-more-options">
                <fieldset className="operations-announcement-toggle-fieldset full-width">
                  <legend>Audience</legend>
                  <div className="operations-announcement-toggle-group is-wrap" role="group" aria-label="Audience">
                    {AUDIENCE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`operations-announcement-toggle${form.audience === option.id ? ' active' : ''}`}
                        aria-pressed={form.audience === option.id}
                        onClick={() => setForm((current) => ({ ...current, audience: option.id }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="operations-announcement-schedule-grid">
                  <label className="form-field">
                    <span>Start date</span>
                    <input
                      type="date"
                      value={form.startsAtDate}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        startsAtDate: event.target.value,
                      }))}
                    />
                  </label>

                  <label className="form-field">
                    <span>Start time</span>
                    <TimeSelect
                      value={form.startsAtTime}
                      onChange={(time) => setForm((current) => ({ ...current, startsAtTime: time }))}
                      placeholder="Optional"
                    />
                  </label>

                  <label className="form-field">
                    <span>End date</span>
                    <input
                      type="date"
                      value={form.endsAtDate}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        endsAtDate: event.target.value,
                      }))}
                    />
                  </label>

                  <label className="form-field">
                    <span>End time</span>
                    <TimeSelect
                      value={form.endsAtTime}
                      onChange={(time) => setForm((current) => ({ ...current, endsAtTime: time }))}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions operations-announcement-form-actions">
            <button type="button" className="ghost-btn operations-form-action" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary-btn operations-form-action" disabled={isSaving}>
              {isSaving ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
