// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getEmployeeInitials } from './employeeInitials'
import {
  EMPLOYEE_IDENTITY_SIZES,
  EMPLOYEE_IDENTITY_SIZE_KEYS,
  resolveEmployeeIdentitySize,
} from './employeeIdentitySize'
import {
  createIdentityColorRegistry,
  getAvailableIdentityColors,
  getEmployeeIdentityColor,
  isIdentityColorAvailable,
  releaseIdentityColor,
  reserveIdentityColor,
} from './employeeIdentityColor'
import {
  EMPLOYEE_IDENTITY_MODES,
  resolveEmployeeIdentityPresentation,
  resolveEmployeePhotoUrl,
} from './employeeIdentityResolve'
import {
  IDENTITY_COLOR_PALETTE,
  IDENTITY_NEUTRAL_COLOR,
  getIdentityColorById,
  isPaletteColorId,
} from './identityColorPalette'

describe('employeeInitials', () => {
  it('uses first and last tokens, ignoring middle names', () => {
    expect(getEmployeeInitials('Platon Sachinis')).toBe('PS')
    expect(getEmployeeInitials('John Michael Smith')).toBe('JS')
  })

  it('uses a single initial for one-word names', () => {
    expect(getEmployeeInitials('Evie')).toBe('E')
  })

  it('trims whitespace and never crashes on empty input', () => {
    expect(getEmployeeInitials('   ')).toBe('')
    expect(getEmployeeInitials(null)).toBe('')
    expect(getEmployeeInitials(undefined)).toBe('')
  })
})

describe('employeeIdentitySize', () => {
  it('exposes a shared frozen size map for xs through xl', () => {
    expect(EMPLOYEE_IDENTITY_SIZE_KEYS).toEqual(['xs', 'sm', 'md', 'lg', 'xl'])
    expect(Object.isFrozen(EMPLOYEE_IDENTITY_SIZES)).toBe(true)
    expect(Object.isFrozen(EMPLOYEE_IDENTITY_SIZES.md)).toBe(true)
  })

  it('falls back to md for unknown sizes', () => {
    expect(resolveEmployeeIdentitySize('unknown')).toBe(EMPLOYEE_IDENTITY_SIZES.md)
    expect(resolveEmployeeIdentitySize('MD').sizePx).toBe(40)
  })
})

describe('identityColorPalette', () => {
  it('freezes a curated palette of premium colors', () => {
    expect(IDENTITY_COLOR_PALETTE).toHaveLength(30)
    expect(Object.isFrozen(IDENTITY_COLOR_PALETTE)).toBe(true)
    expect(Object.isFrozen(IDENTITY_COLOR_PALETTE[0])).toBe(true)
    expect(Object.isFrozen(IDENTITY_NEUTRAL_COLOR)).toBe(true)
  })

  it('looks up palette entries by id', () => {
    expect(getIdentityColorById('champagne')?.name).toBe('Champagne')
    expect(isPaletteColorId('champagne')).toBe(true)
    expect(isPaletteColorId('random')).toBe(false)
  })
})

describe('employeeIdentityColor helpers', () => {
  it('returns neutral fallback when identityColor is missing or invalid', () => {
    expect(getEmployeeIdentityColor(null)).toBe(IDENTITY_NEUTRAL_COLOR)
    expect(getEmployeeIdentityColor({ identityColor: 'invalid' })).toBe(IDENTITY_NEUTRAL_COLOR)
  })

  it('returns palette color when employee.identityColor is valid', () => {
    expect(getEmployeeIdentityColor({ identityColor: 'emerald' })).toBe(getIdentityColorById('emerald'))
  })

  it('tracks availability and reservations immutably', () => {
    const empty = createIdentityColorRegistry()
    expect(Object.isFrozen(empty)).toBe(true)

    const reserved = reserveIdentityColor(empty, 'emerald', 'emp-1')
    expect(reserved).not.toBe(empty)
    expect(reserved.emerald).toBe('emp-1')
    expect(isIdentityColorAvailable('emerald', reserved)).toBe(false)
    expect(isIdentityColorAvailable('emerald', reserved, { exceptEmployeeId: 'emp-1' })).toBe(true)

    const blocked = reserveIdentityColor(reserved, 'emerald', 'emp-2')
    expect(blocked).toBe(reserved)

    const released = releaseIdentityColor(reserved, 'emerald', 'emp-1')
    expect(released).not.toBe(reserved)
    expect(released.emerald).toBeUndefined()
    expect(isIdentityColorAvailable('emerald', released)).toBe(true)
  })

  it('lists only available palette colors', () => {
    const registry = createIdentityColorRegistry({ emerald: 'emp-1', ruby: 'emp-2' })
    const available = getAvailableIdentityColors(registry)

    expect(available.some((color) => color.id === 'emerald')).toBe(false)
    expect(available.some((color) => color.id === 'ruby')).toBe(false)
    expect(available.some((color) => color.id === 'champagne')).toBe(true)
    expect(available).toHaveLength(28)
  })
})

describe('resolveEmployeeIdentityPresentation', () => {
  it('prefers photo over initials', () => {
    const presentation = resolveEmployeeIdentityPresentation({
      name: 'Platon Sachinis',
      photoUrl: 'https://example.com/photo.jpg',
      identityColor: 'emerald',
    })

    expect(presentation.mode).toBe(EMPLOYEE_IDENTITY_MODES.PHOTO)
    expect(presentation.photoUrl).toBe('https://example.com/photo.jpg')
    expect(presentation.initials).toBe('PS')
  })

  it('falls back to initials when no photo is available', () => {
    const presentation = resolveEmployeeIdentityPresentation({
      full_name: 'Platon Sachinis',
      identityColor: 'ocean',
    })

    expect(presentation.mode).toBe(EMPLOYEE_IDENTITY_MODES.INITIALS)
    expect(presentation.initials).toBe('PS')
    expect(presentation.color.id).toBe('ocean')
  })

  it('returns unknown presentation for missing employees', () => {
    const presentation = resolveEmployeeIdentityPresentation(null)

    expect(presentation.mode).toBe(EMPLOYEE_IDENTITY_MODES.UNKNOWN)
    expect(presentation.ariaLabel).toBe('Unknown employee')
    expect(presentation.color).toBe(IDENTITY_NEUTRAL_COLOR)
  })

  it('appends avatarVersion to photo URLs without mutating inputs', () => {
    const employee = {
      photoUrl: 'https://example.com/photo.jpg',
      avatarVersion: '3',
    }

    expect(resolveEmployeePhotoUrl(employee)).toBe('https://example.com/photo.jpg?v=3')
    expect(employee.photoUrl).toBe('https://example.com/photo.jpg')
    expect(employee.avatarVersion).toBe('3')
  })

  it('freezes resolved presentation objects', () => {
    const presentation = resolveEmployeeIdentityPresentation({ name: 'Evie' })
    expect(Object.isFrozen(presentation)).toBe(true)
  })
})
