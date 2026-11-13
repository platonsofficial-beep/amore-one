import { applyStripeEvent, verifyStripeSignature } from '../_shared/stripeBilling.js'

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

function venueFromEvent(event) {
  return {
    status: event.status,
    graceStartedAt: event.grace_started_at,
    graceReason: event.grace_reason,
    currentPeriodEnd: event.current_period_end,
    plan: event.plan,
    interval: event.billing_interval,
  }
}

async function storeEvent(event) {
  const url = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const workspaceId = `${event?.data?.object?.metadata?.workspace_id ?? ''}`.trim()
  if (!url || !serviceKey || !workspaceId) return { stored: false }
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const currentResponse = await fetch(
    `${url}/rest/v1/billing_account_venues?workspace_id=eq.${workspaceId}&select=status,grace_started_at,grace_reason,current_period_end,plan,billing_interval`,
    { headers },
  )
  if (!currentResponse.ok) return { stored: false }
  const rows = await currentResponse.json()
  if (!rows?.[0]) return { stored: false }
  const next = applyStripeEvent(event, venueFromEvent(rows[0]))
  const patch = {
    status: next.status,
    grace_started_at: next.graceStartedAt,
    grace_reason: next.graceReason,
    current_period_end: next.currentPeriodEnd,
    plan: next.plan ?? rows[0].plan,
    billing_interval: next.interval ?? rows[0].billing_interval,
  }
  const update = await fetch(`${url}/rest/v1/billing_account_venues?workspace_id=eq.${workspaceId}`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  return { stored: update.ok }
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
  const stored = await storeEvent(event)
  return new Response(JSON.stringify({ received: true, ...stored }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handleWebhook)
}
