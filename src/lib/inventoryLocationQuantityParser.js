/**
 * P8.29.11 — Inventory location quantity expression parser.
 *
 * Pure, deterministic. No eval / Function / dynamic execution.
 * Parses plain numbers and additive non-negative expressions (e.g. "288+180").
 */

export const INVENTORY_LOCATION_QUANTITY_PARSE_STATUS = Object.freeze({
  EMPTY: 'empty',
  OK: 'ok',
  EXPRESSION_OK: 'expression_ok',
  MALFORMED: 'malformed',
})

export const INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE = Object.freeze({
  VALID: 'valid',
  WARNING: 'warning',
  BLOCKER: 'blocker',
})

export const INVENTORY_LOCATION_QUANTITY_WARNING = Object.freeze({
  EXPRESSION_SUMMED: 'expression_summed',
  LOCATION_QUANTITY_MALFORMED: 'location_quantity_malformed',
  LOCATION_QUANTITY_NEGATIVE: 'location_quantity_negative',
})

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isBlank(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * Parse a single non-negative numeric term (no sign, no expression).
 * @param {string} term
 * @returns {number|null}
 */
function parseNonNegativeTerm(term) {
  if (!/^\d+(\.\d+)?$/.test(term)) return null
  const parsed = Number(term)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

/**
 * @param {string} code
 * @param {object} [extra]
 */
function malformedResult(code, extra = {}) {
  return Object.freeze({
    parsedQuantity: null,
    parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.MALFORMED,
    validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER,
    warnings: Object.freeze([code]),
    evidence: Object.freeze({ ...extra }),
  })
}

/**
 * Parse a location quantity cell into the Apply contract fragment.
 *
 * @param {unknown} value
 * @returns {{
 *   parsedQuantity: number|null,
 *   parseStatus: 'empty'|'ok'|'expression_ok'|'malformed',
 *   validationState: 'valid'|'warning'|'blocker',
 *   warnings: readonly string[],
 *   evidence: Readonly<Record<string, unknown>>,
 * }}
 */
export function parseInventoryLocationQuantity(value) {
  if (isBlank(value)) {
    return Object.freeze({
      parsedQuantity: null,
      parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EMPTY,
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
      warnings: Object.freeze([]),
      evidence: Object.freeze({}),
    })
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED)
    }
    if (value < 0) {
      return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_NEGATIVE)
    }
    return Object.freeze({
      parsedQuantity: value,
      parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.OK,
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
      warnings: Object.freeze([]),
      evidence: Object.freeze({}),
    })
  }

  if (typeof value === 'boolean') {
    return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED)
  }

  const raw = String(value).trim()
  if (!raw) {
    return Object.freeze({
      parsedQuantity: null,
      parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EMPTY,
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
      warnings: Object.freeze([]),
      evidence: Object.freeze({}),
    })
  }

  // Reject any operator other than '+', and any letters/symbols outside digits, dots, plus, whitespace.
  if (/[^\d.+ \t]/.test(raw)) {
    if (/-/.test(raw)) {
      return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_NEGATIVE, {
        reason: 'subtraction_or_sign',
      })
    }
    return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED)
  }
  if (/[*/]/.test(raw)) {
    return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED, {
      reason: 'unsupported_operator',
    })
  }

  const compact = raw.replace(/[ \t]+/g, '')
  if (!compact) {
    return Object.freeze({
      parsedQuantity: null,
      parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EMPTY,
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
      warnings: Object.freeze([]),
      evidence: Object.freeze({}),
    })
  }

  // Single plain number (no '+').
  if (!compact.includes('+')) {
    const single = parseNonNegativeTerm(compact)
    if (single == null) {
      return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED)
    }
    return Object.freeze({
      parsedQuantity: single,
      parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.OK,
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
      warnings: Object.freeze([]),
      evidence: Object.freeze({}),
    })
  }

  // Additive expression: split on '+'; reject empty terms (e.g. 10++5, leading/trailing +).
  const parts = compact.split('+')
  if (parts.length < 2 || parts.some((part) => part === '')) {
    return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED, {
      reason: 'empty_term',
    })
  }

  /** @type {number[]} */
  const formulaParts = []
  for (const part of parts) {
    const term = parseNonNegativeTerm(part)
    if (term == null) {
      return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED)
    }
    formulaParts.push(term)
  }

  const sum = formulaParts.reduce((acc, term) => acc + term, 0)
  if (!Number.isFinite(sum) || sum < 0) {
    return malformedResult(INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_MALFORMED)
  }

  return Object.freeze({
    parsedQuantity: sum,
    parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EXPRESSION_OK,
    validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.WARNING,
    warnings: Object.freeze([INVENTORY_LOCATION_QUANTITY_WARNING.EXPRESSION_SUMMED]),
    evidence: Object.freeze({ formulaParts: Object.freeze([...formulaParts]) }),
  })
}
