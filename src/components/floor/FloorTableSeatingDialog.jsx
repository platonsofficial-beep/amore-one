import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { formatHostListUnitLabel } from '../../lib/seatingAssignment'
import { HostTableInspectorContent } from './HostTableInspectorContent'

export { formatTableDayViewCapacity } from './HostTableInspectorContent'

export function getFloorTableSeatingDialogOverlayClass(isPhone) {
  return `floor-table-seating-dialog-overlay${isPhone ? ' is-phone' : ' is-tablet'}`
}

export function FloorTableSeatingDialog({
  table,
  tableLabel,
  areaLabel = '',
  dateLabel = '',
  rows = [],
  assignmentContext = null,
  onNewReservation,
  onOpenReservation,
  onEditReservation,
  onQuickStatusUpdate,
  onReleaseTable,
  onClose,
  isSaving = false,
  canManageAssignment = true,
  nowMinutes = 0,
  todayKey = '',
  floorLayout = null,
  reservationSeatings = [],
}) {
  const isPhone = useMediaQuery('(max-width: 720px)')
  const overlayClassName = getFloorTableSeatingDialogOverlayClass(isPhone)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={overlayClassName} role="presentation" data-testid="floor-table-seating-dialog">
      <button
        type="button"
        className="floor-table-seating-dialog-backdrop"
        onClick={onClose}
        aria-label="Close table day view"
      />
      <div
        className={`floor-table-seating-dialog floor-table-day-view${assignmentContext ? ' is-assignment-mode' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-table-seating-dialog-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="floor-table-day-view"
        data-assignment-mode={assignmentContext ? 'true' : 'false'}
      >
        <HostTableInspectorContent
          table={table}
          tableLabel={tableLabel}
          areaLabel={areaLabel}
          dateLabel={dateLabel}
          rows={rows}
          assignmentContext={assignmentContext}
          onNewReservation={onNewReservation}
          onOpenReservation={onOpenReservation}
          onEditReservation={onEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onReleaseTable={onReleaseTable}
          onClose={onClose}
          isSaving={isSaving}
          canManageAssignment={canManageAssignment}
          variant="dialog"
          nowMinutes={nowMinutes}
          todayKey={todayKey}
          floorLayout={floorLayout}
          reservationSeatings={reservationSeatings}
          titleId="floor-table-seating-dialog-title"
          animateEntrance={false}
        />
      </div>
    </div>,
    document.body,
  )
}

export function getFloorTableDialogLabel(table) {
  if (!table) return 'TABLE'
  const unitLabel = table.displayLabel ?? (table.unitType === 'table' ? `Table ${table.label}` : table.label)
  return formatHostListUnitLabel(unitLabel).toUpperCase()
}

export function formatFloorTableAreaLabel(layout, table) {
  if (!table?.zoneId || !layout?.zones?.length) return ''
  return layout.zones.find((zone) => zone.id === table.zoneId)?.label ?? ''
}
