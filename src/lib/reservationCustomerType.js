export const CUSTOMER_TYPE_MARKER = '\n@@CUSTOMER@@'

export const CUSTOMER_TYPES = ['Regular', 'VIP', 'VVIP']

export function parseCustomerTypeFromNotes(notes) {
  const value = `${notes ?? ''}`
  const markerIndex = value.indexOf(CUSTOMER_TYPE_MARKER)
  if (markerIndex < 0) {
    const haystack = value.toLowerCase()
    if (haystack.includes('vvip') || haystack.includes('v.v.i.p')) return 'VVIP'
    if (haystack.includes('vip')) return 'VIP'
    return 'Regular'
  }

  const raw = value.slice(markerIndex + CUSTOMER_TYPE_MARKER.length).trim()
  if (raw === 'VIP' || raw === 'VVIP') return raw
  return 'Regular'
}

export function stripCustomerTypeFromNotes(notes) {
  const value = `${notes ?? ''}`
  const markerIndex = value.indexOf(CUSTOMER_TYPE_MARKER)
  if (markerIndex < 0) return value.trim()
  return value.slice(0, markerIndex).trim()
}

export function encodeCustomerTypeInNotes(notes, customerType) {
  const userNotes = stripCustomerTypeFromNotes(notes)
  const type = CUSTOMER_TYPES.includes(customerType) ? customerType : 'Regular'
  if (type === 'Regular') return userNotes
  return userNotes
    ? `${userNotes}${CUSTOMER_TYPE_MARKER}${type}`
    : `${CUSTOMER_TYPE_MARKER}${type}`
}
