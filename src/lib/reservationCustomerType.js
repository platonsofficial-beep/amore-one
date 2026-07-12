export const CUSTOMER_TYPE_MARKER = '\n@@CUSTOMER@@'

export const CUSTOMER_TYPES = ['Regular', 'VIP', 'VVIP', 'House Guest']

export const GUEST_TYPE_OPTIONS = [
  { value: 'Regular', label: 'Normal' },
  { value: 'VIP', label: 'VIP' },
  { value: 'VVIP', label: 'VVIP' },
  { value: 'House Guest', label: 'House Guest' },
]

export function getGuestTypeLabel(customerType) {
  const normalized = normalizeStoredCustomerType(customerType)
  const option = GUEST_TYPE_OPTIONS.find((entry) => entry.value === normalized)
  return option?.label ?? 'Normal'
}

export function normalizeStoredCustomerType(customerType) {
  const value = `${customerType ?? ''}`.trim()
  if (value === 'Normal') return 'Regular'
  if (CUSTOMER_TYPES.includes(value)) return value
  return 'Regular'
}

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
  if (raw === 'VIP' || raw === 'VVIP' || raw === 'House Guest') return raw
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
  const type = normalizeStoredCustomerType(customerType)
  if (type === 'Regular') return userNotes
  return userNotes
    ? `${userNotes}${CUSTOMER_TYPE_MARKER}${type}`
    : `${CUSTOMER_TYPE_MARKER}${type}`
}
