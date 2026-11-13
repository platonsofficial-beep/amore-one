import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_GRACE_DAYS, resolveSubscriptionAccess } from './subscriptionAccess'
import {
  STRIPE_PRICE_ENV_NAMES,
  applyStripeEvent,
  assertStripeConfigured,
  buildCheckoutBody,
  verifyStripeSignature,
} from './stripeBilling'

const SECRET = 'whsec_test_secret'
const NOW = new Date('2026-11-20T12:00:00.000Z')

async function signedHeader(payload, timestampSeconds = Math.floor(NOW.getTime() / 1000), secret = SECRET) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
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

describe('stripe billing', () => {
  it('accepts a valid signature and rejects a bad one or a stale timestamp', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' })
    const header = await signedHeader(payload)
    await expect(verifyStripeSignature({
      payload,
      header,
      secret: SECRET,
      now: NOW.getTime(),
    })).resolves.toEqual({ ok: true })

    await expect(verifyStripeSignature({
      payload,
      header: header.replace(/v1=[0-9a-f]+/, 'v1=deadbeef'),
      secret: SECRET,
      now: NOW.getTime(),
    })).resolves.toMatchObject({ ok: false, reason: 'mismatch' })

    const stale = await signedHeader(payload, Math.floor(NOW.getTime() / 1000) - 3600)
    await expect(verifyStripeSignature({
      payload,
      header: stale,
      secret: SECRET,
      now: NOW.getTime(),
    })).resolves.toMatchObject({ ok: false, reason: 'stale' })
  })

  it('refuses checkout when the secret or a price id is missing', () => {
    expect(() => assertStripeConfigured('')).toThrow(/not configured/)
    expect(() => buildCheckoutBody({
      plan: 'start',
      interval: 'month',
      priceEnv: {},
      successUrl: 'https://example.test/ok',
      cancelUrl: 'https://example.test/cancel',
    })).toThrow(/STRIPE_PRICE_START_MONTH/)
    expect(STRIPE_PRICE_ENV_NAMES).toContain('STRIPE_PRICE_GROUP_YEAR')
    expect(STRIPE_PRICE_ENV_NAMES).toContain('STRIPE_PRICE_PRO_EXTRA_MONTH6')
  })

  it('builds a EUR subscription checkout for the selected plan', () => {
    const body = buildCheckoutBody({
      plan: 'pro',
      interval: 'month6',
      extraVenueQty: 1,
      priceEnv: {
        STRIPE_PRICE_PRO_MONTH6: 'price_pro_6',
        STRIPE_PRICE_PRO_EXTRA_MONTH6: 'price_extra_6',
      },
      successUrl: 'https://example.test/ok',
      cancelUrl: 'https://example.test/cancel',
      workspaceId: 'ws-1',
    })
    expect(body.mode).toBe('subscription')
    expect(body.currency).toBe('eur')
    expect(body.line_items).toEqual([
      { price: 'price_pro_6', quantity: 1 },
      { price: 'price_extra_6', quantity: 1 },
    ])
    expect(body.metadata).toMatchObject({ plan: 'pro', interval: 'month6', workspace_id: 'ws-1' })
  })

  it('starts payment grace on a failed invoice and unlocks when checkout completes', () => {
    const during = {
      status: 'trialing',
      trialEndsAt: '2026-11-01T12:00:00.000Z',
      graceStartedAt: null,
    }
    const failed = applyStripeEvent({ type: 'invoice.payment_failed' }, during, NOW)
    const grace = resolveSubscriptionAccess(failed, NOW)
    expect(failed.status).toBe('past_due')
    expect(failed.graceReason).toBe('payment')
    expect(grace.allowsWrites).toBe(true)
    expect(grace.daysLeft).toBe(SUBSCRIPTION_GRACE_DAYS)

    const again = applyStripeEvent({ type: 'invoice.payment_failed' }, failed, new Date(NOW.getTime() + 86400000))
    expect(again.graceStartedAt).toBe(failed.graceStartedAt)

    const paid = applyStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { current_period_end: Math.floor(NOW.getTime() / 1000) + 86400 * 30 } },
    }, failed, NOW)
    const unlocked = resolveSubscriptionAccess(paid, NOW)
    expect(paid.status).toBe('active')
    expect(paid.graceStartedAt).toBeNull()
    expect(unlocked.allowsWrites).toBe(true)
    expect(unlocked.phase).toBe('active')
  })
})
