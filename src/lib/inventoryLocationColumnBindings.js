/**
 * P8.29.11 — Generic location column bindings + locationQuantities builder.
 *
 * Pure, deterministic. Converts operational source quantity fields into the
 * Apply contract array locationQuantities[] without hardcoded Apply branches.
 *
 * Operational Storage/BAR fields are adapted into the generic binding model
 * so future columns (Kitchen, Fridge, …) use the same shape.
 */

import {
  INVENTORY_LOCATION_QUANTITY_PARSE_STATUS,
  INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE,
  INVENTORY_LOCATION_QUANTITY_WARNING,
  parseInventoryLocationQuantity,
} from './inventoryLocationQuantityParser.js'
import { parseInventoryLocationHeader } from './inventoryLocationHeaderParser.js'

export const INVENTORY_LOCATION_BINDING_STATUS = Object.freeze({
  MAPPED: 'mapped',
  UNMAPPED: 'unmapped',
  AMBIGUOUS: 'ambiguous',
  INVALID: 'invalid',
})

export const INVENTORY_LOCATION_BINDING_SOURCE_FIELD = Object.freeze({
  STORAGE: 'storage',
  BAR: 'bar',
})

export const INVENTORY_LOCATION_QUANTITY_BLOCKER = Object.freeze({
  LOCATION_QUANTITY_MALFORMED: 'location_quantity_malformed',
  LOCATION_QUANTITY_NEGATIVE: 'location_quantity_negative',
  LOCATION_BINDING_UNMAPPED: 'location_binding_unmapped',
  LOCATION_BINDING_AMBIGUOUS: 'location_binding_ambiguous',
  LOCATION_BINDING_INVALID: 'location_binding_invalid',
  DUPLICATE_LOCATION_DESTINATION: 'duplicate_location_destination',
})

/** Exact workspace location_key used for the operational BAR column heuristic. */
export const INVENTORY_OPERATIONAL_BAR_LOCATION_KEY = 'Bar'

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
 * @param {unknown} storage
 * @returns {{ id: string, locationKey: string }|null}
 */
function normalizeWorkspaceStorage(storage) {
  if (!isPlainObject(storage)) return null
  const id = asTrimmedString(storage.id ?? storage.workspaceStorageId)
  const locationKey = asTrimmedString(storage.locationKey ?? storage.location_key)
  if (!id || !locationKey) return null
  return { id, locationKey }
}

/**
 * Resolve exact location_key matches from a workspace storage catalog.
 *
 * @param {unknown} workspaceStorages
 * @param {string} locationKey
 * @returns {{
 *   status: 'mapped'|'unmapped'|'ambiguous',
 *   storage: { id: string, locationKey: string }|null,
 * }}
 */
export function resolveWorkspaceStorageByLocationKey(workspaceStorages, locationKey) {
  const key = asTrimmedString(locationKey)
  if (!key) {
    return { status: INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED, storage: null }
  }

  const list = Array.isArray(workspaceStorages) ? workspaceStorages : []
  /** @type {Array<{ id: string, locationKey: string }>} */
  const matches = []
  for (const entry of list) {
    const normalized = normalizeWorkspaceStorage(entry)
    if (!normalized) continue
    if (normalized.locationKey === key) matches.push(normalized)
  }

  if (matches.length === 0) {
    return { status: INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED, storage: null }
  }
  if (matches.length > 1) {
    return { status: INVENTORY_LOCATION_BINDING_STATUS.AMBIGUOUS, storage: null }
  }
  return { status: INVENTORY_LOCATION_BINDING_STATUS.MAPPED, storage: matches[0] }
}

/**
 * Build a single generic binding row.
 *
 * @param {{
 *   sourceHeaderNormalized: string,
 *   sourceHeader: string,
 *   sourceColumnIndex: number|null,
 *   sourceField?: string|null,
 *   destinationStorageId?: string|null,
 *   destinationLocationKey?: string|null,
 *   bindingStatus?: string,
 *   operatorLabel?: string|null,
 *   locationKey?: string|null,
 * }} input
 */
