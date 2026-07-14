// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_CATALOG,
  findDepartment,
  findPosition,
  findVenueType,
  getDefaultPositionsForVenueType,
  getDepartmentByKey,
  getDepartmentsForVenueType,
  getOptionalPositionsForVenueType,
  getPositionByKey,
  getPositionsForDepartment,
  getPositionsForVenueType,
  getVenueTemplate,
  getVenueTypeByKey,
  isDepartmentAvailableForVenueType,
  isPositionAvailableForVenueType,
  POSITION_CATALOG,
  validateVenueCatalogIntegrity,
  VENUE_CATALOG_TEMPLATES,
  VENUE_TYPES,
} from './venueCatalogTemplates'

describe('validateVenueCatalogIntegrity', () => {
  it('reports zero errors for the committed catalog', () => {
    expect(validateVenueCatalogIntegrity()).toEqual({ valid: true, errors: [] })
  })
})

describe('venue catalog', () => {
  it('includes 12 required venue types with unique keys', () => {
    expect(VENUE_TYPES).toHaveLength(12)
    expect(new Set(VENUE_TYPES.map((entry) => entry.key)).size).toBe(12)
    expect(VENUE_TYPES.map((entry) => entry.label)).toContain('Restaurant')
    expect(VENUE_TYPES.map((entry) => entry.label)).toContain('Fast Casual / Quick Service')
  })

  it('finds venue types by key, label and alias without substring false positives', () => {
    expect(getVenueTypeByKey('restaurant')).toBe(VENUE_TYPES.find((entry) => entry.key === 'restaurant'))
    expect(findVenueType('Bar / Cocktail Bar')).toBe(getVenueTypeByKey('bar'))
    expect(findVenueType('Cocktail Bar')).toBe(getVenueTypeByKey('bar'))
    expect(findVenueType('Restaurant')).toBe(getVenueTypeByKey('restaurant'))
    expect(findVenueType('Restaurants')).toBeNull()
    expect(findVenueType('')).toBeNull()
  })
})

