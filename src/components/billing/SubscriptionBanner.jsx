import './subscription.css'

export function SubscriptionBanner({ message, action, onAction }) {
  return (
    <div className="subscription-banner" data-testid="subscription-banner" role="status">
      <p className="subscription-banner-copy">{message}</p>
      <button type="button" className="subscription-banner-action" onClick={onAction}>
        {action}
      </button>
    </div>
  )
}
