// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  focusNextReservationFormField,
  getReservationFormFocusableFields,
  handleReservationFormEnterKey,
} from './reservationFormNavigation'

function createFormMarkup() {
  document.body.innerHTML = `
    <form id="reservation-form">
      <input id="guest" type="text" />
      <div class="reservation-phone-field">
        <select id="country"><option value="+357">CY +357</option></select>
        <input id="phone" type="tel" />
      </div>
      <textarea id="notes"></textarea>
      <button type="button" id="save">Save</button>
    </form>
  `
  return document.getElementById('reservation-form')
}

describe('getReservationFormFocusableFields', () => {
  it('returns focusable reservation fields in DOM order', () => {
    const form = createFormMarkup()
    const fields = getReservationFormFocusableFields(form)

    expect(fields.map((field) => field.id)).toEqual(['guest', 'country', 'phone', 'notes'])
  })
})

describe('focusNextReservationFormField', () => {
  it('moves focus to the next field', () => {
    createFormMarkup()
    const guest = document.getElementById('guest')
    const country = document.getElementById('country')
    guest.focus()

    expect(focusNextReservationFormField(guest)).toBe(true)
    expect(document.activeElement).toBe(country)
  })
})

describe('handleReservationFormEnterKey', () => {
  it('moves focus on Enter in text inputs', () => {
    createFormMarkup()
    const guest = document.getElementById('guest')
    const country = document.getElementById('country')
    guest.focus()

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: guest })
    let handled = false
    event.preventDefault = () => {
      Object.defineProperty(event, 'defaultPrevented', { value: true })
    }
    handled = handleReservationFormEnterKey(event)

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(country)
  })

  it('allows newline in textarea fields', () => {
    createFormMarkup()
    const notes = document.getElementById('notes')
    notes.focus()

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    Object.defineProperty(event, 'target', { value: notes })
    const handled = handleReservationFormEnterKey(event)

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })
})
