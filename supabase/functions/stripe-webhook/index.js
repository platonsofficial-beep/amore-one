import {
  applyStripeEvent,
  stripeCustomerIdFromObject,
  stripeSubscriptionIdFromObject,
  subscriptionPeriodEndUnix,
  verifyStripeSignature,
  workspaceIdFromStripeObject,
} from '../_shared/stripeBilling.js'

const HANDLED_TYPES = new Set([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

const VENUE_COLUMNS = [
  'workspace_id',
  'billing_account_id',
  'status',
  'grace_started_at',
  'grace_reason',
  'current_period_end',
  'plan',
  'billing_interval',
  'stripe_subscription_id',
  'free_forever',
].join(',')

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function venueFromRow(row) {
  return {
    status: row.status,
    graceStartedAt: row.grace_started_at,
    graceReason: row.grace_reason,
    currentPeriodEnd: row.current_period_end,
    plan: row.plan,
    interval: row.billing_interval,
  }
}

function serviceHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    ...extra,
  }
}

async function rest(table, { method = 'GET', query = {}, body } = {}) {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const headers = serviceHeaders(serviceKey)
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    headers.prefer = 'return=minimal'
  }
  return fetch(`${env('SUPABASE_URL')}/rest/v1/${table}?${new URLSearchParams(query)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function pickVenue(venues, subscriptionId) {
  if (!venues?.length) return null
  if (subscriptionId) {
    const match = venues.find((venue) => venue.stripe_subscription_id === subscriptionId)
    if (match) return match
  }
  if (venues.length === 1) return venues[0]
  const unassigned = venues.filter((venue) => !`${venue.stripe_subscription_id ?? ''}`.trim())
  if (unassigned.length === 1) return unassigned[0]
  return null
}

async function findVenue({ workspaceId, subscriptionId, customerId }) {
  const select = `${VENUE_COLUMNS},billing_accounts(id,stripe_customer_id)`
  if (workspaceId) {
    const response = await rest('billing_account_venues', {
      query: { select, workspace_id: `eq.${workspaceId}` },
    })
    if (!response.ok) return { error: true }
    const rows = await response.json()
    if (rows?.[0]) return { venue: rows[0] }
  }
  if (subscriptionId) {
    const response = await rest('billing_account_venues', {
      query: { select, stripe_subscription_id: `eq.${subscriptionId}` },
    })
    if (!response.ok) return { error: true }
    const rows = await response.json()
    if (rows?.[0]) return { venue: rows[0] }
  }
  if (customerId) {
    const response = await rest('billing_accounts', {
      query: {
        select: `id,stripe_customer_id,billing_account_venues(${VENUE_COLUMNS})`,
        stripe_customer_id: `eq.${customerId}`,
      },
    })
    if (!response.ok) return { error: true }
    const accounts = await response.json()
    const account = accounts?.[0]
    const venue = pickVenue(account?.billing_account_venues, subscriptionId)
    if (venue) {
      return {
        venue: {
          ...venue,
          billing_account_id: venue.billing_account_id ?? account.id,
          billing_accounts: { id: account.id, stripe_customer_id: account.stripe_customer_id },
        },
      }
    }
  }
  return { venue: null }
}

async function retrieveSubscription(subscriptionId) {
  const secret = env('STRIPE_SECRET_KEY')
  if (!secret || !subscriptionId) return null
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { authorization: `Bearer ${secret}` },
  })
  if (!response.ok) return null
  return response.json()
}

async function storeEvent(event) {
  const url = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return { stored: false }
  const object = event?.data?.object ?? {}
  const subscriptionId = stripeSubscriptionIdFromObject(object)
  const customerId = stripeCustomerIdFromObject(object)
  if (event?.type === 'checkout.session.completed' && subscriptionId) {
    const subscription = await retrieveSubscription(subscriptionId)
    if (subscription) {
      const unix = subscriptionPeriodEndUnix(subscription)
      if (unix) object.current_period_end = unix
      const sessionMeta = Object.fromEntries(
        Object.entries(object.metadata ?? {}).filter(([, value]) => `${value ?? ''}`.trim()),
      )
      object.metadata = { ...(subscription.metadata ?? {}), ...sessionMeta }
    }
  }
  const found = await findVenue({
    workspaceId: workspaceIdFromStripeObject(object),
    subscriptionId,
    customerId,
  })
  if (found.error || !found.venue?.workspace_id) return { stored: false }
  const venue = found.venue
  const next = applyStripeEvent(event, venueFromRow(venue))
  const patch = {
    status: next.status ?? venue.status,
    grace_started_at: next.graceStartedAt ?? null,
    grace_reason: next.graceReason ?? null,
    current_period_end: next.currentPeriodEnd ?? venue.current_period_end ?? null,
    plan: next.plan ?? venue.plan,
    billing_interval: next.interval ?? venue.billing_interval,
  }
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId
  const update = await rest('billing_account_venues', {
    method: 'PATCH',
    query: { workspace_id: `eq.${venue.workspace_id}` },
    body: patch,
  })
  if (!update.ok) return { stored: false }
  const accountId = venue.billing_account_id || venue.billing_accounts?.id
  const existingCustomer = `${venue.billing_accounts?.stripe_customer_id ?? ''}`.trim()
  if (customerId && accountId && customerId !== existingCustomer) {
    const accountUpdate = await rest('billing_accounts', {
      method: 'PATCH',
      query: { id: `eq.${accountId}` },
      body: { stripe_customer_id: customerId },
    })
    if (!accountUpdate.ok) return { stored: false }
  }
  return { stored: true, workspaceId: venue.workspace_id }
}

export async function handleWebhook(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const payload = await req.text()
  const verified = await verifyStripeSignature({
    payload,
    header: req.headers.get('stripe-signature') || '',
    secret: env('STRIPE_WEBHOOK_SECRET'),
  })
  if (!verified.ok) {
    return new Response('Invalid signature', { status: 400 })
  }
  let event
  try {
    event = JSON.parse(payload)
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }
  if (!HANDLED_TYPES.has(event?.type)) {
    return jsonResponse({ received: true, ignored: true }, 200)
  }
  try {
    const stored = await storeEvent(event)
    if (!stored.stored) return jsonResponse({ received: true, stored: false }, 500)
    return jsonResponse({ received: true, ...stored }, 200)
  } catch {
    return jsonResponse({ received: true, stored: false }, 500)
  }
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handleWebhook)
}
