// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  focusNextEmployeeFormField,
  getEmployeeFormFocusableFields,
  handleEmployeeFormEnterKey,
} from './employeeFormNavigation'

function createEmployeeFormMarkup() {
  document.body.innerHTML = `
    <form class="employee-form employee-premium-form" id="employee-form">
      <input id="first-name" type="text" />
      <input id="last-name" type="text" />
      <button type="button" class="employee-premium-field-select-trigger" id="department">Department</button>
      <input id="primary-position" class="employee-premium-position-input" type="text" />
      <button type="button" class="employee-premium-date-trigger" id="start-date">Start Date</button>
      <input id="weekly-hours" type="text" />
      <input id="phone-local" type="tel" />
      <input id="email" type="email" />
      <textarea id="notes" class="employee-premium-notes-input"></textarea>
      <button type="button" class="employee-premium-form-cancel-btn" id="cancel">Cancel</button>
      <button type="submit" class="employee-premium-form-save-btn" id="save">Save</button>
    </form>
  `
  return document.getElementById('employee-form')
}

describe('getEmployeeFormFocusableFields', () => {
  it('returns focusable employee fields in DOM order and skips cancel', () => {
    const form = createEmployeeFormMarkup()
    const fields = getEmployeeFormFocusableFields(form)

    expect(fields.map((field) => field.id)).toEqual([
      'first-name',
      'last-name',
      'department',
      'primary-position',
      'start-date',
      'weekly-hours',
      'phone-local',
      'email',
      'notes',
      'save',
    ])
  })
})

describe('focusNextEmployeeFormField', () => {
  it('moves focus to the next eligible field', () => {
    createEmployeeFormMarkup()
    const firstName = document.getElementById('first-name')
    const lastName = document.getElementById('last-name')
    firstName.focus()

    expect(focusNextEmployeeFormField(firstName)).toBe(true)
    expect(document.activeElement).toBe(lastName)
  })
})

describe('handleEmployeeFormEnterKey', () => {
  it('moves focus on Enter in text inputs', () => {
    createEmployeeFormMarkup()
    const firstName = document.getElementById('first-name')
    const lastName = document.getElementById('last-name')
    firstName.focus()

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: firstName })
    event.preventDefault = () => {
      Object.defineProperty(event, 'defaultPrevented', { value: true })
    }

    expect(handleEmployeeFormEnterKey(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(lastName)
  })

  it('allows newline in textarea fields', () => {
    createEmployeeFormMarkup()
    const notes = document.getElementById('notes')
    notes.focus()

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    Object.defineProperty(event, 'target', { value: notes })

    expect(handleEmployeeFormEnterKey(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('does not advance when primary position suggestions are open', () => {
    createEmployeeFormMarkup()
    const primaryPosition = document.getElementById('primary-position')
    primaryPosition.setAttribute('aria-expanded', 'true')
    primaryPosition.focus()

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: primaryPosition })

    expect(handleEmployeeFormEnterKey(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })
})
