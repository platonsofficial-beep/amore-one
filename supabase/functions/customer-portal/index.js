import { assertStripeConfigured } from '../_shared/stripeBilling.js'

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

async function stripeCustomerForWorkspace(req, workspaceId) {
  const url = env('SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('authorization') || ''
  if (!url || !anon || !serviceKey || !authorization || !workspaceId) return null
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { authorization, apikey: anon },
  })
  if (!userResponse.ok) return null
  const user = await userResponse.json()
  const userId = `${user?.id ?? ''}`
  if (!userId) return null
  const query = new URLSearchParams({
    select: 'billing_accounts(stripe_customer_id)',
    workspace_id: `eq.${workspaceId}`,
  })
  const venueResponse = await fetch(`${url}/rest/v1/billing_account_venues?${query}`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
  if (!venueResponse.ok) return null
  const rows = await venueResponse.json()
  const customerId = rows?.[0]?.billing_accounts?.stripe_customer_id
  if (!customerId) return null
  const memberQuery = new URLSearchParams({
    select: 'role',
    workspace_id: `eq.${workspaceId}`,
    auth_user_id: `eq.${userId}`,
    role: 'in.(owner,general_manager,manager)',
  })
  const memberResponse = await fetch(`${url}/rest/v1/workspace_members?${memberQuery}`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
  if (!memberResponse.ok) return null
  const members = await memberResponse.json()
  return members?.length ? customerId : null
}

export async function handlePortal(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  try {
    assertStripeConfigured(env('STRIPE_SECRET_KEY'))
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 503 })
  }
  const appUrl = env('PUBLIC_APP_URL').replace(/\/$/, '')
  if (!appUrl) {
    return new Response(JSON.stringify({ error: 'Missing PUBLIC_APP_URL' }), { status: 503 })
  }
  const input = await req.json()
  const customerId = await stripeCustomerForWorkspace(req, `${input?.workspaceId ?? ''}`)
  if (!customerId) {
    return new Response(JSON.stringify({ error: "Billing isn't connected yet." }), { status: 403 })
  }
  const form = new URLSearchParams({ customer: customerId, return_url: `${appUrl}/` })
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const payload = await response.json()
  if (!response.ok || !payload?.url) {
    return new Response(JSON.stringify({ error: "Billing isn't connected yet." }), { status: 502 })
  }
  return new Response(JSON.stringify({ url: payload.url }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handlePortal)
}
