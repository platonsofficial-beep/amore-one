import { isOnlineReservation } from '../../lib/onlineBooking'
import { t } from '../../i18n/i18n'
import './onlineReservationBadge.css'

export function OnlineReservationBadge({ reservation }) {
  if (!isOnlineReservation(reservation)) return null
  return <span className="reservation-online-badge">{t("Online")}</span>
}
