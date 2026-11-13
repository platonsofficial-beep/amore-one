const PRICE_ENV = {
  start: {
    month: 'STRIPE_PRICE_START_MONTH',
    month3: 'STRIPE_PRICE_START_MONTH3',
    month6: 'STRIPE_PRICE_START_MONTH6',
    year: 'STRIPE_PRICE_START_YEAR',
  },
  pro: {
    month: 'STRIPE_PRICE_PRO_MONTH',
    month3: 'STRIPE_PRICE_PRO_MONTH3',
    month6: 'STRIPE_PRICE_PRO_MONTH6',
    year: 'STRIPE_PRICE_PRO_YEAR',
  },
  group: {
    month: 'STRIPE_PRICE_GROUP_MONTH',
    month3: 'STRIPE_PRICE_GROUP_MONTH3',
    month6: 'STRIPE_PRICE_GROUP_MONTH6',
    year: 'STRIPE_PRICE_GROUP_YEAR',
  },
  extra: {
    pro: {
      month: 'STRIPE_PRICE_PRO_EXTRA_MONTH',
      month3: 'STRIPE_PRICE_PRO_EXTRA_MONTH3',
      month6: 'STRIPE_PRICE_PRO_EXTRA_MONTH6',
      year: 'STRIPE_PRICE_PRO_EXTRA_YEAR',
    },
    group: {
      month: 'STRIPE_PRICE_GROUP_EXTRA_MONTH',
      month3: 'STRIPE_PRICE_GROUP_EXTRA_MONTH3',
      month6: 'STRIPE_PRICE_GROUP_EXTRA_MONTH6',
      year: 'STRIPE_PRICE_GROUP_EXTRA_YEAR',
    },
  },
}

export const STRIPE_PRICE_ENV_NAMES = [
  ...Object.values(PRICE_ENV.start),
  ...Object.values(PRICE_ENV.pro),
  ...Object.values(PRICE_ENV.group),
  ...Object.values(PRICE_ENV.extra.pro),
  ...Object.values(PRICE_ENV.extra.group),
]

const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000

function textBytes(value) {
  return new TextEncoder().encode(value)
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    textBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textBytes(message))
  return hexFromBuffer(signature)
}

function timingSafeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

export function assertStripeConfigured(secret) {
  if (`${secret ?? ''}`.trim()) return
  const error = new Error('Stripe is not configured')
  error.status = 503
  throw error
}

export function buildCheckoutBody({
  plan,
  interval,
  extraVenueQty = 0,
  priceEnv = {},
  successUrl,
  cancelUrl,
  customerId = '',
  workspaceId = '',
}) {
  const envName = PRICE_ENV[plan]?.[interval]
  if (!envName) {
    throw new Error('Choose Start, Pro, or Group, and a billing period.')
  }
  const price = `${priceEnv[envName] ?? ''}`.trim()
  if (!price) {
    const error = new Error(`Missing ${envName}`)
    error.status = 503
    throw error
  }
  const lineItems = [{ price, quantity: 1 }]
  const extras = Math.max(0, Number(extraVenueQty) || 0)
  if (extras > 0 && (plan === 'pro' || plan === 'group')) {
    const extraName = PRICE_ENV.extra[plan][interval]
    const extraPrice = `${priceEnv[extraName] ?? ''}`.trim()
    if (!extraPrice) {
      const error = new Error(`Missing ${extraName}`)
      error.status = 503
      throw error
    }
    lineItems.push({ price: extraPrice, quantity: extras })
  }
  const workspace = `${workspaceId ?? ''}`.trim()
  const metadata = {
    plan,
    interval,
    workspace_id: workspace,
  }
  return {
    mode: 'subscription',
    currency: 'eur',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customerId || undefined,
    client_reference_id: workspace || undefined,
    line_items: lineItems,
    metadata,
    subscription_data: { metadata },
  }
}

export function encodeStripeForm(body) {
  const params = new URLSearchParams()
  params.set('mode', body.mode)
  params.set('success_url', body.success_url)
  params.set('cancel_url', body.cancel_url)
  if (body.customer) params.set('customer', body.customer)
  if (body.client_reference_id) params.set('client_reference_id', body.client_reference_id)
  body.line_items.forEach((item, index) => {
    params.set(`line_items[${index}][price]`, item.price)
    params.set(`line_items[${index}][quantity]`, String(item.quantity))
  })
  Object.entries(body.metadata ?? {}).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, `${value ?? ''}`)
  })
  Object.entries(body.subscription_data?.metadata ?? {}).forEach(([key, value]) => {
    params.set(`subscription_data[metadata][${key}]`, `${value ?? ''}`)
  })
  return params
}

export function workspaceIdFromStripeObject(object) {
  const values = [
    object?.metadata?.workspace_id,
    object?.client_reference_id,
    object?.subscription_details?.metadata?.workspace_id,
    object?.parent?.subscription_details?.metadata?.workspace_id,
  ]
  for (const value of values) {
    const id = `${value ?? ''}`.trim()
    if (id) return id
  }
  return ''
}

export function stripeCustomerIdFromObject(object) {
  const value = object?.customer
  if (value && typeof value === 'object') return `${value.id ?? ''}`.trim()
  return `${value ?? ''}`.trim()
}

