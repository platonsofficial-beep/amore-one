import { PlansBillingSection } from './PlansBillingSection'
import './subscription.css'

export function SubscriptionLockScreen({
  manager,
  venueName,
  onSignOut,
  onCheckout,
  onPortal,
  notice = '',
  showPortal = false,
}) {
  const venue = `${venueName ?? ''}`.trim() || 'This venue'
  if (!manager) {
    return (
      <div className="subscription-lock is-staff" data-testid="subscription-lock" role="dialog" aria-modal="true" aria-labelledby="subscription-lock-title">
        <div className="subscription-staff-card">
          <img className="subscription-lock-mark" src="/brand/one-mark.svg" alt="" />
          <h1 id="subscription-lock-title">Your venue’s subscription needs renewing</h1>
          <p>Ask your manager. Nothing has been deleted.</p>
          <button type="button" className="subscription-sign-out" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="subscription-lock" data-testid="subscription-lock" role="dialog" aria-modal="true" aria-labelledby="subscription-lock-title">
      <div className="subscription-lock-card">
        <header className="subscription-lock-hero">
          <img className="subscription-lock-mark" src="/brand/one-mark.svg" alt="" />
          <h1 id="subscription-lock-title">{venue} is paused</h1>
          <p>Your data is safe. Choose a plan to continue.</p>
        </header>
        <PlansBillingSection
          framed={false}
          venueName={venue}
          onCheckout={onCheckout}
          onPortal={onPortal}
          notice={notice}
          showPortal={showPortal}
        />
        <button type="button" className="subscription-sign-out" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
