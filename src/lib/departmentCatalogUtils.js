const APOSTROPHE_VARIANTS = /[\u2018\u2019]/g
const EN_DASH = /\u2013/g
const EM_DASH = /\u2014/g
const WHITESPACE = /\s+/g
const KEY_SEPARATOR = /[\s/&-]+/g
const UNDERSCORE_RUNS = /_+/g
const LEADING_TRAILING_UNDERSCORES = /^_|_$/g

function toSafeString(value) {
  if (value === null || value === undefined) return ''
  return `${value}`
}

function normalizeCatalogKeyFromText(normalizedText) {
  if (!normalizedText) return ''

  return normalizedText
    .replace(/'/g, '')
    .replace(KEY_SEPARATOR, '_')
    .replace(UNDERSCORE_RUNS, '_')
    .replace(LEADING_TRAILING_UNDERSCORES, '')
}

export function normalizeCatalogText(value) {
  const normalized = toSafeString(value)
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(EN_DASH, '-')
    .replace(EM_DASH, '-')
    .trim()
    .replace(WHITESPACE, ' ')
    .toLowerCase()

  return normalized
}

export function normalizeDepartmentKey(value) {
  return normalizeCatalogKeyFromText(normalizeCatalogText(value))
}

export function normalizePositionKey(value) {
  return normalizeCatalogKeyFromText(normalizeCatalogText(value))
}

export function departmentLabelsMatch(left, right) {
  const leftKey = normalizeDepartmentKey(left)
  const rightKey = normalizeDepartmentKey(right)

  if (!leftKey || !rightKey) return false
  return leftKey === rightKey
}

export function positionLabelsMatch(left, right) {
  const leftKey = normalizePositionKey(left)
  const rightKey = normalizePositionKey(right)

  if (!leftKey || !rightKey) return false
  return leftKey === rightKey
}

function normalizeAliasList(aliases) {
  if (!Array.isArray(aliases)) return []

  return aliases
    .map((alias) => toSafeString(alias).trim())
    .filter(Boolean)
}

function normalizeFilterDepartmentKey(departmentKey) {
  const normalized = normalizeDepartmentKey(departmentKey)
  return normalized || null
}

function isEntryEligibleForDepartment(entry, filterDepartmentKey) {
  if (!filterDepartmentKey) return true

  const entryDepartmentKey = normalizeDepartmentKey(entry?.departmentKey ?? '')
  if (!entryDepartmentKey) return false

  return entryDepartmentKey === filterDepartmentKey
}

/**
 * Collection-wide exact match with priority: all keys, then all labels, then all aliases.
 * When duplicate aliases exist, the first matching entry in catalog order wins.
 */
function findMatchingCatalogEntry(value, entries, {
  normalizeKey,
  filterDepartmentKey = null,
}) {
  if (!Array.isArray(entries) || entries.length === 0) return null

  const valueKey = normalizeKey(value)
  if (!valueKey) return null

  const eligibleEntries = entries.filter((entry) => isEntryEligibleForDepartment(entry, filterDepartmentKey))

  for (const entry of eligibleEntries) {
    const entryKey = normalizeKey(entry?.key ?? '')
    if (entryKey && entryKey === valueKey) return entry
  }

  for (const entry of eligibleEntries) {
    const labelKey = normalizeKey(entry?.label ?? '')
    if (labelKey && labelKey === valueKey) return entry
  }

  for (const entry of eligibleEntries) {
    for (const alias of normalizeAliasList(entry?.aliases)) {
      const aliasKey = normalizeKey(alias)
      if (aliasKey && aliasKey === valueKey) return entry
    }
  }

  return null
}

export function findMatchingDepartment(value, departments) {
  return findMatchingCatalogEntry(value, departments, {
    normalizeKey: normalizeDepartmentKey,
  })
}

export function findMatchingPosition(value, positions, departmentKey) {
  return findMatchingCatalogEntry(value, positions, {
    normalizeKey: normalizePositionKey,
    filterDepartmentKey: normalizeFilterDepartmentKey(departmentKey),
  })
}

export function isLegacyDepartmentValue(value, departments) {
  const trimmed = toSafeString(value).trim()
  if (!trimmed) return false

  return findMatchingDepartment(trimmed, departments) === null
}

export function isLegacyPositionValue(value, positions, departmentKey) {
  const trimmed = toSafeString(value).trim()
  if (!trimmed) return false

  return findMatchingPosition(trimmed, positions, departmentKey) === null
}

function optionMatchesValue(option, value, normalizeKey) {
  if (!option || typeof option !== 'object') return false

  const valueKey = normalizeKey(value)
  if (!valueKey) return false

  const optionKey = normalizeKey(option.key ?? '')
  if (optionKey && optionKey === valueKey) return true

  const optionLabelKey = normalizeKey(option.label ?? '')
  if (optionLabelKey && optionLabelKey === valueKey) return true

  for (const alias of normalizeAliasList(option.aliases)) {
    const aliasKey = normalizeKey(alias)
    if (aliasKey && aliasKey === valueKey) return true
  }

  const legacyKey = `legacy:${valueKey}`
  if (toSafeString(option.key).trim() === legacyKey) return true

  return false
}

export function preserveLegacyCatalogOption(value, options, config = {}) {
  if (!Array.isArray(options)) return []

  const trimmedValue = toSafeString(value).trim()
  if (!trimmedValue) return options

  const normalizeKey = config?.type === 'position'
    ? normalizePositionKey
    : normalizeDepartmentKey

  if (options.some((option) => optionMatchesValue(option, trimmedValue, normalizeKey))) {
    return options
  }

  const syntheticOption = {
    key: `legacy:${normalizeKey(trimmedValue)}`,
    label: trimmedValue,
    legacy: true,
    custom: true,
  }

  if (config?.departmentKey !== undefined && config?.departmentKey !== null && `${config.departmentKey}`.trim()) {
    syntheticOption.departmentKey = `${config.departmentKey}`.trim()
  }

  if (config?.departmentLabel !== undefined && config?.departmentLabel !== null && `${config.departmentLabel}`.trim()) {
    syntheticOption.departmentLabel = `${config.departmentLabel}`.trim()
  }

  if (config?.type !== undefined && config?.type !== null && `${config.type}`.trim()) {
    syntheticOption.type = `${config.type}`.trim()
  }

  return [...options, syntheticOption]
}
