import { useState } from 'react'
import './subscription.css'
import { BILLING_INTERVALS, SUBSCRIPTION_PRICES, formatEuro, perMonthEquivalent } from '../../lib/subscriptionAccess'

const PLANS = [
  {
    id: 'start',
    name: 'Start',
    detail: '1 venue, up to 15 staff',
    freeMonth: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    detail: 'All features, 1 venue included, up to 40 staff, up to 3 venues',
    freeMonth: true,
    recommended: true,
  },
  {
    id: 'group',
    name: 'Group',
    detail: 'Up to 5 venues included, unlimited staff',
    freeMonth: false,
  },
]

export function PlansBillingSection({
  venueName = '',
  onCheckout,
  onPortal,
  onClose,
  notice = '',
  framed = true,
  showPortal = false,
}) {
  const [interval, setInterval] = useState('month')
  const period = BILLING_INTERVALS.find((item) => item.id === interval) ?? BILLING_INTERVALS[0]
  const venue = `${venueName ?? ''}`.trim()
  return (
    <section className={`subscription-plans${framed ? ' is-framed' : ''}`} data-testid="subscription-plans">
      {framed ? (
        <header className="subscription-sheet-header">
          <div className="subscription-sheet-heading">
            {onClose ? (
              <button type="button" className="mobile-sheet-close-btn" aria-label="Back" onClick={onClose}>‹</button>
            ) : null}
            <div className="subscription-sheet-copy">
              <p className="mobile-screen-eyebrow">Settings</p>
              <h2 className="mobile-screen-title">Plans & billing</h2>
              {venue ? <p className="subscription-sheet-venue">{venue}</p> : null}
            </div>
          </div>
          {onClose ? (
            <button type="button" className="mobile-sheet-close-btn" aria-label="Close" onClick={onClose}>✕</button>
          ) : null}
        </header>
      ) : null}
      <div className="subscription-plans-body">
        <div className="subscription-intervals" role="group" aria-label="Billing period">
          {BILLING_INTERVALS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === interval ? 'is-selected' : ''}
              aria-pressed={item.id === interval}
              onClick={() => setInterval(item.id)}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>
        <div className="subscription-plan-grid">
          {PLANS.map((plan) => {
            const amount = SUBSCRIPTION_PRICES[plan.id][interval]
            const extra = plan.id === 'start' ? null : SUBSCRIPTION_PRICES.extra[plan.id][interval]
            const equivalent = perMonthEquivalent(amount, period.months)
            return (
              <article
                key={plan.id}
                className={`subscription-plan-card${plan.recommended ? ' is-recommended' : ''}`}
              >
                <div className="subscription-plan-name">
                  <h3>{plan.name}</h3>
                  {plan.recommended ? <span className="subscription-plan-badge">Recommended</span> : null}
                </div>
                <p className="subscription-plan-price">
                  <span>{formatEuro(amount)}</span>
                  <span className="subscription-plan-suffix"> {period.suffix}</span>
                </p>
                {equivalent != null ? (
                  <p className="subscription-plan-equivalent">{formatEuro(equivalent)} / month · {period.saving}</p>
                ) : null}
                {plan.freeMonth ? <p className="subscription-plan-free">1 month free</p> : null}
                <p className="subscription-plan-detail">{plan.detail}</p>
                {extra != null ? (
                  <p className="subscription-plan-detail">Extra venue {formatEuro(extra)} for this period.</p>
                ) : null}
                <button type="button" className="subscription-plan-continue" onClick={() => onCheckout?.(plan.id, interval)}>
                  Continue with {plan.name}
                </button>
              </article>
            )
          })}
        </div>
        <p className="subscription-vat">Prices exclude VAT.</p>
        {notice ? <p className="subscription-notice" role="status">{notice}</p> : null}
        {showPortal ? (
          <button type="button" className="subscription-portal" onClick={onPortal}>
            Manage billing
          </button>
        ) : null}
      </div>
    </section>
  )
}
