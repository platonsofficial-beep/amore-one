const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'

export function coordinateIsSet(value) {
  if (value === null || value === undefined || value === '') return false
  return Number.isFinite(Number(value))
}

export function formatNominatimAddress(address = {}) {
  const road = `${address.road ?? address.pedestrian ?? address.footway ?? ''}`.trim()
  const number = `${address.house_number ?? ''}`.trim()
  const street = [road, number].filter(Boolean).join(' ')
  const postcode = `${address.postcode ?? ''}`.trim()
  const city = `${address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? ''}`.trim()
  return {
    line: [street, postcode, city].filter(Boolean).join(', '),
    city,
  }
}

export function venueMapsUrl({ lat, lng, address = '', city = '', mapsUrl = '' } = {}) {
  const provided = `${mapsUrl ?? ''}`.trim()
  if (provided) return provided
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (coordinateIsSet(lat) && coordinateIsSet(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  }
  const street = `${address ?? ''}`.trim()
  const placeName = `${city ?? ''}`.trim()
  const place = street ? [street, placeName].filter(Boolean).join(', ') : ''
  if (!place) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
}

export function venueLocationErrorKey(error) {
  if (error?.code === 1) return 'Location permission was denied. You can type the address instead.'
  if (error?.code === 3) return 'Finding the location took too long. You can type the address instead.'
  if (error?.offline) return "Couldn't reach the location service. Check your connection and try again."
  if (error?.code === 2) return "Couldn't read this location. You can type the address instead."
  return "Couldn't read this location. You can type the address instead."
}

export function readCurrentPosition(geolocation, options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      const error = new Error('unsupported')
      error.code = 2
      reject(error)
      return
    }
    geolocation.getCurrentPosition(resolve, reject, options)
  })
}

export async function reverseGeocodeVenue(lat, lng, fetchImpl = globalThis.fetch) {
  const url = `${NOMINATIM_REVERSE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=en`
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    referrerPolicy: 'origin',
  })
  if (!response?.ok) {
    const error = new Error('geocode')
    error.geocode = true
    throw error
  }
  const body = await response.json()
  return formatNominatimAddress(body?.address || {})
}

export async function captureVenueLocation({
  geolocation = globalThis.navigator?.geolocation,
  fetchImpl = globalThis.fetch,
  online = globalThis.navigator?.onLine !== false,
} = {}) {
  if (!online) {
    return { errorKey: "Couldn't reach the location service. Check your connection and try again." }
  }
  let position
  try {
    position = await readCurrentPosition(geolocation)
  } catch (error) {
    return { errorKey: venueLocationErrorKey(error) }
  }
  const lat = position?.coords?.latitude
  const lng = position?.coords?.longitude
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { errorKey: "Couldn't read this location. You can type the address instead." }
  }
  try {
    const place = await reverseGeocodeVenue(lat, lng, fetchImpl)
    return {
      lat: Number(lat),
      lng: Number(lng),
      address: place.line,
      city: place.city,
      geocodeFailed: !place.line,
    }
  } catch {
    return { lat: Number(lat), lng: Number(lng), geocodeFailed: true }
  }
}
