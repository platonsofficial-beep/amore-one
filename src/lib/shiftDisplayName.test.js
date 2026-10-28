import { describe, expect, it } from 'vitest'
import { buildShiftDisplayNames, lookupShiftDisplayName } from './shiftDisplayName'

function people(names) {
  return names.map((name, index) => ({ id: `emp-${index + 1}`, full_name: name }))
}

describe('buildShiftDisplayNames', () => {
  it('uses the full first name and surname initial when first names are unique', () => {
    const labels = buildShiftDisplayNames(people([
      'Lucas Morgan',
      'Katerina Papadopoulou',
    ]))

    expect(labels.get('emp-1')).toBe('Lucas M.')
    expect(labels.get('emp-2')).toBe('Katerina P.')
  })

  it('keeps a single initial when the same first name has different surname initials', () => {
    const labels = buildShiftDisplayNames(people([
      'Maria Stone',
      'Maria Alvarez',
    ]))

    expect(labels.get('emp-1')).toBe('Maria S.')
    expect(labels.get('emp-2')).toBe('Maria A.')
  })

  it('extends the surname prefix until shared initials differ', () => {
    const labels = buildShiftDisplayNames(people([
      'Konstantinos Pasiopoulos',
      'Konstantinos Papadimopoulos',
    ]))

    expect(labels.get('emp-1')).toBe('Konstantinos Pas.')
    expect(labels.get('emp-2')).toBe('Konstantinos Pap.')
  })

  it('extends Greek surname prefixes the same way', () => {
    const labels = buildShiftDisplayNames(people([
      'Κωνσταντίνος Πασιόπουλος',
      'Κωνσταντίνος Παπαδόπουλος',
    ]))

    expect(labels.get('emp-1')).toBe('Κωνσταντίνος Πασ.')
    expect(labels.get('emp-2')).toBe('Κωνσταντίνος Παπ.')
  })

  it('shows the first name alone when there is no surname', () => {
    const labels = buildShiftDisplayNames(people(['Lucas', 'Katerina Papadopoulou']))

    expect(labels.get('emp-1')).toBe('Lucas')
    expect(labels.get('emp-2')).toBe('Katerina P.')
  })

  it('does not crash when two employees have the identical full name', () => {
    const names = ['Konstantinos Pasiopoulos', 'Konstantinos Pasiopoulos']

    expect(() => buildShiftDisplayNames(people(names))).not.toThrow()

    const labels = buildShiftDisplayNames(people(names))
    expect(labels.get('emp-1')).toBeTruthy()
    expect(labels.get('emp-2')).toBe(labels.get('emp-1'))
    expect(labels.get('emp-1')).toContain('Konstantinos')
  })
})

describe('lookupShiftDisplayName', () => {
  it('reads the workspace label by employee id and falls back from a full name', () => {
    const labels = buildShiftDisplayNames(people(['Evie Samaridi']))

    expect(lookupShiftDisplayName(labels, 'emp-1', 'Evie Samaridi')).toBe('Evie S.')
    expect(lookupShiftDisplayName(labels, '', 'Lucas Morgan')).toBe('Lucas M.')
    expect(lookupShiftDisplayName(labels, '', '')).toBe('Unassigned')
  })
})
