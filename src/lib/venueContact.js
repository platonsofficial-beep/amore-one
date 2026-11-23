export function venueContactPhoneError(phone = '') {
  const trimmed = `${phone ?? ''}`.trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return 'Enter a valid phone number.'
  return ''
}

export function venueContactEmailError(email = '') {
  const trimmed = `${email ?? ''}`.trim()
  if (!trimmed) return ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.'
  return ''
}

export function venueContactLines({
  phone = '',
  email = '',
  address = '',
  city = '',
  country = '',
} = {}) {
  const venuePhone = `${phone ?? ''}`.trim()
  const contactEmail = `${email ?? ''}`.trim()
  const street = `${address ?? ''}`.trim()
  const place = street
    ? [street, `${city ?? ''}`.trim(), `${country ?? ''}`.trim()].filter(Boolean).join(', ')
    : ''
  return {
    phone: venuePhone,
    email: contactEmail,
    address: place,
    telHref: venuePhone ? `tel:${venuePhone.replace(/[^\d+]/g, '')}` : '',
    mailHref: contactEmail ? `mailto:${contactEmail}` : '',
    mapHref: place
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
      : '',
  }
}
