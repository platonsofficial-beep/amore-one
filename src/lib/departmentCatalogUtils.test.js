// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  departmentLabelsMatch,
  findMatchingDepartment,
  findMatchingPosition,
  isLegacyDepartmentValue,
  isLegacyPositionValue,
  normalizeCatalogText,
  normalizeDepartmentKey,
  normalizePositionKey,
  positionLabelsMatch,
  preserveLegacyCatalogOption,
} from './departmentCatalogUtils'

const departments = [
  {
    id: 'dept-service',
    key: 'service_front_of_house',
    label: 'Service / Front of House',
    aliases: ['Service', 'FOH', 'Front of House'],
  },
  {
    id: 'dept-bar',
    key: 'bar_beverage',
    label: 'Bar / Beverage',
    aliases: ['Bar', 'Beverage'],
  },
]

const positions = [
  {
    id: 'position-bartender',
    key: 'bartender',
    label: 'Bartender',
    departmentKey: 'bar_beverage',
    aliases: ['Bar Staff'],
  },
  {
    id: 'position-server',
    key: 'waiter_server',
    label: 'Waiter / Server',
    departmentKey: 'service_front_of_house',
    aliases: ['Waiter', 'Server'],
  },
]

describe('normalizeCatalogText', () => {
  it('normalizes whitespace, casing, apostrophes and dashes without mutating input', () => {
    const input = '  Front   Office '
    expect(normalizeCatalogText(input)).toBe('front office')
    expect(input).toBe('  Front   Office ')

    expect(normalizeCatalogText('Maître d\u2019')).toBe("maître d'")
    expect(normalizeCatalogText('Bar\u2013Manager')).toBe('bar-manager')
    expect(normalizeCatalogText('Bar\u2014Manager')).toBe('bar-manager')
    expect(normalizeCatalogText('Caf\u00e9')).toBe('caf\u00e9')
    expect(normalizeCatalogText(null)).toBe('')
    expect(normalizeCatalogText(undefined)).toBe('')
    expect(normalizeCatalogText('')).toBe('')
    expect(normalizeCatalogText('   ')).toBe('')
    expect(normalizeCatalogText(42)).toBe('42')
  })
})

describe('normalizeDepartmentKey', () => {
  it('builds stable department comparison keys', () => {
    expect(normalizeDepartmentKey('Service / Front of House')).toBe('service_front_of_house')
    expect(normalizeDepartmentKey('Bar & Beverage')).toBe('bar_beverage')
    expect(normalizeDepartmentKey('Front-Office')).toBe('front_office')
    expect(normalizeDepartmentKey('  Housekeeping  ')).toBe('housekeeping')
    expect(normalizeDepartmentKey('Service   Front of House')).toBe('service_front_of_house')
    expect(normalizeDepartmentKey('Service-Front of House')).toBe('service_front_of_house')
    expect(normalizeDepartmentKey('Service & Front of House')).toBe('service_front_of_house')
    expect(normalizeDepartmentKey('Team 42')).toBe('team_42')
    expect(normalizeDepartmentKey('')).toBe('')
  })
})

describe('normalizePositionKey', () => {
  it('builds stable position comparison keys', () => {
    expect(normalizePositionKey('Head Bartender')).toBe('head_bartender')
    expect(normalizePositionKey('Waiter / Server')).toBe('waiter_server')
    expect(normalizePositionKey('Maître d\u2019')).toBe('maître_d')
    expect(normalizePositionKey('Assistant Front-Office Manager')).toBe('assistant_front_office_manager')
    expect(normalizePositionKey('Bar & Beverage Lead')).toBe('bar_beverage_lead')
    expect(normalizePositionKey('')).toBe('')
  })
})

describe('departmentLabelsMatch', () => {
  it('matches equivalent department labels exactly', () => {
    expect(departmentLabelsMatch('Bar', ' bar ')).toBe(true)
    expect(departmentLabelsMatch('Service / Front of House', 'Service-Front of House')).toBe(true)
    expect(departmentLabelsMatch('Service & Front of House', 'Service / Front of House')).toBe(true)
  })

  it('rejects partial and empty matches', () => {
    expect(departmentLabelsMatch('Bar', 'Bar Manager')).toBe(false)
    expect(departmentLabelsMatch('Service', 'Guest Service Manager')).toBe(false)
    expect(departmentLabelsMatch('', 'Bar')).toBe(false)
    expect(departmentLabelsMatch('Bar', '')).toBe(false)
  })
})

