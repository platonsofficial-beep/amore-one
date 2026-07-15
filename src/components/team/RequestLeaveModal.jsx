import { useEffect, useRef, useState } from 'react'
import { LEAVE_TYPES } from '../../lib/leave/leaveConstants'
import { validateLeaveDates } from '../../lib/leave/leaveValidation'
import { requestLeave } from '../../services/leaveService'
import { LeaveHistoryPanel } from './LeaveHistoryPanel'

const LEAVE_TYPE_OPTIONS = LEAVE_TYPES.map((type) => ({
  value: type,
  label: `${type.charAt(0).toUpperCase()}${type.slice(1)}`,
}))

const SUCCESS_MESSAGE = 'Leave request submitted and pending approval.'

function buildFieldErrors({ leaveType, startDate, endDate }) {
  const nextErrors = {}
  const normalizedLeaveType = `${leaveType ?? ''}`.trim()
  const normalizedStartDate = `${startDate ?? ''}`.trim()
  const normalizedEndDate = `${endDate ?? ''}`.trim()

  if (!normalizedLeaveType) {
    nextErrors.leaveType = 'Leave type is required.'
  }

  if (!normalizedStartDate) {
    nextErrors.startDate = 'Start date is required.'
  }

  if (!normalizedEndDate) {
    nextErrors.endDate = 'End date is required.'
  }

  let dateValidation = { ok: false, error: '' }
  if (normalizedStartDate && normalizedEndDate) {
    dateValidation = validateLeaveDates({ startDate, endDate })
    if (!dateValidation.ok) {
      nextErrors.dateRange = dateValidation.error
    }
  }

  return {
    fieldErrors: nextErrors,
    dateValidation,
    isValid: Object.keys(nextErrors).length === 0 && dateValidation.ok,
  }
}

export function RequestLeaveActionButton({
  isVisible = false,
  onOpen,
}) {
  if (!isVisible) return null

  return (
    <button
      type="button"
      className="ghost-btn schedule-request-leave-btn"
      onClick={() => onOpen?.()}
      aria-haspopup="dialog"
    >
      Request Leave
    </button>
  )
}

export function RequestLeaveModal({
  isOpen,
  workspaceId,
  onClose,
}) {
  const [leaveType, setLeaveType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitInFlightRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    setLeaveType('')
    setStartDate('')
    setEndDate('')
    setNote('')
    setFieldErrors({})
    setErrorMessage('')
    setSuccessMessage('')
    setIsSubmitting(false)
    submitInFlightRef.current = false
  }, [isOpen])

  if (!isOpen) return null

  const handleClose = () => {
    if (isSubmitting) return
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting || submitInFlightRef.current) return

    setErrorMessage('')
    setSuccessMessage('')

    const validation = buildFieldErrors({ leaveType, startDate, endDate })
    if (!validation.isValid) {
      setFieldErrors(validation.fieldErrors)
      return
    }

    setFieldErrors({})
    submitInFlightRef.current = true
    setIsSubmitting(true)

    try {
      await requestLeave(workspaceId, {
        leaveType,
        startDate: validation.dateValidation.startDate,
        endDate: validation.dateValidation.endDate,
        note,
      })

      setSuccessMessage(SUCCESS_MESSAGE)
      window.setTimeout(() => {
        onClose?.()
      }, 1200)
    } catch (error) {
      submitInFlightRef.current = false
      setErrorMessage(error?.message || 'Unable to submit the leave request right now.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="employee-modal-backdrop" onClick={handleClose}>
      <div
        className="employee-modal blend-compact-modal request-leave-modal is-responsive-sheet"
        role="dialog"
        aria-labelledby="request-leave-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <style>{`
          .schedule-request-leave-btn,
          .request-leave-modal .primary-btn,
          .request-leave-modal .ghost-btn,
          .request-leave-modal .icon-btn {
            min-height: 44px;
            min-width: 44px;
          }
        `}</style>

        <div className="drawer-header">
          <div>
            <p className="eyebrow">Team</p>
            <h3 id="request-leave-title">Request Leave</h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={handleClose}
            aria-label="Close request leave dialog"
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <form className="request-leave-modal-form" onSubmit={handleSubmit}>
          <div className="request-leave-modal-body">
            {successMessage ? (
              <p className="request-leave-success" role="status">{successMessage}</p>
            ) : null}

            {errorMessage ? (
              <p className="request-leave-error" role="alert">{errorMessage}</p>
            ) : null}

            <label className="form-field full-width">
              <span>Leave Type</span>
              <select
                value={leaveType}
                onChange={(event) => setLeaveType(event.target.value)}
                disabled={isSubmitting || Boolean(successMessage)}
                aria-invalid={fieldErrors.leaveType ? 'true' : 'false'}
              >
                <option value="">Select leave type</option>
                {LEAVE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.leaveType ? (
                <span className="request-leave-field-error" role="alert">{fieldErrors.leaveType}</span>
              ) : null}
            </label>

            <div className="request-leave-date-grid">
              <label className="form-field">
                <span>Start Date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={isSubmitting || Boolean(successMessage)}
                  aria-invalid={fieldErrors.startDate || fieldErrors.dateRange ? 'true' : 'false'}
                />
                {fieldErrors.startDate ? (
                  <span className="request-leave-field-error" role="alert">{fieldErrors.startDate}</span>
                ) : null}
              </label>

              <label className="form-field">
                <span>End Date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={isSubmitting || Boolean(successMessage)}
                  aria-invalid={fieldErrors.endDate || fieldErrors.dateRange ? 'true' : 'false'}
                />
                {fieldErrors.endDate ? (
                  <span className="request-leave-field-error" role="alert">{fieldErrors.endDate}</span>
                ) : null}
              </label>
            </div>

            {fieldErrors.dateRange ? (
              <p className="request-leave-field-error" role="alert">{fieldErrors.dateRange}</p>
            ) : null}

            <label className="form-field full-width">
              <span>Note (optional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Add context for your manager"
                disabled={isSubmitting || Boolean(successMessage)}
              />
            </label>
          </div>

          <div className="drawer-footer request-leave-modal-footer">
            <button
              type="button"
              className="ghost-btn"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={isSubmitting || Boolean(successMessage)}
            >
              {isSubmitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>

        <LeaveHistoryPanel workspaceId={workspaceId} isActive={isOpen} />
      </div>
    </div>
  )
}
