import { useEffect, useMemo, useRef, useState } from 'react'
import { ReservationDateField } from '../../reservations/ReservationDateField'
import { ReservationPhoneField } from '../../reservations/ReservationPhoneField'
import { HostQuickCreateTimePicker } from './HostQuickCreateTimePicker'
import { GUEST_TYPE_OPTIONS } from '../../../lib/reservationCustomerType'
import { HOST_RESERVATION_STATUSES } from '../../../lib/reservationHostStatus'
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
import { buildQuickCreateEditHydration } from './hostQuickCreateEditHydration'

const EDIT_RESERVATION_STATUSES = HOST_RESERVATION_STATUSES.map((entry) => entry.id)

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
  mode = 'create',
  primaryActionLabel = 'Save reservation',
  showPendingHint = true,
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
    const isEditMode = mode === 'edit'
    const isWalkInMode = mode === 'walk-in'

    if (isWalkInMode) {
      if (!trimmedFirstName && !trimmedLastName) {
        onNameValidationError?.('Please provide at least a first name or last name')
        return
      }
    } else if (!trimmedFirstName || (!isEditMode && !trimmedLastName)) {
      onNameValidationError?.('Please provide the guest name.')
      return
    }

    onNameValidationError?.('')
    const guestName = trimmedLastName
      ? `${trimmedFirstName} ${trimmedLastName}`.trim()
      : trimmedFirstName

    await onSubmit?.({
      ...formRef.current,
      guestName,
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
            required={mode === 'create'}
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
            required={mode !== 'edit'}
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
          <HostQuickCreateTimePicker
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

      <div className="mobile-host-form-row">
        <label className="mobile-host-form-field">
          <span>Guest Type</span>
          <select
            value={form.customerType ?? 'Regular'}
            onChange={(event) => updateForm({ customerType: event.target.value })}
            data-testid="host-quick-create-customer-type"
          >
            {GUEST_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {mode === 'edit' ? (
          <label className="mobile-host-form-field">
            <span>Status</span>
            <select
              value={form.status ?? 'Pending'}
              onChange={(event) => updateForm({ status: event.target.value })}
              data-testid="host-quick-create-status"
            >
              {EDIT_RESERVATION_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="mobile-host-form-field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) => updateForm({ notes: event.target.value })}
          placeholder="Allergies, occasion, seating preference"
        />
      </label>

      {showPendingHint ? (
        <p className="mobile-host-form-hint">
          Pending status · tap date or calendar to change service day
        </p>
      ) : null}

      <div className="mobile-host-reservation-form-actions">
        <button
          type="button"
          className="mobile-secondary-btn"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="mobile-primary-btn"
          onClick={handleSave}
          disabled={isSaving}
          data-testid="host-quick-create-primary-action"
        >
          {isSaving ? 'Saving…' : primaryActionLabel}
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
  mode = 'create',
  reservation = null,
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
  const [editGuestTitle, setEditGuestTitle] = useState('Edit reservation')
  const openSessionRef = useRef(null)
  const isEditMode = mode === 'edit'
  const isWalkInMode = mode === 'walk-in'

  const availabilityReservations = useMemo(() => {
    if (!isEditMode || !reservation?.id) return reservations
    return reservations.filter((entry) => String(entry.id) !== String(reservation.id))
  }, [isEditMode, reservation?.id, reservations])

  const availabilityKey = useMemo(
    () => buildHostQuickCreateAvailabilityKey(form, availabilityReservations, layout),
    [form.date, form.time, form.seatingId, form.seatingAreaId, form.guests, layout, availabilityReservations],
  )

  useEffect(() => {
    if (!isOpen) {
      openSessionRef.current = null
      return
    }

    const sessionKey = isEditMode ? `edit:${reservation?.id ?? ''}` : mode
    if (openSessionRef.current === sessionKey) return
    openSessionRef.current = sessionKey

    if (isEditMode && reservation) {
      const hydration = buildQuickCreateEditHydration(reservation, layout, seatings, todayKey)
      if (hydration) {
        setForm(hydration.quickForm)
        setFirstName(hydration.firstName)
        setLastName(hydration.lastName)
        setEditGuestTitle(hydration.guestTitle)
        setNameError('')
      }
      return
    }

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
    setEditGuestTitle('Edit reservation')
    setNameError('')
  }, [isOpen, isEditMode, mode, reservation, prefill, todayKey, layout, seatings])

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
      reservations: availabilityReservations,
    }))
  }, [isOpen, layout, seatings, availabilityKey, availabilityReservations])

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
    const submitForm = isWalkInMode ? { ...nextForm, walkIn: true } : nextForm
    const saved = isEditMode
      ? await onSubmit?.(reservation, submitForm, todayKey)
      : await onSubmit?.(submitForm)
    if (saved !== false) {
      setForm(EMPTY_HOST_QUICK_CREATE_FORM)
      setFirstName('')
      setLastName('')
      setEditGuestTitle('Edit reservation')
      setNameError('')
    }
    return saved
  }

  const handleNameValidationError = (message) => {
    setNameError(`${message ?? ''}`.trim())
  }

  const eyebrowLabel = isEditMode
    ? 'Edit reservation'
    : isWalkInMode
      ? 'NEW WALK-IN'
      : 'New reservation'
  const titleLabel = isEditMode ? editGuestTitle : 'Quick create'

  const header = (
    <header className="mobile-host-reservation-panel-header">
      <div className="mobile-host-reservation-panel-header-copy">
        <p className="mobile-screen-eyebrow" data-testid="host-quick-create-eyebrow">{eyebrowLabel}</p>
        <h2 className="mobile-host-reservation-panel-title">{titleLabel}</h2>
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
      reservations={availabilityReservations}
      layout={layout}
      mode={mode}
      primaryActionLabel={isEditMode ? 'Save changes' : isWalkInMode ? 'Seat Now' : 'Save reservation'}
      showPendingHint={!isEditMode && !isWalkInMode}
    />
  )

  const panelAriaLabel = isEditMode
    ? 'Edit reservation'
    : isWalkInMode
      ? 'Create walk-in'
      : 'Create reservation'
  const dialogTitleId = isEditMode
    ? 'mobile-host-reservation-edit-title'
    : isWalkInMode
      ? 'mobile-host-reservation-walk-in-title'
      : 'mobile-host-reservation-create-title'

  if (variant === 'inline') {
    return (
      <div
        className={`mobile-host-reservation-inline-panel host-station-form-surface${isEditMode ? ' is-edit' : ''}`}
        role="region"
        aria-label={panelAriaLabel}
        data-testid={isEditMode
          ? 'host-quick-create-edit-panel'
          : isWalkInMode
            ? 'host-quick-create-walk-in-panel'
            : 'host-quick-create-create-panel'}
      >
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
          aria-labelledby={dialogTitleId}
        >
          <div id={dialogTitleId} className="sr-only">{panelAriaLabel}</div>
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
        aria-labelledby={dialogTitleId}
      >
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <header className="mobile-sheet-header">
          <div className="mobile-sheet-header-copy">
            <p className="mobile-screen-eyebrow" data-testid="host-quick-create-eyebrow">{eyebrowLabel}</p>
            <h2 id={dialogTitleId} className="mobile-sheet-title">
              {titleLabel}
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
