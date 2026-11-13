import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleCheckout } from './create-checkout-session/index.js'
import { handleWebhook } from './stripe-webhook/index.js'
import { addIntervalIso } from './_shared/stripeBilling.js'

const SECRET = 'whsec_test_secret'
const ENV = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_SECRET_KEY: 'sk_test',
  PUBLIC_APP_URL: 'https://app.test',
  STRIPE_PRICE_PRO_MONTH6: 'price_pro_6',
}

const originalFetch = globalThis.fetch

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function signedHeader(payload) {
  const timestampSeconds = Math.floor(Date.now() / 1000)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestampSeconds}.${payload}`),
  )
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `t=${timestampSeconds},v1=${hex}`
}

async function postWebhook(event) {
  const payload = JSON.stringify(event)
  return handleWebhook(new Request('https://example.test/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': await signedHeader(payload),
    },
    body: payload,
  }))
}

function venueRow(overrides = {}) {
  return {
    workspace_id: 'ws-1',
    billing_account_id: 'acct-1',
    status: 'active',
    grace_started_at: null,
    grace_reason: null,
    current_period_end: '2026-12-20T12:00:00.000Z',
    plan: 'pro',
    billing_interval: 'month',
    stripe_subscription_id: null,
    free_forever: true,
    billing_accounts: { id: 'acct-1', stripe_customer_id: null },
    ...overrides,
  }
}

function installFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const href = `${url}`
    const call = { href, method: init.method || 'GET', body: init.body ? `${init.body}` : '' }
    calls.push(call)
    return handler(call)
  }
  return calls
}

function patches(calls, table) {
  return calls
    .filter((call) => call.method === 'PATCH' && call.href.includes(`/rest/v1/${table}?`))
    .map((call) => JSON.parse(call.body))
}

beforeEach(() => {
  globalThis.Deno = { env: { get: (name) => ENV[name] ?? '' } }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete globalThis.Deno
})

describe('stripe webhook storage', () => {
  it('stores a real invoice.paid whose top-level metadata is empty', async () => {
    const end = Math.floor(Date.parse('2027-05-20T12:00:00.000Z') / 1000)
    const calls = installFetch((call) => {
      if (call.method === 'GET' && call.href.includes('/billing_account_venues?')) return json([venueRow()])
      if (call.method === 'PATCH') return json({ ok: true })
      return json({ error: 'unexpected' }, 500)
    })
    const response = await postWebhook({
      type: 'invoice.paid',
      data: {
        object: {
          object: 'invoice',
          customer: 'cus_1',
          subscription: null,
          metadata: {},
          parent: {
            subscription_details: {
              subscription: 'sub_1',
              metadata: { workspace_id: 'ws-1', plan: 'pro', interval: 'month6' },
            },
          },
          lines: { data: [{ period: { end } }] },
        },
      },
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ stored: true, workspaceId: 'ws-1' })
    const venue = patches(calls, 'billing_account_venues')[0]
    const account = patches(calls, 'billing_accounts')[0]
    expect(venue.current_period_end).toBe('2027-05-20T12:00:00.000Z')
    expect(venue.status).toBe('active')
    expect(venue.grace_started_at).toBeNull()
    expect(venue.stripe_subscription_id).toBe('sub_1')
    expect(venue.free_forever).toBeUndefined()
    expect(account).toEqual({ stripe_customer_id: 'cus_1' })
  })

  it('starts grace for invoice.payment_failed resolved by subscription id when metadata is empty', async () => {
    const calls = installFetch((call) => {
      if (call.href.includes('stripe_subscription_id=eq.sub_1')) {
        return json([venueRow({ stripe_subscription_id: 'sub_1' })])
      }
      if (call.method === 'PATCH') return json({ ok: true })
      return json([], 200)
    })
    const response = await postWebhook({
      type: 'invoice.payment_failed',
      data: {
        object: {
          object: 'invoice',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: {},
          parent: { subscription_details: { metadata: {}, subscription: 'sub_1' } },
        },
      },
    })
    expect(response.status).toBe(200)
    const venue = patches(calls, 'billing_account_venues')[0]
    expect(venue.status).toBe('past_due')
    expect(venue.grace_reason).toBe('payment')
    expect(venue.grace_started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(venue.stripe_subscription_id).toBe('sub_1')
    expect(venue.free_forever).toBeUndefined()
    expect(patches(calls, 'billing_accounts')[0]).toEqual({ stripe_customer_id: 'cus_1' })
  })

  it('resolves an invoice by stripe customer id and keeps the line period', async () => {
    const end = Math.floor(Date.parse('2027-11-20T12:00:00.000Z') / 1000)
    const calls = installFetch((call) => {
      if (call.method === 'GET' && call.href.includes('/billing_accounts?')) {
        return json([{
          id: 'acct-1',
          stripe_customer_id: 'cus_1',
          billing_account_venues: [venueRow()],
        }])
      }
      if (call.method === 'PATCH') return json({ ok: true })
      return json([], 200)
    })
    const response = await postWebhook({
      type: 'invoice.paid',
      data: {
        object: {
          object: 'invoice',
          customer: 'cus_1',
          subscription: null,
          metadata: {},
          lines: { data: [{ period: { end } }] },
        },
      },
    })
    expect(response.status).toBe(200)
    expect(patches(calls, 'billing_account_venues')[0].current_period_end).toBe('2027-11-20T12:00:00.000Z')
    expect(patches(calls, 'billing_accounts')).toEqual([])
  })

  it('stores the subscription item period end for a 6-month checkout', async () => {
    const end = Math.floor(Date.parse('2027-05-20T12:00:00.000Z') / 1000)
    const calls = installFetch((call) => {
      if (call.href.startsWith('https://api.stripe.com/v1/subscriptions/')) {
        return json({
          id: 'sub_1',
          metadata: { workspace_id: 'ws-1', plan: 'pro', interval: 'month6' },
          items: { data: [{ current_period_end: end }] },
        })
      }
      if (call.method === 'GET') return json([venueRow()])
      if (call.method === 'PATCH') return json({ ok: true })
      return json({ error: 'unexpected' }, 500)
    })
    const response = await postWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { workspace_id: 'ws-1', plan: 'pro', interval: 'month6' },
          client_reference_id: 'ws-1',
        },
      },
    })
    expect(response.status).toBe(200)
    const venue = patches(calls, 'billing_account_venues')[0]
    expect(venue.current_period_end).toBe('2027-05-20T12:00:00.000Z')
    expect(venue.billing_interval).toBe('month6')
    expect(venue.stripe_subscription_id).toBe('sub_1')
    expect(Date.parse(venue.current_period_end) - Date.now()).toBeGreaterThan(150 * 24 * 60 * 60 * 1000)
  })

  it('derives a multi-month period when Stripe does not return the subscription', async () => {
    const calls = installFetch((call) => {
      if (call.href.startsWith('https://api.stripe.com/v1/subscriptions/')) return json({ error: 'missing' }, 404)
      if (call.method === 'GET') return json([venueRow()])
      if (call.method === 'PATCH') return json({ ok: true })
      return json({ error: 'unexpected' }, 500)
    })
    const before = Date.now()
    const response = await postWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { workspace_id: 'ws-1', plan: 'pro', interval: 'month6' },
        },
      },
    })
    expect(response.status).toBe(200)
    const storedEnd = Date.parse(patches(calls, 'billing_account_venues')[0].current_period_end)
    expect(Math.abs(storedEnd - Date.parse(addIntervalIso(before, 'month6')))).toBeLessThan(5000)
  })

  it('updates and deletes subscriptions without clearing a complimentary venue', async () => {
    const end = Math.floor(Date.parse('2027-05-20T12:00:00.000Z') / 1000)
    const calls = installFetch((call) => {
      if (call.method === 'GET') return json([venueRow({ stripe_subscription_id: 'sub_1' })])
      if (call.method === 'PATCH') return json({ ok: true })
      return json({ error: 'unexpected' }, 500)
    })
    const updated = await postWebhook({
      type: 'customer.subscription.updated',
      data: {
        object: {
          object: 'subscription',
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          metadata: { workspace_id: 'ws-1', plan: 'pro', interval: 'month6' },
          items: { data: [{ current_period_end: end }] },
        },
      },
    })
    expect(updated.status).toBe(200)
    const deleted = await postWebhook({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          object: 'subscription',
          id: 'sub_1',
          customer: 'cus_1',
          status: 'canceled',
          metadata: { workspace_id: 'ws-1' },
        },
      },
    })
    expect(deleted.status).toBe(200)
    const [active, canceled] = patches(calls, 'billing_account_venues')
    expect(active.status).toBe('active')
    expect(active.current_period_end).toBe('2027-05-20T12:00:00.000Z')
    expect(active.free_forever).toBeUndefined()
    expect(canceled.status).toBe('past_due')
    expect(canceled.grace_reason).toBe('payment')
    expect(canceled.free_forever).toBeUndefined()
  })

  it('returns 500 when a handled event cannot be stored and 200 when the event is ignored', async () => {
    installFetch(() => json({ error: 'down' }, 500))
    const failed = await postWebhook({
      type: 'invoice.paid',
      data: { object: { metadata: { workspace_id: 'ws-1' }, customer: 'cus_1' } },
    })
    expect(failed.status).toBe(500)
    await expect(failed.json()).resolves.toMatchObject({ stored: false })

    const calls = installFetch(() => {
      throw new Error('should not call the database')
    })
    const ignored = await postWebhook({ type: 'customer.created', data: { object: { id: 'cus_1' } } })
    expect(ignored.status).toBe(200)
    await expect(ignored.json()).resolves.toEqual({ received: true, ignored: true })
    expect(calls).toEqual([])
  })
})

describe('create checkout session auth', () => {
  it('returns 401 when the request has no user JWT', async () => {
    installFetch(() => {
      throw new Error('should not call Stripe or Supabase')
    })
    const response = await handleCheckout(new Request('https://example.test/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'pro', interval: 'month6', workspaceId: 'ws-1' }),
    }))
    expect(response.status).toBe(401)
  })

  it('reuses the stored Stripe customer for a manager', async () => {
    const calls = installFetch((call) => {
      if (call.href.includes('/auth/v1/user')) return json({ id: 'user-1', email: 'owner@example.test' })
      if (call.href.includes('/workspace_members?')) return json([{ role: 'owner' }])
      if (call.href.includes('/billing_account_venues?')) {
        return json([{
          billing_account_id: 'acct-1',
          billing_accounts: { id: 'acct-1', stripe_customer_id: 'cus_existing' },
        }])
      }
      if (call.href.includes('/checkout/sessions')) return json({ url: 'https://stripe.test/pay' })
      return json({ error: 'unexpected' }, 500)
    })
    const response = await handleCheckout(new Request('https://example.test/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer user-jwt',
      },
      body: JSON.stringify({ plan: 'pro', interval: 'month6', workspaceId: 'ws-1' }),
    }))
    expect(response.status).toBe(200)
    const session = calls.find((call) => call.href.includes('/checkout/sessions'))
    const params = new URLSearchParams(session.body)
    expect(params.get('customer')).toBe('cus_existing')
    expect(params.get('client_reference_id')).toBe('ws-1')
    expect(params.get('subscription_data[metadata][workspace_id]')).toBe('ws-1')
    expect(params.get('subscription_data[metadata][plan]')).toBe('pro')
    expect(params.get('subscription_data[metadata][interval]')).toBe('month6')
    expect(calls.some((call) => call.href.includes('/v1/customers'))).toBe(false)
  })

  it('creates a Stripe customer once and stores it when the account has none', async () => {
    const calls = installFetch((call) => {
      if (call.href.includes('/auth/v1/user')) return json({ id: 'user-1', email: 'owner@example.test' })
      if (call.href.includes('/workspace_members?')) return json([{ role: 'manager' }])
      if (call.method === 'GET' && call.href.includes('/billing_account_venues?')) {
        return json([{
          billing_account_id: 'acct-1',
          billing_accounts: { id: 'acct-1', stripe_customer_id: null },
        }])
      }
      if (call.href.includes('/v1/customers')) return json({ id: 'cus_new' })
      if (call.method === 'PATCH' && call.href.includes('/billing_accounts?')) return json({ ok: true })
      if (call.href.includes('/checkout/sessions')) return json({ url: 'https://stripe.test/pay' })
      return json({ error: 'unexpected' }, 500)
    })
    const response = await handleCheckout(new Request('https://example.test/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer user-jwt',
      },
      body: JSON.stringify({ plan: 'pro', interval: 'month6', workspaceId: 'ws-1' }),
    }))
    expect(response.status).toBe(200)
    expect(patches(calls, 'billing_accounts')).toEqual([{ stripe_customer_id: 'cus_new' }])
    const session = new URLSearchParams(calls.find((call) => call.href.includes('/checkout/sessions')).body)
    expect(session.get('customer')).toBe('cus_new')
    const created = new URLSearchParams(calls.find((call) => call.href.includes('/v1/customers')).body)
    expect(created.get('email')).toBe('owner@example.test')
    expect(created.get('metadata[workspace_id]')).toBe('ws-1')
  })

  it('returns 403 when the signed-in user is not a manager of that venue', async () => {
    installFetch((call) => {
      if (call.href.includes('/auth/v1/user')) return json({ id: 'user-1', email: 'host@example.test' })
      if (call.href.includes('/workspace_members?')) return json([])
      return json({ error: 'unexpected' }, 500)
    })
    const response = await handleCheckout(new Request('https://example.test/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer user-jwt',
      },
      body: JSON.stringify({ plan: 'start', interval: 'month', workspaceId: 'ws-1' }),
    }))
    expect(response.status).toBe(403)
  })
})
