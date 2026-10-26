/**
 * Standard inventory table preview and staging.
 *
 * Weekly operational sheets keep using the operational preview. This module
 * turns a mapped product list into create / link / skip rows with one opening
 * balance per workspace storage.
 */

import { normalizeInventoryOperationalProductName } from './inventoryOperationalProductMatcher.js'
import { INVENTORY_IMPORT_QUANTITY_POLICY } from './inventoryImportEligibility.js'

export const STANDARD_IMPORT_PREVIEW_VERSION = 'standard_import_preview_v1'

export const STANDARD_IMPORT_ACTION = Object.freeze({
  CREATE: 'create',
  LINK: 'link',
  SKIP: 'skip',
  BLOCKED: 'blocked',
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * @param {object|null|undefined} row
 * @param {number} columnIndex
 * @returns {string}
 */
function cellText(row, columnIndex) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0) return ''
  const cell = Array.isArray(row?.cells) ? row.cells[columnIndex] : null
  const value = cell?.normalized?.value
  if (value !== null && value !== undefined && `${value}`.trim() !== '') return `${value}`.trim()
  const raw = cell?.raw
  if (raw === null || raw === undefined || `${raw}`.trim() === '') return ''
  return `${raw}`.trim()
}

/**
 * @param {string} raw
 * @returns {{ present: boolean, ok: boolean, value: number|null }}
 */
function parseDecimal(raw) {
  const trimmed = text(raw)
  if (!trimmed) return { present: false, ok: true, value: null }
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { present: true, ok: false, value: null }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { present: true, ok: false, value: null }
  return { present: true, ok: true, value }
}

/**
 * @param {Array<{ role?: string, columnIndex?: number, duplicate?: boolean }>|null|undefined} mapped
 * @param {string} role
 * @returns {number}
 */
function columnIndexForRole(mapped, role) {
  const match = (mapped ?? []).find((field) => field.role === role && field.duplicate !== true)
  return Number.isInteger(match?.columnIndex) ? match.columnIndex : -1
}

/**
 * @param {string} label
 * @param {Array<{ id?: string, locationKey?: string, name?: string, active?: boolean }>|null|undefined} storages
 */
function resolveStorage(label, storages) {
  const needle = text(label).toLowerCase()
  if (!needle) return { status: 'missing', label: '' }
  const matches = (storages ?? []).filter((storage) => {
    if (!storage || storage.active === false) return false
    const key = text(storage.locationKey).toLowerCase()
    const name = text(storage.name).toLowerCase()
    return key === needle || name === needle
  })
  if (matches.length === 1) return { status: 'matched', storage: matches[0], label: text(label) }
  if (matches.length > 1) return { status: 'ambiguous', label: text(label) }
  return { status: 'unknown', label: text(label) }
}

/**
 * @param {Array<{ id?: string, name?: string }>|null|undefined} items
 */
