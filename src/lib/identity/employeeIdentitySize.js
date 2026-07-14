export const EMPLOYEE_IDENTITY_SIZES = Object.freeze({
  xs: Object.freeze({ sizePx: 24, fontSizeRem: 0.62, ringWidthPx: 1.5 }),
  sm: Object.freeze({ sizePx: 32, fontSizeRem: 0.72, ringWidthPx: 2 }),
  md: Object.freeze({ sizePx: 40, fontSizeRem: 0.82, ringWidthPx: 2 }),
  lg: Object.freeze({ sizePx: 52, fontSizeRem: 0.95, ringWidthPx: 2.5 }),
  xl: Object.freeze({ sizePx: 64, fontSizeRem: 1.1, ringWidthPx: 3 }),
})

export const EMPLOYEE_IDENTITY_SIZE_KEYS = Object.freeze(Object.keys(EMPLOYEE_IDENTITY_SIZES))

const DEFAULT_SIZE = EMPLOYEE_IDENTITY_SIZES.md

/**
 * @param {string | null | undefined} size
 * @returns {typeof DEFAULT_SIZE}
 */
export function resolveEmployeeIdentitySize(size) {
  const normalized = `${size ?? ''}`.trim().toLowerCase()
  if (normalized && Object.prototype.hasOwnProperty.call(EMPLOYEE_IDENTITY_SIZES, normalized)) {
    return EMPLOYEE_IDENTITY_SIZES[normalized]
  }
  return DEFAULT_SIZE
}