describe('positionLabelsMatch', () => {
  it('matches equivalent position labels exactly', () => {
    expect(positionLabelsMatch('Head Bartender', ' head bartender ')).toBe(true)
    expect(positionLabelsMatch('Waiter / Server', 'Waiter-Server')).toBe(true)
    expect(positionLabelsMatch('Maître d\u2019', "Maître d'")).toBe(true)
  })

  it('rejects partial and empty matches', () => {
    expect(positionLabelsMatch('Bartender', 'Senior Bartender')).toBe(false)
    expect(positionLabelsMatch('Host', 'Host Manager')).toBe(false)
    expect(positionLabelsMatch('', 'Host')).toBe(false)
  })
})

describe('findMatchingDepartment', () => {
  it('matches by key, label and alias without mutating the catalog', () => {
    const catalog = [...departments]

    expect(findMatchingDepartment('service_front_of_house', catalog)).toBe(departments[0])
    expect(findMatchingDepartment('Service', catalog)).toBe(departments[0])
    expect(findMatchingDepartment('FOH', catalog)).toBe(departments[0])
    expect(findMatchingDepartment('  bar  ', catalog)).toBe(departments[1])
    expect(findMatchingDepartment('Bar Manager', catalog)).toBe(null)
    expect(findMatchingDepartment('', catalog)).toBe(null)
    expect(findMatchingDepartment('Service', null)).toBe(null)
    expect(findMatchingDepartment('Service', 'invalid')).toBe(null)

    expect(catalog).toEqual(departments)
  })

  it('prefers collection-wide key matches before later label matches', () => {
    const ambiguousCatalog = [
      {
        id: 'dept-alias-first',
        key: 'team_a',
        label: 'Team A',
        aliases: ['Shared Label'],
      },
      {
        id: 'dept-key-second',
        key: 'shared_label',
        label: 'Shared Label Canonical',
        aliases: ['Other'],
      },
    ]

    expect(findMatchingDepartment('shared_label', ambiguousCatalog)).toBe(ambiguousCatalog[1])
  })

  it('prefers label matches before alias matches across the collection', () => {
    const ambiguousCatalog = [
      {
        id: 'dept-alias-first',
        key: 'team_a',
        label: 'Team A',
        aliases: ['Shared Label'],
      },
      {
        id: 'dept-label-second',
        key: 'team_b',
        label: 'Shared Label',
        aliases: ['Other'],
      },
    ]

    expect(findMatchingDepartment('Shared Label', ambiguousCatalog)).toBe(ambiguousCatalog[1])
  })

  it('returns the first entry for duplicate aliases deterministically', () => {
    const duplicateAliasCatalog = [
      {
        id: 'dept-one',
        key: 'dept_one',
        label: 'Department One',
        aliases: ['Shared Alias'],
      },
      {
        id: 'dept-two',
        key: 'dept_two',
        label: 'Department Two',
        aliases: ['Shared Alias'],
      },
    ]

    expect(findMatchingDepartment('Shared Alias', duplicateAliasCatalog)).toBe(duplicateAliasCatalog[0])
  })

  it('tolerates malformed entries and aliases', () => {
    const malformedCatalog = [
      null,
      {
        id: 'dept-safe',
        key: 'safe',
        label: 'Safe',
        aliases: [null, '', '  Alias  '],
      },
    ]

    expect(findMatchingDepartment('Alias', malformedCatalog)).toBe(malformedCatalog[1])
    expect(findMatchingDepartment('Missing', malformedCatalog)).toBe(null)
  })
})

describe('findMatchingPosition', () => {
  it('matches globally and respects department filters', () => {
    expect(findMatchingPosition('Bartender', positions)).toBe(positions[0])
    expect(findMatchingPosition('Bartender', positions, 'bar_beverage')).toBe(positions[0])
    expect(findMatchingPosition('Bartender', positions, 'service_front_of_house')).toBe(null)
    expect(findMatchingPosition('Server', positions, 'service_front_of_house')).toBe(positions[1])
    expect(findMatchingPosition('Bar Staff', positions, 'bar_beverage')).toBe(positions[0])
    expect(findMatchingPosition('Senior Bartender', positions)).toBe(null)
  })

  it('uses collection-wide key priority and deterministic duplicate aliases', () => {
    const ambiguousCatalog = [
      {
        id: 'pos-alias-first',
        key: 'role_a',
        label: 'Role A',
        departmentKey: 'dept_a',
        aliases: ['Shared Role'],
      },
      {
        id: 'pos-key-second',
        key: 'shared_role',
        label: 'Shared Role Canonical',
        departmentKey: 'dept_b',
        aliases: ['Other'],
      },
    ]

    expect(findMatchingPosition('shared_role', ambiguousCatalog)).toBe(ambiguousCatalog[1])

    const duplicateAliasCatalog = [
      {
        id: 'pos-one',
        key: 'role_one',
        label: 'Role One',
        departmentKey: 'dept_a',
        aliases: ['Shared Alias'],
      },
      {
        id: 'pos-two',
        key: 'role_two',
        label: 'Role Two',
        departmentKey: 'dept_b',
        aliases: ['Shared Alias'],
      },
    ]

    expect(findMatchingPosition('Shared Alias', duplicateAliasCatalog)).toBe(duplicateAliasCatalog[0])
  })

  it('rejects positions with empty department metadata when a filter is supplied', () => {
    const malformedCatalog = [
      {
        id: 'pos-no-dept',
        key: 'floater',
        label: 'Floater',
        departmentKey: '',
        aliases: ['Floater'],
      },
    ]

    expect(findMatchingPosition('Floater', malformedCatalog, 'bar_beverage')).toBe(null)
    expect(findMatchingPosition('Floater', malformedCatalog)).toBe(malformedCatalog[0])
  })

  it('tolerates malformed catalogs without mutation', () => {
    const catalog = [...positions]
    expect(findMatchingPosition('Bartender', catalog)).toBe(positions[0])
    expect(findMatchingPosition('Bartender', 'invalid')).toBe(null)
    expect(catalog).toEqual(positions)
  })
})

