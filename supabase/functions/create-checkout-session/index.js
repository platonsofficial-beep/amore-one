import {
  STRIPE_PRICE_ENV_NAMES,
  assertStripeConfigured,
  buildCheckoutBody,
  encodeStripeForm,
} from '../_shared/stripeBilling.js'

function env(name) {
  return globalThis.Deno?.env?.get?.(name) ?? ''
}

export async function handleCheckout(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  try {
    assertStripeConfigured(env('STRIPE_SECRET_KEY'))
    const appUrl = env('PUBLIC_APP_URL').replace(/\/$/, '')
    if (!appUrl) {
      return new Response(JSON.stringify({ error: 'Missing PUBLIC_APP_URL' }), { status: 503 })
    }
    const input = await req.json()
    const priceEnv = Object.fromEntries(STRIPE_PRICE_ENV_NAMES.map((name) => [name, env(name)]))
    const body = buildCheckoutBody({
      plan: input.plan,
      interval: input.interval,
      extraVenueQty: input.extraVenueQty,
      workspaceId: input.workspaceId,
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
      return new Response(JSON.stringify({ error: "Billing isn't connected yet." }), { status: 502 })
    }
    return new Response(JSON.stringify({ url: payload.url }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    const status = error?.status || 400
    const message = status >= 500 ? "Billing isn't connected yet." : 'Choose a plan and a billing period.'
    return new Response(JSON.stringify({ error: message }), { status })
  }
}

if (globalThis.Deno?.serve) {
  globalThis.Deno.serve(handleCheckout)
}
