import { venueMapsUrl } from './venueLocation.js'

function alreadyIncludes(text, part) {
  const needle = `${part ?? ''}`.trim().toLowerCase()
  if (!needle) return false
  return `${text ?? ''}`.toLowerCase().includes(needle)
}

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
  lat = null,
  lng = null,
  mapsUrl = '',
} = {}) {
  const venuePhone = `${phone ?? ''}`.trim()
  const contactEmail = `${email ?? ''}`.trim()
  const street = `${address ?? ''}`.trim()
  const placeName = `${city ?? ''}`.trim()
  const countryName = `${country ?? ''}`.trim()
  const extras = []
  if (placeName && !alreadyIncludes(street, placeName)) extras.push(placeName)
  if (countryName && !alreadyIncludes(street, countryName)) extras.push(countryName)
  const place = street ? [street, ...extras].join(', ') : ''
  return {
    phone: venuePhone,
    email: contactEmail,
    address: place,
    telHref: venuePhone ? `tel:${venuePhone.replace(/[^\d+]/g, '')}` : '',
    mailHref: contactEmail ? `mailto:${contactEmail}` : '',
    mapHref: venueMapsUrl({
      lat,
      lng,
      address: street,
      city: street ? placeName : '',
      mapsUrl,
    }),
  }
}
