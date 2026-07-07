export const STOCK_UNIT_CUSTOM_VALUE = '__custom__'

export const STOCK_CATEGORIES = [
  'Spirits',
  'Syrups & Purées',
  'Beverages',
  'Wine',
  'Fresh',
  'Consumables',
  'Other',
]

export const STOCK_LOCATIONS = [
  'Main Storage',
  'Bar',
  'Fridge',
  'Freezer',
  'Wine Storage',
  'Coffee Station',
  'Kitchen',
  'Other',
]

const LEGACY_STOCK_CATEGORY_MAP = {
  Wines: 'Wine',
  Wine: 'Wine',
  Beers: 'Beverages',
  Beer: 'Beverages',
  'Soft Drinks': 'Beverages',
  Coffee: 'Beverages',
  Kitchen: 'Other',
  'Bar Supplies': 'Consumables',
  Housekeeping: 'Consumables',
}

const LEGACY_STOCK_TYPE_MAP = {
  'red wine': 'Red Wine',
  'white wine': 'White Wine',
  'rosé wine': 'Rosé Wine',
  'sparkling wine': 'Sparkling Wine',
  champagne: 'Champagne',
  'dessert wine': 'Dessert Wine',
  'fortified wine': 'Other',
  lager: 'Beer',
  ipa: 'Beer',
  ale: 'Beer',
  stout: 'Beer',
  cider: 'Beer',
  'non-alcoholic beer': 'Beer',
  soda: 'Soda / Tonic',
  tonic: 'Soda / Tonic',
  cola: 'Soft Drink',
  lemonade: 'Soft Drink',
  juice: 'Juice',
  'energy drink': 'Energy Drink',
  water: 'Water',
  'sparkling water': 'Water',
  mezcal: 'Tequila',
  liqueur: 'Vermouth & Liqueur',
  vermouth: 'Vermouth & Liqueur',
  brandy: 'Cognac',
  whiskey: 'Whiskey',
}

export const STOCK_TYPES_BY_CATEGORY = {
  Spirits: [
    'Vodka',
    'Gin',
    'Tequila',
    'Whiskey',
    'Rum',
    'Cognac',
    'Vermouth & Liqueur',
    'Aperitif',
    'Other',
  ],
  'Syrups & Purées': [
    'Syrup',
    'Purée',
    'Cordial',
    'Shrub',
    'Other',
  ],
  Beverages: [
    'Beer',
    'Soft Drink',
    'Water',
    'Juice',
    'Energy Drink',
    'Soda / Tonic',
    'Other',
  ],
  Wine: [
    'White Wine',
    'Rosé Wine',
    'Red Wine',
    'Sparkling Wine',
    'Champagne',
    'Dessert Wine',
    'Other',
  ],
  Fresh: [
    'Citrus',
    'Fruit',
    'Herbs',
    'Dairy',
    'Garnish',
    'Other',
  ],
  Consumables: [
    'Napkins',
    'Straws',
    'Cleaning',
    'Packaging',
    'Other',
  ],
  Other: ['Other'],
}

export const STOCK_GENERAL_UNIT_PRESETS = [
  'Bottle',
  'Case',
  'Litre',
  'Kg',
  'Gram',
  'Piece',
  'Pack',
  'Box',
]

export const STOCK_UNIT_PRESETS_BY_CATEGORY = {
  Spirits: [
    'Bottle 700ml',
    'Bottle 1L',
    'Case 6 bottles',
    'Case 12 bottles',
    'Litre',
    ...STOCK_GENERAL_UNIT_PRESETS,
  ],
  'Syrups & Purées': [
    'Bottle',
    'Litre',
    'Kg',
    'Pack',
    'Container',
    ...STOCK_GENERAL_UNIT_PRESETS,
  ],
  Beverages: [
    'Bottle',
    'Can',
    'Keg',
    'Case 24',
    'Case 12',
    'Litre',
    ...STOCK_GENERAL_UNIT_PRESETS,
  ],
  Wine: [
    'Bottle 750ml',
    'Case 6 bottles',
    'Case 12 bottles',
    'Magnum',
    'Glass bottle',
    ...STOCK_GENERAL_UNIT_PRESETS,
  ],
  Fresh: [
    'Kg',
    'Gram',
    'Piece',
    'Bunch',
    'Box',
    'Pack',
    ...STOCK_GENERAL_UNIT_PRESETS,
  ],
  Consumables: [
    'Piece',
    'Pack',
    'Box',
    'Case',
    'Roll',
    ...STOCK_GENERAL_UNIT_PRESETS,
  ],
  Other: [...STOCK_GENERAL_UNIT_PRESETS],
}

export const STOCK_DEFAULT_UNIT_BY_CATEGORY = {
  Spirits: 'Bottle 700ml',
  'Syrups & Purées': 'Bottle',
  Beverages: 'Bottle',
  Wine: 'Bottle 750ml',
  Fresh: 'Kg',
  Consumables: 'Pack',
  Other: 'Piece',
}

