import { useEffect, useState } from 'react'
import {
  createHostReservationEditForm,
  HostReservationEditPanel,
} from '../../reservations/HostReservationEditPanel'
import { usePublishedFloorPlan } from '../../../lib/PublishedFloorPlanContext'

export function MobileReservationHostEditSheet({
  reservation = null,
  todayKey = '',
  reservations = [],
  seatings = [],
  isSaving = false,
  variant = 'sheet',
  onClose,
  onSave,
  onDelete,
  onValidationError,
}) {
  const { layout } = usePublishedFloorPlan()
  const [form, setForm] = useState(null)

  useEffect(() => {
    setForm(reservation ? createHostReservationEditForm(reservation, layout, seatings) : null)
  }, [reservation, layout, seatings])

  if (!reservation) return null

  const handleSave = async () => {
    const result = await onSave?.(reservation, form, todayKey)
    if (result?.saved) {
      onClose?.()
    }
  }

  const handleDelete = async () => {
    await onDelete?.(reservation)
    onClose?.()
  }

  const header = (
    <header className="mobile-host-reservation-panel-header">
      <div className="mobile-host-reservation-panel-header-copy">
        <p className="mobile-screen-eyebrow">Reservation</p>
        <h2 className="mobile-host-reservation-panel-title">
          {reservation.guestName || 'Edit reservation'}
        </h2>
      </div>
      <button
        type="button"
        className="mobile-sheet-close-btn"
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>
    </header>
  )

  const panelBody = (
    <HostReservationEditPanel
      reservation={reservation}
      form={form}
      onChange={setForm}
      onSave={handleSave}
      onDelete={handleDelete}
      onCancel={onClose}
      onValidationError={onValidationError}
      isSaving={isSaving}
      variant="inline"
      reservations={reservations}
      todayKey={todayKey}
      layout={layout}
      seatings={seatings}
    />
  )

  if (variant === 'inline') {
    return (
      <div className="mobile-host-reservation-inline-panel host-station-form-surface is-edit" role="region" aria-label="Edit reservation">
        {header}
        <div className="mobile-host-reservation-inline-body mobile-host-reservation-edit-body">
          {panelBody}
        </div>
      </div>
    )
  }

  if (variant === 'panel') {
    return (
      <div className="mobile-host-panel-backdrop" onClick={onClose}>
        <div
          className="mobile-host-panel-dialog mobile-host-reservation-panel host-station-form-surface is-edit"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-host-reservation-edit-title"
        >
          <div id="mobile-host-reservation-edit-title" className="sr-only">Edit reservation</div>
          {header}
          <div className="mobile-host-reservation-panel-body mobile-host-reservation-edit-body">
            {panelBody}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <div
        className="mobile-sheet mobile-host-reservation-sheet is-edit"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-host-reservation-edit-title"
      >
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <header className="mobile-sheet-header">
          <div className="mobile-sheet-header-copy">
            <p className="mobile-screen-eyebrow">Reservation</p>
            <h2 id="mobile-host-reservation-edit-title" className="mobile-sheet-title">
              {reservation.guestName || 'Edit reservation'}
            </h2>
          </div>
          <button
            type="button"
            className="mobile-sheet-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="mobile-sheet-body mobile-host-reservation-edit-body">
          {panelBody}
        </div>
      </div>
    </div>
  )
}
