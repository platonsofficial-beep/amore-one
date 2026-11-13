import { supabase } from '../lib/supabaseClient'

const BILLING_NOTICE = "Billing isn't connected yet."

function mapVenueRow(row) {
  if (!row) return null
  return {
    plan: row.plan,
    interval: row.billing_interval,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    currentPeriodEnd: row.current_period_end,
    graceStartedAt: row.grace_started_at,
    graceReason: row.grace_reason,
    freeForever: row.free_forever === true,
  }
}

export async function loadWorkspaceSubscription(workspaceId) {
  const id = `${workspaceId ?? ''}`.trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('billing_account_venues')
    .select('plan, billing_interval, status, trial_ends_at, current_period_end, grace_started_at, grace_reason, free_forever')
    .eq('workspace_id', id)
    .maybeSingle()
  if (error || !data) return null
  return mapVenueRow(data)
}

async function invokeBilling(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error || !data?.url) {
    throw new Error(BILLING_NOTICE)
  }
  return data.url
}

export async function startSubscriptionCheckout({ plan, interval, workspaceId, extraVenueQty = 0 }) {
  return invokeBilling('create-checkout-session', {
    plan,
    interval,
    workspaceId,
    extraVenueQty,
  })
}

export async function startSubscriptionPortal({ workspaceId }) {
  return invokeBilling('customer-portal', { workspaceId })
}