describe('department catalog', () => {
  it('includes required departments with valid venue applicability', () => {
    const keys = DEPARTMENT_CATALOG.map((entry) => entry.key)
    expect(keys).toContain('management')
    expect(keys).toContain('service_front_of_house')
    expect(keys).toContain('housekeeping')
    expect(keys).toContain('pool_beach')
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('matches departments canonically and by alias', () => {
    expect(findDepartment('service_front_of_house')).toBe(getDepartmentByKey('service_front_of_house'))
    expect(findDepartment('Service')).toBe(getDepartmentByKey('service_front_of_house'))
    expect(findDepartment('FOH')).toBe(getDepartmentByKey('service_front_of_house'))
  })

  it('applies venue-specific department availability', () => {
    const restaurantDepartments = getDepartmentsForVenueType('restaurant').map((entry) => entry.key)
    const hotelDepartments = getDepartmentsForVenueType('hotel', { includeOptional: true }).map((entry) => entry.key)
    const barDepartments = getDepartmentsForVenueType('bar').map((entry) => entry.key)

    expect(restaurantDepartments).not.toContain('housekeeping')
    expect(hotelDepartments).toContain('reception_front_office')
    expect(hotelDepartments).toContain('housekeeping')
    expect(barDepartments).not.toContain('reception_front_office')
    expect(isDepartmentAvailableForVenueType('pool_beach', 'resort')).toBe(true)
    expect(isDepartmentAvailableForVenueType('spa_wellness', 'restaurant')).toBe(false)
  })
})

describe('position catalog', () => {
  it('includes core roles with valid departments and unique keys', () => {
    const keys = POSITION_CATALOG.map((entry) => entry.key)
    expect(keys).toContain('bartender')
    expect(keys).toContain('front_desk_agent')
    expect(keys).toContain('room_attendant')
    expect(keys).toContain('lifeguard')
    expect(keys).toContain('pastry_chef')
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('matches positions globally and by department filter', () => {
    expect(findPosition('Bartender')).toBe(getPositionByKey('bartender'))
    expect(findPosition('Server', 'service_front_of_house')).toBe(getPositionByKey('waiter_server'))
    expect(findPosition('Bartender', 'service_front_of_house')).toBeNull()
    expect(findPosition('Senior Bartender', 'bar_beverage')).toBe(getPositionByKey('senior_bartender'))
    expect(findPosition('Bartender', 'bar_beverage')).toBe(getPositionByKey('bartender'))
    expect(getPositionByKey('bartender').departmentKey).toBe('bar_beverage')
    expect(getPositionByKey('front_desk_agent').departmentKey).toBe('reception_front_office')
    expect(getPositionByKey('room_attendant').departmentKey).toBe('housekeeping')
    expect(getPositionByKey('lifeguard').departmentKey).toBe('pool_beach')
    expect(getPositionByKey('pastry_chef').departmentKey).toBe('production_pastry')
  })
})

describe('venue templates', () => {
  it('defines templates for every venue type', () => {
    for (const venueType of VENUE_TYPES) {
      expect(getVenueTemplate(venueType.key)).toBe(VENUE_CATALOG_TEMPLATES[venueType.key])
    }
  })

  it('uses expected default departments and optional inclusion', () => {
    expect(getDepartmentsForVenueType('restaurant').map((entry) => entry.key)).toEqual([
      'management',
      'service_front_of_house',
      'bar_beverage',
      'kitchen_back_of_house',
      'host_reservations',
    ])
    expect(getDepartmentsForVenueType('nightclub').map((entry) => entry.key)).toContain('security')
    expect(getDepartmentsForVenueType('beach_club').map((entry) => entry.key)).toContain('pool_beach')
    expect(getDepartmentsForVenueType('bakery').map((entry) => entry.key)).toContain('production_pastry')
    expect(getDepartmentsForVenueType('fast_casual').map((entry) => entry.key)).toEqual([
      'management',
      'service_front_of_house',
      'kitchen_back_of_house',
    ])

    const restaurantWithOptional = getDepartmentsForVenueType('restaurant', { includeOptional: true }).map((entry) => entry.key)
    expect(restaurantWithOptional).toContain('delivery')
    expect(getDepartmentsForVenueType('restaurant').map((entry) => entry.key)).not.toContain('delivery')
  })
})

describe('default positions', () => {
  it('returns realistic restaurant defaults', () => {
    const labels = getDefaultPositionsForVenueType('restaurant').map((entry) => entry.key)
    expect(labels).toContain('waiter_server')
    expect(labels).toContain('bartender')
    expect(labels).toContain('host')
    expect(labels).toContain('dishwasher_steward')
  })

  it('returns realistic hotel defaults', () => {
    const labels = getDefaultPositionsForVenueType('hotel').map((entry) => entry.key)
    expect(labels).toContain('front_desk_agent')
    expect(labels).toContain('room_attendant')
    expect(labels).toContain('maintenance_technician')
    expect(labels).toContain('security_officer')
  })

  it('returns extended resort defaults across core departments', () => {
    const labels = getDefaultPositionsForVenueType('resort').map((entry) => entry.key)
    expect(labels).toContain('waiter_server')
    expect(labels).toContain('bartender')
    expect(labels).toContain('head_chef')
    expect(labels).toContain('front_desk_agent')
    expect(labels).toContain('room_attendant')
    expect(labels).toContain('lifeguard')
  })

  it('separates optional positions from defaults', () => {
    const optional = getOptionalPositionsForVenueType('restaurant').map((entry) => entry.key)
    const defaults = getDefaultPositionsForVenueType('restaurant').map((entry) => entry.key)
    expect(optional).toContain('sommelier')
    expect(defaults).not.toContain('sommelier')
  })
})

describe('selectors', () => {
  it('returns new arrays for filtered collections and original objects for direct lookups', () => {
    const departmentsA = getDepartmentsForVenueType('restaurant')
    const departmentsB = getDepartmentsForVenueType('restaurant')
    expect(departmentsA).not.toBe(departmentsB)
    expect(departmentsA[0]).toBe(getDepartmentByKey('management'))

    const positions = getPositionsForDepartment('bar_beverage', { venueTypeKey: 'restaurant' })
    expect(Array.isArray(positions)).toBe(true)
    expect(positions.every((entry) => entry.departmentKey === 'bar_beverage')).toBe(true)

    expect(getPositionsForVenueType('unknown')).toEqual([])
    expect(getVenueTemplate('unknown')).toBeNull()
    expect(isPositionAvailableForVenueType('bartender', 'restaurant')).toBe(true)
  })

  it('does not mutate frozen catalogs', () => {
    const before = DEPARTMENT_CATALOG.length
    expect(() => {
      DEPARTMENT_CATALOG.push({})
    }).toThrow()
    expect(DEPARTMENT_CATALOG.length).toBe(before)
    expect(Object.isFrozen(VENUE_TYPES)).toBe(true)
    expect(Object.isFrozen(VENUE_TYPES[0])).toBe(true)
    expect(Object.isFrozen(VENUE_TYPES[0].aliases)).toBe(true)
    expect(Object.isFrozen(VENUE_CATALOG_TEMPLATES)).toBe(true)
    expect(Object.isFrozen(VENUE_CATALOG_TEMPLATES.restaurant.defaultPositionKeys)).toBe(true)
    expect(Object.isFrozen(POSITION_CATALOG[0].defaultForVenueTypes)).toBe(true)
  })
})

describe('match priority and collision safety', () => {
  it('prefers exact department keys over later labels', () => {
    const match = findDepartment('bar_beverage')
    expect(match?.key).toBe('bar_beverage')
  })

  it('does not substring-match position labels', () => {
    expect(findPosition('Bar')).toBeNull()
    expect(findPosition('Head')).toBeNull()
  })
})
