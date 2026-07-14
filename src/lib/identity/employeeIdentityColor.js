import {
  IDENTITY_COLOR_PALETTE,
  IDENTITY_NEUTRAL_COLOR,
  getIdentityColorById,
  isPaletteColorId,
} from './identityColorPalette'

/**
 * @typedef {Readonly<Record<string, string>>} IdentityColorRegistry
 */

/**
 * @param {Record<string, string>} [assignments]
 * @returns {IdentityColorRegistry}
 */
export function createIdentityColorRegistry(assignments = {}) {
  const normalized = {}

  Object.entries(assignments).forEach(([colorId, employeeId]) => {
    const normalizedColorId = `${colorId ?? ''}`.trim()
    const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
    if (!normalizedColorId || !normalizedEmployeeId || !isPaletteColorId(normalizedColorId)) {
      return
    }
    normalized[normalizedColorId] = normalizedEmployeeId
  })

  return Object.freeze(normalized)
}

/**
 * @returns {readonly import('./identityColorPalette').IdentityColor[]}
 */
export function getAvailableIdentityColors(registry = {}, { exceptEmployeeId = null } = {}) {
  const exceptId = `${exceptEmployeeId ?? ''}`.trim()

  return IDENTITY_COLOR_PALETTE.filter((color) => (
    isIdentityColorAvailable(color.id, registry, { exceptEmployeeId: exceptId })
  ))
}

export function isIdentityColorAvailable(colorId, registry = {}, { exceptEmployeeId = null } = {}) {
  const normalizedColorId = `${colorId ?? ''}`.trim()
  if (!isPaletteColorId(normalizedColorId)) {
    return false
  }

  const holder = registry[normalizedColorId]
  if (!holder) {
    return true
  }

  const exceptId = `${exceptEmployeeId ?? ''}`.trim()
  return Boolean(exceptId && holder === exceptId)
}

/**
 * @param {IdentityColorRegistry} registry
 * @param {string} colorId
 * @param {string | number} employeeId
 * @returns {IdentityColorRegistry}
 */
export function reserveIdentityColor(registry, colorId, employeeId) {
  const normalizedColorId = `${colorId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()

  if (!normalizedColorId || !normalizedEmployeeId || !isPaletteColorId(normalizedColorId)) {
    return registry
  }

  const holder = registry[normalizedColorId]
  if (holder && holder !== normalizedEmployeeId) {
    return registry
  }

  return Object.freeze({
    ...registry,
    [normalizedColorId]: normalizedEmployeeId,
  })
}

/**
 * @param {IdentityColorRegistry} registry
 * @param {string} colorId
 * @param {string | number} employeeId
 * @returns {IdentityColorRegistry}
 */
export function releaseIdentityColor(registry, colorId, employeeId) {
  const normalizedColorId = `${colorId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()

  if (!normalizedColorId || !normalizedEmployeeId) {
    return registry
  }

  if (registry[normalizedColorId] !== normalizedEmployeeId) {
    return registry
  }

  const next = { ...registry }
  delete next[normalizedColorId]
  return Object.freeze(next)
}

/**
 * @param {object | null | undefined} employee
 * @returns {import('./identityColorPalette').IdentityColor}
 */
export function getEmployeeIdentityColor(employee) {
  const requested = `${employee?.identityColor ?? ''}`.trim()
  if (requested && isPaletteColorId(requested)) {
    return getIdentityColorById(requested) ?? IDENTITY_NEUTRAL_COLOR
  }
  return IDENTITY_NEUTRAL_COLOR
}
