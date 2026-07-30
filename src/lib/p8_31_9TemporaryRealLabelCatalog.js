/**
 * P8.31.9 — Temporary Real-Label Test Catalog dataset contract (test/build-time only).
 * Pure validation. No I/O beyond the caller-supplied dataset. No production side effects.
 */

import {
  STOCK_CATEGORIES,
  STOCK_LOCATIONS,
  STOCK_TYPES_BY_CATEGORY,
  PRODUCT_METADATA_LIMITS,
} from './stockCatalog.js'
import { isAcceptedInventoryUnitValue } from './inventoryUnitStandard.js'
import { buildProductIdentityKey } from './stockProductIdentity.js'

export const P8_31_9_BATCH_ID = 'ONE_REAL_LABEL_TEST_2026_07'

export const P8_31_9_FICTIONAL_SUPPLIERS = Object.freeze([
  'Premium Spirits Distribution Ltd',
  'Mediterranean Beverage Partners',
  'Cyprus Fine Wines Trading',
  'Island Water & Refreshments',
  'FreshServe Food Solutions',
  'Nicosia HORECA Supplies',
  'Local Produce Partners',
])

export const P8_31_9_DOMAIN_TARGETS = Object.freeze({
  spirits: 55,
  wine: 35,
  beer: 18,
  nonAlcoholicBeverages: 30,
  barIngredients: 25,
  operationalConsumables: 17,
})

export const P8_31_9_EXPECTED_PRODUCT_COUNT = 180

/** Domain tags stored on each row for distribution checks (not a DB column). */
export const P8_31_9_DOMAIN_TAGS = Object.freeze([
  'spirits',
  'wine',
  'beer',
  'nonAlcoholicBeverages',
  'barIngredients',
  'operationalConsumables',
])

const FORBIDDEN_UNIT_TOKENS = Object.freeze([
  'case',
  'box',
  'pack',
  'carton',
  'tray',
  'pallet',
])

const TEST_PREFIX_RE = /\b(ONE_REAL_LABEL_TEST|ONE_STOCK_LOAD_TEST|TEST_CATALOG|LOAD_TEST)\b/i

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return ''
  return `${value}`.replace(/\s+/g, ' ').trim()
}

/**
 * @param {object} product
 * @returns {number}
 */
export function sumLocationQuantities(product) {
  const rows = Array.isArray(product?.locationQuantities) ? product.locationQuantities : []
  return rows.reduce((sum, row) => sum + Number(row?.quantity ?? 0), 0)
}

/**
 * @param {object} product
 * @returns {'out'|'low'|'healthy'}
 */
export function classifyStockState(product) {
  const current = Number.isFinite(Number(product?.currentQuantity))
    ? Number(product.currentQuantity)
    : sumLocationQuantities(product)
  const minimum = Number(product?.minimumQuantity ?? 0)
  if (current <= 0) return 'out'
  if (Number.isFinite(minimum) && current < minimum) return 'low'
  return 'healthy'
}

/**
 * @param {object} dataset
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   summary: object,
 * }}
 */
