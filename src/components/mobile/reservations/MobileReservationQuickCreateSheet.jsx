import { useEffect, useState } from 'react'
import { ReservationDateField } from '../../reservations/ReservationDateField'
import { ReservationTimeSelect } from '../../reservations/ReservationTimeSelect'
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

export function MobileReservationQuickCreateSheet({
  isOpen = false,
  todayKey = '',
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!isOpen) return
    setForm({
      ...EMPTY_FORM,
      date: normalizeReservationDateKey(todayKey),
    })
  }, [isOpen, todayKey])

  if (!isOpen) return null

  const handleClose = () => {
    if (isSaving) return
    setForm(EMPTY_FORM)
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onSubmit?.(form)
    setForm(EMPTY_FORM)
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

        <form className="mobile-sheet-body mobile-host-reservation-form" onSubmit={handleSubmit}>
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
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((current) => ({
                ...current,
                phone: event.target.value,
              }))}
              placeholder="Optional"
              autoComplete="tel"
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

          <div className="mobile-sheet-actions">
            <button
              type="button"
              className="mobile-secondary-btn"
              onClick={handleClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="mobile-primary-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
