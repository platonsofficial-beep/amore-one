import {
  STOCK_CATEGORIES,
  STOCK_LOCATIONS,
  getStockTypeOptionsForCategory,
  normalizeStockCategory,
  normalizeStockItemType,
} from './stockCatalog'
import { resolveStockStorageLocation } from './stockCatalog'

const IMPORT_HEADERS = [
  'name',
  'category',
  'type',
  'supplier',
  'unit',
  'current quantity',
  'minimum',
  'target',
  'cost',
  'location',
]

const HEADER_ALIASES = {
  name: ['name', 'product', 'product name'],
  category: ['category'],
  type: ['type', 'item type'],
  supplier: ['supplier'],
  unit: ['unit'],
  currentquantity: ['current quantity', 'current', 'on hand', 'quantity'],
  minimum: ['minimum', 'minimum alert', 'min'],
  target: ['target', 'target stock', 'par', 'par level'],
  cost: ['cost', 'cost price', 'purchase price', 'price'],
  location: ['location', 'storage location', 'storage'],
}

function normalizeHeader(value) {
  return `${value ?? ''}`.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function mapHeaderToField(header) {
  const normalized = normalizeHeader(header)
  const entries = Object.entries(HEADER_ALIASES)

  for (const [field, aliases] of entries) {
    if (aliases.includes(normalized)) return field
  }

  return null
}

function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values.map((value) => value.trim())
}

function parseOptionalNumber(value, { allowEmpty = true } = {}) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return allowEmpty ? null : Number.NaN
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function parseStockImportCsv(text) {
  const lines = `${text ?? ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { rows: [], errors: ['CSV file is empty.'] }
  }

  const headerCells = parseCsvLine(lines[0])
  const fieldIndexes = {}
  const errors = []

  headerCells.forEach((header, index) => {
    const field = mapHeaderToField(header)
    if (field) {
      fieldIndexes[field] = index
    }
  })

  if (fieldIndexes.name === undefined) {
    errors.push('Missing required column: Name')
  }

  const rows = lines.slice(1).map((line, lineIndex) => {
    const cells = parseCsvLine(line)
    const rowNumber = lineIndex + 2

    const getCell = (field) => {
      const index = fieldIndexes[field]
      return index === undefined ? '' : `${cells[index] ?? ''}`.trim()
    }

    return {
      rowNumber,
      name: getCell('name'),
      category: getCell('category'),
      type: getCell('type'),
      supplier: getCell('supplier'),
      unit: getCell('unit'),
      currentQuantity: getCell('currentquantity'),
      minimumQuantity: getCell('minimum'),
      targetQuantity: getCell('target'),
      costPrice: getCell('cost'),
      storageLocation: getCell('location'),
    }
  })

  return { rows, errors }
}

export function validateStockImportRow(row) {
  const issues = []

  const name = `${row.name ?? ''}`.trim()
  if (!name) {
    issues.push('Name is required.')
    return { isValid: false, issues, payload: null }
  }

  const category = normalizeStockCategory(row.category || 'Other')
  if (!STOCK_CATEGORIES.includes(category)) {
    issues.push(`Invalid category "${row.category || ''}".`)
  }

  const itemType = normalizeStockItemType(category, row.type || 'Other')
  const typeOptions = getStockTypeOptionsForCategory(category)
  if (!typeOptions.includes(itemType)) {
    issues.push(`Invalid type "${row.type || ''}" for ${category}.`)
  }

  const unit = `${row.unit ?? ''}`.trim()
  if (!unit) {
    issues.push('Unit is required.')
  }

  const currentQuantity = parseOptionalNumber(row.currentQuantity, { allowEmpty: false })
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
    issues.push('Current quantity must be zero or greater.')
  }

  const minimumQuantity = parseOptionalNumber(row.minimumQuantity, { allowEmpty: false })
  if (!Number.isFinite(minimumQuantity) || minimumQuantity < 0) {
    issues.push('Minimum must be zero or greater.')
  }

  const targetQuantity = parseOptionalNumber(row.targetQuantity, { allowEmpty: true })
  if (targetQuantity !== null && (!Number.isFinite(targetQuantity) || targetQuantity < 0)) {
    issues.push('Target must be zero or greater when provided.')
  }

  const costPrice = parseOptionalNumber(row.costPrice, { allowEmpty: true })
  if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
    issues.push('Cost must be zero or greater when provided.')
  }

  const storageLocation = `${row.storageLocation ?? ''}`.trim() || 'Main Storage'
  if (!STOCK_LOCATIONS.includes(storageLocation)) {
    issues.push(`Invalid location "${row.storageLocation || ''}".`)
  }

  if (issues.length > 0) {
    return { isValid: false, issues, payload: null }
  }

  return {
    isValid: true,
    issues: [],
    payload: {
      name,
      category,
      itemType,
      supplier: `${row.supplier ?? ''}`.trim(),
      unit,
      currentQuantity,
      minimumQuantity,
      targetQuantity,
      costPrice: costPrice ?? 0,
      storageLocation,
    },
    matchKey: `${name.toLowerCase()}::${storageLocation.toLowerCase()}`,
  }
}

export function buildStockImportPlan(rows = [], existingItems = []) {
  const existingByKey = new Map()

  existingItems.forEach((item) => {
    const key = `${`${item.name ?? ''}`.trim().toLowerCase()}::${resolveStockStorageLocation(item).toLowerCase()}`
    if (!existingByKey.has(key)) {
      existingByKey.set(key, item)
    }
  })

  const plan = {
    creates: [],
    updates: [],
    skipped: [],
    errors: [],
  }

  rows.forEach((row) => {
    const validation = validateStockImportRow(row)
    if (!validation.isValid) {
      plan.skipped.push({
        rowNumber: row.rowNumber,
        name: row.name,
        reason: validation.issues.join(' '),
      })
      return
    }

    const existing = existingByKey.get(validation.matchKey)
    if (existing?.id) {
      plan.updates.push({
        id: existing.id,
        rowNumber: row.rowNumber,
        payload: validation.payload,
      })
      return
    }

    plan.creates.push({
      rowNumber: row.rowNumber,
      payload: validation.payload,
    })
  })

  return plan
}

export function getStockImportTemplateHeaders() {
  return IMPORT_HEADERS.map((header) => header.replace(/\b\w/g, (char) => char.toUpperCase()))
}