export function validateTemporaryRealLabelCatalog(dataset) {
  /** @type {string[]} */
  const errors = []
  const products = Array.isArray(dataset?.products) ? dataset.products : null

  if (!dataset || typeof dataset !== 'object') {
    return { ok: false, errors: ['dataset must be an object'], summary: {} }
  }
  if (dataset.batchId !== P8_31_9_BATCH_ID) {
    errors.push(`dataset.batchId must be ${P8_31_9_BATCH_ID}`)
  }
  if (!products) {
    return { ok: false, errors: [...errors, 'dataset.products must be an array'], summary: {} }
  }
  if (products.length !== P8_31_9_EXPECTED_PRODUCT_COUNT) {
    errors.push(`expected ${P8_31_9_EXPECTED_PRODUCT_COUNT} products, got ${products.length}`)
  }

  const sequences = new Set()
  const identityKeys = new Set()
  const domainCounts = Object.fromEntries(P8_31_9_DOMAIN_TAGS.map((tag) => [tag, 0]))
  const categoryCounts = Object.fromEntries(STOCK_CATEGORIES.map((c) => [c, 0]))
  const supplierCounts = Object.fromEntries(P8_31_9_FICTIONAL_SUPPLIERS.map((s) => [s, 0]))
  let activeCount = 0
  let inactiveCount = 0
  let multiLocationCount = 0
  let singleLocationCount = 0
  let healthyCount = 0
  let lowCount = 0
  let outCount = 0
  let verifiedBarcodeCount = 0
  let nullBarcodeCount = 0

  for (const [index, product] of products.entries()) {
    const label = `products[${index}]`
    if (!product || typeof product !== 'object') {
      errors.push(`${label}: must be an object`)
      continue
    }

    if (product.batchId !== P8_31_9_BATCH_ID) {
      errors.push(`${label}: batchId must be ${P8_31_9_BATCH_ID}`)
    }

    const sequence = Number(product.sequence)
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > P8_31_9_EXPECTED_PRODUCT_COUNT) {
      errors.push(`${label}: sequence must be integer 1–${P8_31_9_EXPECTED_PRODUCT_COUNT}`)
    } else if (sequences.has(sequence)) {
      errors.push(`${label}: duplicate sequence ${sequence}`)
    } else {
      sequences.add(sequence)
    }

    const brand = asTrimmedString(product.brand)
    const name = asTrimmedString(product.name)
    const size = asTrimmedString(product.size)
    if (!name) errors.push(`${label}: name is required`)
    if (TEST_PREFIX_RE.test(brand) || TEST_PREFIX_RE.test(name)) {
      errors.push(`${label}: Brand/Name must not contain visible test batch prefixes`)
    }
    if (brand && name.toLocaleLowerCase('en-US').startsWith(`${brand.toLocaleLowerCase('en-US')} `)) {
      errors.push(`${label}: Product Name must not repeat Brand`)
    }
    if (brand && name.toLocaleLowerCase('en-US') === brand.toLocaleLowerCase('en-US')) {
      errors.push(`${label}: Product Name must not equal Brand`)
    }

    if (brand.length > PRODUCT_METADATA_LIMITS.brand) {
      errors.push(`${label}: brand exceeds ${PRODUCT_METADATA_LIMITS.brand}`)
    }
    if (size.length > PRODUCT_METADATA_LIMITS.size) {
      errors.push(`${label}: size exceeds ${PRODUCT_METADATA_LIMITS.size}`)
    }

    const category = asTrimmedString(product.category)
    const itemType = asTrimmedString(product.itemType)
    if (!STOCK_CATEGORIES.includes(category)) {
      errors.push(`${label}: invalid category ${category}`)
    } else {
      categoryCounts[category] += 1
      const allowedTypes = STOCK_TYPES_BY_CATEGORY[category] || []
      if (!allowedTypes.includes(itemType)) {
        errors.push(`${label}: itemType ${itemType} not allowed for ${category}`)
      }
    }

    const unit = asTrimmedString(product.unit)
    if (!isAcceptedInventoryUnitValue(unit)) {
      errors.push(`${label}: unit ${unit} is not a selectable physical inventory unit`)
    }
    if (FORBIDDEN_UNIT_TOKENS.some((token) => unit.toLowerCase().includes(token))) {
      errors.push(`${label}: unit must not be packaging-only (${unit})`)
    }

    const packagingNote = asTrimmedString(product.packagingNote)
    if (packagingNote.length > 240) {
      errors.push(`${label}: packagingNote exceeds 240`)
    }

    const supplierName = asTrimmedString(product.supplierName)
    if (!P8_31_9_FICTIONAL_SUPPLIERS.includes(supplierName)) {
      errors.push(`${label}: supplierName must be one of the seven fictional suppliers`)
    } else {
      supplierCounts[supplierName] += 1
    }

    const defaultStorage = asTrimmedString(product.defaultStorage)
    if (!STOCK_LOCATIONS.includes(defaultStorage)) {
      errors.push(`${label}: defaultStorage ${defaultStorage} is not a canonical STOCK_LOCATIONS key`)
    }

    const locations = Array.isArray(product.locationQuantities) ? product.locationQuantities : null
    if (!locations || locations.length < 1) {
      errors.push(`${label}: locationQuantities must have at least one row`)
    } else {
      if (locations.length >= 2) multiLocationCount += 1
      else singleLocationCount += 1

      let hasDefault = false
      for (const [locIndex, row] of locations.entries()) {
        const key = asTrimmedString(row?.locationKey)
        const qty = Number(row?.quantity)
        if (!STOCK_LOCATIONS.includes(key)) {
          errors.push(`${label}.locationQuantities[${locIndex}]: invalid locationKey ${key}`)
        }
        if (!Number.isFinite(qty) || qty < 0) {
          errors.push(`${label}.locationQuantities[${locIndex}]: quantity must be finite and >= 0`)
        }
        if (key === defaultStorage) hasDefault = true
      }
      if (!hasDefault) {
        errors.push(`${label}: locationQuantities must include defaultStorage ${defaultStorage}`)
      }
    }

    const locationSum = sumLocationQuantities(product)
    const currentQuantity = Number(product.currentQuantity)
    if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
      errors.push(`${label}: currentQuantity must be finite and >= 0`)
    } else if (Math.abs(currentQuantity - locationSum) > 1e-9) {
      errors.push(`${label}: currentQuantity ${currentQuantity} != sum(locationQuantities) ${locationSum}`)
    }

    for (const field of ['minimumQuantity', 'targetQuantity', 'orderQuantity', 'costPrice']) {
      const value = Number(product[field])
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`${label}: ${field} must be finite and >= 0`)
      }
    }

    if (typeof product.active !== 'boolean') {
      errors.push(`${label}: active must be boolean`)
    } else if (product.active) activeCount += 1
    else inactiveCount += 1

    const identityKey = buildProductIdentityKey({ brand, name, size })
    if (identityKeys.has(identityKey)) {
      errors.push(`${label}: duplicate identity Brand+Name+Size (${brand} / ${name} / ${size})`)
    } else {
      identityKeys.add(identityKey)
    }

    const domain = asTrimmedString(product.domain)
    if (!P8_31_9_DOMAIN_TAGS.includes(domain)) {
      errors.push(`${label}: domain must be one of ${P8_31_9_DOMAIN_TAGS.join(', ')}`)
    } else {
      domainCounts[domain] += 1
    }

    const research = product.research
    if (!research || typeof research !== 'object') {
      errors.push(`${label}: research object required`)
    } else {
      const status = asTrimmedString(research.status)
      const sourceUrl = asTrimmedString(research.sourceUrl)
      const sizeVerified = research.sizeVerified === true
      const barcodeVerified = research.barcodeVerified === true
      const barcode = product.barcode == null || product.barcode === ''
        ? null
        : asTrimmedString(product.barcode)

      if (barcode == null) {
        nullBarcodeCount += 1
        if (barcodeVerified) {
          errors.push(`${label}: barcodeVerified cannot be true when barcode is null`)
        }
      } else {
        if (barcode.length > PRODUCT_METADATA_LIMITS.barcode) {
          errors.push(`${label}: barcode exceeds ${PRODUCT_METADATA_LIMITS.barcode}`)
        }
        if (!barcodeVerified) {
          errors.push(`${label}: non-null barcode requires barcodeVerified true`)
        } else {
          verifiedBarcodeCount += 1
        }
        if (!/^\d{8,14}$/.test(barcode)) {
          errors.push(`${label}: verified barcode must be 8–14 digits`)
        }
      }

      const branded = Boolean(brand)
      if (branded && status === 'verified') {
        if (!sourceUrl) errors.push(`${label}: verified branded product requires sourceUrl`)
        if (!sizeVerified) errors.push(`${label}: verified branded product requires sizeVerified`)
      }
      if (status === 'operational_generic') {
        if (barcode != null) errors.push(`${label}: operational_generic products must have null barcode`)
      } else if (status !== 'verified') {
        errors.push(`${label}: research.status must be verified or operational_generic`)
      }
    }

    const state = classifyStockState(product)
    if (state === 'out') outCount += 1
    else if (state === 'low') lowCount += 1
    else healthyCount += 1
  }

  for (let seq = 1; seq <= P8_31_9_EXPECTED_PRODUCT_COUNT; seq += 1) {
    if (!sequences.has(seq)) errors.push(`missing sequence ${seq}`)
  }

  for (const [domain, target] of Object.entries(P8_31_9_DOMAIN_TARGETS)) {
    if (domainCounts[domain] !== target) {
      errors.push(`domain ${domain}: expected ${target}, got ${domainCounts[domain]}`)
    }
  }

  if (multiLocationCount < Math.ceil(P8_31_9_EXPECTED_PRODUCT_COUNT * 0.4)) {
    errors.push(`multi-location products must be >= 40% (got ${multiLocationCount})`)
  }
  if (inactiveCount < 8 || inactiveCount > 12) {
    errors.push(`inactive products must be 8–12 (got ${inactiveCount})`)
  }

  const healthyShare = healthyCount / P8_31_9_EXPECTED_PRODUCT_COUNT
  const lowShare = lowCount / P8_31_9_EXPECTED_PRODUCT_COUNT
  const outShare = outCount / P8_31_9_EXPECTED_PRODUCT_COUNT
  // Targets are approximate and do not sum to 100%; remainder may also be healthy.
  if (healthyShare < 0.5 || healthyShare > 0.8) {
    errors.push(`healthy share ~55%+ expected (got ${(healthyShare * 100).toFixed(1)}%)`)
  }
  if (lowShare < 0.12 || lowShare > 0.2) {
    errors.push(`low share ~15% expected (got ${(lowShare * 100).toFixed(1)}%)`)
  }
  if (outShare < 0.08 || outShare > 0.14) {
    errors.push(`out share ~10% expected (got ${(outShare * 100).toFixed(1)}%)`)
  }

  const summary = {
    totalProducts: products.length,
    domainCounts,
    categoryCounts,
    supplierCounts,
    activeCount,
    inactiveCount,
    singleLocationCount,
    multiLocationCount,
    healthyCount,
    lowCount,
    outCount,
    verifiedBarcodeCount,
    nullBarcodeCount,
  }

  return { ok: errors.length === 0, errors, summary }
}
