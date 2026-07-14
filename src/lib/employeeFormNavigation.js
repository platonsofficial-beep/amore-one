const EMPLOYEE_FORM_FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'button.employee-premium-field-select-trigger:not([disabled])',
  'button.employee-premium-date-trigger:not([disabled])',
  'button.employee-premium-position-trigger:not([disabled])',
  'button[class*="country-picker-trigger"]:not([disabled])',
  'button.employee-premium-position-chip:not([disabled])',
  'button.employee-premium-form-save-btn:not([disabled])',
].join(', ')

const EMPLOYEE_FORM_SKIP_FOCUS_CLASS_NAMES = [
  'employee-premium-form-close',
  'employee-premium-form-cancel-btn',
  'employee-premium-custom-position-btn',
]

export function getEmployeeFormFocusableFields(container) {
  if (!container) return []

  return Array.from(container.querySelectorAll(EMPLOYEE_FORM_FOCUSABLE_SELECTOR)).filter((element) => {
    if (!(element instanceof HTMLElement)) return false
    if (element.closest('[data-employee-form-skip-focus="true"]')) return false
    if (EMPLOYEE_FORM_SKIP_FOCUS_CLASS_NAMES.some((className) => element.classList.contains(className))) {
      return false
    }
    return true
  })
}

export function focusNextEmployeeFormField(currentElement) {
  const container = currentElement?.closest('.employee-premium-form')
    ?? currentElement?.closest('.employee-premium-form-modal')
  if (!container || !currentElement) return false

  const fields = getEmployeeFormFocusableFields(container)
  const index = fields.indexOf(currentElement)
  if (index >= 0 && index < fields.length - 1) {
    fields[index + 1].focus()
    return true
  }

  return false
}

export function handleEmployeeFormEnterKey(event) {
  if (event.key !== 'Enter') return false
  if (event.nativeEvent?.isComposing) return false

  const target = event.target
  if (!(target instanceof HTMLElement)) return false

  if (target.tagName === 'TEXTAREA') return false

  if (target.closest('.employee-premium-field-select-portal')) return false
  if (target.closest('.employee-premium-position-picker-portal')) return false
  if (target.closest('.employee-premium-date-picker-portal')) return false
  if (target.closest('.phone-country-picker-portal')) return false

  if (target.tagName === 'BUTTON') {
    if (target.type === 'submit') return false

    if (
      target.classList.contains('employee-premium-field-select-trigger')
      || target.classList.contains('employee-premium-date-trigger')
      || target.classList.contains('employee-premium-position-trigger')
      || `${target.className}`.includes('country-picker-trigger')
    ) {
      return false
    }

    return false
  }

  if (target.tagName === 'INPUT') {
    const inputType = `${target.getAttribute('type') ?? 'text'}`.toLowerCase()
    if (inputType === 'submit' || inputType === 'button') return false

    event.preventDefault()
    return focusNextEmployeeFormField(target)
  }

  return false
}
