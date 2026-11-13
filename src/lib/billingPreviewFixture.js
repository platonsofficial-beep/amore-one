import { readSubscriptionPreview } from './subscriptionAccess'
import { t } from '../i18n/i18n'

/** Local Today stand-in for billing screenshots. Auth-disabled preview only. */
export function shouldUseBillingPreviewFixture(search) {
  if (import.meta.env.VITE_AUTH_DISABLED !== 'true') return false
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  return Boolean(readSubscriptionPreview(query, { subscriptionsOn: true, authDisabled: true }))
}

export function applyBillingPreviewToday(summary = {}) {
  return {
    ...summary,
    onShiftSummary: '4 on shift',
    teamScheduledSummary: '12 scheduled today',
    reservationsSummaryLine: '6 bookings · 18 covers',
    tasksSummary: '3 open tasks',
    stockSummaryLine: t("Stock levels OK"),
  }
}
