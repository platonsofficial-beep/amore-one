import { PlansBillingSection } from './PlansBillingSection'
import './subscription.css'

export function SubscriptionLockScreen({
  manager,
  venueName,
  onSignOut,
  onCheckout,
  onPortal,
  notice = '',
}) {
  const venue = `${venueName ?? ''}`.trim() || 'This venue'
  return (
    <div className="subscription-lock" data-testid="subscription-lock" role="dialog" aria-modal="true" aria-labelledby="subscription-lock-title">
      <div className="subscription-lock-card">
        <p className="subscription-lock-kicker">ONE</p>
        {manager ? (
          <>
            <h1 id="subscription-lock-title">{venue} is paused</h1>
            <p>Your data is safe. Choose a plan to continue.</p>
            <PlansBillingSection
              venueName={venue}
              onCheckout={onCheckout}
              onPortal={onPortal}
              notice={notice}
            />
          </>
        ) : (
          <>
            <h1 id="subscription-lock-title">Your venue’s subscription needs renewing</h1>
            <p>Ask your manager. Nothing has been deleted.</p>
          </>
        )}
        <button type="button" className="subscription-sign-out" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
