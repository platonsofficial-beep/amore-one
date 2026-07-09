const RESERVATION_FORM_FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'button.reservation-time-select-trigger:not([disabled])',
  'button.time-select-trigger:not([disabled])',
].join(', ')

export function getReservationFormFocusableFields(container) {
  if (!container) return []

  return Array.from(container.querySelectorAll(RESERVATION_FORM_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element instanceof HTMLInputElement && element.type === 'hidden') return false
    if (element.closest('[data-reservation-form-skip-focus="true"]')) return false
    return true
  })
}

export function focusNextReservationFormField(currentElement) {
  const container = currentElement?.closest('form') ?? currentElement?.closest('[data-reservation-form]')
  if (!container || !currentElement) return false

  const fields = getReservationFormFocusableFields(container)
  const index = fields.indexOf(currentElement)
  if (index >= 0 && index < fields.length - 1) {
    fields[index + 1].focus()
    return true
  }

  return false
}

export function handleReservationFormEnterKey(event) {
  if (event.key !== 'Enter') return false
  if (event.nativeEvent?.isComposing) return false

  const target = event.target
  if (!(target instanceof HTMLElement)) return false

  if (target.tagName === 'TEXTAREA') return false

  if (target.tagName === 'BUTTON') {
    if (
      target.classList.contains('reservation-time-select-trigger')
      || target.classList.contains('time-select-trigger')
    ) {
      event.preventDefault()
      return focusNextReservationFormField(target)
    }
    return false
  }

  if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
    const inputType = target.tagName === 'INPUT'
      ? `${target.getAttribute('type') ?? 'text'}`.toLowerCase()
      : 'select'

    if (inputType === 'submit' || inputType === 'button') return false

    event.preventDefault()
    return focusNextReservationFormField(target)
  }

  return false
}

export function preventReservationFormSubmit(event) {
  event.preventDefault()
}
