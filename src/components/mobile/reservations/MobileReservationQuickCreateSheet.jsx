import { useEffect, useMemo, useRef, useState } from 'react'
import { ReservationDateField } from '../../reservations/ReservationDateField'
import { ReservationPhoneField } from '../../reservations/ReservationPhoneField'
import { ReservationTimeSelect } from '../../reservations/ReservationTimeSelect'
import {
  handleReservationFormEnterKey,
  preventReservationFormSubmit,
} from '../../../lib/reservationFormNavigation'
import { normalizeReservationDateKey } from '../../../lib/timeFormatUtils'
import { usePublishedFloorPlan } from '../../../lib/PublishedFloorPlanContext'
import { getActiveSeatingsForDate } from '../../../lib/reservationSeatings'
import {
  applyHostQuickCreateFormPatch,
  buildHostQuickCreateAvailabilityKey,
  createHostQuickCreateFormState,
  EMPTY_HOST_QUICK_CREATE_FORM,
  formatHostQuickCreateSeatingOptionLabel,
  refreshHostQuickCreateAssignedUnits,
  syncHostQuickCreateLayoutContext,
  toggleHostQuickCreateTableSelection,
} from '../../../lib/hostQuickCreateForm'
import { HostQuickCreateTableField } from './HostQuickCreateTableField'