function indexExistingByName(items) {
  /** @type {Map<string, object[]>} */
  const map = new Map()
  for (const item of items ?? []) {
    const key = normalizeInventoryOperationalProductName(text(item?.name))
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
}

/**
 * @param {{
 *   parseResult?: object|null,
 *   columnMappingSummary?: { mapped?: object[] }|null,
 *   existingStockItems?: object[]|null,
 *   workspaceStorages?: object[]|null,
 *   actionOverrides?: Record<string, string>|null,
 *   quantityPolicy?: string,
 * }} [input]
 */
export function buildStandardInventoryImportPreview({
  parseResult = null,
  columnMappingSummary = null,
  existingStockItems = null,
  workspaceStorages = null,
  actionOverrides = null,
  quantityPolicy = INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
} = {}) {
  const mapped = Array.isArray(columnMappingSummary?.mapped) ? columnMappingSummary.mapped : []
  const indexes = {
    product_name: columnIndexForRole(mapped, 'product_name'),
    category: columnIndexForRole(mapped, 'category'),
    unit: columnIndexForRole(mapped, 'unit'),
    quantity: columnIndexForRole(mapped, 'quantity'),
    minimum: columnIndexForRole(mapped, 'minimum'),
    cost: columnIndexForRole(mapped, 'cost'),
    supplier: columnIndexForRole(mapped, 'supplier'),
    storage: columnIndexForRole(mapped, 'storage'),
  }
  const existing = indexExistingByName(existingStockItems)
  const sourceRows = (Array.isArray(parseResult?.rows) ? parseResult.rows : [])
    .filter((row) => row?.isBlank !== true)

  /** @type {Map<string, object>} */
  const groups = new Map()

  sourceRows.forEach((row, index) => {
    const sourceRowNumber = Number(row?.sourceRowNumber) > 0
      ? Math.floor(Number(row.sourceRowNumber))
      : index + 2
    const name = cellText(row, indexes.product_name)
    const normalizedName = normalizeInventoryOperationalProductName(name)
    const productKey = normalizedName || `blank:${sourceRowNumber}`
    const current = groups.get(productKey) ?? {
      productKey,
      name: '',
      category: '',
      unit: '',
      units: new Set(),
      minimum: null,
      cost: null,
      supplier: '',
      minimumDiffers: false,
      costDiffers: false,
      categoryDiffers: false,
      supplierDiffers: false,
      invalidNumber: false,
      negativeNumber: false,
      missingQuantity: false,
      missingName: false,
      missingUnit: false,
      locations: new Map(),
      storageIssues: [],
      sourceRowNumbers: [],
    }
    if (!current.name && name) current.name = name
    const category = cellText(row, indexes.category)
    if (!current.category && category) current.category = category
    else if (category && current.category && category.toLowerCase() !== current.category.toLowerCase()) {
      current.categoryDiffers = true
    }
    const unit = cellText(row, indexes.unit)
    if (unit) current.units.add(unit.toLowerCase())
    if (!current.unit && unit) current.unit = unit
    if (!name) current.missingName = true
    if (!unit) current.missingUnit = true

    const quantity = parseDecimal(cellText(row, indexes.quantity))
    const minimum = parseDecimal(cellText(row, indexes.minimum))
    const cost = parseDecimal(cellText(row, indexes.cost))
    if (!quantity.present || !quantity.ok) current.missingQuantity = true
    if (quantity.ok && quantity.value != null && quantity.value < 0) current.negativeNumber = true
    if (minimum.present && !minimum.ok) current.invalidNumber = true
    if (minimum.ok && minimum.value != null && minimum.value < 0) current.negativeNumber = true
    if (cost.present && !cost.ok) current.invalidNumber = true
    if (cost.ok && cost.value != null && cost.value < 0) current.negativeNumber = true

    if (minimum.ok && minimum.value != null) {
      if (current.minimum == null) current.minimum = minimum.value
      else if (current.minimum !== minimum.value) current.minimumDiffers = true
    }
    if (cost.ok && cost.value != null) {
      if (current.cost == null) current.cost = cost.value
      else if (current.cost !== cost.value) current.costDiffers = true
    }
    const supplier = cellText(row, indexes.supplier)
    if (!current.supplier && supplier) current.supplier = supplier
    else if (supplier && current.supplier && supplier.toLowerCase() !== current.supplier.toLowerCase()) {
      current.supplierDiffers = true
    }

    const storageLabel = cellText(row, indexes.storage)
    const resolved = resolveStorage(storageLabel, workspaceStorages)
    if (resolved.status === 'matched' && quantity.ok && quantity.value != null && quantity.value >= 0) {
      const locationKey = text(resolved.storage.locationKey)
      const existingLocation = current.locations.get(locationKey)
      if (existingLocation) {
        existingLocation.parsedQuantity += quantity.value
        existingLocation.sourceRowNumbers.push(sourceRowNumber)
      } else {
        current.locations.set(locationKey, {
          destinationStorageId: text(resolved.storage.id),
          destinationLocationKey: locationKey,
          parsedQuantity: quantity.value,
          validationState: 'valid',
          sourceRowNumbers: [sourceRowNumber],
        })
      }
    } else if (resolved.status !== 'matched') {
      current.storageIssues.push(resolved)
    }

    current.sourceRowNumbers.push(sourceRowNumber)
    groups.set(productKey, current)
  })

  const rows = Array.from(groups.values()).map((group) => {
    /** @type {string[]} */
    const messages = []
    const matches = existing.get(group.productKey) ?? []
    const singleMatch = matches.length === 1 ? matches[0] : null
    const createOffered = Boolean(group.name) && group.units.size <= 1 && !group.missingUnit
      && matches.length === 0
    const linkOffered = Boolean(singleMatch) && group.units.size <= 1
    const skipOffered = true
    const override = text(actionOverrides?.[group.productKey])
    let action = matches.length > 0
      ? STANDARD_IMPORT_ACTION.SKIP
      : STANDARD_IMPORT_ACTION.CREATE
    if (override === STANDARD_IMPORT_ACTION.SKIP && skipOffered) action = STANDARD_IMPORT_ACTION.SKIP
    if (override === STANDARD_IMPORT_ACTION.LINK && linkOffered) action = STANDARD_IMPORT_ACTION.LINK
    if (override === STANDARD_IMPORT_ACTION.CREATE && createOffered) action = STANDARD_IMPORT_ACTION.CREATE

    if (!group.name || group.missingName) messages.push('Product name is empty.')
    if (group.missingUnit || !group.unit) messages.push('Unit is empty.')
    if (group.units.size > 1) messages.push('This name uses more than one unit.')
    if (group.missingQuantity) messages.push('Quantity must be a number zero or greater.')
    if (group.invalidNumber) messages.push('Minimum and cost price must be numbers.')
    if (group.negativeNumber) messages.push('Quantity, minimum, and cost price cannot be negative.')
    if (matches.length > 1) {
      messages.push('More than one existing product uses this name, so this row is skipped.')
    } else if (singleMatch && action === STANDARD_IMPORT_ACTION.SKIP) {
      messages.push('Skipped so the existing product is left unchanged.')
    }
    if (group.categoryDiffers) messages.push('Category differs across rows. The first value is kept.')
    if (group.minimumDiffers) messages.push('Minimum differs across rows. The first value is kept.')
    if (group.costDiffers) messages.push('Cost price differs across rows. The first value is kept.')
    if (group.supplierDiffers) messages.push('Supplier differs across rows. The first value is kept.')

    const hardDataProblem = !group.name || group.missingUnit || group.units.size > 1
      || group.missingQuantity || group.invalidNumber || group.negativeNumber
    const needsStorage = action === STANDARD_IMPORT_ACTION.CREATE
      || (
        action === STANDARD_IMPORT_ACTION.LINK
        && quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
      )
    const dataBlocksAction = hardDataProblem && action !== STANDARD_IMPORT_ACTION.SKIP
    if (needsStorage) {
      for (const issue of group.storageIssues) {
        if (issue.status === 'missing') messages.push('Choose a storage that already exists in this workspace.')
        else if (issue.status === 'ambiguous') {
          messages.push(`Storage “${issue.label}” matches more than one workspace storage.`)
        } else if (issue.status === 'unknown') {
          messages.push(`Storage “${issue.label}” is not in this workspace.`)
        }
      }
      if (group.locations.size === 0 && group.storageIssues.length === 0) {
        messages.push('Choose a storage that already exists in this workspace.')
      }
      for (const location of group.locations.values()) {
        if (location.destinationLocationKey.length > 80 || !location.destinationStorageId) {
          messages.push('A storage on this row cannot be used for opening stock.')
        }
      }
    }

    const blocking = dataBlocksAction
      || (needsStorage && (
        group.storageIssues.length > 0
        || group.locations.size === 0
        || Array.from(group.locations.values()).some((location) => (
          location.destinationLocationKey.length > 80 || !location.destinationStorageId
        ))
      ))
    if (blocking) action = STANDARD_IMPORT_ACTION.BLOCKED

    const locationQuantities = Array.from(group.locations.values()).map((location) => ({
      destinationStorageId: location.destinationStorageId,
      destinationLocationKey: location.destinationLocationKey,
      parsedQuantity: location.parsedQuantity,
      validationState: 'valid',
    }))
    const resolvedQuantity = locationQuantities.reduce((sum, location) => sum + location.parsedQuantity, 0)
    const matchedId = text(singleMatch?.id)

    return {
      productKey: group.productKey,
      name: group.name,
      category: group.category || 'Other',
      unit: group.unit,
      minimumQuantity: group.minimum ?? 0,
      costPrice: group.cost ?? 0,
      supplier: group.supplier,
      action,
      createOffered,
      linkOffered,
      skipOffered,
      matchedStockItemId: matchedId || null,
      matchedStockItemName: text(singleMatch?.name) || null,
      sourceRowNumbers: [...group.sourceRowNumbers],
      locationQuantities,
      resolvedQuantity,
      messages,
    }
  }).sort((left, right) => (
    (left.sourceRowNumbers[0] ?? 0) - (right.sourceRowNumbers[0] ?? 0)
  ))

  const counts = {
    create: rows.filter((row) => row.action === STANDARD_IMPORT_ACTION.CREATE).length,
    link: rows.filter((row) => row.action === STANDARD_IMPORT_ACTION.LINK).length,
    skip: rows.filter((row) => row.action === STANDARD_IMPORT_ACTION.SKIP).length,
    blocked: rows.filter((row) => row.action === STANDARD_IMPORT_ACTION.BLOCKED).length,
  }

  return {
    version: STANDARD_IMPORT_PREVIEW_VERSION,
    rows,
    counts,
    isReady: rows.length > 0 && counts.blocked === 0,
  }
}

/**
 * @param {object|null|undefined} preview
 * @param {{ quantityPolicy?: string, existingQuantityOverwriteConfirmed?: boolean }} [policy]
 * @returns {string[]}
 */
export function listStandardImportContinueMessages(preview, policy = {}) {
  if (!preview) return ['Loading the import preview.']
  /** @type {string[]} */
  const messages = []
  for (const row of preview.rows ?? []) {
    if (row.action !== STANDARD_IMPORT_ACTION.BLOCKED) continue
    const detail = Array.isArray(row.messages) && row.messages.length > 0
      ? row.messages[0]
      : 'This row needs attention.'
    messages.push(`${row.name || 'A row'}: ${detail}`)
  }
  if (
    policy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
    && (preview.counts?.link ?? 0) > 0
    && policy.existingQuantityOverwriteConfirmed !== true
  ) {
    messages.push('Confirm replacing quantities on existing products.')
  }
  if (messages.length === 0 && preview.isReady !== true) {
    messages.push('Finish required validation before continuing.')
  }
  return messages
}

/**
 * @param {unknown} selectedFile
 */
function readFileMetadata(selectedFile) {
  const name = text(selectedFile?.name ?? selectedFile?.sourceFilename)
  if (!name) throw new Error('A file name is required before this import can be applied.')
  const extension = text(selectedFile?.extension ?? name.split('.').pop()).toLowerCase()
  const sourceFormat = extension === 'csv'
    ? 'csv'
    : extension === 'xlsx' || extension === 'xls'
      ? 'xlsx'
      : null
  const size = Number(selectedFile?.sizeBytes ?? selectedFile?.size ?? selectedFile?.file?.size)
  return {
    source_filename: name,
    source_format: sourceFormat,
    source_file_size_bytes: Number.isFinite(size) && size >= 0 ? size : null,
    source_fingerprint: text(selectedFile?.fingerprint ?? selectedFile?.sourceFingerprint) || null,
    extension,
  }
}

/**
 * Stage a ready standard preview into the session shape Apply already accepts.
 *
 * @param {{
 *   workspaceId: string,
 *   selectedFile: object,
 *   selectedWorksheetName?: string,
 *   headerRowNumber?: number|null,
 *   preview: object,
 *   policy?: { quantityPolicy?: string, existingQuantityOverwriteConfirmed?: boolean },
 *   mapping?: object,
 * }} input
 */
export function buildStandardInventoryImportStagingPayload({
  workspaceId,
  selectedFile,
  selectedWorksheetName = '',
  headerRowNumber = null,
  preview,
  policy = {},
  mapping = {},
} = {}) {
  const normalizedWorkspaceId = text(workspaceId)
  if (!normalizedWorkspaceId) throw new Error('Workspace is required to apply this import.')
  if (!preview || preview.isReady !== true || !Array.isArray(preview.rows)) {
    throw new Error('Resolve the remaining rows before applying this import.')
  }
  const quantityPolicy = policy.quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
    ? INVENTORY_IMPORT_QUANTITY_POLICY.NO_CHANGE
    : INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
  const overwriteConfirmed = policy.existingQuantityOverwriteConfirmed === true
  if (
    quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK
    && preview.rows.some((row) => row.action === STANDARD_IMPORT_ACTION.LINK)
    && !overwriteConfirmed
  ) {
    throw new Error('Confirm replacing quantities on existing products before applying.')
  }

  const seen = new Set()
  const rows = preview.rows.map((row) => {
    const sourceRowNumber = row.sourceRowNumbers?.[0]
    if (!Number.isInteger(sourceRowNumber) || sourceRowNumber <= 0 || seen.has(sourceRowNumber)) {
      throw new Error('Each imported product needs its own source row.')
    }
    seen.add(sourceRowNumber)
    const action = row.action
    if (
      action !== STANDARD_IMPORT_ACTION.CREATE
      && action !== STANDARD_IMPORT_ACTION.LINK
      && action !== STANDARD_IMPORT_ACTION.SKIP
    ) {
      throw new Error('Resolve the remaining rows before applying this import.')
    }

    const locationQuantities = (row.locationQuantities ?? []).map((location) => ({
      destinationStorageId: text(location.destinationStorageId),
      destinationLocationKey: text(location.destinationLocationKey),
      parsedQuantity: location.parsedQuantity,
      validationState: 'valid',
    }))
    const home = locationQuantities[0] ?? null
    /** @type {Record<string, unknown>} */
    const normalized = {
      name: row.name,
      category: row.category || 'Other',
      unit: row.unit,
      supplier: row.supplier || '',
      supplierId: null,
      minimumQuantity: row.minimumQuantity ?? 0,
      costPrice: row.costPrice ?? 0,
      active: true,
    }
    if (action === STANDARD_IMPORT_ACTION.CREATE || action === STANDARD_IMPORT_ACTION.LINK) {
      normalized.resolvedQuantity = row.resolvedQuantity ?? 0
      normalized.locationQuantities = locationQuantities
      if (home) {
        normalized.locationKey = home.destinationLocationKey
        normalized.storageLocation = home.destinationLocationKey
      }
    }
    if (action === STANDARD_IMPORT_ACTION.LINK) {
      if (!row.matchedStockItemId || !UUID_RE.test(row.matchedStockItemId)) {
        throw new Error(`Link for ${row.name || 'a product'} needs an existing product.`)
      }
      normalized.matchedStockItemId = row.matchedStockItemId
    }
    if (action === STANDARD_IMPORT_ACTION.SKIP) {
      normalized.skipReason = row.matchedStockItemId ? 'existing_name' : 'explicit_skip'
    }

    const warnings = (row.messages ?? []).filter((message) => (
      !message.startsWith('Skipped so the existing product')
    ))

    return {
      workspace_id: normalizedWorkspaceId,
      source_row_number: sourceRowNumber,
      raw_payload: {
        productName: row.name,
        category: row.category,
        unit: row.unit,
        supplier: row.supplier,
        costPrice: row.costPrice ?? 0,
        minimumQuantity: row.minimumQuantity ?? 0,
        sourceRowNumbers: [...(row.sourceRowNumbers ?? [])],
        locationQuantities,
      },
      normalized_payload: normalized,
      mapping_evidence: {
        productKey: row.productKey,
        reviewedAction: action,
        stagedAction: action,
        standardPreviewVersion: STANDARD_IMPORT_PREVIEW_VERSION,
      },
      source_fingerprint: '',
      validation_state: warnings.length > 0 ? 'warning' : 'valid',
      validation_messages: warnings.map((message) => ({ severity: 'warning', message })),
      validation_version: STANDARD_IMPORT_PREVIEW_VERSION,
      conflict_state: row.matchedStockItemId ? 'exact_match' : 'none',
      conflict_evidence: {
        matchedStockItemId: row.matchedStockItemId,
      },
      matched_stock_item_id: action === STANDARD_IMPORT_ACTION.LINK ? row.matchedStockItemId : null,
      proposed_action: action,
      selected_action: action,
      confirm_quantity_update: action === STANDARD_IMPORT_ACTION.LINK
        && quantityPolicy === INVENTORY_IMPORT_QUANTITY_POLICY.OPENING_STOCK,
      confirm_location_fallback: false,
      apply_state: 'pending',
    }
  })

  const file = readFileMetadata(selectedFile)
  const header = Number(headerRowNumber)
  const counts = rows.reduce((acc, row) => {
    acc.total_rows += 1
    if (row.validation_state === 'warning') acc.warning_rows += 1
    else acc.valid_rows += 1
    if (row.selected_action === 'create') acc.create_rows += 1
    else if (row.selected_action === 'link') acc.link_rows += 1
    else if (row.selected_action === 'skip') acc.skip_rows += 1
    return acc
  }, {
    total_rows: 0,
    valid_rows: 0,
    warning_rows: 0,
    error_rows: 0,
    manual_review_rows: 0,
    create_rows: 0,
    link_rows: 0,
    update_rows: 0,
    skip_rows: 0,
  })

  return {
    stagingVersion: STANDARD_IMPORT_PREVIEW_VERSION,
    session: {
      workspace_id: normalizedWorkspaceId,
      source_filename: file.source_filename,
      source_format: file.source_format,
      source_file_size_bytes: file.source_file_size_bytes,
      source_fingerprint: file.source_fingerprint,
      selected_sheet: text(selectedWorksheetName),
      header_row_number: Number.isFinite(header) && header > 0 ? Math.floor(header) : null,
      parser_version: STANDARD_IMPORT_PREVIEW_VERSION,
      normalization_version: STANDARD_IMPORT_PREVIEW_VERSION,
      validation_version: STANDARD_IMPORT_PREVIEW_VERSION,
      contract_version: 'import_v1.0',
      mapping: mapping && typeof mapping === 'object' ? mapping : {},
      confirmations: {
        quantityPolicy,
        existingQuantityOverwriteConfirmed: overwriteConfirmed,
        newProductLocationFallback: null,
        standardImport: true,
      },
      source_metadata: {
        fileExtension: file.extension || null,
        worksheetName: text(selectedWorksheetName) || null,
        standardPreviewVersion: STANDARD_IMPORT_PREVIEW_VERSION,
        totalReviewedRows: counts.total_rows,
      },
      status: 'review',
      ...counts,
    },
    rows,
  }
}
