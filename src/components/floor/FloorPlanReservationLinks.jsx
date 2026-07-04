import { RESERVATION_LINK_STROKE } from '../../lib/hostFloorPlanViewport'

export function FloorPlanReservationLinks({ linkGroups }) {
  if (!linkGroups?.length) return null

  return (
    <svg
      className="floor-plan-reservation-links"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {linkGroups.map((group) => {
        if (group.points.length < 2) return null

        return (
          <polyline
            key={group.reservationId}
            className="floor-plan-reservation-link"
            fill="none"
            stroke={group.stroke ?? RESERVATION_LINK_STROKE}
            points={group.points.map((point) => `${point.x},${point.y}`).join(' ')}
          />
        )
      })}
    </svg>
  )
}