function HostReservationQuickCreateFields({
  form,
  setForm,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  nameError,
  onNameValidationError,
  todayKey,
  isSaving,
  onClose,
  onSubmit,
  seatings = [],
  reservations = [],
  layout = null,
}) {
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])

  const activeSeatings = useMemo(
    () => getActiveSeatingsForDate(seatings, form.date || todayKey),
    [form.date, seatings, todayKey],
  )
  const zones = layout?.zones ?? []

  const updateForm = (patch) => {
    setForm((current) => applyHostQuickCreateFormPatch(current, patch, {
      layout,
      seatings,
      reservations,
    }))
  }

  const handleSelectTable = (unit) => {
    setForm((current) => {
      const toggled = toggleHostQuickCreateTableSelection(current, unit, {
        layout,
        reservations,
        seatings,
      })
      const patch = {
        assignedUnits: toggled.assignedUnits,
      }
      if (toggled.assignedUnits.length === 0) {
        patch.extraChairs = 0
      }
      return applyHostQuickCreateFormPatch(current, patch, {
        layout,
        seatings,
        reservations,
      })
    })
  }

  const handleClearTable = () => {
    updateForm({ assignedUnits: [], extraChairs: 0, tableSelectionNotice: '' })
  }

  const handleToggleExtraChair = () => {
    setForm((current) => applyHostQuickCreateFormPatch(current, {
      extraChairs: (Number(current.extraChairs) || 0) > 0 ? 0 : 1,
    }, {
      layout,
      seatings,
      reservations,
    }))
  }

  const handleSave = async () => {
    const trimmedFirstName = `${firstName}`.trim()
    const trimmedLastName = `${lastName}`.trim()

    if (!trimmedFirstName || !trimmedLastName) {
      onNameValidationError?.('Please provide the guest name.')
      return
    }

    onNameValidationError?.('')
    await onSubmit?.({
      ...formRef.current,
      guestName: `${trimmedFirstName} ${trimmedLastName}`.trim(),
    })
  }

  return (
    <form
      className="mobile-host-reservation-form"
      onSubmit={preventReservationFormSubmit}
      onKeyDownCapture={handleReservationFormEnterKey}
    >
      <div className="mobile-host-form-row">
        <label className="mobile-host-form-field">
          <span>First name</span>
          <input
            type="text"
            value={firstName}
            onChange={(event) => {
              onNameValidationError?.('')
              onFirstNameChange?.(event.target.value)
            }}
            placeholder="First name"
            required
            autoComplete="given-name"
          />
        </label>

        <label className="mobile-host-form-field">
          <span>Last name</span>
          <input
            type="text"
            value={lastName}
            onChange={(event) => {
              onNameValidationError?.('')
              onLastNameChange?.(event.target.value)
            }}
            placeholder="Last name"
            required
            autoComplete="family-name"
          />
        </label>
      </div>

      {nameError ? (
        <div className="mobile-host-reservations-notice" role="alert">{nameError}</div>
      ) : null}

      <label className="mobile-host-form-field">
        <span>Phone</span>
        <ReservationPhoneField
          value={form.phone}
          onChange={(phone) => updateForm({ phone })}
          placeholder="Optional"
        />
      </label>

      <label className="mobile-host-form-field">
        <span>Date</span>
        <ReservationDateField
          value={form.date}
          onChange={(date) => updateForm({ date })}
          todayKey={todayKey}
          required
        />
      </label>

      <div className="mobile-host-form-row">
        <label className="mobile-host-form-field">
          <span>Time</span>
          <ReservationTimeSelect
            value={form.time}
            onChange={(time) => updateForm({ time })}
          />
        </label>

        <label className="mobile-host-form-field">
          <span>Party size</span>
          <input
            type="number"
            min="1"
            value={form.guests}
            onChange={(event) => updateForm({ guests: event.target.value })}
            required
          />
        </label>
      </div>

      <div className="mobile-host-form-row">
        <label className="mobile-host-form-field">
          <span>Seating</span>
          <select
            value={form.seatingId ?? ''}
            onChange={(event) => updateForm({
              seatingId: event.target.value || null,
            })}
            data-testid="host-quick-create-seating"
          >
            <option value="">Choose a seating</option>
            {activeSeatings.map((seating) => (
              <option key={seating.id} value={seating.id}>
                {formatHostQuickCreateSeatingOptionLabel(seating)}
              </option>
            ))}
          </select>
        </label>

        <label className="mobile-host-form-field">
          <span>Area</span>
          <select
            value={form.seatingAreaId}
            onChange={(event) => updateForm({ seatingAreaId: event.target.value })}
            disabled={zones.length === 0}
            data-testid="host-quick-create-area"
          >
            <option value="">Choose an area</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.label}</option>
            ))}
          </select>
        </label>
      </div>

      <HostQuickCreateTableField
        form={form}
        layout={layout}
        reservations={reservations}
        seatings={seatings}
        onSelectTable={handleSelectTable}
        onClearTable={handleClearTable}
        onToggleExtraChair={handleToggleExtraChair}
      />

      <label className="mobile-host-form-field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) => updateForm({ notes: event.target.value })}
          placeholder="Allergies, occasion, seating preference"
        />
      </label>

      <p className="mobile-host-form-hint">
        Pending status · tap date or calendar to change service day
      </p>

      <div className="mobile-host-reservation-form-actions">
        <button
          type="button"
          className="mobile-secondary-btn"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button type="button" className="mobile-primary-btn" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save reservation'}
        </button>
      </div>
    </form>
  )
}

