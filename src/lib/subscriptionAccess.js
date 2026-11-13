/** Single grace length for a lapsed trial or a failed payment. Default 7 days. */
export const SUBSCRIPTION_GRACE_DAYS = 7

export const SUBSCRIPTION_DAY_MS = 24 * 60 * 60 * 1000

export const SUBSCRIPTION_PRICES = {
  start: { month: 29, month3: 78, month6: 139, year: 261 },
  pro: { month: 59, month3: 159, month6: 283, year: 531 },
  group: { month: 129, month3: 348, month6: 619, year: 1161 },
  extra: {
    pro: { month: 20, month3: 54, month6: 96, year: 180 },
    group: { month: 15, month3: 40.5, month6: 72, year: 135 },
  },
}

export const BILLING_INTERVALS = [
  { id: 'month', label: 'Monthly', shortLabel: 'Monthly', suffix: '/ month', months: 1, saving: '' },
  { id: 'month3', label: '3 months', shortLabel: '3 mo', suffix: '/ 3 months', months: 3, saving: '−10%' },
  { id: 'month6', label: '6 months', shortLabel: '6 mo', suffix: '/ 6 months', months: 6, saving: '−20%' },
  { id: 'year', label: 'Yearly', shortLabel: 'Yearly', suffix: '/ year', months: 12, saving: '−25%' },
]

export function perMonthEquivalent(amount, months) {
  const count = Number(months) || 0
  const total = Number(amount)
  if (count <= 1 || !Number.isFinite(total)) return null
  return Math.round((total / count) * 100) / 100
}

const PREVIEW_STATES = new Set(['trial', 'grace-trial', 'grace-payment', 'locked', 'plans'])

export function subscriptionsEnabled(env = import.meta.env) {
  return env?.VITE_SUBSCRIPTIONS_ENABLED === 'true'
}

export function formatEuro(amount) {
  const cents = Math.round(Number(amount) * 100)
  const whole = cents % 100 === 0
  const value = whole ? String(cents / 100) : (cents / 100).toFixed(2)
  return `€${value}`
}

export function addSubscriptionDays(date, days) {
  return new Date(new Date(date).getTime() + days * SUBSCRIPTION_DAY_MS)
}

export function daysLeftUntil(end, now) {
  const endMs = new Date(end).getTime()
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs) || nowMs >= endMs) return 0
  return Math.ceil((endMs - nowMs) / SUBSCRIPTION_DAY_MS)
}

function access(phase, allowsWrites, daysLeft, audience, reason) {
  return { phase, allowsWrites, daysLeft, audience, reason }
}

/**
 * Decide whether a venue can still be used, and what owners should see.
 * Day 0 is the moment the trial ends or the payment fails: the app still
 * works, and `daysLeft` is the full grace length. The day the grace window
 * ends (`now` equal to the end) locks. A paid `active` period in the future
 * unlocks immediately, including a payment that arrives during grace.
 * No billing row stays open so an unenrolled venue is not locked.
 */
export function resolveSubscriptionAccess(row, now = new Date(), graceDays = SUBSCRIPTION_GRACE_DAYS) {
  if (!row) return access('unenrolled', true, null, 'none', null)
  if (row.freeForever) return access('free_forever', true, null, 'none', null)

  const nowDate = new Date(now)
  const status = `${row.status ?? ''}`
  const periodEnd = row.currentPeriodEnd ? new Date(row.currentPeriodEnd) : null
  const trialEnd = row.trialEndsAt ? new Date(row.trialEndsAt) : null
  const graceStart = row.graceStartedAt ? new Date(row.graceStartedAt) : null
  const graceReason = row.graceReason ?? null

  if (status === 'active' && periodEnd && nowDate < periodEnd) {
    return access('active', true, null, 'none', null)
  }

  if (status === 'trialing' && trialEnd && nowDate < trialEnd) {
    return access('trial', true, daysLeftUntil(trialEnd, nowDate), 'managers', 'trial')
  }

  if (graceStart && (graceReason === 'payment' || status === 'past_due')) {
    const end = addSubscriptionDays(graceStart, graceDays)
    if (nowDate < end) {
      return access('grace', true, daysLeftUntil(end, nowDate), 'managers', 'payment')
    }
  }

  if (status === 'active' && periodEnd && nowDate >= periodEnd) {
    const end = addSubscriptionDays(periodEnd, graceDays)
    if (nowDate < end) {
      return access('grace', true, daysLeftUntil(end, nowDate), 'managers', 'payment')
    }
  }

  if (
    trialEnd
    && graceReason !== 'payment'
    && status !== 'past_due'
    && status !== 'pending_payment'
    && status !== 'canceled'
  ) {
    const end = addSubscriptionDays(trialEnd, graceDays)
    if (nowDate < end) {
      return access('grace', true, daysLeftUntil(end, nowDate), 'managers', 'trial')
    }
  }

  const reason = graceReason === 'payment' || status === 'past_due' || status === 'active'
    ? 'payment'
    : 'trial'
  return access('locked', false, 0, 'everyone', reason)
}

export function readSubscriptionPreview(search, { subscriptionsOn = false, authDisabled = false } = {}) {
  if (!subscriptionsOn || !authDisabled) return null
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const value = `${params?.get?.('subscriptionPreview') ?? ''}`.trim()
  return PREVIEW_STATES.has(value) ? value : null
}

export function previewSubscriptionAccess(preview, now = new Date()) {
  const at = new Date(now)
  if (preview === 'trial') {
    return resolveSubscriptionAccess({
      status: 'trialing',
      trialEndsAt: addSubscriptionDays(at, 12).toISOString(),
    }, at)
  }
  if (preview === 'grace-trial') {
    return resolveSubscriptionAccess({
      status: 'trialing',
      trialEndsAt: addSubscriptionDays(at, -1).toISOString(),
    }, at)
  }
  if (preview === 'grace-payment') {
    return resolveSubscriptionAccess({
      status: 'past_due',
      graceReason: 'payment',
      graceStartedAt: addSubscriptionDays(at, -3).toISOString(),
      trialEndsAt: addSubscriptionDays(at, -40).toISOString(),
    }, at)
  }
  if (preview === 'locked') {
    return resolveSubscriptionAccess({
      status: 'trialing',
      trialEndsAt: addSubscriptionDays(at, -(SUBSCRIPTION_GRACE_DAYS + 1)).toISOString(),
    }, at)
  }
  if (preview === 'plans') {
    return resolveSubscriptionAccess({
      status: 'active',
      currentPeriodEnd: addSubscriptionDays(at, 20).toISOString(),
    }, at)
  }
  return resolveSubscriptionAccess(null, at)
}

function dayWord(days) {
  return days === 1 ? 'day' : 'days'
}

export function subscriptionBannerCopy(resolved) {
  if (!resolved) return null
  const days = resolved.daysLeft
  const word = dayWord(days)
  if (resolved.phase === 'trial') {
    return {
      message: `${days} ${word} left on your free month.`,
      action: 'Choose plan',
    }
  }
  if (resolved.phase === 'grace' && resolved.reason === 'payment') {
    return {
      message: `Payment didn't go through. ${days} ${word} left to update payment.`,
      action: 'Update payment',
    }
  }
  if (resolved.phase === 'grace') {
    return {
      message: `Your free month has ended. You have ${days} ${word} left to choose a plan before ONE pauses.`,
      action: 'Choose plan',
    }
  }
  return null
}
