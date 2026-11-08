export function NoServiceHoursNotice({
  onOpenSeatingHours,
  afterHours = false,
}) {
  return (
    <div className="host-no-service-hours" role="status" data-testid="host-no-service-hours">
      <p>No service hours for this day.</p>
      <p>
        {afterHours
          ? 'You can still seat an after-hours walk-in. It is not tied to a service.'
          : 'You can still save the booking. It will not be tied to a service.'}
      </p>
      {typeof onOpenSeatingHours === 'function' ? (
        <button type="button" className="host-no-service-hours-action" onClick={onOpenSeatingHours}>
          Open seating hours
        </button>
      ) : null}
    </div>
  )
}
