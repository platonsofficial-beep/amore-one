import { t } from '../../i18n/i18n'
export function SeatingHoursFallback({
  kind = 'empty',
  onOpenSeatingHours,
  afterHours = false,
}) {
  if (kind === 'loading') {
    return (
      <p className="host-no-service-hours" role="status" data-testid="host-seating-hours-status">
        {t("Loading seating hours…")}
      </p>
    )
  }

  if (kind === 'error') {
    return (
      <p className="host-no-service-hours" role="alert" data-testid="host-seating-hours-status">
        {t("Couldn't load seating hours.")}
      </p>
    )
  }

  return (
    <NoServiceHoursNotice onOpenSeatingHours={onOpenSeatingHours} afterHours={afterHours} />
  )
}

export function NoServiceHoursNotice({
  onOpenSeatingHours,
  afterHours = false,
}) {
  return (
    <div className="host-no-service-hours" role="status" data-testid="host-no-service-hours">
      <p>{t("No service hours for this day.")}</p>
      <p>
        {afterHours
          ? 'You can still seat an after-hours walk-in. It is not tied to a service.'
          : 'You can still save the booking. It will not be tied to a service.'}
      </p>
      {typeof onOpenSeatingHours === 'function' ? (
        <button type="button" className="host-no-service-hours-action" onClick={onOpenSeatingHours}>
          {t("Open seating hours")}
        </button>
      ) : null}
    </div>
  )
}
