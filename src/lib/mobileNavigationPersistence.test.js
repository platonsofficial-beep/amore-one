/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { normalizeMobileTab } from './mobileNavigationPersistence'

describe('host mobile tab persistence', () => {
  it('maps the legacy host tab onto reservations and keeps staff tabs', () => {
    expect(normalizeMobileTab('host', { variant: 'host' })).toBe('reservations')
    expect(normalizeMobileTab('reservations', { variant: 'host' })).toBe('reservations')
    expect(normalizeMobileTab('schedule', { variant: 'host' })).toBe('schedule')
    expect(normalizeMobileTab('tasks', { variant: 'host' })).toBe('tasks')
    expect(normalizeMobileTab('stock', { variant: 'host' })).toBe('reservations')
    expect(normalizeMobileTab('home', { variant: 'staff' })).toBe('home')
    expect(normalizeMobileTab('availability', { variant: 'staff' })).toBe('availability')
    expect(normalizeMobileTab('chat', { variant: 'staff' })).toBe('chat')
    expect(normalizeMobileTab('chat', { variant: 'host' })).toBe('chat')
    expect(normalizeMobileTab('availability', { variant: 'host' })).toBe('availability')
    expect(normalizeMobileTab('reservations', { variant: 'staff' })).toBe('home')
  })
})
