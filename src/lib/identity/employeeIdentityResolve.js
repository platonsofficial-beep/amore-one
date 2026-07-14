import { getEmployeeInitials } from './employeeInitials'
import { getEmployeeIdentityColor } from './employeeIdentityColor'

export const EMPLOYEE_IDENTITY_MODES = Object.freeze({
  PHOTO: 'photo',
  INITIALS: 'initials',
  UNKNOWN: 'unknown',
})

export function resolveEmployeeDisplayName(employee) {
  if (!employee) {
    return ''
  }

  return `${employee.full_name ?? employee.fullName ?? employee.name ?? ''}`.trim()
}

export function resolveEmployeeDisplayRole(employee) {
  if (!employee) {
    return ''
  }

  const positionNames = Array.isArray(employee.positions)
    ? employee.positions.map((position) => `${position?.name ?? ''}`.trim()).filter(Boolean)
    : []

  if (positionNames.length > 0) {
    return positionNames.join(' · ')
  }

  return `${employee.position ?? employee.role ?? ''}`.trim()
}

export function resolveEmployeePhotoUrl(employee) {
  const url = `${employee?.photoUrl ?? ''}`.trim()
  if (!url) {
    return ''
  }

  const version = `${employee?.avatarVersion ?? ''}`.trim()
  if (!version) {
    return url
  }

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${encodeURIComponent(version)}`
}

/**
 * @param {object | null | undefined} employee
 * @returns {{
 *   mode: string,
 *   name: string,
 *   role: string,
 *   initials: string,
 *   photoUrl: string,
 *   color: import('./identityColorPalette').IdentityColor,
 *   ariaLabel: string,
 * }}
 */
export function resolveEmployeeIdentityPresentation(employee) {
  const name = resolveEmployeeDisplayName(employee)
  const role = resolveEmployeeDisplayRole(employee)
  const color = getEmployeeIdentityColor(employee)
  const photoUrl = resolveEmployeePhotoUrl(employee)

  if (!employee) {
    return Object.freeze({
      mode: EMPLOYEE_IDENTITY_MODES.UNKNOWN,
      name: '',
      role: '',
      initials: '',
      photoUrl: '',
      color,
      ariaLabel: 'Unknown employee',
    })
  }

  if (photoUrl) {
    const ariaLabel = name ? `${name} profile photo` : 'Employee profile photo'
    return Object.freeze({
      mode: EMPLOYEE_IDENTITY_MODES.PHOTO,
      name,
      role,
      initials: getEmployeeInitials(name),
      photoUrl,
      color,
      ariaLabel,
    })
  }

  const initials = getEmployeeInitials(name)
  if (initials) {
    const ariaLabel = name ? `${name}, ${initials}` : initials
    return Object.freeze({
      mode: EMPLOYEE_IDENTITY_MODES.INITIALS,
      name,
      role,
      initials,
      photoUrl: '',
      color,
      ariaLabel,
    })
  }

  return Object.freeze({
    mode: EMPLOYEE_IDENTITY_MODES.UNKNOWN,
    name,
    role,
    initials: '',
    photoUrl: '',
    color,
    ariaLabel: name ? `${name}, unknown employee` : 'Unknown employee',
  })
}
