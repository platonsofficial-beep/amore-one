import { describe, expect, it } from 'vitest'
import { resolveDisplayedLinkedEmployee } from './linkedEmployeeDisplay'

const employees = [
  { id: 'emp-1', name: 'Platon Sachinis' },
  { id: 'emp-2', name: 'Alex Stone' },
]

describe('resolveDisplayedLinkedEmployee', () => {
  it('shows a unique name match without treating it as a saved link', () => {
    expect(resolveDisplayedLinkedEmployee(employees, {
      employeeId: '',
      displayName: 'Platon Sachinis',
    })).toEqual({
      name: 'Platon Sachinis',
      persisted: false,
      matchedByName: true,
    })
  })

  it('uses the saved employee id when one exists', () => {
    expect(resolveDisplayedLinkedEmployee(employees, {
      employeeId: 'emp-2',
      displayName: 'Platon Sachinis',
    })).toEqual({
      name: 'Alex Stone',
      persisted: true,
      matchedByName: false,
    })
  })

  it('stays unlinked when more than one employee shares the name', () => {
    expect(resolveDisplayedLinkedEmployee([
      { id: 'a', name: 'Alex Stone' },
      { id: 'b', fullName: 'Alex Stone' },
    ], { displayName: 'Alex Stone' })).toEqual({
      name: null,
      persisted: false,
      matchedByName: false,
    })
  })
})
