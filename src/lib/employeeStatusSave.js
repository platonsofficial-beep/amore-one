// 0036 — "Disabled" in the Edit employee form does exactly what the Disable
// action does (set_employee_access via setEmployeeEnabled), never a bare
// status write. Choosing another status for a disabled person enables them.
export const EMPLOYEE_FORM_DISABLED_STATUS = 'Disabled'

const isDisabledRecord = (employee) => Boolean(employee) && (
  employee.active === false
  || `${employee.status ?? ''}`.trim().toLowerCase() === EMPLOYEE_FORM_DISABLED_STATUS.toLowerCase()
)

export function planEmployeeStatusSave({ editingEmployee = null, formStatus = '' } = {}) {
  const wantsDisabled = `${formStatus ?? ''}`.trim().toLowerCase() === EMPLOYEE_FORM_DISABLED_STATUS.toLowerCase()
  const wasDisabled = isDisabledRecord(editingEmployee)

  if (!editingEmployee) {
    // New people are never created disabled.
    return { payloadStatus: wantsDisabled ? 'Working' : formStatus, accessChange: null, needsConfirm: false }
  }
  if (wantsDisabled && !wasDisabled) {
    const keep = `${editingEmployee.status ?? ''}`.trim() || 'Working'
    return { payloadStatus: keep, accessChange: 'disable', needsConfirm: true }
  }
  if (wantsDisabled && wasDisabled) {
    return { payloadStatus: EMPLOYEE_FORM_DISABLED_STATUS, accessChange: null, needsConfirm: false }
  }
  if (!wantsDisabled && wasDisabled) {
    return { payloadStatus: formStatus, accessChange: 'enable', needsConfirm: false }
  }
  return { payloadStatus: formStatus, accessChange: null, needsConfirm: false }
}

export function buildEmployeeStatusOptions(baseOptions = [], { isEditing = false } = {}) {
  return isEditing
    ? [...baseOptions, { value: EMPLOYEE_FORM_DISABLED_STATUS, label: EMPLOYEE_FORM_DISABLED_STATUS }]
    : baseOptions
}

export function disableConfirmMessage(employee) {
  const name = employee?.full_name ?? employee?.name ?? 'this person'
  return `Disable ${name}? They can't sign in and their upcoming shifts are hidden. You can enable them again any time.`
}