export function createInventoryLocationColumnBinding(input) {
  const sourceHeaderNormalized = asTrimmedString(input?.sourceHeaderNormalized)
  const sourceHeader = asTrimmedString(input?.sourceHeader) || sourceHeaderNormalized
  const parsedHeader = parseInventoryLocationHeader(sourceHeader)
  const sourceColumnIndex = Number.isFinite(Number(input?.sourceColumnIndex))
    ? Math.floor(Number(input.sourceColumnIndex))
    : null
  const sourceField = asTrimmedString(input?.sourceField) || null
  const destinationStorageId = asTrimmedString(input?.destinationStorageId) || null
  const destinationLocationKey = asTrimmedString(input?.destinationLocationKey) || null
  const bindingStatus = asTrimmedString(input?.bindingStatus)
    || (
      destinationStorageId && destinationLocationKey
        ? INVENTORY_LOCATION_BINDING_STATUS.MAPPED
        : INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
    )
  const operatorLabel = input?.operatorLabel !== undefined
    ? (asTrimmedString(input.operatorLabel) || null)
    : parsedHeader.operatorLabel
  const locationKey = asTrimmedString(input?.locationKey)
    || parsedHeader.locationKey
    || null

  return Object.freeze({
    sourceHeaderNormalized: parsedHeader.locationKeyNormalized || sourceHeaderNormalized,
    sourceHeader,
    sourceColumnIndex,
    sourceField,
    destinationStorageId,
    destinationLocationKey,
    bindingStatus,
    operatorLabel,
    locationKey,
  })
}

/**
 * Adapt operational Storage + BAR source fields into generic bindings.
 *
 * Does not invent Bar storage. Exact key "Bar" must exist in the catalog
 * (or an explicit override must supply destination ids).
 *
 * @param {{
 *   workspaceStorages?: unknown,
 *   storageDestination?: { id?: string, locationKey?: string, location_key?: string }|null,
 *   barDestination?: { id?: string, locationKey?: string, location_key?: string }|null,
 *   storageColumnIndex?: number|null,
 *   barColumnIndex?: number|null,
 *   storageHeader?: string|null,
 *   barHeader?: string|null,
 *   includeStorage?: boolean,
 *   includeBar?: boolean,
 * }} [input]
 * @returns {ReadonlyArray<object>}
 */
export function buildOperationalLocationColumnBindings(input = {}) {
  const includeStorage = input.includeStorage !== false
  const includeBar = input.includeBar !== false
  /** @type {object[]} */
  const bindings = []

  if (includeStorage) {
    const storageDest = normalizeWorkspaceStorage(input.storageDestination)
      ?? (
        asTrimmedString(input.storageDestination?.locationKey
          ?? input.storageDestination?.location_key)
          ? resolveWorkspaceStorageByLocationKey(
            input.workspaceStorages,
            input.storageDestination.locationKey ?? input.storageDestination.location_key,
          ).storage
          : null
      )

    let storageStatus = INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
    let storageId = null
    let storageKey = null
    if (storageDest) {
      storageStatus = INVENTORY_LOCATION_BINDING_STATUS.MAPPED
      storageId = storageDest.id
      storageKey = storageDest.locationKey
    } else if (isPlainObject(input.storageDestination)) {
      const keyOnly = asTrimmedString(
        input.storageDestination.locationKey ?? input.storageDestination.location_key,
      )
      if (keyOnly) {
        const resolved = resolveWorkspaceStorageByLocationKey(input.workspaceStorages, keyOnly)
        storageStatus = resolved.status
        storageId = resolved.storage?.id ?? null
        storageKey = resolved.storage?.locationKey ?? keyOnly
      }
    }

    const storageHeader = asTrimmedString(input.storageHeader) || 'Storage'
    const storageParsed = parseInventoryLocationHeader(storageHeader)
    bindings.push(createInventoryLocationColumnBinding({
      sourceHeaderNormalized: storageParsed.locationKeyNormalized || 'storage',
      sourceHeader: storageHeader,
      sourceColumnIndex: input.storageColumnIndex ?? null,
      sourceField: INVENTORY_LOCATION_BINDING_SOURCE_FIELD.STORAGE,
      destinationStorageId: storageId,
      destinationLocationKey: storageKey,
      bindingStatus: storageStatus,
      operatorLabel: storageParsed.operatorLabel,
      locationKey: storageParsed.locationKey || 'Storage',
    }))
  }

  if (includeBar) {
    const explicitBar = normalizeWorkspaceStorage(input.barDestination)
    let barStatus = INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
    let barId = null
    let barKey = null

    if (explicitBar) {
      barStatus = INVENTORY_LOCATION_BINDING_STATUS.MAPPED
      barId = explicitBar.id
      barKey = explicitBar.locationKey
    } else {
      const resolved = resolveWorkspaceStorageByLocationKey(
        input.workspaceStorages,
        INVENTORY_OPERATIONAL_BAR_LOCATION_KEY,
      )
      barStatus = resolved.status
      barId = resolved.storage?.id ?? null
      barKey = resolved.storage?.locationKey
        ?? (resolved.status === INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
          ? INVENTORY_OPERATIONAL_BAR_LOCATION_KEY
          : null)
    }

    const barHeader = asTrimmedString(input.barHeader) || 'BAR'
    const barParsed = parseInventoryLocationHeader(barHeader)
    bindings.push(createInventoryLocationColumnBinding({
      sourceHeaderNormalized: barParsed.locationKeyNormalized || 'bar',
      sourceHeader: barHeader,
      sourceColumnIndex: input.barColumnIndex ?? null,
      sourceField: INVENTORY_LOCATION_BINDING_SOURCE_FIELD.BAR,
      destinationStorageId: barId,
      destinationLocationKey: barKey,
      bindingStatus: barStatus,
      operatorLabel: barParsed.operatorLabel,
      locationKey: barParsed.locationKey || INVENTORY_OPERATIONAL_BAR_LOCATION_KEY,
    }))
  }

  return Object.freeze(bindings.map((binding) => Object.freeze({ ...binding })))
}

