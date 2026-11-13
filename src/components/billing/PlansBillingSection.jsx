import { useState } from 'react'
import './subscription.css'
import { BILLING_INTERVALS, SUBSCRIPTION_PRICES, formatEuro } from '../../lib/subscriptionAccess'

const PLANS = [
  {
    id: 'start',
    name: 'Start',
    detail: '1 venue, up to 15 staff',
  },
  {
    id: 'pro',
    name: 'Pro',
    detail: 'All features, 1 venue included, up to 40 staff, up to 3 venues',
  },
  {
    id: 'group',
    name: 'Group',
    detail: 'Up to 5 venues included, unlimited staff. No free month.',
  },
]

export function PlansBillingSection({
  venueName = '',
  onCheckout,
  onPortal,
  notice = '',
}) {
  const [interval, setInterval] = useState('month')
  const venue = `${venueName ?? ''}`.trim()
  return (
    <section className="subscription-plans" data-testid="subscription-plans">
      <header className="subscription-plans-header">
        <h2>Plans & billing</h2>
        {venue ? <p>{venue}</p> : null}
      </header>
      <div className="subscription-intervals" role="group" aria-label="Billing period">
        {BILLING_INTERVALS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === interval ? 'is-selected' : ''}
            aria-pressed={item.id === interval}
            onClick={() => setInterval(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="subscription-plan-grid">
        {PLANS.map((plan) => {
          const amount = SUBSCRIPTION_PRICES[plan.id][interval]
          const extra = plan.id === 'start' ? null : SUBSCRIPTION_PRICES.extra[plan.id][interval]
          return (
            <article key={plan.id} className="subscription-plan-card">
              <h3>{plan.name}</h3>
              <p className="subscription-plan-price">{formatEuro(amount)}</p>
              <p>{plan.detail}</p>
              {extra != null ? (
                <p>Extra venue {formatEuro(extra)} for this period.</p>
              ) : null}
              <button type="button" onClick={() => onCheckout?.(plan.id, interval)}>
                Continue with {plan.name}
              </button>
            </article>
          )
        })}
      </div>
      <p className="subscription-vat">Prices exclude VAT.</p>
      {notice ? <p className="subscription-notice" role="status">{notice}</p> : null}
      <button type="button" className="subscription-portal" onClick={onPortal}>
        Manage billing
      </button>
    </section>
  )
}
