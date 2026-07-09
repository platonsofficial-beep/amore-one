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
  isSaving = false,
  onClose,
  onSave,
  onDelete,
  onValidationError,
}) {
  const { layout } = usePublishedFloorPlan()
  const [form, setForm] = useState(null)

  useEffect(() => {
    setForm(reservation ? createHostReservationEditForm(reservation, layout) : null)
  }, [reservation, layout])

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
          />
        </div>
      </div>
    </div>
  )
}