/**
 * @param {unknown} source
 * @param {object} binding
 * @returns {unknown}
 */
function readSourceValueForBinding(source, binding) {
  const field = asTrimmedString(binding?.sourceField)
  if (field && isPlainObject(source) && Object.prototype.hasOwnProperty.call(source, field)) {
    return source[field]
  }
  // Generic fallback: normalized header as key.
  const headerKey = asTrimmedString(binding?.sourceHeaderNormalized)
  if (headerKey && isPlainObject(source) && Object.prototype.hasOwnProperty.call(source, headerKey)) {
    return source[headerKey]
  }
  return null
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isInventoryLocationQuantityCellPresent(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}

/**
 * Build locationQuantities[] for one row from source + generic bindings.
 *
 * @param {{
 *   source?: object|null,
 *   bindings?: unknown,
 * }} input
 * @returns {{
 *   locationQuantities: ReadonlyArray<object>,
 *   blockers: readonly string[],
 *   warnings: readonly string[],
 *   aggregateQuantity: number|null,
 * }}
 */
export function buildInventoryLocationQuantities(input = {}) {
  const source = isPlainObject(input.source) ? input.source : {}
  const bindings = Array.isArray(input.bindings) ? input.bindings : []

  /** @type {object[]} */
  const locationQuantities = []
  /** @type {string[]} */
  const blockers = []
  /** @type {string[]} */
  const warnings = []
  /** @type {Map<string, number>} */
  const destinationCounts = new Map()

  for (const binding of bindings) {
    if (!isPlainObject(binding)) continue

    const rawEvidence = readSourceValueForBinding(source, binding)
    const cellPresent = isInventoryLocationQuantityCellPresent(rawEvidence)
    const parsed = parseInventoryLocationQuantity(rawEvidence)

    const bindingStatus = asTrimmedString(binding.bindingStatus)
      || INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
    const destinationStorageId = asTrimmedString(binding.destinationStorageId) || null
    const destinationLocationKey = asTrimmedString(binding.destinationLocationKey) || null

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
        bindingStatus === INVENTORY_LOCATION_BINDING_STATUS.INVALID
        || !destinationStorageId
        || !destinationLocationKey
        || bindingStatus === INVENTORY_LOCATION_BINDING_STATUS.UNMAPPED
      ) {
        validationState = INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
        const code = bindingStatus === INVENTORY_LOCATION_BINDING_STATUS.INVALID
          ? INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_INVALID
          : INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED
        entryWarnings.push(code)
        if (!blockers.includes(code)) blockers.push(code)
      }

      if (parsed.parseStatus === INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.MALFORMED) {
        validationState = INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
        const code = parsed.warnings.includes(
          INVENTORY_LOCATION_QUANTITY_WARNING.LOCATION_QUANTITY_NEGATIVE,
        )
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
    } else {
      // Empty cell: no opening balance; unmapped empty stays non-applicable.
      validationState = INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID
    }

    for (const warning of entryWarnings) {
      if (
        warning === INVENTORY_LOCATION_QUANTITY_WARNING.EXPRESSION_SUMMED
        && !warnings.includes(warning)
      ) {
        warnings.push(warning)
      }
    }

    locationQuantities.push(Object.freeze({
      sourceColumnIndex: Number.isFinite(Number(binding.sourceColumnIndex))
        ? Math.floor(Number(binding.sourceColumnIndex))
        : null,
      sourceHeader: asTrimmedString(binding.sourceHeader)
        || asTrimmedString(binding.sourceHeaderNormalized)
        || null,
      destinationStorageId,
      destinationLocationKey,
      operatorLabel: asTrimmedString(binding.operatorLabel) || null,
      rawEvidence: rawEvidence === undefined ? null : rawEvidence,
      parsedQuantity: parsed.parsedQuantity,
      parseStatus: parsed.parseStatus,
      validationState,
      warnings: Object.freeze([...entryWarnings]),
      evidence: Object.freeze({ ...(parsed.evidence ?? {}) }),
    }))
  }

  for (const [destinationId, count] of destinationCounts.entries()) {
    if (count < 2) continue
    if (!blockers.includes(INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION)) {
      blockers.push(INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION)
    }
    for (let index = 0; index < locationQuantities.length; index += 1) {
      const entry = locationQuantities[index]
      if (entry.destinationStorageId !== destinationId) continue
      if (!isInventoryLocationQuantityCellPresent(entry.rawEvidence)) continue
      const nextWarnings = entry.warnings.includes(
        INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION,
      )
        ? [...entry.warnings]
        : [...entry.warnings, INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION]
      locationQuantities[index] = Object.freeze({
        ...entry,
        validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER,
        warnings: Object.freeze(nextWarnings),
      })
    }
  }

  /** @type {number|null} */
  let aggregateQuantity = null
  let sawValidQuantity = false
  for (const entry of locationQuantities) {
    if (
      entry.validationState === INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.BLOCKER
    ) {
      continue
    }
    if (
      entry.parseStatus === INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EMPTY
      || entry.parsedQuantity == null
    ) {
      continue
    }
    if (
      entry.validationState !== INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID
      && entry.validationState !== INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.WARNING
    ) {
      continue
    }
    if (!entry.destinationStorageId) continue
    sawValidQuantity = true
    aggregateQuantity = (aggregateQuantity ?? 0) + entry.parsedQuantity
  }

  return Object.freeze({
    locationQuantities: Object.freeze([...locationQuantities]),
    blockers: Object.freeze([...blockers]),
    warnings: Object.freeze([...warnings]),
    aggregateQuantity: sawValidQuantity ? aggregateQuantity : null,
  })
}

/**
 * Build per-row locationQuantities using operational Storage/BAR adapter.
 *
 * @param {{
 *   source?: object|null,
 *   workspaceStorages?: unknown,
 *   storageLocationKey?: string|null,
 *   storageDestination?: object|null,
 *   barDestination?: object|null,
 *   bindings?: unknown,
 * }} input
 */
export function buildOperationalInventoryLocationQuantities(input = {}) {
  const bindings = Array.isArray(input.bindings) && input.bindings.length > 0
    ? input.bindings
    : buildOperationalLocationColumnBindings({
      workspaceStorages: input.workspaceStorages,
      storageDestination: input.storageDestination ?? (
        asTrimmedString(input.storageLocationKey)
          ? { locationKey: asTrimmedString(input.storageLocationKey) }
          : null
      ),
      barDestination: input.barDestination ?? null,
    })

  return buildInventoryLocationQuantities({
    source: input.source,
    bindings,
  })
}
