function toTitleWords(value) {
  return `${value ?? ''}`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function stripRedundantShiftSuffix(name) {
  const stripped = `${name ?? ''}`.replace(/\s+shift$/i, '').trim()
  return stripped || `${name ?? ''}`.trim()
}

/**
 * Display-only shift name. Stored template names are left unchanged.
 * "Evening Shift" and "Evening" both read as "Evening".
 */
export function formatScheduleShiftDisplayName(templateName, department) {
  const name = stripRedundantShiftSuffix(templateName)
  const dept = `${department ?? ''}`.trim()

  if (!name) return 'Shift'
  if (!dept) return toTitleWords(name)

  const normalizedName = name.toLowerCase()
  const normalizedDept = dept.toLowerCase()

  if (normalizedName.startsWith(normalizedDept)) {
    const remainder = name.slice(dept.length).trim().replace(/^[-–—\s]+/, '')
    if (remainder) return toTitleWords(stripRedundantShiftSuffix(remainder))
  }

  return toTitleWords(name)
}
