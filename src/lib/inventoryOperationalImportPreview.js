/**
 * P8.16.11 — Operational Import Preview Domain Foundation.
 *
 * Pure, deterministic, read-only preview combining operational source rows,
 * matcher output, and the supplied workspace stock catalog snapshot.
 *
 * No UI, network, Supabase, services, Apply, or quantity calculation.
 *
 * Preview version: operational_import_preview_v1
 *
 * Catalog limitation (P8.16.8): workspace catalog currently supplies
 * id, name, category, unit, sku, active only. storageLocation and
 * currentQuantity are always null in existingOne until a later sprint
 * expands the catalog contract.
 */

import { INVENTORY_OPERATIONAL_MATCH_STATUS } from './inventoryOperationalProductMatcher.js'

export const INVENTORY_OPERATIONAL_IMPORT_PREVIEW_VERSION = 1

export const INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION = Object.freeze({
  LINK_EXISTING: 'link_existing',
  CREATE_NEW: 'create_new',
  REQUIRES_RESOLUTION: 'requires_resolution',
  BLOCKED: 'blocked',
  SKIP_INVALID: 'skip_invalid',
})

export const INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS = Object.freeze({
  REQUIRES_POLICY: 'requires_policy',
  NOT_APPLICABLE: 'not_applicable',
})

export class InventoryOperationalImportPreviewError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryOperationalImportPreviewError'
    this.code = code
  }
}

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
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMeaningfullyPopulated(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) {
    return Object.values(value).some((entry) => isMeaningfullyPopulated(entry))
  }
  return false
}

/**
 * @param {unknown} weekdays
 * @returns {boolean}
 */
function hasPopulatedWeekday(weekdays) {
  if (!isPlainObject(weekdays)) return false
  return Object.values(weekdays).some((value) => isMeaningfullyPopulated(value))
}

/**
 * @param {unknown} weekdays
 * @returns {Record<string, unknown>|null}
 */
function copyWeekdays(weekdays) {
  if (weekdays == null) return null
  if (!isPlainObject(weekdays)) return weekdays
  return { ...weekdays }
}

/**
 * Flatten operational products in matcher order (categories then products).
 *
 * @param {{ categories?: unknown[] }} operationalModel
 * @returns {Array<{ category: string|null, product: object }>}
 */
function flattenOperationalSourceProducts(operationalModel) {
  /** @type {Array<{ category: string|null, product: object }>} */
  const flattened = []

  for (const category of operationalModel.categories ?? []) {
    if (!isPlainObject(category) || !Array.isArray(category.products)) {
      throw new InventoryOperationalImportPreviewError(
        'INVALID_OPERATIONAL_MODEL',
        'Operational import preview expects each category to include a products array.',
      )
    }

    const categoryName = category.name == null
      ? null
      : typeof category.name === 'string'
        ? category.name
        : String(category.name)

    for (const product of category.products) {
      if (!isPlainObject(product)) {
        throw new InventoryOperationalImportPreviewError(
          'INVALID_OPERATIONAL_MODEL',
          'Operational import preview expects each product to be an object.',
        )
      }
      flattened.push({ category: categoryName, product })
    }
  }

  return flattened
}

/**
 * Identity used to align matcher rows with source products.
 * Compares category and raw product name (Object.is for name so null ≠ '').
 *
 * @param {string|null} category
 * @param {unknown} productName
 * @returns {string}
 */
function sourceIdentityKey(category, productName) {
  const categoryKey = category === null || category === undefined ? '\0null' : String(category)
  const nameKey = productName === undefined
    ? '\0undefined'
    : productName === null
      ? '\0null'
      : String(productName)
  return `${categoryKey}\u0000${nameKey}`
}

/**
 * Snapshot existing ONE item from matcher/catalog fields only.
 * storageLocation and currentQuantity are always null in this preview version.
 *
 * @param {object|null|undefined} stockItem
 * @returns {object|null}
 */
function snapshotExistingOne(stockItem) {
  if (!isPlainObject(stockItem)) return null

  return {
    id: stockItem.id ?? null,
    name: typeof stockItem.name === 'string' ? stockItem.name : `${stockItem.name ?? ''}`,
    category: stockItem.category == null
      ? null
      : typeof stockItem.category === 'string'
        ? stockItem.category
        : String(stockItem.category),
    unit: typeof stockItem.unit === 'string' ? stockItem.unit : stockItem.unit == null ? null : String(stockItem.unit),
    sku: Object.prototype.hasOwnProperty.call(stockItem, 'sku') ? stockItem.sku ?? null : null,
    storageLocation: null,
    currentQuantity: null,
    active: stockItem.active ?? null,
  }
}

/**
 * @param {unknown[]} candidates
 * @returns {object[]}
 */
function copyCandidates(candidates) {
  if (!Array.isArray(candidates)) return []
  return candidates.map((candidate) => {
    if (!isPlainObject(candidate)) return candidate
    const stockItem = isPlainObject(candidate.stockItem)
      ? {
          id: candidate.stockItem.id,
          name: candidate.stockItem.name,
          category: candidate.stockItem.category,
          unit: candidate.stockItem.unit,
          sku: candidate.stockItem.sku,
          active: candidate.stockItem.active,
        }
      : candidate.stockItem
    return {
      stockItem,
      evidence: Array.isArray(candidate.evidence) ? [...candidate.evidence] : [],
    }
  })
}

