import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isManagerRole } from './permissions'
import {
  SUBSCRIPTION_GRACE_DAYS,
  addSubscriptionDays,
  previewSubscriptionAccess,
  readSubscriptionPreview,
  perMonthEquivalent,
  resolveSubscriptionAccess,
  subscriptionBannerCopy,
} from './subscriptionAccess'

const TRIAL_END = '2026-11-01T12:00:00.000Z'

function trialRow(status = 'trialing') {
  return { status, trialEndsAt: TRIAL_END }
}

describe('subscription grace', () => {
  it('uses one grace length of 7 days', () => {
    expect(SUBSCRIPTION_GRACE_DAYS).toBe(7)
    const sql = readFileSync(new URL('../../supabase/subscriptions_schema.sql', import.meta.url), 'utf8')
    expect(sql).toContain('grace_days int not null default 7')
    expect(sql).toContain('subscription_grace_days')
    expect(sql).toContain('make_interval(days => v_grace)')
    expect(sql).toContain('free_forever')
    expect(sql).toContain('workspace_allows_writes')
    expect(sql).toContain("coalesce(auth.role(), '') = 'service_role'")
    expect(sql).toContain('chat_messages')
    expect(sql).toContain('create_signup_venue')
    expect(sql).toContain('start_venue_trial')
    expect(sql).toContain('amore-nicosia')
    expect(sql).toContain("interval '1 month'")
    expect(sql).not.toContain('fewer than 3 days')
  })

  it('keeps the venue open on grace day 0 with 7 days left', () => {
    const now = new Date(TRIAL_END)
    const access = resolveSubscriptionAccess(trialRow(), now)
    expect(access.phase).toBe('grace')
    expect(access.allowsWrites).toBe(true)
    expect(access.daysLeft).toBe(7)
    expect(access.reason).toBe('trial')
    expect(subscriptionBannerCopy(access).message).toBe(
      'Your free month has ended. You have 7 days left to choose a plan before ONE pauses.',
    )
  })

  it('keeps the venue open on grace day 6 with 1 day left', () => {
    const now = addSubscriptionDays(TRIAL_END, 6)
    const access = resolveSubscriptionAccess(trialRow(), now)
    expect(access.phase).toBe('grace')
    expect(access.allowsWrites).toBe(true)
    expect(access.daysLeft).toBe(1)
    expect(subscriptionBannerCopy(access).message).toContain('1 day left')
  })

  it('locks when the 7th grace day ends', () => {
    const now = addSubscriptionDays(TRIAL_END, SUBSCRIPTION_GRACE_DAYS)
    const access = resolveSubscriptionAccess(trialRow(), now)
    expect(access.phase).toBe('locked')
    expect(access.allowsWrites).toBe(false)
    expect(access.daysLeft).toBe(0)
    expect(subscriptionBannerCopy(access)).toBeNull()
  })

  it('starts a 7-day payment grace and locks when that window ends', () => {
    const failedAt = '2026-12-01T09:00:00.000Z'
    const row = {
      status: 'past_due',
      graceReason: 'payment',
      graceStartedAt: failedAt,
      currentPeriodEnd: failedAt,
      trialEndsAt: '2026-10-01T09:00:00.000Z',
    }
    const day0 = resolveSubscriptionAccess(row, new Date(failedAt))
    expect(day0.allowsWrites).toBe(true)
    expect(day0.daysLeft).toBe(7)
    expect(day0.reason).toBe('payment')
    expect(subscriptionBannerCopy(day0).action).toBe('Update payment')

    const day6 = resolveSubscriptionAccess(row, addSubscriptionDays(failedAt, 6))
    expect(day6.allowsWrites).toBe(true)
    expect(day6.daysLeft).toBe(1)

    const day7 = resolveSubscriptionAccess(row, addSubscriptionDays(failedAt, 7))
    expect(day7.allowsWrites).toBe(false)
    expect(day7.phase).toBe('locked')
  })

  it('unlocks immediately when payment succeeds during grace', () => {
    const now = addSubscriptionDays(TRIAL_END, 2)
    const duringGrace = resolveSubscriptionAccess(trialRow(), now)
    expect(duringGrace.phase).toBe('grace')
    expect(duringGrace.allowsWrites).toBe(true)

    const paid = resolveSubscriptionAccess({
      status: 'active',
      trialEndsAt: TRIAL_END,
      graceStartedAt: TRIAL_END,
      graceReason: 'payment',
      currentPeriodEnd: addSubscriptionDays(now, 30).toISOString(),
    }, now)
    expect(paid.phase).toBe('active')
    expect(paid.allowsWrites).toBe(true)
    expect(paid.daysLeft).toBeNull()
    expect(subscriptionBannerCopy(paid)).toBeNull()
  })

  it('shows grace to managers only, and leaves a missing billing row open', () => {
    const grace = resolveSubscriptionAccess(trialRow(), new Date(TRIAL_END))
    expect(isManagerRole('owner')).toBe(true)
    expect(isManagerRole('manager')).toBe(true)
    expect(isManagerRole('staff')).toBe(false)
    expect(isManagerRole('host')).toBe(false)
    expect(grace.audience).toBe('managers')
    expect(resolveSubscriptionAccess(null).allowsWrites).toBe(true)
    expect(resolveSubscriptionAccess({ freeForever: true, status: 'locked' }).phase).toBe('free_forever')
  })

  it('ignores a preview query unless subscriptions and local auth are both on', () => {
    const search = '?subscriptionPreview=locked'
    expect(readSubscriptionPreview(search, { subscriptionsOn: false, authDisabled: true })).toBeNull()
    expect(readSubscriptionPreview(search, { subscriptionsOn: true, authDisabled: false })).toBeNull()
    expect(readSubscriptionPreview(search, { subscriptionsOn: true, authDisabled: true })).toBe('locked')
    expect(previewSubscriptionAccess('locked', new Date(TRIAL_END)).allowsWrites).toBe(false)
    expect(previewSubscriptionAccess('grace-trial', new Date(TRIAL_END)).phase).toBe('grace')
    expect(previewSubscriptionAccess('plans', new Date(TRIAL_END)).phase).toBe('active')
  })

  it('turns a 6-month total into the per-month price', () => {
    expect(perMonthEquivalent(139, 6)).toBe(23.17)
    expect(perMonthEquivalent(29, 1)).toBeNull()
  })
})
