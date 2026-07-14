/**
 * Build employee initials from a display name.
 * Uses first + last token only; middle names are ignored.
 *
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function getEmployeeInitials(name) {
  const parts = `${name ?? ''}`.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return ''
  }

  if (parts.length === 1) {
    return `${parts[0][0] ?? ''}`.toUpperCase()
  }

  const firstInitial = parts[0][0] ?? ''
  const lastInitial = parts[parts.length - 1][0] ?? ''

  return `${firstInitial}${lastInitial}`.toUpperCase()
}
