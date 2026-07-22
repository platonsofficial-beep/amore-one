/**
 * P8.16.14 — New-product draft overlay for operational import preview.
 *
 * Pure, deterministic wizard-local drafts for create_new rows. No UI, network,
 * database access, services, or Apply. Does not mutate the input preview or drafts.
 *
 * Row keys reuse getOperationalMatchResolutionRowKey (preview index + source identity).
 */

import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS,
} from './inventoryOperationalImportPreview.js'
import { getOperationalMatchResolutionRowKey } from './inventoryOperationalMatchResolutions.js'
import {
  INVENTORY_UNIT_INFERENCE_STATUS,
  inferInventoryUnitFromProductName,
} from './inventoryUnitInference.js'

export const INVENTORY_NEW_PRODUCT_UNITS = Object.freeze([
  'Bottle 700ml',
  'Bottle 750ml',
  'Bottle 1L',
  'Bottle 1.5L',
  'Bottle 2L',
  'Can',
  'Case',
  'Pack',
  'Piece',
  'Kg',
  'Gram',
  'Liter',
  'Milliliter',
])

export class InventoryNewProductDraftError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryNewProductDraftError'
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
  return false
}

/**
 * @param {object} row
 * @param {number} index
 * @returns {boolean}
 */
export function isCreateNewPreviewRow(row) {
  return row?.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW
}

/**
 * @param {object|null|undefined} preview
 * @returns {Array<{ key: string, index: number, row: object }>}
 */
export function listCreateNewPreviewRows(preview) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : []
  /** @type {Array<{ key: string, index: number, row: object }>} */
  const listed = []
  rows.forEach((row, index) => {
    if (!isCreateNewPreviewRow(row)) return
    listed.push({
      key: getOperationalMatchResolutionRowKey(row, index),
      index,
      row,
    })
  })
  return listed
}

/**
 * Defaults for a create_new preview row.
 * Unit may be initialized from deterministic name inference; operators override via drafts.
 *
 * @param {object} row
 * @returns {{
 *   productName: string,
 *   category: string,
 *   unit: string|null,
 *   unitInference: ReturnType<typeof inferInventoryUnitFromProductName>,
 * }}
 */
export function getNewProductDraftDefaults(row) {
  const productName = row?.source?.productName == null
    ? ''
    : String(row.source.productName)
  const proposedCategory = row?.metadataProposal?.proposedCategory
  const sourceCategory = row?.source?.category
  const category = isMeaningfullyPopulated(proposedCategory)
    ? String(proposedCategory).trim()
    : isMeaningfullyPopulated(sourceCategory)
      ? String(sourceCategory).trim()
      : 'Other'
  const unitInference = inferInventoryUnitFromProductName(productName)
  return {
    productName,
    category,
    unit: unitInference.status === INVENTORY_UNIT_INFERENCE_STATUS.INFERRED
      ? unitInference.proposedUnit
      : null,
    unitInference,
  }
}

/**
 * Merge stored draft over defaults. Unknown/partial drafts are safe.
 * Explicit draft.unit (including null) is never replaced by inference.
 *
 * @param {object} row
 * @param {{ productName?: unknown, category?: unknown, unit?: unknown }|null|undefined} draft
 * @returns {{
 *   productName: string,
 *   category: string,
 *   unit: string|null,
 *   unitInference: ReturnType<typeof inferInventoryUnitFromProductName>,
 * }}
 */
export function mergeNewProductDraft(row, draft) {
  const defaults = getNewProductDraftDefaults(row)
  if (!isPlainObject(draft)) return defaults

  const productName = draft.productName === undefined
    ? defaults.productName
    : draft.productName == null
      ? ''
      : String(draft.productName)
  const category = draft.category === undefined
    ? defaults.category
    : draft.category == null
      ? ''
      : String(draft.category)
  const unit = draft.unit === undefined
    ? defaults.unit
    : draft.unit == null || draft.unit === ''
      ? null
      : String(draft.unit)

  return {
    productName,
    category,
    unit,
    unitInference: defaults.unitInference,
  }
}

