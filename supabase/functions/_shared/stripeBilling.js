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
  return {
    mode: 'subscription',
    currency: 'eur',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customerId || undefined,
    line_items: lineItems,
    metadata: {
      plan,
      interval,
      workspace_id: `${workspaceId ?? ''}`,
    },
  }
}

export function encodeStripeForm(body) {
  const params = new URLSearchParams()
  params.set('mode', body.mode)
  params.set('success_url', body.success_url)
  params.set('cancel_url', body.cancel_url)
  if (body.customer) params.set('customer', body.customer)
  body.line_items.forEach((item, index) => {
    params.set(`line_items[${index}][price]`, item.price)
    params.set(`line_items[${index}][quantity]`, String(item.quantity))
  })
  Object.entries(body.metadata ?? {}).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, `${value ?? ''}`)
  })
  return params
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

function periodEndIso(value, now) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === 'string' && value) return value
  return new Date(new Date(now).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Pure billing transition. Payment failure starts grace once and does not
 * move the clock on later retries. A completed checkout or paid invoice
 * clears grace and sets `active` with a period end in the future.
 */
export function applyStripeEvent(event, current = {}, now = new Date()) {
  const next = { ...current }
  const type = event?.type
  const object = event?.data?.object ?? {}
  if (type === 'invoice.payment_failed' || type === 'customer.subscription.deleted') {
    next.status = 'past_due'
    next.graceReason = 'payment'
    if (!next.graceStartedAt) next.graceStartedAt = new Date(now).toISOString()
    return next
  }
  if (type === 'invoice.paid' || type === 'checkout.session.completed') {
    const periodEnd = object.current_period_end
      ?? object.lines?.data?.[0]?.period?.end
      ?? object.metadata?.current_period_end
    next.status = 'active'
    next.graceStartedAt = null
    next.graceReason = null
    next.currentPeriodEnd = periodEndIso(periodEnd, now)
    if (object.metadata?.plan) next.plan = object.metadata.plan
    if (object.metadata?.interval) next.interval = object.metadata.interval
    return next
  }
  return next
}