describe('isLegacyDepartmentValue', () => {
  it('detects unknown non-empty department values only', () => {
    expect(isLegacyDepartmentValue('', departments)).toBe(false)
    expect(isLegacyDepartmentValue('   ', departments)).toBe(false)
    expect(isLegacyDepartmentValue('Service', departments)).toBe(false)
    expect(isLegacyDepartmentValue('FOH', departments)).toBe(false)
    expect(isLegacyDepartmentValue('service_front_of_house', departments)).toBe(false)
    expect(isLegacyDepartmentValue('Banqueting', departments)).toBe(true)
    expect(isLegacyDepartmentValue('Banqueting', null)).toBe(true)
  })
})

describe('isLegacyPositionValue', () => {
  it('detects unknown or department-incompatible position values', () => {
    expect(isLegacyPositionValue('', positions)).toBe(false)
    expect(isLegacyPositionValue('Bartender', positions)).toBe(false)
    expect(isLegacyPositionValue('Bartender', positions, 'service_front_of_house')).toBe(true)
    expect(isLegacyPositionValue('Server', positions, 'service_front_of_house')).toBe(false)
    expect(isLegacyPositionValue('Unknown Role', positions)).toBe(true)
  })
})

describe('preserveLegacyCatalogOption', () => {
  it('returns the original array reference when no append is needed', () => {
    const options = [
      {
        key: 'service_front_of_house',
        label: 'Service / Front of House',
        aliases: ['Service'],
      },
    ]
    expect(preserveLegacyCatalogOption('', options)).toBe(options)
    expect(preserveLegacyCatalogOption('Service / Front of House', options)).toBe(options)
    expect(preserveLegacyCatalogOption('Service', options)).toBe(options)
  })

  it('returns a safe empty array for malformed options when value is empty', () => {
    expect(preserveLegacyCatalogOption('', null)).toEqual([])
    expect(preserveLegacyCatalogOption('', undefined)).toEqual([])
  })

  it('appends one synthetic legacy option without mutating the original array or objects', () => {
    const options = [{ key: 'bartender', label: 'Bartender' }]
    const result = preserveLegacyCatalogOption('  VIP Hostess  ', options, {
      departmentKey: 'service_front_of_house',
      departmentLabel: 'Service / Front of House',
      type: 'position',
    })

    expect(result).not.toBe(options)
    expect(options).toEqual([{ key: 'bartender', label: 'Bartender' }])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(options[0])
    expect(result[1]).toEqual({
      key: 'legacy:vip_hostess',
      label: 'VIP Hostess',
      legacy: true,
      custom: true,
      departmentKey: 'service_front_of_house',
      departmentLabel: 'Service / Front of House',
      type: 'position',
    })
  })

  it('does not duplicate synthetic legacy options on repeated calls', () => {
    const options = [{ key: 'bartender', label: 'Bartender' }]
    const once = preserveLegacyCatalogOption('VIP Hostess', options, { type: 'position' })
    const twice = preserveLegacyCatalogOption('VIP Hostess', once)

    expect(once).toHaveLength(2)
    expect(twice).toBe(once)
    expect(twice.filter((option) => option.key === 'legacy:vip_hostess')).toHaveLength(1)
  })

  it('recognizes an existing synthetic legacy option', () => {
    const options = [{
      key: 'legacy:vip_hostess',
      label: 'VIP Hostess',
      legacy: true,
      custom: true,
    }]

    expect(preserveLegacyCatalogOption('VIP Hostess', options, { type: 'position' })).toBe(options)
  })

  it('tolerates malformed option entries without throwing', () => {
    const options = [null, { key: 'safe', label: 'Safe' }]
    const result = preserveLegacyCatalogOption('Legacy Role', options, { type: 'position' })

    expect(result).toHaveLength(3)
    expect(result[2].label).toBe('Legacy Role')
  })
})