export const STOCK_DEFAULT_LOCATION_BY_CATEGORY = {
  Spirits: 'Bar',
  'Syrups & Purées': 'Bar',
  Beverages: 'Main Storage',
  Wine: 'Wine Storage',
  Fresh: 'Fridge',
  Consumables: 'Main Storage',
  Other: 'Main Storage',
}

export function normalizeStockCategory(category) {
  const trimmed = `${category ?? ''}`.trim()
  if (!trimmed) return 'Other'
  return LEGACY_STOCK_CATEGORY_MAP[trimmed] ?? trimmed
}

export function normalizeStockItemType(category, itemType) {
  const trimmed = `${itemType ?? ''}`.trim()
  if (!trimmed) return 'Other'

  const legacy = LEGACY_STOCK_TYPE_MAP[trimmed.toLowerCase()]
  const candidate = legacy ?? trimmed
  const options = getStockTypeOptionsForCategory(category)

  if (options.includes(candidate)) return candidate

  const caseInsensitive = options.find(
    (option) => option.toLowerCase() === candidate.toLowerCase(),
  )
  if (caseInsensitive) return caseInsensitive

  return options.includes('Other') ? 'Other' : (options[0] ?? 'Other')
}

export function getStockTypeOptionsForCategory(category) {
  const normalized = normalizeStockCategory(category)
  return STOCK_TYPES_BY_CATEGORY[normalized] ?? STOCK_TYPES_BY_CATEGORY.Other
}

export function getStockUnitPresetsForCategory(category) {
  const normalized = normalizeStockCategory(category)
  const presets = STOCK_UNIT_PRESETS_BY_CATEGORY[normalized] ?? STOCK_GENERAL_UNIT_PRESETS
  return Array.from(new Set(presets))
}

export function getDefaultUnitForCategory(category) {
  const normalized = normalizeStockCategory(category)
  return STOCK_DEFAULT_UNIT_BY_CATEGORY[normalized] ?? 'Piece'
}

export function getDefaultLocationForCategory(category) {
  const normalized = normalizeStockCategory(category)
  return STOCK_DEFAULT_LOCATION_BY_CATEGORY[normalized] ?? 'Main Storage'
}

export function resolveStockItemType(item) {
  return normalizeStockItemType(item?.category, item?.itemType ?? item?.item_type)
}

export function resolveStockStorageLocation(item) {
  const location = `${item?.storageLocation ?? item?.storage_location ?? ''}`.trim()
  if (location) return location
  return getDefaultLocationForCategory(item?.category)
}

