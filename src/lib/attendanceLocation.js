const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }

export function readCurrentPosition(geolocation = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      reject(Object.assign(new Error('no_location'), { code: 'no_location' }))
      return
    }

    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position?.coords?.latitude ?? null,
          lng: position?.coords?.longitude ?? null,
          accuracy: position?.coords?.accuracy ?? null,
        })
      },
      (error) => {
        const denied = error?.code === 1
        reject(Object.assign(new Error(denied ? 'no_location' : 'location_unavailable'), {
          code: denied ? 'no_location' : 'location_unavailable',
        }))
      },
      GEO_OPTIONS,
    )
  })
}
