import { describe, expect, it, vi } from 'vitest'
import {
  captureVenueLocation,
  formatNominatimAddress,
  venueLocationErrorKey,
  venueMapsUrl,
} from './venueLocation'

describe('venue location', () => {
  it('builds a short address from the reverse-geocode parts', () => {
    expect(formatNominatimAddress({
      road: 'Makariou',
      house_number: '12',
      postcode: '1065',
      city: 'Nicosia',
    })).toEqual({ line: 'Makariou 12, 1065, Nicosia', city: 'Nicosia' })
    expect(formatNominatimAddress({ pedestrian: 'Ledra', town: 'Nicosia' }).line).toBe('Ledra, Nicosia')
  })

  it('prefers coordinates for the maps link and falls back to the address', () => {
    expect(venueMapsUrl({ lat: 35.17, lng: 33.36, address: '12 Harbour Street', city: 'Nicosia' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=35.17,33.36')
    expect(venueMapsUrl({ mapsUrl: 'https://maps.example/pin' })).toBe('https://maps.example/pin')
    expect(venueMapsUrl({ address: '12 Harbour Street', city: 'Nicosia' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=12%20Harbour%20Street%2C%20Nicosia')
    expect(venueMapsUrl({ city: 'Nicosia' })).toBe('')
    expect(venueMapsUrl({ lat: null, lng: null })).toBe('')
  })

  it('names permission, timeout, and offline failures', () => {
    expect(venueLocationErrorKey({ code: 1 })).toContain('permission')
    expect(venueLocationErrorKey({ code: 3 })).toContain('too long')
    expect(venueLocationErrorKey({ offline: true })).toContain('connection')
  })

  it('keeps coordinates when reverse geocoding fails and keeps a typed address unused', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    const geolocation = {
      getCurrentPosition: (ok) => ok({ coords: { latitude: 35.17, longitude: 33.36 } }),
    }
    const failed = await captureVenueLocation({ geolocation, fetchImpl, online: true })
    expect(failed).toEqual({ lat: 35.17, lng: 33.36, geocodeFailed: true })
    expect(fetchImpl.mock.calls[0][0]).toContain('nominatim.openstreetmap.org/reverse')
    expect(fetchImpl.mock.calls[0][0]).toContain('accept-language=en')
    expect(fetchImpl.mock.calls[0][1].referrerPolicy).toBe('origin')

    const filled = await captureVenueLocation({
      geolocation,
      online: true,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ address: { road: 'Makariou', house_number: '12', postcode: '1065', city: 'Nicosia' } }),
      }),
    })
    expect(filled.address).toBe('Makariou 12, 1065, Nicosia')
    expect(filled.city).toBe('Nicosia')
    expect(filled.geocodeFailed).toBe(false)
  })

  it('stops before asking for a location when the device is offline', async () => {
    const geolocation = { getCurrentPosition: vi.fn() }
    const result = await captureVenueLocation({ geolocation, online: false })
    expect(result.errorKey).toContain('connection')
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })
})