export function stripeSubscriptionIdFromObject(object) {
  const value = object?.subscription
    ?? object?.parent?.subscription_details?.subscription
    ?? (object?.object === 'subscription' ? object.id : '')
  if (value && typeof value === 'object') return `${value.id ?? ''}`.trim()
  return `${value ?? ''}`.trim()
}

export function subscriptionPeriodEndUnix(subscription) {
  if (!subscription || typeof subscription !== 'object') return null
  if (typeof subscription.current_period_end === 'number' && Number.isFinite(subscription.current_period_end)) {
    return subscription.current_period_end
  }
  const itemEnd = subscription.items?.data?.[0]?.current_period_end
  if (typeof itemEnd === 'number' && Number.isFinite(itemEnd)) return itemEnd
  return null
}

export function invoicePeriodEndUnix(invoice) {
  const ends = (invoice?.lines?.data ?? [])
    .map((line) => line?.period?.end)
    .filter((end) => typeof end === 'number' && Number.isFinite(end))
  if (!ends.length) return null
  return Math.max(...ends)
}

/**
 * Stripe-Signature header: `t=<unix>,v1=<hex>`.
 * Signed payload is `${t}.${rawBody}` with HMAC-SHA256 of the webhook secret.
 */
export async function verifyStripeSignature({
  payload,
  header,
  secret,
  now = Date.now(),
  toleranceMs = SIGNATURE_TOLERANCE_MS,
}) {
  if (!`${header ?? ''}`.trim() || !`${secret ?? ''}`.trim()) {
    return { ok: false, reason: 'missing' }
  }
  let timestamp = ''
  const signatures = []
  for (const part of `${header}`.split(',')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key === 't') timestamp = value
    if (key === 'v1' && value) signatures.push(value.toLowerCase())
  }
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0 || signatures.length === 0) {
    return { ok: false, reason: 'malformed' }
  }
  if (Math.abs(now - timestampSeconds * 1000) > toleranceMs) {
    return { ok: false, reason: 'stale' }
  }
  const expected = (await hmacHex(secret, `${timestamp}.${payload}`)).toLowerCase()
  const match = signatures.some((signature) => timingSafeEqualHex(signature, expected))
  return match ? { ok: true } : { ok: false, reason: 'mismatch' }
}

const INTERVAL_MONTHS = { month: 1, month3: 3, month6: 6, year: 12 }
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function mergedMetadata(object) {
  return {
    ...(object?.parent?.subscription_details?.metadata ?? {}),
    ...(object?.subscription_details?.metadata ?? {}),
    ...(object?.metadata ?? {}),
  }
}

export function addIntervalIso(now, interval) {
  const months = INTERVAL_MONTHS[interval]
  if (!months) return null
  const next = new Date(now)
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, lastDay))
  return next.toISOString()
}

function periodEndIso(value, now, interval, { derive }) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === 'string' && value) return value
  if (derive) {
    const derived = addIntervalIso(now, interval)
    if (derived) return derived
  }
  return null
}

function startPaymentGrace(next, now) {
  next.status = 'past_due'
  next.graceReason = 'payment'
  if (!next.graceStartedAt) next.graceStartedAt = new Date(now).toISOString()
  return next
}

/**
 * Pure billing transition. Payment failure starts grace once and does not
 * move the clock on later retries. A completed checkout or paid invoice
 * clears grace and sets `active` with a period end in the future.
 * Period end prefers Stripe's timestamp. Checkout falls back to the plan
 * interval (3, 6, or 12 months), and only then to 30 days.
 */
export function applyStripeEvent(event, current = {}, now = new Date()) {
  const next = { ...current }
  const type = event?.type
  const object = event?.data?.object ?? {}
  const meta = mergedMetadata(object)
  if (type === 'invoice.payment_failed' || type === 'customer.subscription.deleted') {
    return startPaymentGrace(next, now)
  }
  if (type === 'customer.subscription.updated') {
    const stripeStatus = `${object.status ?? ''}`
    if (meta.plan) next.plan = meta.plan
    if (meta.interval) next.interval = meta.interval
    if (stripeStatus === 'active' || stripeStatus === 'trialing') {
      const period = periodEndIso(subscriptionPeriodEndUnix(object), now, meta.interval || next.interval, { derive: false })
      if (period) {
        next.status = 'active'
        next.graceStartedAt = null
        next.graceReason = null
        next.currentPeriodEnd = period
      }
      return next
    }
    if (['past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused'].includes(stripeStatus)) {
      return startPaymentGrace(next, now)
    }
    return next
  }
  if (type === 'invoice.paid' || type === 'checkout.session.completed') {
    const unix = type === 'invoice.paid'
      ? (invoicePeriodEndUnix(object) ?? subscriptionPeriodEndUnix(object))
      : subscriptionPeriodEndUnix(object)
    const interval = meta.interval || next.interval
    const period = periodEndIso(unix, now, interval, { derive: true })
      ?? new Date(new Date(now).getTime() + THIRTY_DAYS_MS).toISOString()
    next.status = 'active'
    next.graceStartedAt = null
    next.graceReason = null
    next.currentPeriodEnd = period
    if (meta.plan) next.plan = meta.plan
    if (meta.interval) next.interval = meta.interval
    return next
  }
  return next
}
