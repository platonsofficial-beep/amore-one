// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildUniqueEmployeeDisplayLabels,
  normalizeEmployeeNameForComparison,
  splitEmployeeDisplayNameParts,
} from './uniqueEmployeeDisplayLabels'

function employeesFromNames(names) {
  return names.map((name, index) => ({ id: `emp-${index + 1}`, full_name: name }))
}

describe('uniqueEmployeeDisplayLabels', () => {
  it('includes one surname character when the first name is unique', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Sofia Victoratou',
      'Evie Samaridi',
    ]))

    expect(labels.get('emp-1')).toBe('Sofia V')
    expect(labels.get('emp-2')).toBe('Evie S')
  })

  it('disambiguates matching first names with different surname initials', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Maria Smith',
      'Maria Stone',
    ]))

    expect(labels.get('emp-1')).toBe('Maria Sm')
    expect(labels.get('emp-2')).toBe('Maria St')
  })

  it('expands prefix when surname initials match', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Maria Samaridi',
      'Maria Sandowski',
    ]))

    expect(labels.get('emp-1')).toBe('Maria Sam')
    expect(labels.get('emp-2')).toBe('Maria San')
  })

  it('distinguishes Παπαδόπουλος and Πασιόπουλος with shortest unique prefixes', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Κωνσταντίνος Πασιόπουλος',
      'Κωνσταντίνος Παπαδόπουλος',
    ]))

    expect(labels.get('emp-1')).toBe('Κωνσταντίνος Πασ')
    expect(labels.get('emp-2')).toBe('Κωνσταντίνος Παπ')
  })

  it('expands prefix only as far as necessary', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Alex Anderson',
      'Alex Andrews',
    ]))

    // Length 4 distinguishes Ande vs Andr; length 5 is unnecessary.
    expect(labels.get('emp-1')).toBe('Alex Ande')
    expect(labels.get('emp-2')).toBe('Alex Andr')
  })

  it('supports three employees requiring different prefix lengths', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Nikolaos Papadopoulos',
      'Nikolaos Papathanasiou',
      'Nikolaos Pappas',
    ]))

    expect(labels.get('emp-1')).toBe('Nikolaos Papad')
    expect(labels.get('emp-2')).toBe('Nikolaos Papat')
    expect(labels.get('emp-3')).toBe('Nikolaos Papp')
  })

  it('compares first names case-insensitively', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'maria stone',
      'MARIA SMITH',
    ]))

    // Original casing is preserved in the displayed label.
    expect(labels.get('emp-1')).toBe('maria st')
    expect(labels.get('emp-2')).toBe('MARIA SM')
  })

  it('normalizes leading and trailing whitespace', () => {
    const labels = buildUniqueEmployeeDisplayLabels([
      { id: 'a', full_name: '  Sofia   Victoratou  ' },
      { id: 'b', name: '\tLefteris\tPsilos\n' },
    ])

    expect(labels.get('a')).toBe('Sofia V')
    expect(labels.get('b')).toBe('Lefteris P')
    expect(splitEmployeeDisplayNameParts('  Sofia   Victoratou  ')).toEqual({
      firstName: 'Sofia',
      surname: 'Victoratou',
      fullName: 'Sofia Victoratou',
    })
  })

  it('compares Greek accented names with diacritic-insensitive normalization', () => {
    expect(normalizeEmployeeNameForComparison('Πασιόπουλος'))
      .toBe(normalizeEmployeeNameForComparison('Πασιοπουλος'))

    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Νίκος Πασιόπουλος',
      'Νικος Παπαδόπουλος',
    ]))

    expect(labels.get('emp-1')).toBe('Νίκος Πασ')
    expect(labels.get('emp-2')).toBe('Νικος Παπ')
  })

  it('handles Latin names without altering original casing', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'McKenzie OBrien',
      'Lefteris Psilos',
    ]))

    expect(labels.get('emp-1')).toBe('McKenzie O')
    expect(labels.get('emp-2')).toBe('Lefteris P')
  })

  it('shows the full available name when surname is missing', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Sofia',
      'Evie Samaridi',
    ]))

    expect(labels.get('emp-1')).toBe('Sofia')
    expect(labels.get('emp-2')).toBe('Evie S')
  })

  it('handles single-word employee names without fabricating initials', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames(['Madonna']))
    expect(labels.get('emp-1')).toBe('Madonna')
  })

  it('uses the complete surname when identical full names cannot be disambiguated', () => {
    const labels = buildUniqueEmployeeDisplayLabels(employeesFromNames([
      'Maria Smith',
      'Maria Smith',
    ]))

    expect(labels.get('emp-1')).toBe('Maria Smith')
    expect(labels.get('emp-2')).toBe('Maria Smith')
  })

  it('does not mutate the input collection or employee objects', () => {
    const employees = employeesFromNames(['Evie Samaridi', 'Maria Stone'])
    const snapshot = structuredClone(employees)

    buildUniqueEmployeeDisplayLabels(employees)

    expect(employees).toEqual(snapshot)
  })

  it('returns deterministic labels across repeated runs', () => {
    const employees = employeesFromNames([
      'Κωνσταντίνος Πασιόπουλος',
      'Κωνσταντίνος Παπαδόπουλος',
      'Sofia Victoratou',
    ])

    const first = buildUniqueEmployeeDisplayLabels(employees)
    const second = buildUniqueEmployeeDisplayLabels(employees)

    expect(Object.fromEntries(first)).toEqual(Object.fromEntries(second))
  })

  it('does not expose employee IDs in display labels', () => {
    const labels = buildUniqueEmployeeDisplayLabels([
      { id: 'uuid-secret-99', full_name: 'Alex Rivera' },
      { id: 'uuid-secret-12', full_name: 'Alex Romano' },
    ])

    // Shortest unique surname prefixes are Ri / Ro.
    expect(labels.get('uuid-secret-99')).toBe('Alex Ri')
    expect(labels.get('uuid-secret-12')).toBe('Alex Ro')
    expect(labels.get('uuid-secret-99')).not.toContain('uuid')
    expect(labels.get('uuid-secret-12')).not.toContain('12')
  })
})
