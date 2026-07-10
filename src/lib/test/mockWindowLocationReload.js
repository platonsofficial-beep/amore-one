import { vi } from 'vitest'

export function mockWindowLocationReload() {
  const reload = vi.fn()
  const originalLocation = window.location

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...originalLocation,
      reload,
    },
  })

  return {
    reload,
    restore() {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      })
    },
  }
}
