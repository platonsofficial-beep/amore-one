import {
  STRIPE_PRICE_ENV_NAMES,
  assertStripeConfigured,
  buildCheckoutBody,
  encodeStripeForm,
} from '../_shared/stripeBilling.js'

const MANAGER_ROLES = 'in.(owner,general_manager,manager)'

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function serviceHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    ...extra,
  }
}

async function requireManager(authorization, workspaceId) {
  const url = env('SUPABASE_URL')
  const anon = env('SUPABASE_ANON_KEY')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !serviceKey) {
    return { error: jsonResponse({ error: "Billing isn't connected yet." }, 503) }
  }
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { authorization, apikey: anon },
  })
  if (!userResponse.ok) {
    return { error: jsonResponse({ error: 'Sign in to choose a plan.' }, 401) }
  }
  const user = await userResponse.json()
  const userId = `${user?.id ?? ''}`.trim()
  if (!userId) {
    return { error: jsonResponse({ error: 'Sign in to choose a plan.' }, 401) }
  }
  const memberQuery = new URLSearchParams({
    select: 'role',
    workspace_id: `eq.${workspaceId}`,
    auth_user_id: `eq.${userId}`,
    role: MANAGER_ROLES,
  })
  const memberResponse = await fetch(`${url}/rest/v1/workspace_members?${memberQuery}`, {
    headers: serviceHeaders(serviceKey),
  })
  if (!memberResponse.ok) {
    return { error: jsonResponse({ error: "Billing isn't connected yet." }, 503) }
  }
  const members = await memberResponse.json()
  if (!members?.length) {
    return { error: jsonResponse({ error: 'Only a manager can choose a plan.' }, 403) }
  }
  return { userId, email: `${user?.email ?? ''}`.trim() }
}

async function customerForWorkspace(workspaceId, email) {
  const url = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const query = new URLSearchParams({
    select: 'billing_account_id,billing_accounts(id,stripe_customer_id)',
    workspace_id: `eq.${workspaceId}`,
  })
  const venueResponse = await fetch(`${url}/rest/v1/billing_account_venues?${query}`, {
    headers: serviceHeaders(serviceKey),
  })
  if (!venueResponse.ok) return { error: jsonResponse({ error: "Billing isn't connected yet." }, 502) }
  const rows = await venueResponse.json()
  const venue = rows?.[0]
  const accountId = venue?.billing_account_id || venue?.billing_accounts?.id
  if (!accountId) {
    return { error: jsonResponse({ error: 'This venue is not enrolled yet.' }, 409) }
  }
  const existing = `${venue?.billing_accounts?.stripe_customer_id ?? ''}`.trim()
  if (existing) return { customerId: existing }
  const params = new URLSearchParams()
  if (email) params.set('email', email)
  params.set('metadata[workspace_id]', workspaceId)
  const created = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  const payload = await created.json().catch(() => null)
  if (!created.ok || !payload?.id) {
    return { error: jsonResponse({ error: "Billing isn't connected yet." }, 502) }
  }
  const saved = await fetch(`${url}/rest/v1/billing_accounts?id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: serviceHeaders(serviceKey, {
      'content-type': 'application/json',
      prefer: 'return=minimal',
    }),
    body: JSON.stringify({ stripe_customer_id: payload.id }),
  })
  if (!saved.ok) return { error: jsonResponse({ error: "Billing isn't connected yet." }, 502) }
  return { customerId: payload.id }
}

export async function handleCheckout(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  let input
  try {
    input = await req.json()
  } catch {
    return jsonResponse({ error: 'Choose a plan and a billing period.' }, 400)
  }
  const workspaceId = `${input?.workspaceId ?? ''}`.trim()
  const authorization = req.headers.get('authorization') || ''
  if (!workspaceId) {
    return jsonResponse({ error: 'Choose a plan and a billing period.' }, 400)
  }
  if (!/^bearer\s+\S+/i.test(authorization)) {
    return jsonResponse({ error: 'Sign in to choose a plan.' }, 401)
  }
  try {
    const manager = await requireManager(authorization, workspaceId)
    if (manager.error) return manager.error
    assertStripeConfigured(env('STRIPE_SECRET_KEY'))
    const appUrl = env('PUBLIC_APP_URL').replace(/\/$/, '')
    if (!appUrl) {
      return jsonResponse({ error: 'Missing PUBLIC_APP_URL' }, 503)
    }
    const customer = await customerForWorkspace(workspaceId, manager.email)
    if (customer.error) return customer.error
    const priceEnv = Object.fromEntries(STRIPE_PRICE_ENV_NAMES.map((name) => [name, env(name)]))
    const body = buildCheckoutBody({
      plan: input.plan,
      interval: input.interval,
      extraVenueQty: input.extraVenueQty,
      workspaceId,
      customerId: customer.customerId,
      priceEnv,
      successUrl: `${appUrl}/?billing=success`,
      cancelUrl: `${appUrl}/?billing=cancel`,
    })
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: encodeStripeForm(body),
    })
    const payload = await response.json()
    if (!response.ok || !payload?.url) {
      return jsonResponse({ error: "Billing isn't connected yet." }, 502)
    }
    return jsonResponse({ url: payload.url }, 200)
  } catch (error) {
    const status = error?.status || 400
    const message = status >= 500 ? "Billing isn't connected yet." : 'Choose a plan and a billing period.'
    return jsonResponse({ error: message }, status)
  }
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handleCheckout)
}
