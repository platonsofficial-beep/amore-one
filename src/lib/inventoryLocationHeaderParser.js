/**
 * P8.29.15 — Operator-qualified location header parser.
 *
 * Separates canonical location type from counter/operator suffix.
 * Example: "Storage Tasos" → locationKey "Storage", operatorLabel "Tasos".
 * Pure, deterministic. No UI / network / SQL.
 */

/**
 * Canonical location prefixes (longest first for matching).
 * Display forms are the bindable location keys.
 */
export const INVENTORY_LOCATION_HEADER_PREFIXES = Object.freeze([
  Object.freeze({ normalized: 'coffee station', locationKey: 'Coffee Station', sourceField: 'coffee_station' }),
  Object.freeze({ normalized: 'water storage', locationKey: 'Water Storage', sourceField: 'water_storage' }),
  Object.freeze({ normalized: 'wine storage', locationKey: 'Wine Storage', sourceField: 'wine_storage' }),
  Object.freeze({ normalized: 'main storage', locationKey: 'Main Storage', sourceField: 'main_storage' }),
  Object.freeze({ normalized: 'storage', locationKey: 'Storage', sourceField: 'storage' }),
  Object.freeze({ normalized: 'kitchen', locationKey: 'Kitchen', sourceField: 'kitchen' }),
  Object.freeze({ normalized: 'freezer', locationKey: 'Freezer', sourceField: 'freezer' }),
  Object.freeze({ normalized: 'fridge', locationKey: 'Fridge', sourceField: 'fridge' }),
  Object.freeze({ normalized: 'terrace', locationKey: 'Terrace', sourceField: 'terrace' }),
  Object.freeze({ normalized: 'bar', locationKey: 'Bar', sourceField: 'bar' }),
  Object.freeze({ normalized: 'other', locationKey: 'Other', sourceField: 'other' }),
])

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeHeaderText(value) {
  return asTrimmedString(value).toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Parse a quantity-location column header into location type + operator label.
 *
 * @param {unknown} headerOrLabel
 * @returns {{
 *   matched: boolean,
 *   sourceHeader: string,
 *   locationKey: string|null,
 *   locationKeyNormalized: string|null,
 *   operatorLabel: string|null,
 *   sourceField: string|null,
 * }}
 */
export function parseInventoryLocationHeader(headerOrLabel) {
  let sourceHeader = ''
  if (headerOrLabel !== null && typeof headerOrLabel === 'object' && !Array.isArray(headerOrLabel)) {
    if (headerOrLabel.isBlank) {
      return Object.freeze({
        matched: false,
        sourceHeader: '',
        locationKey: null,
        locationKeyNormalized: null,
        operatorLabel: null,
        sourceField: null,
      })
    }
    sourceHeader = asTrimmedString(
      headerOrLabel.sourceHeader ?? headerOrLabel.normalized ?? headerOrLabel,
    )
  } else {
    sourceHeader = asTrimmedString(headerOrLabel)
  }

  if (!sourceHeader) {
    return Object.freeze({
      matched: false,
      sourceHeader: '',
      locationKey: null,
      locationKeyNormalized: null,
      operatorLabel: null,
      sourceField: null,
    })
  }

  const normalized = normalizeHeaderText(
    (headerOrLabel !== null && typeof headerOrLabel === 'object' && !Array.isArray(headerOrLabel))
      ? (headerOrLabel.normalized || sourceHeader)
      : sourceHeader,
  )

  for (const prefix of INVENTORY_LOCATION_HEADER_PREFIXES) {
    if (normalized === prefix.normalized) {
      return Object.freeze({
        matched: true,
        sourceHeader,
        locationKey: prefix.locationKey,
        locationKeyNormalized: prefix.normalized,
        operatorLabel: null,
        sourceField: prefix.sourceField,
      })
    }
    if (normalized.startsWith(`${prefix.normalized} `)) {
      const prefixWordCount = prefix.normalized.split(' ').length
      const originalParts = asTrimmedString(sourceHeader).split(/\s+/).filter(Boolean)
      const operatorFromOriginal = originalParts.slice(prefixWordCount).join(' ')
      const operatorLabel = operatorFromOriginal
        || asTrimmedString(normalized.slice(prefix.normalized.length))
        || null
      return Object.freeze({
        matched: true,
        sourceHeader,
        locationKey: prefix.locationKey,
        locationKeyNormalized: prefix.normalized,
        operatorLabel,
        sourceField: prefix.sourceField,
      })
    }
  }

  return Object.freeze({
    matched: false,
    sourceHeader,
    locationKey: null,
    locationKeyNormalized: null,
    operatorLabel: null,
    sourceField: null,
  })
}
