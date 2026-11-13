import { useEffect, useMemo, useState } from 'react'
import { isManagerRole } from '../../lib/permissions'
import {
  previewSubscriptionAccess,
  readSubscriptionPreview,
  resolveSubscriptionAccess,
  subscriptionBannerCopy,
  subscriptionsEnabled,
  venueOffersFreeMonth,
} from '../../lib/subscriptionAccess'
import { loadWorkspaceSubscription } from '../../services/billingService'

export function useSubscriptionUi({
  role,
  workspaceId,
  isAuthDisabled = false,
}) {
  const enabled = subscriptionsEnabled()
  const preview = enabled
    ? readSubscriptionPreview(typeof window !== 'undefined' ? window.location.search : '', {
      subscriptionsOn: true,
      authDisabled: isAuthDisabled,
    })
    : null
  const [remote, setRemote] = useState(null)

  useEffect(() => {
    if (!enabled || preview || isAuthDisabled || !workspaceId) return undefined
    let cancelled = false
    loadWorkspaceSubscription(workspaceId).then((row) => {
      if (!cancelled) setRemote(row)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, preview, isAuthDisabled, workspaceId])

  return useMemo(() => {
    if (!enabled) {
      return {
        enabled: false,
        showBanner: false,
        bannerMessage: '',
        bannerAction: '',
        locked: false,
        manager: false,
        hasStripeCustomer: false,
        freeMonthEligible: false,
      }
    }
    const access = preview
      ? previewSubscriptionAccess(preview)
      : resolveSubscriptionAccess(remote)
    const manager = isManagerRole(role)
    const copy = manager ? subscriptionBannerCopy(access) : null
    return {
      enabled: true,
      showBanner: Boolean(copy),
      bannerMessage: copy?.message ?? '',
      bannerAction: copy?.action ?? '',
      locked: access.phase === 'locked',
      manager,
      hasStripeCustomer: remote?.hasStripeCustomer === true,
      freeMonthEligible: venueOffersFreeMonth(preview ? null : remote, access),
    }
  }, [enabled, preview, remote, role])
}