/**
 * @param {{ productName?: unknown, category?: unknown, unit?: unknown }|null|undefined} draft
 * @returns {{
 *   valid: boolean,
 *   errors: { productName?: string, category?: string, unit?: string },
 *   normalized: { productName: string, category: string, unit: string|null },
 * }}
 */
export function validateNewProductDraft(draft) {
  /** @type {{ productName?: string, category?: string, unit?: string }} */
  const errors = {}
  const productNameRaw = draft?.productName == null ? '' : String(draft.productName)
  const categoryRaw = draft?.category == null ? '' : String(draft.category)
  const unitRaw = draft?.unit == null || draft?.unit === ''
    ? null
    : String(draft.unit)

  const productName = productNameRaw.trim()
  const category = categoryRaw.trim()
  const unit = unitRaw

  if (!productName) {
    errors.productName = 'Product name is required'
  }
  if (!category) {
    errors.category = 'Category is required'
  }
  if (!unit) {
    errors.unit = 'Unit is required'
  } else if (!INVENTORY_NEW_PRODUCT_UNITS.includes(unit)) {
    errors.unit = 'Select a valid unit'
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      productName,
      category,
      unit,
    },
  }
}

/**
 * @param {{
 *   preview?: object|null,
 *   drafts?: Record<string, { productName?: unknown, category?: unknown, unit?: unknown }>,
 * }} [input]
 * @returns {boolean}
 */
export function areAllNewProductDraftsValid({ preview, drafts = {} } = {}) {
  const createRows = listCreateNewPreviewRows(preview)
  if (createRows.length === 0) return true
  if (!isPlainObject(drafts)) return false

  return createRows.every(({ key, row }) => {
    const merged = mergeNewProductDraft(row, drafts[key])
    return validateNewProductDraft(merged).valid
  })
}

/**
 * Unique workspace category options for the new-product dropdown.
 *
 * @param {{
 *   catalogItems?: Array<{ category?: unknown }>|null,
 *   preview?: object|null,
 * }} [input]
 * @returns {string[]}
 */
export function listNewProductCategoryOptions({ catalogItems = [], preview = null } = {}) {
  /** @type {Set<string>} */
  const categories = new Set()

  if (Array.isArray(catalogItems)) {
    for (const item of catalogItems) {
      if (isMeaningfullyPopulated(item?.category)) {
        categories.add(String(item.category).trim())
      }
    }
  }

  for (const { row } of listCreateNewPreviewRows(preview)) {
    const defaults = getNewProductDraftDefaults(row)
    if (isMeaningfullyPopulated(defaults.category)) {
      categories.add(defaults.category)
    }
    if (isMeaningfullyPopulated(row?.source?.category)) {
      categories.add(String(row.source.category).trim())
    }
  }

  if (!categories.has('Other')) categories.add('Other')

  return Object.freeze([...categories].sort((a, b) => a.localeCompare(b)))
}

/**
 * @param {object} row
 * @returns {object}
 */
function cloneRowShallow(row) {
  return {
    source: {
      category: row.source?.category ?? null,
      productName: row.source?.productName,
      storage: row.source?.storage,
      bar: row.source?.bar,
      weekdays: row.source?.weekdays == null || !isPlainObject(row.source.weekdays)
        ? row.source?.weekdays ?? null
        : { ...row.source.weekdays },
      order: row.source?.order,
      stockControl: row.source?.stockControl,
    },
    match: {
      status: row.match?.status,
      matchedStockItem: row.match?.matchedStockItem ?? null,
      candidates: Array.isArray(row.match?.candidates)
        ? row.match.candidates.map((candidate) => (
          isPlainObject(candidate)
            ? {
                stockItem: candidate.stockItem,
                evidence: Array.isArray(candidate.evidence) ? [...candidate.evidence] : [],
              }
            : candidate
        ))
        : [],
      evidence: Array.isArray(row.match?.evidence) ? [...row.match.evidence] : [],
    },
    existingOne: row.existingOne ?? null,
    proposedAction: row.proposedAction,
    quantityProposal: { ...row.quantityProposal },
    locationProposal: { ...row.locationProposal },
    metadataProposal: { ...row.metadataProposal },
    warnings: Array.isArray(row.warnings) ? [...row.warnings] : [],
    blockers: Array.isArray(row.blockers) ? [...row.blockers] : [],
    resolution: row.resolution ?? null,
  }
}

