/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PlansBillingSection } from './PlansBillingSection'
import { SubscriptionBanner } from './SubscriptionBanner'
import { SubscriptionLockScreen } from './SubscriptionLockScreen'

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('subscription screens', () => {
  it('shows the free-month grace banner with a Choose plan button', () => {
    const onAction = vi.fn()
    const view = render(createElement(SubscriptionBanner, {
      message: 'Your free month has ended. You have 6 days left to choose a plan before ONE pauses.',
      action: 'Choose plan',
      onAction,
    }))
    expect(view.container.textContent).toContain('You have 6 days left to choose a plan before ONE pauses.')
    const button = view.container.querySelector('button')
    expect(button.textContent).toBe('Choose plan')
    expect(button.getAttribute('type')).toBe('button')
    act(() => button.click())
    expect(onAction).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('shows the payment grace banner with Update payment', () => {
    const view = render(createElement(SubscriptionBanner, {
      message: "Payment didn't go through. 4 days left to update payment.",
      action: 'Update payment',
      onAction: () => {},
    }))
    expect(view.container.textContent).toContain("Payment didn't go through. 4 days left to update payment.")
    expect(view.container.querySelector('button').textContent).toBe('Update payment')
    view.unmount()
  })

  it('shows the pay screen to managers and the ask-your-manager screen to staff', () => {
    const owner = render(createElement(SubscriptionLockScreen, {
      manager: true,
      venueName: 'AMORE.NICOSIA',
      onSignOut: () => {},
    }))
    expect(owner.container.textContent).toContain('paused')
    expect(owner.container.textContent).toContain('Choose a plan')
    expect(owner.container.textContent).toContain('Prices exclude VAT.')
    expect(owner.container.textContent).not.toContain('1 month free')
    owner.unmount()

    const staff = render(createElement(SubscriptionLockScreen, {
      manager: false,
      venueName: 'AMORE.NICOSIA',
      onSignOut: () => {},
    }))
    expect(staff.container.textContent).toContain('Your venue’s subscription needs renewing')
    expect(staff.container.textContent).toContain('Ask your manager')
    expect(staff.container.textContent).not.toContain('€29')
    staff.unmount()
  })

  it('lists the 6-month totals and excludes VAT', () => {
    const onCheckout = vi.fn()
    const view = render(createElement(PlansBillingSection, {
      venueName: 'Harbour',
      onCheckout,
      onPortal: () => {},
    }))
    expect(view.container.textContent).toContain('Recommended')
    expect(view.container.textContent).not.toContain('1 month free')
    expect(view.container.textContent).not.toContain('Manage billing')
    const sixMonths = [...view.container.querySelectorAll('button')].find((button) => button.textContent === '6 mo')
    act(() => sixMonths.click())
    expect(view.container.textContent).toContain('€139')
    expect(view.container.textContent).toContain('€283')
    expect(view.container.textContent).toContain('€619')
    expect(view.container.textContent).toContain('−20%')
    expect(view.container.textContent).toContain('/ 6 months')
    expect(view.container.textContent).toContain('Prices exclude VAT.')
    const start = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Continue with Start')
    act(() => start.click())
    expect(onCheckout).toHaveBeenCalledWith('start', 'month6')
    view.unmount()

    const eligible = render(createElement(PlansBillingSection, {
      venueName: 'Harbour',
      freeMonthEligible: true,
      onCheckout: () => {},
      onPortal: () => {},
    }))
    const startCard = [...eligible.container.querySelectorAll('article')].find((card) => card.textContent.includes('Start'))
    const proCard = [...eligible.container.querySelectorAll('article')].find((card) => card.textContent.includes('Pro'))
    const groupCard = [...eligible.container.querySelectorAll('article')].find((card) => card.textContent.includes('Group'))
    expect(startCard.textContent).toContain('1 month free')
    expect(proCard.textContent).toContain('1 month free')
    expect(groupCard.textContent).not.toContain('1 month free')
    eligible.unmount()
  })
})
