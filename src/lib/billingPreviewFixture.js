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
    onShiftSummary: t('4 on shift'),
    teamScheduledSummary: t('12 scheduled today'),
    reservationsSummaryLine: t('6 bookings · 18 covers'),
    tasksSummary: t('3 open tasks'),
    stockSummaryLine: t("Stock levels OK"),
  }
}
