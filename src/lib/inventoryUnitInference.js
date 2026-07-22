/**
 * P8.16.14a — Deterministic unit inference from product names.
 *
 * Pure, immutable helper for new-product draft initialization.
 * No UI, network, database, parser, or matcher coupling.
 */

export const INVENTORY_UNIT_INFERENCE_STATUS = Object.freeze({
  INFERRED: 'inferred',
  AMBIGUOUS: 'ambiguous',
  NOT_FOUND: 'not_found',
})

export const INVENTORY_UNIT_INFERENCE_REASON = Object.freeze({
  EXPLICIT_SUPPORTED_VOLUME: 'explicit_supported_volume',
  PACKAGING_AMBIGUOUS: 'packaging_ambiguous',
  MULTIPLE_CONFLICTING_VOLUMES: 'multiple_conflicting_volumes',
  UNSUPPORTED_VOLUME: 'unsupported_volume',
  NO_VOLUME_TOKEN: 'no_volume_token',
})

export class InventoryUnitInferenceError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryUnitInferenceError'
    this.code = code
  }
}

/** @type {ReadonlyMap<number, string>} */
const SUPPORTED_VOLUME_UNITS = Object.freeze(new Map([
  [700, 'Bottle 700ml'],
  [750, 'Bottle 750ml'],
  [1000, 'Bottle 1L'],
  [1500, 'Bottle 1.5L'],
  [2000, 'Bottle 2L'],
]))

const PACKAGING_CONFLICT_RE = /\b(?:cans?|tins?|cases?|packs?|box(?:es)?|kegs?)\b/i

/**
 * Volume tokens with explicit boundaries.
 * Decimal comma/dot forms for litre sizes are included.
 */
const VOLUME_TOKEN_RE = /\b(\d+(?:[.,]\d+)?)\s*(cl|ml|lt|liters?|litres?|l)\b/gi
/** Multipack forms like 24x330ml where the size is not a standalone word. */
const MULTIPACK_VOLUME_RE = /[x×]\s*(\d+(?:[.,]\d+)?)\s*(ml|cl)\b/gi

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value
  if (Object.isFrozen(value)) return value

  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry)
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze(/** @type {Record<string, unknown>} */ (value)[key])
    }
  }

  return Object.freeze(value)
}

/**
 * @param {string} status
 * @param {string|null} proposedUnit
 * @param {number|null} normalizedVolumeMl
 * @param {string|null} matchedToken
 * @param {string} reason
 */
function result(status, proposedUnit, normalizedVolumeMl, matchedToken, reason) {
  return deepFreeze({
    status,
    proposedUnit,
    normalizedVolumeMl,
    matchedToken,
    reason,
  })
}

/**
 * @param {string} rawAmount
 * @returns {number|null}
 */
function parseAmount(rawAmount) {
  const normalized = String(rawAmount).replace(',', '.')
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

/**
 * @param {number} amount
 * @param {string} unitToken
 * @returns {number|null}
 */
function toMilliliters(amount, unitToken) {
  const unit = unitToken.toLowerCase()
  if (unit === 'ml') return Math.round(amount)
  if (unit === 'cl') return Math.round(amount * 10)
  if (unit === 'l' || unit === 'lt' || unit.startsWith('liter') || unit.startsWith('litre')) {
    return Math.round(amount * 1000)
  }
  return null
}

/**
 * @param {string} productName
 * @returns {Array<{ ml: number, token: string }>}
 */
function collectVolumeMatches(productName) {
  /** @type {Array<{ ml: number, token: string }>} */
  const matches = []

  VOLUME_TOKEN_RE.lastIndex = 0
  let match = VOLUME_TOKEN_RE.exec(productName)
  while (match) {
    const amount = parseAmount(match[1])
    const ml = amount == null ? null : toMilliliters(amount, match[2])
    if (ml != null) {
      matches.push({ ml, token: match[0] })
    }
    match = VOLUME_TOKEN_RE.exec(productName)
  }

  MULTIPACK_VOLUME_RE.lastIndex = 0
  match = MULTIPACK_VOLUME_RE.exec(productName)
  while (match) {
    const amount = parseAmount(match[1])
    const ml = amount == null ? null : toMilliliters(amount, match[2])
    if (ml != null) {
      matches.push({ ml, token: match[0] })
    }
    match = MULTIPACK_VOLUME_RE.exec(productName)
  }

  return matches
}

/**
 * Infer a V1 Bottle unit from an explicit, unambiguous volume token in a product name.
 *
 * @param {unknown} productName
 * @returns {{
 *   status: 'inferred'|'ambiguous'|'not_found',
 *   proposedUnit: string|null,
 *   normalizedVolumeMl: number|null,
 *   matchedToken: string|null,
 *   reason: string,
 * }}
 */
export function inferInventoryUnitFromProductName(productName) {
  if (productName === null || productName === undefined) {
    return result(
      INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
      null,
      null,
      null,
      INVENTORY_UNIT_INFERENCE_REASON.NO_VOLUME_TOKEN,
    )
  }
  if (typeof productName !== 'string') {
    throw new InventoryUnitInferenceError(
      'INVALID_PRODUCT_NAME',
      'Unit inference expects a string product name, null, or undefined.',
    )
  }

  const trimmed = productName.trim()
  if (trimmed === '') {
    return result(
      INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
      null,
      null,
      null,
      INVENTORY_UNIT_INFERENCE_REASON.NO_VOLUME_TOKEN,
    )
  }

  const hasPackagingConflict = PACKAGING_CONFLICT_RE.test(trimmed)
  const volumes = collectVolumeMatches(trimmed)

  if (volumes.length === 0) {
    return result(
      INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
      null,
      null,
      null,
      INVENTORY_UNIT_INFERENCE_REASON.NO_VOLUME_TOKEN,
    )
  }

  /** @type {Map<number, string>} */
  const uniqueByMl = new Map()
  for (const entry of volumes) {
    if (!uniqueByMl.has(entry.ml)) {
      uniqueByMl.set(entry.ml, entry.token)
    }
  }

  if (uniqueByMl.size > 1) {
    const first = volumes[0]
    return result(
      INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      null,
      null,
      first.token,
      INVENTORY_UNIT_INFERENCE_REASON.MULTIPLE_CONFLICTING_VOLUMES,
    )
  }

  const [[normalizedVolumeMl, matchedToken]] = uniqueByMl.entries()
  const proposedUnit = SUPPORTED_VOLUME_UNITS.get(normalizedVolumeMl) ?? null

  if (hasPackagingConflict) {
    return result(
      INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      null,
      normalizedVolumeMl,
      matchedToken,
      INVENTORY_UNIT_INFERENCE_REASON.PACKAGING_AMBIGUOUS,
    )
  }

  if (!proposedUnit) {
    return result(
      INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      null,
      normalizedVolumeMl,
      matchedToken,
      INVENTORY_UNIT_INFERENCE_REASON.UNSUPPORTED_VOLUME,
    )
  }

  return result(
    INVENTORY_UNIT_INFERENCE_STATUS.INFERRED,
    proposedUnit,
    normalizedVolumeMl,
    matchedToken,
    INVENTORY_UNIT_INFERENCE_REASON.EXPLICIT_SUPPORTED_VOLUME,
  )
}