/**
 * @param {string|null} category
 * @param {object} product
 * @returns {object}
 */
function buildSourceFacts(category, product) {
  return {
    category,
    productName: product.name,
    storage: product.storage,
    bar: product.bar,
    weekdays: copyWeekdays(product.weekdays),
    order: product.order,
    stockControl: product.stockControl,
  }
}

/**
 * @param {object} source
 * @param {string[]} warnings
 */
function appendSourceFieldWarnings(source, warnings) {
  if (isMeaningfullyPopulated(source.storage) || isMeaningfullyPopulated(source.bar)) {
    warnings.push('source_quantity_requires_policy')
  }
  if (hasPopulatedWeekday(source.weekdays)) {
    warnings.push('source_weekdays_unmapped')
  }
  if (isMeaningfullyPopulated(source.order)) {
    warnings.push('source_order_unmapped')
  }
  if (isMeaningfullyPopulated(source.stockControl)) {
    warnings.push('source_stock_control_unmapped')
  }
}

/**
 * @param {object} source
 * @param {object} matchRow
 * @returns {object}
 */
function buildPreviewRow(source, matchRow) {
  const status = matchRow.status
  const warnings = []
  const blockers = []

  const match = {
    status,
    matchedStockItem: matchRow.matchedStockItem == null
      ? null
      : snapshotExistingOne(matchRow.matchedStockItem),
    candidates: copyCandidates(matchRow.candidates),
    evidence: Array.isArray(matchRow.evidence) ? [...matchRow.evidence] : [],
  }

  /** @type {string} */
  let proposedAction = INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED
  /** @type {object|null} */
  let existingOne = null
  /** @type {object} */
  let quantityProposal = {
    status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
    currentOneQuantity: null,
    sourceStorage: source.storage,
    sourceBar: source.bar,
    proposedQuantity: null,
    calculationRule: null,
  }
  /** @type {object} */
  let locationProposal = {
    status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
    currentOneLocation: null,
    proposedStorageLocation: null,
    rule: null,
  }
  /** @type {object} */
  let metadataProposal = {
    sourceCategory: source.category,
    proposedCategory: null,
    sourceUnit: null,
    proposedUnit: null,
    proposedActive: null,
  }

  if (status === INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH) {
    proposedAction = INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING
    existingOne = snapshotExistingOne(matchRow.matchedStockItem)
    quantityProposal = {
      status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
      currentOneQuantity: null,
      sourceStorage: source.storage,
      sourceBar: source.bar,
      proposedQuantity: null,
      calculationRule: null,
    }
    locationProposal = {
      status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.NOT_APPLICABLE,
      currentOneLocation: null,
      proposedStorageLocation: null,
      rule: null,
    }
    metadataProposal = {
      sourceCategory: source.category,
      proposedCategory: null,
      sourceUnit: null,
      proposedUnit: null,
      proposedActive: existingOne?.active ?? null,
    }
    blockers.push('quantity_policy_unset')
    if (existingOne && existingOne.active === false) {
      warnings.push('matched_item_inactive')
    }
    appendSourceFieldWarnings(source, warnings)
  } else if (status === INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH) {
    proposedAction = INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION
    existingOne = null
    match.matchedStockItem = null
    blockers.push('possible_match_unresolved')
    appendSourceFieldWarnings(source, warnings)
  } else if (status === INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT) {
    proposedAction = INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW
    existingOne = null
    const blankCategory = !isMeaningfullyPopulated(source.category)
    const proposedCategory = blankCategory ? 'Other' : source.category
    if (blankCategory) warnings.push('category_defaulted_to_other')

    quantityProposal = {
      status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
      currentOneQuantity: null,
      sourceStorage: source.storage,
      sourceBar: source.bar,
      proposedQuantity: null,
      calculationRule: null,
    }
    locationProposal = {
      status: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY,
      currentOneLocation: null,
      proposedStorageLocation: null,
      rule: null,
    }
    metadataProposal = {
      sourceCategory: source.category,
      proposedCategory,
      sourceUnit: null,
      proposedUnit: null,
      proposedActive: true,
    }
    blockers.push('unit_missing', 'quantity_policy_unset', 'location_policy_unset')
    warnings.push('source_location_requires_policy')
    appendSourceFieldWarnings(source, warnings)
  } else if (status === INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE) {
    proposedAction = INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID
    existingOne = null
    blockers.push('invalid_source_name')
  } else {
    proposedAction = INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED
    blockers.push('unrecognized_match_status')
  }

  return {
    source,
    match,
    existingOne,
    proposedAction,
    quantityProposal,
    locationProposal,
    metadataProposal,
    warnings,
    blockers,
  }
}

