/**
 * P8.29.14 — Import Review location allocation model.
 *
 * Pure helpers for multi-location quantity editing in Spreadsheet Import Review.
 * Serializes to Apply contract locationQuantities[]. No network / UI / SQL.
 */

import {
  INVENTORY_LOCATION_BINDING_STATUS,
  INVENTORY_LOCATION_QUANTITY_BLOCKER,
  INVENTORY_OPERATIONAL_BAR_LOCATION_KEY,
  resolveWorkspaceStorageByLocationKey,
} from './inventoryLocationColumnBindings.js'
import {
  INVENTORY_LOCATION_QUANTITY_PARSE_STATUS,
  INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE,
  parseInventoryLocationQuantity,
} from './inventoryLocationQuantityParser.js'
import { mapInventoryImportHeaderToOneField } from './inventoryImportWizardUx.js'

export const INVENTORY_LOCATION_ALLOCATION_SOURCE = Object.freeze({
  STORAGE: 'storage',
  BAR: 'bar',
})

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

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
 * @returns {boolean}
 */
export function isLocationAllocationQuantityPresent(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

/**
 * Detect quantity-location columns from worksheet headers.
 * Generic: any storage or bar role (and future mapped roles) become allocation sources.
 *
 * @param {unknown} parseResultOrHeaders
 * @returns {ReadonlyArray<{
 *   sourceField: string,
 *   sourceHeader: string,
 *   sourceHeaderNormalized: string,
 *   sourceColumnIndex: number,
 * }>}
 */
export function detectInventoryImportQuantitySourceColumns(parseResultOrHeaders) {
  const headers = Array.isArray(parseResultOrHeaders)
    ? parseResultOrHeaders
    : Array.isArray(parseResultOrHeaders?.headers)
      ? parseResultOrHeaders.headers
      : []

  /** @type {Array<{ sourceField: string, sourceHeader: string, sourceHeaderNormalized: string, sourceColumnIndex: number }>} */
  const columns = []
  /** @type {Set<string>} */
  const seenFields = new Set()

  headers.forEach((header, index) => {
    const sourceHeader = header?.isBlank
      ? ''
      : asTrimmedString(header?.sourceHeader ?? header)
    if (!sourceHeader) return
    const mapped = mapInventoryImportHeaderToOneField(header)
    const role = mapped?.role
    let sourceField = null
    if (role === 'storage') sourceField = INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE
    else if (role === 'bar') sourceField = INVENTORY_LOCATION_ALLOCATION_SOURCE.BAR
    else {
      const normalized = asTrimmedString(header?.normalized ?? sourceHeader).toLowerCase()
      if (
        normalized === 'kitchen'
        || normalized === 'fridge'
        || normalized === 'freezer'
        || normalized === 'terrace'
        || normalized === 'pool'
        || normalized === 'vip'
        || normalized === 'restaurant'
        || normalized.startsWith('wine')
        || normalized.includes('cellar')
      ) {
        // Generic future columns: stable field key from normalized header.
        sourceField = normalized.replace(/\s+/g, '_')
      }
    }
    if (!sourceField || seenFields.has(sourceField)) return
    seenFields.add(sourceField)
    columns.push({
      sourceField,
      sourceHeader,
      sourceHeaderNormalized: asTrimmedString(header?.normalized ?? sourceHeader).toLowerCase(),
      sourceColumnIndex: Number.isFinite(Number(header?.columnIndex))
        ? Math.floor(Number(header.columnIndex))
        : index,
    })
  })

  return Object.freeze(columns.map((column) => Object.freeze({ ...column })))
}

/**
 * @param {unknown} workspaceStorages
 * @param {string} locationKey
 */
function findStorageByLocationKey(workspaceStorages, locationKey) {
  return resolveWorkspaceStorageByLocationKey(workspaceStorages, locationKey)
}

/**
 * Build default allocation rows for a product source + detected columns.
 *
 * @param {{
 *   source?: object|null,
 *   columns?: unknown,
 *   workspaceStorages?: unknown,
 *   preferredStorageLocationKey?: string|null,
 * }} [input]
 */
export function buildDefaultInventoryLocationAllocations(input = {}) {
  const source = isPlainObject(input.source) ? input.source : {}
  const columns = Array.isArray(input.columns) && input.columns.length > 0
    ? input.columns
    : [
      {
        sourceField: INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE,
        sourceHeader: 'Storage',
        sourceHeaderNormalized: 'storage',
        sourceColumnIndex: null,
      },
      {
        sourceField: INVENTORY_LOCATION_ALLOCATION_SOURCE.BAR,
        sourceHeader: 'BAR',
        sourceHeaderNormalized: 'bar',
        sourceColumnIndex: null,
      },
    ]

  const preferred = asTrimmedString(input.preferredStorageLocationKey) || null

  return Object.freeze(columns.map((column) => {
    const sourceField = asTrimmedString(column.sourceField)
    const rawEvidence = Object.prototype.hasOwnProperty.call(source, sourceField)
      ? source[sourceField]
      : null

    let destinationLocationKey = null
    let destinationStorageId = null
    let bindingStatus = INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED

    if (sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.BAR) {
      const resolved = findStorageByLocationKey(
        input.workspaceStorages,
        INVENTORY_OPERATIONAL_BAR_LOCATION_KEY,
      )
      bindingStatus = resolved.status
      destinationStorageId = resolved.storage?.id ?? null
      destinationLocationKey = resolved.storage?.locationKey
        ?? INVENTORY_OPERATIONAL_BAR_LOCATION_KEY
    } else if (sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE && preferred) {
      const resolved = findStorageByLocationKey(input.workspaceStorages, preferred)
      bindingStatus = resolved.status
      destinationStorageId = resolved.storage?.id ?? null
      destinationLocationKey = resolved.storage?.locationKey ?? preferred
    }

    return Object.freeze({
      sourceField,
      sourceHeader: asTrimmedString(column.sourceHeader) || sourceField,
      sourceHeaderNormalized: asTrimmedString(column.sourceHeaderNormalized) || sourceField,
      sourceColumnIndex: Number.isFinite(Number(column.sourceColumnIndex))
        ? Math.floor(Number(column.sourceColumnIndex))
        : null,
      rawEvidence,
      quantityInput: rawEvidence == null ? '' : rawEvidence,
      destinationLocationKey,
      destinationStorageId,
      bindingStatus,
    })
  }))
}

/**
 * Merge draft overrides onto default allocations (stable sourceField order).
 *
 * @param {unknown} defaults
 * @param {unknown} draftAllocations
 */
export function mergeInventoryLocationAllocations(defaults, draftAllocations) {
  const base = Array.isArray(defaults) ? defaults : []
  const overrides = Array.isArray(draftAllocations) ? draftAllocations : []
  /** @type {Map<string, object>} */
  const byField = new Map()
  for (const entry of overrides) {
    if (!isPlainObject(entry)) continue
    const field = asTrimmedString(entry.sourceField)
    if (!field) continue
    byField.set(field, entry)
  }

  return Object.freeze(base.map((row) => {
    const override = byField.get(row.sourceField)
    if (!override) return Object.freeze({ ...row })
    return Object.freeze({
      ...row,
      quantityInput: override.quantityInput !== undefined
        ? override.quantityInput
        : row.quantityInput,
      destinationLocationKey: override.destinationLocationKey !== undefined
        ? (asTrimmedString(override.destinationLocationKey) || null)
        : row.destinationLocationKey,
      destinationStorageId: override.destinationStorageId !== undefined
        ? (asTrimmedString(override.destinationStorageId) || null)
        : row.destinationStorageId,
      bindingStatus: override.bindingStatus !== undefined
        ? asTrimmedString(override.bindingStatus) || row.bindingStatus
        : row.bindingStatus,
    })
  }))
}

/**
 * Resolve allocations against the workspace storage catalog and quantity parser.
 *
 * @param {{
 *   allocations?: unknown,
 *   workspaceStorages?: unknown,
 * }} [input]
 */
export function resolveInventoryLocationAllocations(input = {}) {
  const allocations = Array.isArray(input.allocations) ? input.allocations : []
  /** @type {Map<string, number>} */
  const destinationCounts = new Map()
  /** @type {object[]} */
  const resolved = []
  /** @type {string[]} */
  const blockers = []
  /** @type {string[]} */
  const warnings = []
  let total = 0
  let sawQuantity = false

  for (const allocation of allocations) {
    if (!isPlainObject(allocation)) continue
    const quantityInput = allocation.quantityInput
    const parsed = parseInventoryLocationQuantity(quantityInput)
    const cellPresent = isLocationAllocationQuantityPresent(quantityInput)

    let destinationLocationKey = asTrimmedString(allocation.destinationLocationKey) || null
    let destinationStorageId = asTrimmedString(allocation.destinationStorageId) || null
    let bindingStatus = asTrimmedString(allocation.bindingStatus)
      || INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED

    if (destinationLocationKey) {
      const catalog = findStorageByLocationKey(input.workspaceStorages, destinationLocationKey)
      if (catalog.status === INVENTORY_LOCATION_BINDING_STATUS.MAPPED && catalog.storage) {
        destinationStorageId = String(catalog.storage.id)
        destinationLocationKey = catalog.storage.locationKey
        bindingStatus = INVENTORY_LOCATION_BINDING_STATUS.MAPPED
      } else if (catalog.status === INVENTORY_LOCATION_BINDING_STATUS.AMBIGUOUS) {
        bindingStatus = INVENTORY_LOCATION_BINDING_STATUS.AMBIGUOUS
        destinationStorageId = null
      } else if (!destinationStorageId) {
        bindingStatus = INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
      }
    } else {
      bindingStatus = INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
      destinationStorageId = null
    }

    /** @type {string} */
    let validationState = parsed.validationState
    /** @type {string[]} */
    const entryWarnings = [...parsed.warnings]

    if (cellPresent) {
      if (bindingStatus === INVENTORY_LOCATION_BINDING_STATUS.AMBIGUOUS) {
        validationState = INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
        entryWarnings.push(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS)
        if (!blockers.includes(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS)) {
          blockers.push(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS)
        }
      } else if (
        bindingStatus !== INVENTORY_LOCATION_BINDING_STATUS.MAPPED
        || !destinationStorageId
        || !destinationLocationKey
      ) {
        validationState = INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
        entryWarnings.push(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED)
        if (!blockers.includes(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED)) {
          blockers.push(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED)
        }
      }

      if (parsed.parseStatus === INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.MALFORMED) {
        validationState = INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
        const code = parsed.warnings.includes('location_quantity_negative')
          ? INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_QUANTITY_NEGATIVE
          : INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_QUANTITY_MALFORMED
        if (!blockers.includes(code)) blockers.push(code)
      }

      if (destinationStorageId) {
        destinationCounts.set(
          destinationStorageId,
          (destinationCounts.get(destinationStorageId) ?? 0) + 1,
        )
      }
    }

    if (parsed.warnings.includes('expression_summed')
      && !warnings.includes('expression_summed')
    ) {
      warnings.push('expression_summed')
    }

    if (
      cellPresent
      && parsed.parsedQuantity != null
      && validationState !== INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
    ) {
      sawQuantity = true
      total += parsed.parsedQuantity
    }

    resolved.push({
      sourceField: asTrimmedString(allocation.sourceField),
      sourceHeader: asTrimmedString(allocation.sourceHeader),
      sourceHeaderNormalized: asTrimmedString(allocation.sourceHeaderNormalized),
      sourceColumnIndex: allocation.sourceColumnIndex ?? null,
      rawEvidence: allocation.rawEvidence ?? null,
      quantityInput,
      destinationLocationKey,
      destinationStorageId,
      bindingStatus,
      parsedQuantity: parsed.parsedQuantity,
      parseStatus: parsed.parseStatus,
      validationState,
      warnings: Object.freeze([...entryWarnings]),
      evidence: Object.freeze({ ...(parsed.evidence ?? {}) }),
    })
  }

  for (const [destinationId, count] of destinationCounts.entries()) {
    if (count < 2) continue
    if (!blockers.includes(INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION)) {
      blockers.push(INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION)
    }
    for (let index = 0; index < resolved.length; index += 1) {
      const entry = resolved[index]
      if (entry.destinationStorageId !== destinationId) continue
      if (!isLocationAllocationQuantityPresent(entry.quantityInput)) continue
      const nextWarnings = entry.warnings.includes(
        INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION,
      )
        ? [...entry.warnings]
        : [...entry.warnings, INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION]
      resolved[index] = {
        ...entry,
        validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER,
        warnings: Object.freeze(nextWarnings),
      }
    }
  }

  return Object.freeze({
    allocations: Object.freeze(resolved.map((entry) => Object.freeze(entry))),
    blockers: Object.freeze([...blockers]),
    warnings: Object.freeze([...warnings]),
    totalOpeningStock: sawQuantity ? total : null,
    hasDuplicateDestination: blockers.includes(
      INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION,
    ),
  })
}

/**
 * Serialize resolved allocations into Apply locationQuantities[] (omit empties).
 *
 * @param {unknown} resolvedAllocations
 * @returns {object[]}
 */
export function serializeAllocationsToLocationQuantities(resolvedAllocations) {
  const list = Array.isArray(resolvedAllocations) ? resolvedAllocations : []
  /** @type {object[]} */
  const out = []
  for (const entry of list) {
    if (!isPlainObject(entry)) continue
    if (!isLocationAllocationQuantityPresent(entry.quantityInput)) continue
    out.push({
      sourceColumnIndex: entry.sourceColumnIndex ?? null,
      sourceHeader: entry.sourceHeader ?? null,
      destinationStorageId: entry.destinationStorageId ?? null,
      destinationLocationKey: entry.destinationLocationKey ?? null,
      rawEvidence: entry.quantityInput ?? entry.rawEvidence ?? null,
      parsedQuantity: entry.parsedQuantity,
      parseStatus: entry.parseStatus,
      validationState: entry.validationState,
      warnings: Array.isArray(entry.warnings) ? [...entry.warnings] : [],
      evidence: isPlainObject(entry.evidence) ? { ...entry.evidence } : {},
    })
  }
  return out
}

/**
 * Format expression evidence for Review UI.
 *
 * @param {object} allocation
 * @returns {string|null}
 */
export function formatLocationAllocationEvidenceLabel(allocation) {
  if (!isPlainObject(allocation)) return null
  if (allocation.parseStatus === 'expression_ok'
    && Array.isArray(allocation.evidence?.formulaParts)
  ) {
    return `from ${allocation.evidence.formulaParts.join(' + ')}`
  }
  const header = asTrimmedString(allocation.sourceHeader)
  if (header && isLocationAllocationQuantityPresent(allocation.quantityInput)) {
    return header
  }
  return null
}

/**
 * Primary catalog storage_location for create rows: Storage column destination only.
 * Does not fall back to BAR (that would auto-bind Storage→Bar and cause duplicates).
 *
 * @param {unknown} resolvedAllocations
 * @returns {string|null}
 */
export function resolvePrimaryStorageLocationKeyFromAllocations(resolvedAllocations) {
  const list = Array.isArray(resolvedAllocations) ? resolvedAllocations : []
  const storageRow = list.find((entry) => (
    entry?.sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE
    && asTrimmedString(entry.destinationLocationKey)
  ))
  if (storageRow) return asTrimmedString(storageRow.destinationLocationKey)
  return null
}

/**
 * Create-row location when Storage is unset: first mapped non-empty allocation destination.
 * If the Storage column has a quantity but is still blocked, do not fall back to BAR
 * (keeps create-location unresolved until Storage is bound or a fallback is chosen).
 *
 * @param {unknown} resolvedAllocations
 * @returns {string|null}
 */
export function resolveCreateLocationKeyFromAllocations(resolvedAllocations) {
  const primary = resolvePrimaryStorageLocationKeyFromAllocations(resolvedAllocations)
  if (primary) return primary
  const list = Array.isArray(resolvedAllocations) ? resolvedAllocations : []
  const storageRow = list.find((entry) => (
    entry?.sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE
  ))
  if (
    storageRow
    && isLocationAllocationQuantityPresent(storageRow.quantityInput)
    && storageRow.validationState === INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
  ) {
    return null
  }
  for (const entry of list) {
    if (
      isLocationAllocationQuantityPresent(entry?.quantityInput)
      && asTrimmedString(entry?.destinationLocationKey)
      && entry?.validationState !== INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
    ) {
      return asTrimmedString(entry.destinationLocationKey)
    }
  }
  for (const entry of list) {
    const key = asTrimmedString(entry?.destinationLocationKey)
    if (key) return key
  }
  return null
}

/**
 * @param {unknown} columns
 * @returns {boolean}
 */
export function isMultiLocationQuantityColumnSheet(columns) {
  return Array.isArray(columns) && columns.length > 1
}
