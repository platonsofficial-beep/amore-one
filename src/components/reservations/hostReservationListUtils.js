export {
  HOST_LIST_GROUP_DEFS,
  getHostListGroupId,
  groupHostListReservations,
} from '../../lib/reservationHostStatus'

export function getHostListCustomerTypeMeta(reservation, getGuestCustomerType) {
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  const customerType = getGuestCustomerType(reservation)

  if (notes.includes('walk-in') || notes.includes('walk in') || notes.includes('walkin')) {
    return { label: 'WALK-IN', className: 'type-walkin' }
  }

  if (customerType === 'VVIP') {
    return { label: 'VVIP', className: 'type-vvip' }
  }

  if (customerType === 'VIP') {
    return { label: 'VIP', className: 'type-vip' }
  }

  return { label: 'REG', className: 'type-regular' }
}