/**
 * Apply wizard-local new-product drafts onto a (already resolution-derived) preview.
 *
 * Unknown draft keys are ignored. Non-create_new rows are copied unchanged.
 *
 * @param {{
 *   preview?: unknown,
 *   drafts?: unknown,
 * }} [input]
 */
export function applyInventoryNewProductDrafts({
  preview,
  drafts = {},
} = {}) {
  if (!isPlainObject(preview)) {
    throw new InventoryNewProductDraftError(
      'INVALID_PREVIEW',
      'New product drafts expect a preview object.',
    )
  }
  if (!Array.isArray(preview.rows)) {
    throw new InventoryNewProductDraftError(
      'INVALID_PREVIEW',
      'New product drafts expect preview.rows to be an array.',
    )
  }
  if (!isPlainObject(drafts)) {
    throw new InventoryNewProductDraftError(
      'INVALID_DRAFTS',
      'New product drafts expect drafts to be a plain object map.',
    )
  }

  /** @type {object[]} */
  const rows = []
  let missingUnits = 0
  let createNew = 0

  for (let index = 0; index < preview.rows.length; index += 1) {
    const row = preview.rows[index]
    if (!isPlainObject(row)) {
      throw new InventoryNewProductDraftError(
        'INVALID_PREVIEW',
        `New product drafts expect preview row at index ${index} to be an object.`,
      )
    }

    if (!isCreateNewPreviewRow(row)) {
      rows.push(cloneRowShallow(row))
      continue
    }

    const key = getOperationalMatchResolutionRowKey(row, index)
    const merged = mergeNewProductDraft(row, drafts[key])
    const validation = validateNewProductDraft(merged)
    const derived = cloneRowShallow(row)

    derived.source = {
      ...derived.source,
      productName: validation.normalized.productName || merged.productName,
    }
    derived.metadataProposal = {
      ...derived.metadataProposal,
      proposedCategory: validation.normalized.category || merged.category,
      proposedUnit: validation.normalized.unit,
      proposedActive: true,
    }
    derived.draft = {
      productName: merged.productName,
      category: merged.category,
      unit: merged.unit,
      valid: validation.valid,
    }

    const blockers = derived.blockers.filter((code) => code !== 'unit_missing')
    if (!validation.normalized.unit) {
      blockers.push('unit_missing')
    }
    derived.blockers = blockers

    if (!validation.normalized.unit) missingUnits += 1
    createNew += 1
    rows.push(derived)
  }

  const baseSummary = isPlainObject(preview.summary) ? { ...preview.summary } : {}
  const summary = {
    ...baseSummary,
    createNew: baseSummary.createNew ?? createNew,
    missingUnits,
  }

  // Keep createNew count aligned with derived create_new rows when summary lacked it.
  let createNewCount = 0
  for (const row of rows) {
    if (row.proposedAction === INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION.CREATE_NEW) {
      createNewCount += 1
    }
  }
  summary.createNew = createNewCount

  return deepFreeze({
    previewVersion: preview.previewVersion ?? 1,
    rows,
    summary,
  })
}

export {
  getOperationalMatchResolutionRowKey,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_ACTION,
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_PROPOSAL_STATUS,
}
