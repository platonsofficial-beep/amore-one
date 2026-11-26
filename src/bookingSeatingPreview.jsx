import './App.css'
import './mobileShell.css'
import './uiScale.css'
import './safeOverlay.css'
import { FloorSeatingSelector } from './components/floor/FloorSeatingSelector'
import { MobileManagerReservationsView } from './components/mobile/MobileManagerReservationsView'
import { HostReservationList } from './components/reservations/HostReservationList'
import { HOST_LIST_HELPERS } from './components/reservations/hostReservationListHelpers'
import { HOST_FLOOR_PLAN_LEGEND_ITEMS } from './lib/hostFloorPlanLegend'
import { setLocale } from './i18n/i18n'

const seatings = [
  { id: 'brunch', name: 'Brunch', start_time: '10:00', duration_minutes: 120, days_of_week: [0, 1, 2, 3, 4, 5, 6], is_active: true, sort_order: 0 },
  { id: 'lunch', name: 'Lunch', start_time: '12:00', duration_minutes: 150, days_of_week: [0, 1, 2, 3, 4, 5, 6], is_active: true, sort_order: 1 },
  { id: 'dinner-1', name: 'Dinner 1', start_time: '19:00', duration_minutes: 120, days_of_week: [0, 1, 2, 3, 4, 5, 6], is_active: true, sort_order: 2 },
  { id: 'dinner-2', name: 'Dinner 2', start_time: '21:00', duration_minutes: 120, days_of_week: [0, 1, 2, 3, 4, 5, 6], is_active: true, sort_order: 3 },
]

const reservations = [
  {
    id: 'r1',
    guestName: 'Elena Pavlou',
    guests: 2,
    time: '19:00',
    date: '2026-11-26',
    status: 'Confirmed',
    seatingId: 'dinner-1',
    seatingAssignment: { assignedUnits: [{ id: 't109', label: 'T109', seatedCapacity: 4, maxGuestCapacity: 4 }], extraChairs: 0, standingGuests: 0 },
  },
  {
    id: 'r2',
    guestName: 'Thomas Christodoulou',
    guests: 4,
    time: '12:30',
    date: '2026-11-26',
    status: 'Pending',
    seatingId: 'lunch',
    seatingAssignment: { assignedUnits: [{ id: 't18', label: 'T18', seatedCapacity: 4, maxGuestCapacity: 4 }], extraChairs: 0, standingGuests: 0 },
  },
]

export function BookingSeatingPreview({ shot = 'landscape' }) {
  const greek = shot.endsWith('-el')
  const view = greek ? shot.slice(0, -3) : shot
  setLocale(greek ? 'el' : 'en')

  if (view === 'portrait') {
    return (
      <div className="mobile-app mobile-manager-app" style={{ minHeight: '100vh', background: 'var(--one-bg)' }}>
        <MobileManagerReservationsView
          reservations={reservations}
          todayKey="2026-11-26"
          dateKey="2026-11-26"
          nowMinutes={11 * 60}
          canManage
          seatings={seatings}
          onOpenReservationServices={() => {}}
          onCreateReservation={() => {}}
          onEditReservation={() => {}}
          onQuickStatusUpdate={() => {}}
        />
      </div>
    )
  }

  return (
    <div className="mobile-host-reservations is-landscape is-host-queue" style={{ minHeight: '100vh', background: 'var(--one-bg)', display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)' }}>
      <HostReservationList
        layout="compactTablet"
        reservations={reservations}
        nowMinutes={11 * 60}
        todayKey="2026-11-26"
        isLoading={false}
        isSelected={() => false}
        hostEditingReservation={null}
        draggingReservationId={null}
        isSavingStatus={false}
        listFilter="All"
        searchTerm=""
        isViewingToday
        onOpenEdit={() => {}}
        onStatusChange={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        helpers={HOST_LIST_HELPERS}
        useHostQueuePresentation
        seatings={seatings}
      />
      <div className="mobile-host-floor-stage" style={{ minWidth: 0 }}>
        <FloorSeatingSelector
          seatings={seatings.map((seating) => ({
            ...seating,
            startTime: seating.start_time,
            durationMinutes: seating.duration_minutes,
            daysOfWeek: seating.days_of_week,
            isActive: seating.is_active,
          }))}
          dateKey="2026-11-26"
          selectedSeatingId={null}
          onSelect={() => {}}
          legendItems={HOST_FLOOR_PLAN_LEGEND_ITEMS}
        />
      </div>
    </div>
  )
}