/**
 * Build a frozen operational import preview model.
 *
 * Alignment strategy: flatten operational products in matcher order, require
 * matchingResult.matches length and per-row source identity (category + product
 * name) to match exactly. On mismatch, throw InventoryOperationalImportPreviewError
 * (SOURCE_MATCH_ALIGNMENT). Rows are never silently dropped or zip-repaired.
 *
 * @param {{
 *   operationalModel?: unknown,
 *   matchingResult?: unknown,
 *   existingStockItems?: unknown,
 * }} [input]
 */
export function buildInventoryOperationalImportPreview({
  operationalModel,
  matchingResult,
  existingStockItems,
} = {}) {
  if (!isPlainObject(operationalModel)) {
    throw new InventoryOperationalImportPreviewError(
      'INVALID_OPERATIONAL_MODEL',
      'Operational import preview expects an operationalModel object.',
    )
  }
  if (!Array.isArray(operationalModel.categories)) {
    throw new InventoryOperationalImportPreviewError(
      'INVALID_OPERATIONAL_MODEL',
      'Operational import preview expects operationalModel.categories to be an array.',
    )
  }
  if (!isPlainObject(matchingResult)) {
    throw new InventoryOperationalImportPreviewError(
      'INVALID_MATCHING_RESULT',
      'Operational import preview expects a matchingResult object.',
    )
  }
  if (!Array.isArray(matchingResult.matches)) {
    throw new InventoryOperationalImportPreviewError(
      'INVALID_MATCHING_RESULT',
      'Operational import preview expects matchingResult.matches to be an array.',
    )
  }
  if (!Array.isArray(existingStockItems)) {
    throw new InventoryOperationalImportPreviewError(
      'INVALID_EXISTING_STOCK_ITEMS',
      'Operational import preview expects existingStockItems to be an array.',
    )
  }

  // existingStockItems is accepted for API symmetry with the matcher/catalog
  // pipeline. This preview version does not enrich quantity/location from it
  // (catalog contract limitation). Reference kept to satisfy purity/input checks.
  void existingStockItems

  const flattened = flattenOperationalSourceProducts(operationalModel)
  const matches = matchingResult.matches

  if (flattened.length !== matches.length) {
    throw new InventoryOperationalImportPreviewError(
      'SOURCE_MATCH_ALIGNMENT',
      `Operational import preview requires matchingResult.matches length (${matches.length}) to equal flattened source product count (${flattened.length}).`,
    )
  }

  /** @type {object[]} */
  const rows = []

  for (let index = 0; index < flattened.length; index += 1) {
    const sourceEntry = flattened[index]
    const matchRow = matches[index]

    if (!isPlainObject(matchRow)) {
      throw new InventoryOperationalImportPreviewError(
        'INVALID_MATCHING_RESULT',
        `Operational import preview expects match row at index ${index} to be an object.`,
      )
    }

    const matchCategory = matchRow.source?.category ?? null
    const matchProductName = matchRow.source?.product?.name
    const expectedKey = sourceIdentityKey(sourceEntry.category, sourceEntry.product.name)
    const actualKey = sourceIdentityKey(matchCategory, matchProductName)

    if (expectedKey !== actualKey) {
      throw new InventoryOperationalImportPreviewError(
        'SOURCE_MATCH_ALIGNMENT',
        `Operational import preview source/match identity mismatch at index ${index}.`,
      )
    }

    const source = buildSourceFacts(sourceEntry.category, sourceEntry.product)
    rows.push(buildPreviewRow(source, matchRow))
  }

  const summary = {
    total: 0,
    linkExisting: 0,
    createNew: 0,
    requiresResolution: 0,
    blocked: 0,
    skippedInvalid: 0,
    inactiveMatches: 0,
    missingUnits: 0,
    quantityPolicyRequired: 0,
    locationPolicyRequired: 0,
    unmappedWeekdayRows: 0,
    unmappedOrderRows: 0,
    unmappedStockControlRows: 0,
  }

  for (const row of rows) {
    summary.total += 1
    if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.LINK_EXISTING) {
      summary.linkExisting += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW) {
      summary.createNew += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.REQUIRES_RESOLUTION) {
      summary.requiresResolution += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.BLOCKED) {
      summary.blocked += 1
    } else if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.SKIP_INVALID) {
      summary.skippedInvalid += 1
    }

    if (row.warnings.includes('matched_item_inactive')) summary.inactiveMatches += 1
    if (row.blockers.includes('unit_missing')) summary.missingUnits += 1
    if (row.quantityProposal.status === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY) {
      summary.quantityPolicyRequired += 1
    }
    if (row.locationProposal.status === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS.REQUIRES_POLICY) {
      summary.locationPolicyRequired += 1
    }
    if (row.warnings.includes('source_weekdays_unmapped')) summary.unmappedWeekdayRows += 1
    if (row.warnings.includes('source_order_unmapped')) summary.unmappedOrderRows += 1
    if (row.warnings.includes('source_stock_control_unmapped')) summary.unmappedStockControlRows += 1
  }

  return /** @type {ReturnType<typeof buildInventoryOperationalImportPreview>} */ (
    deepFreeze({
      previewVersion: INVENTORY_OPERATIONAL_IMPORT_PREVIEW_VERSION,
      rows,
      summary,
    })
  )
}
