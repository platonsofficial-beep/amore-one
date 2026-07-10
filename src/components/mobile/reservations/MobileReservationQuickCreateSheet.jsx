import { useEffect, useState } from 'react'
import { ReservationDateField } from '../../reservations/ReservationDateField'
import { ReservationPhoneField } from '../../reservations/ReservationPhoneField'
import { ReservationTimeSelect } from '../../reservations/ReservationTimeSelect'
import {
  handleReservationFormEnterKey,
  preventReservationFormSubmit,
} from '../../../lib/reservationFormNavigation'
import { normalizeReservationDateKey } from '../../../lib/timeFormatUtils'

const EMPTY_FORM = {
  guestName: '',
  phone: '',
  date: '',
  time: '',
  guests: '2',
  notes: '',
  tableNumber: '',
}

function HostReservationQuickCreateFields({
  form,
  setForm,
  todayKey,
  isSaving,
  onClose,
  onSubmit,
}) {
  const handleSave = async () => {
    await onSubmit?.(form)
  }

  return (
    <form
      className="mobile-host-reservation-form"
      onSubmit={preventReservationFormSubmit}
      onKeyDownCapture={handleReservationFormEnterKey}
    >
      <label className="mobile-host-form-field">
        <span>Guest name</span>
        <input
          type="text"
          value={form.guestName}
          onChange={(event) => setForm((current) => ({
            ...current,
            guestName: event.target.value,
          }))}
          placeholder="Guest name"
          required
          autoComplete="name"
        />
      </label>

      <label className="mobile-host-form-field">
        <span>Phone</span>
        <ReservationPhoneField
          value={form.phone}
          onChange={(phone) => setForm((current) => ({ ...current, phone }))}
          placeholder="Optional"
        />
      </label>

      <label className="mobile-host-form-field">
        <span>Date</span>
        <ReservationDateField
          value={form.date}
          onChange={(date) => setForm((current) => ({ ...current, date }))}
          todayKey={todayKey}
          required
        />
      </label>

      <div className="mobile-host-form-row">
        <label className="mobile-host-form-field">
          <span>Time</span>
          <ReservationTimeSelect
            value={form.time}
            onChange={(time) => setForm((current) => ({ ...current, time }))}
          />
        </label>

        <label className="mobile-host-form-field">
          <span>Party size</span>
          <input
            type="number"
            min="1"
            value={form.guests}
            onChange={(event) => setForm((current) => ({
              ...current,
              guests: event.target.value,
            }))}
            required
          />
        </label>
      </div>

      <label className="mobile-host-form-field">
        <span>Table (optional)</span>
        <input
          type="text"
          value={form.tableNumber}
          onChange={(event) => setForm((current) => ({
            ...current,
            tableNumber: event.target.value,
          }))}
          placeholder="Table or section"
        />
      </label>

      <label className="mobile-host-form-field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) => setForm((current) => ({
            ...current,
            notes: event.target.value,
          }))}
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
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!isOpen) return
    setForm({
      ...EMPTY_FORM,
      ...prefill,
      date: normalizeReservationDateKey(prefill?.date ?? todayKey),
      guests: `${prefill?.guests ?? '2'}`,
      tableNumber: `${prefill?.tableNumber ?? ''}`,
      phone: `${prefill?.phone ?? ''}`,
      guestName: `${prefill?.guestName ?? ''}`,
      time: `${prefill?.time ?? ''}`,
      notes: `${prefill?.notes ?? ''}`,
      seatingId: prefill?.seatingId ?? null,
      assignedUnits: Array.isArray(prefill?.assignedUnits) ? prefill.assignedUnits : [],
      area: `${prefill?.area ?? ''}`,
    })
  }, [isOpen, prefill, todayKey])

  if (!isOpen) return null

  const handleClose = () => {
    if (isSaving) return
    setForm(EMPTY_FORM)
    onClose?.()
  }

  const handleSubmit = async (nextForm) => {
    const saved = await onSubmit?.(nextForm)
    if (saved !== false) {
      setForm(EMPTY_FORM)
    }
    return saved
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
      todayKey={todayKey}
      isSaving={isSaving}
      onClose={handleClose}
      onSubmit={handleSubmit}
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