export function MobileReservationQuickCreateSheet({
  isOpen = false,
  todayKey = '',
  isSaving = false,
  variant = 'sheet',
  prefill = null,
  seatings = [],
  reservations = [],
  onClose,
  onSubmit,
}) {
  const { layout } = usePublishedFloorPlan()
  const [form, setForm] = useState(EMPTY_HOST_QUICK_CREATE_FORM)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nameError, setNameError] = useState('')
  const wasOpenRef = useRef(false)
  const availabilityKey = useMemo(
    () => buildHostQuickCreateAvailabilityKey(form, reservations, layout),
    [form.date, form.time, form.seatingId, form.seatingAreaId, form.guests, layout, reservations],
  )

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      return
    }

    if (wasOpenRef.current) return
    wasOpenRef.current = true

    setForm(createHostQuickCreateFormState({
      ...prefill,
      date: normalizeReservationDateKey(prefill?.date ?? todayKey),
      guests: `${prefill?.guests ?? '2'}`,
      phone: `${prefill?.phone ?? ''}`,
      time: `${prefill?.time ?? ''}`,
      notes: `${prefill?.notes ?? ''}`,
      seatingId: prefill?.seatingId ?? null,
      seatingAreaId: prefill?.seatingAreaId ?? '',
      area: `${prefill?.area ?? ''}`,
      assignedUnits: Array.isArray(prefill?.assignedUnits) ? prefill.assignedUnits : [],
      seatingManuallyOverridden: Boolean(prefill?.seatingManuallyOverridden),
    }, { todayKey, layout, seatings }))
    setFirstName('')
    setLastName('')
    setNameError('')
  }, [isOpen, prefill, todayKey, layout, seatings])

  useEffect(() => {
    if (!isOpen) return
    setForm((current) => syncHostQuickCreateLayoutContext(current, {
      layout,
      seatings,
    }))
  }, [isOpen, layout, seatings])

  useEffect(() => {
    if (!isOpen) return
    setForm((current) => refreshHostQuickCreateAssignedUnits(current, {
      layout,
      seatings,
      reservations,
    }))
  }, [isOpen, layout, seatings, availabilityKey])

  if (!isOpen) return null

  const handleClose = () => {
    if (isSaving) return
    setForm(EMPTY_HOST_QUICK_CREATE_FORM)
    setFirstName('')
    setLastName('')
    setNameError('')
    onClose?.()
  }

  const handleSubmit = async (nextForm) => {
    const saved = await onSubmit?.(nextForm)
    if (saved !== false) {
      setForm(EMPTY_HOST_QUICK_CREATE_FORM)
      setFirstName('')
      setLastName('')
      setNameError('')
    }
    return saved
  }

  const handleNameValidationError = (message) => {
    setNameError(`${message ?? ''}`.trim())
  }

  const header = (
    <header className="mobile-host-reservation-panel-header">
      <div className="mobile-host-reservation-panel-header-copy">
        <p className="mobile-screen-eyebrow">New reservation</p>
        <h2 className="mobile-host-reservation-panel-title">Quick create</h2>
      </div>
      <button
        type="button"
        className="mobile-sheet-close-btn"
        onClick={handleClose}
        aria-label="Close"
      >
        ✕
      </button>
    </header>
  )

  const fields = (
    <HostReservationQuickCreateFields
      form={form}
      setForm={setForm}
      firstName={firstName}
      lastName={lastName}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      nameError={nameError}
      onNameValidationError={handleNameValidationError}
      todayKey={todayKey}
      isSaving={isSaving}
      onClose={handleClose}
      onSubmit={handleSubmit}
      seatings={seatings}
      reservations={reservations}
      layout={layout}
    />
  )

  if (variant === 'inline') {
    return (
      <div className="mobile-host-reservation-inline-panel host-station-form-surface" role="region" aria-label="Create reservation">
        {header}
        <div className="mobile-host-reservation-inline-body">
          {fields}
        </div>
      </div>
    )
  }

  if (variant === 'panel') {
    return (
      <div className="mobile-host-panel-backdrop" onClick={handleClose}>
        <div
          className="mobile-host-panel-dialog mobile-host-reservation-panel host-station-form-surface"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-host-reservation-create-title"
        >
          <div id="mobile-host-reservation-create-title" className="sr-only">Create reservation</div>
          {header}
          <div className="mobile-host-reservation-panel-body">
            {fields}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-sheet-backdrop" onClick={handleClose}>
      <div
        className="mobile-sheet mobile-host-reservation-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-host-reservation-create-title"
      >
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <header className="mobile-sheet-header">
          <div className="mobile-sheet-header-copy">
            <p className="mobile-screen-eyebrow">New reservation</p>
            <h2 id="mobile-host-reservation-create-title" className="mobile-sheet-title">
              Quick create
            </h2>
          </div>
          <button
            type="button"
            className="mobile-sheet-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="mobile-sheet-body">
          {fields}
        </div>
      </div>
    </div>
  )
}
