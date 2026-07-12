import { describe, expect, it } from 'vitest'
import { getHostListCustomerTypeMeta, getHostNameGuestTypeBadgeMeta } from './hostReservationListUtils'
import { HOST_LIST_HELPERS } from './hostReservationListHelpers'
import { CUSTOMER_TYPE_MARKER } from '../../lib/reservationCustomerType'

describe('getHostNameGuestTypeBadgeMeta', () => {
  it('shows VIP, VVIP, and House Guest beside the guest name', () => {
    expect(getHostNameGuestTypeBadgeMeta(
      { notes: `Anniversary${CUSTOMER_TYPE_MARKER}VIP`, customerType: 'VIP' },
      HOST_LIST_HELPERS.getGuestCustomerType,
    )).toEqual({ label: 'VIP', className: 'type-vip' })

    expect(getHostNameGuestTypeBadgeMeta(
      { notes: `Owner${CUSTOMER_TYPE_MARKER}VVIP`, customerType: 'VVIP' },
      HOST_LIST_HELPERS.getGuestCustomerType,
    )).toEqual({ label: 'VVIP', className: 'type-vvip' })

    expect(getHostNameGuestTypeBadgeMeta(
      { notes: `Stay${CUSTOMER_TYPE_MARKER}House Guest`, customerType: 'House Guest' },
      HOST_LIST_HELPERS.getGuestCustomerType,
    )).toEqual({ label: 'HOUSE GUEST', className: 'type-house-guest' })
  })

  it('returns no badge for Normal / Regular guests', () => {
    expect(getHostNameGuestTypeBadgeMeta(
      { notes: 'Window seat', customerType: 'Regular' },
      HOST_LIST_HELPERS.getGuestCustomerType,
    )).toBeNull()
  })
})

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
