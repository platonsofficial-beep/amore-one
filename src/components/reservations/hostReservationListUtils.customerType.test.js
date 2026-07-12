import { describe, expect, it } from 'vitest'
import { getHostListCustomerTypeMeta } from './hostReservationListUtils'
import { HOST_LIST_HELPERS } from './hostReservationListHelpers'

describe('getHostListCustomerTypeMeta', () => {
  it('shows HOUSE GUEST badge for house guest reservations', () => {
    const meta = getHostListCustomerTypeMeta(
      {
        notes: '\n@@CUSTOMER@@House Guest',
        customerType: 'House Guest',
      },
      HOST_LIST_HELPERS.getGuestCustomerType,
    )

    expect(meta).toEqual({
      label: 'HOUSE GUEST',
      className: 'type-house-guest',
    })
  })

  it('preserves walk-in badge ahead of customer type badges', () => {
    const meta = getHostListCustomerTypeMeta(
      {
        notes: 'walk-in\n@@CUSTOMER@@VIP',
        customerType: 'VIP',
      },
      HOST_LIST_HELPERS.getGuestCustomerType,
    )

    expect(meta).toEqual({
      label: 'WALK-IN',
      className: 'type-walkin',
    })
  })
})