export function resolveStockTargetQuantity(item) {
  const raw = item?.targetQuantity ?? item?.target_quantity
  if (raw === null || raw === undefined || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function computeSuggestedOrder(item) {
  const current = Number(item?.currentQuantity ?? item?.current_quantity ?? 0) || 0
  const target = resolveStockTargetQuantity(item)
  const minimum = Number(item?.minimumQuantity ?? item?.minimum_quantity ?? 0) || 0

  if (target !== null) {
    if (current >= target) return 0
    return Math.max(0, target - current)
  }

  if (current >= minimum) return 0
  return Math.max(0, minimum - current)
}

export function itemNeedsOrder(item) {
  const current = Number(item?.currentQuantity ?? item?.current_quantity ?? 0) || 0
  const target = resolveStockTargetQuantity(item)
  if (target !== null) return current < target
  const minimum = Number(item?.minimumQuantity ?? item?.minimum_quantity ?? 0) || 0
  return current < minimum
}

export function resolveStockFormUnit(form) {
  if (form.unitPreset === STOCK_UNIT_CUSTOM_VALUE) {
    return `${form.customUnit ?? ''}`.trim()
  }
  return `${form.unitPreset ?? ''}`.trim()
}

export function resolveUnitFieldsForForm(unit, category) {
  const normalizedCategory = normalizeStockCategory(category)
  const presets = getStockUnitPresetsForCategory(normalizedCategory)
  const normalizedUnit = `${unit ?? ''}`.trim()

  if (normalizedUnit && presets.includes(normalizedUnit)) {
    return { unitPreset: normalizedUnit, customUnit: '' }
  }

  if (normalizedUnit) {
    return { unitPreset: STOCK_UNIT_CUSTOM_VALUE, customUnit: normalizedUnit }
  }

  return {
    unitPreset: getDefaultUnitForCategory(normalizedCategory),
    customUnit: '',
  }
}

export function buildEmptyStockItemForm(category = 'Spirits') {
  const normalizedCategory = normalizeStockCategory(category)
  const typeOptions = getStockTypeOptionsForCategory(normalizedCategory)

  return {
    name: '',
    category: normalizedCategory,
    itemType: typeOptions[0] ?? 'Other',
    supplier: '',
    storageLocation: getDefaultLocationForCategory(normalizedCategory),
    unitPreset: getDefaultUnitForCategory(normalizedCategory),
    customUnit: '',
    currentQuantity: '',
    minimumQuantity: '',
    targetQuantity: '',
    orderQuantity: '',
    purchasePrice: '',
  }
}

export function stockItemToDuplicateForm(item) {
  const form = stockItemToForm(item)

  return {
    ...form,
    name: '',
    currentQuantity: '',
  }
}

export function stockItemToForm(item) {
  const category = normalizeStockCategory(item?.category)
  const itemType = normalizeStockItemType(category, resolveStockItemType(item))
  const unitFields = resolveUnitFieldsForForm(item?.unit, category)
  const orderQuantity = item?.orderQuantity ?? item?.order_quantity
  const targetQuantity = item?.targetQuantity ?? item?.target_quantity

  return {
    name: item?.name ?? '',
    category,
    itemType,
    supplier: item?.supplier ?? '',
    storageLocation: resolveStockStorageLocation(item),
    ...unitFields,
    currentQuantity: item?.currentQuantity ?? item?.current_quantity ?? '',
    minimumQuantity: item?.minimumQuantity ?? item?.minimum_quantity ?? '',
    targetQuantity: targetQuantity === null || targetQuantity === undefined || targetQuantity === ''
      ? ''
      : targetQuantity,
    orderQuantity: orderQuantity === null || orderQuantity === undefined || orderQuantity === ''
      ? ''
      : orderQuantity,
    purchasePrice: item?.costPrice ?? item?.cost_price ?? '',
  }
}

export function validateStockItemForm(form) {
  const name = `${form.name ?? ''}`.trim()
  if (!name) return 'Please enter a product name.'

  const category = normalizeStockCategory(form.category)
  if (!category) return 'Please select a category.'

  const itemType = `${form.itemType ?? ''}`.trim()
  if (!itemType) return 'Please select a product type.'

  const typeOptions = getStockTypeOptionsForCategory(category)
  if (!typeOptions.includes(itemType)) {
    return 'Please select a valid type for this category.'
  }

  const storageLocation = `${form.storageLocation ?? ''}`.trim()
  if (!storageLocation) return 'Please select a storage location.'

  const unit = resolveStockFormUnit(form)
  if (!unit) return 'Please choose or enter a unit.'

  const currentQuantity = Number(form.currentQuantity)
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
    return 'Current quantity must be zero or greater.'
  }

  const minimumQuantity = Number(form.minimumQuantity)
  if (!Number.isFinite(minimumQuantity) || minimumQuantity < 0) {
    return 'Minimum alert must be zero or greater.'
  }

  const targetQuantityRaw = `${form.targetQuantity ?? ''}`.trim()
  if (targetQuantityRaw) {
    const targetQuantity = Number(targetQuantityRaw)
    if (!Number.isFinite(targetQuantity) || targetQuantity < 0) {
      return 'Target stock must be zero or greater.'
    }
  }

  const orderQuantityRaw = `${form.orderQuantity ?? ''}`.trim()
  if (orderQuantityRaw) {
    const orderQuantity = Number(orderQuantityRaw)
    if (!Number.isFinite(orderQuantity) || orderQuantity < 0) {
      return 'Suggested order must be zero or greater.'
    }
  }

  const purchasePriceRaw = `${form.purchasePrice ?? ''}`.trim()
  if (purchasePriceRaw) {
    const purchasePrice = Number(purchasePriceRaw)
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      return 'Purchase price must be zero or greater.'
    }
  }

  return ''
}

export function stockFormToPayload(form) {
  const purchasePriceRaw = `${form.purchasePrice ?? ''}`.trim()
  const orderQuantityRaw = `${form.orderQuantity ?? ''}`.trim()
  const targetQuantityRaw = `${form.targetQuantity ?? ''}`.trim()

  return {
    name: `${form.name ?? ''}`.trim(),
    category: normalizeStockCategory(form.category),
    itemType: `${form.itemType ?? ''}`.trim() || 'Other',
    supplier: `${form.supplier ?? ''}`.trim(),
    storageLocation: `${form.storageLocation ?? ''}`.trim() || 'Main Storage',
    unit: resolveStockFormUnit(form),
    currentQuantity: Number(form.currentQuantity) || 0,
    minimumQuantity: Number(form.minimumQuantity) || 0,
    targetQuantity: targetQuantityRaw ? Number(targetQuantityRaw) : null,
    orderQuantity: orderQuantityRaw ? Number(orderQuantityRaw) : null,
    costPrice: purchasePriceRaw ? Number(purchasePriceRaw) : 0,
  }
}

export function formatStockCategoryTypeLine(category, itemType) {
  const normalizedCategory = normalizeStockCategory(category)
  const normalizedType = normalizeStockItemType(normalizedCategory, itemType)
  return `${normalizedCategory} · ${normalizedType}`
}
