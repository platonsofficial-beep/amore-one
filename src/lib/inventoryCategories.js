export const INVENTORY_CATEGORIES = [
  'Spirits',
  'Wines',
  'Beers',
  'Soft Drinks',
  'Coffee',
  'Bar Supplies',
  'Kitchen',
  'Other',
]

export const INVENTORY_SUBCATEGORIES_BY_CATEGORY = {
  Spirits: [
    'Vodka',
    'Gin',
    'Rum',
    'Whiskey',
    'Tequila',
    'Mezcal',
    'Brandy',
    'Liqueurs',
    'Aperitifs',
    'Digestifs',
  ],
  Wines: ['White Wine', 'Red Wine', 'Rose Wine', 'Sparkling', 'Champagne'],
  Beers: ['Lager', 'IPA', 'Alcohol Free', 'Cider'],
  'Soft Drinks': ['Cola', 'Lemonade', 'Orangeade', 'Tonic', 'Soda', 'Energy Drinks', 'Juices'],
  Coffee: ['Beans', 'Decaf', 'Milk', 'Plant Milk', 'Syrups', 'Tea', 'Chocolate'],
  'Bar Supplies': [
    'Fruits',
    'Purees',
    'Syrups',
    'Garnishes',
    'Straws',
    'Napkins',
    'Cleaning',
    'Consumables',
  ],
  Kitchen: ['Meat', 'Fish', 'Vegetables', 'Dairy', 'Dry Goods', 'Sauces', 'Frozen', 'Bakery'],
  Other: ['Misc'],
}

export const INVENTORY_UNCATEGORIZED_SUBCATEGORY = 'Uncategorized'
export const INVENTORY_CUSTOM_CATEGORY_VALUE = '__custom_category__'
export const INVENTORY_CUSTOM_SUBCATEGORY_VALUE = '__custom_subcategory__'
export const INVENTORY_NO_SUBCATEGORY_VALUE = '__no_subcategory__'

function compareLabels(left, right) {
  return `${left ?? ''}`.localeCompare(`${right ?? ''}`, undefined, { sensitivity: 'base' })
}

function sortItemsByName(items = []) {
  return [...items].sort((left, right) => compareLabels(left?.itemName, right?.itemName))
}

export function isPresetInventoryCategory(category) {
  return INVENTORY_CATEGORIES.includes(`${category ?? ''}`.trim())
}

export function getInventorySubcategories(category) {
  const trimmed = `${category ?? ''}`.trim()
  return INVENTORY_SUBCATEGORIES_BY_CATEGORY[trimmed] ?? []
}

export function getInventorySubcategoryLabel(item) {
  const trimmed = `${item?.subcategory ?? ''}`.trim()
  return trimmed || INVENTORY_UNCATEGORIZED_SUBCATEGORY
}

export function formatInventoryCategoryPath(item) {
  const category = `${item?.category ?? ''}`.trim() || 'Uncategorized'
  const subcategory = getInventorySubcategoryLabel(item)
  return `${category} • ${subcategory}`
}

export function formatInventoryBarRefillOptionLabel(item) {
  const itemName = `${item?.itemName ?? ''}`.trim() || 'Unnamed item'
  const category = `${item?.category ?? ''}`.trim() || 'Uncategorized'
  const subcategory = getInventorySubcategoryLabel(item)
  return `${itemName} — ${category} / ${subcategory}`
}

export function serializeInventorySubcategoryForSave(subcategory) {
  const trimmed = `${subcategory ?? ''}`.trim()
  if (!trimmed || trimmed === INVENTORY_UNCATEGORIZED_SUBCATEGORY) {
    return ''
  }
  return trimmed
}

export function resolveInventoryCategoryForForm(category) {
  const trimmed = `${category ?? ''}`.trim() || 'Other'

  return {
    categoryPreset: trimmed,
    customCategory: '',
  }
}

export function resolveInventorySubcategoryForForm(category, subcategory) {
  const trimmed = `${subcategory ?? ''}`.trim()

  if (!trimmed) {
    return {
      subcategoryPreset: INVENTORY_NO_SUBCATEGORY_VALUE,
      customSubcategory: '',
    }
  }

  const presets = getInventorySubcategories(category)
  if (presets.includes(trimmed)) {
    return {
      subcategoryPreset: trimmed,
      customSubcategory: '',
    }
  }

  return {
    subcategoryPreset: INVENTORY_CUSTOM_SUBCATEGORY_VALUE,
    customSubcategory: trimmed,
  }
}

export function resolveInventoryCategoryForSave(categoryPreset, customCategory) {
  if (categoryPreset === INVENTORY_CUSTOM_CATEGORY_VALUE) {
    return `${customCategory ?? ''}`.trim()
  }
  return `${categoryPreset ?? ''}`.trim()
}

export function resolveInventorySubcategoryForSave(subcategoryPreset, customSubcategory) {
  if (subcategoryPreset === INVENTORY_NO_SUBCATEGORY_VALUE) {
    return ''
  }

  if (subcategoryPreset === INVENTORY_CUSTOM_SUBCATEGORY_VALUE) {
    return serializeInventorySubcategoryForSave(customSubcategory)
  }

  return serializeInventorySubcategoryForSave(subcategoryPreset)
}

function sortWithPresetsFirst(values = [], presetList = []) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)))
  const presetMatches = presetList.filter((preset) => uniqueValues.includes(preset))
  const customValues = uniqueValues
    .filter((value) => !presetList.includes(value))
    .sort(compareLabels)

  return [...presetMatches, ...customValues]
}

export function getInventoryCategoryFilters(items = []) {
  const customCategories = new Set()

  items.forEach((item) => {
    const category = `${item?.category ?? ''}`.trim()
    if (category && !isPresetInventoryCategory(category)) {
      customCategories.add(category)
    }
  })

  return [
    ...INVENTORY_CATEGORIES,
    ...Array.from(customCategories).sort(compareLabels),
  ]
}

export function getInventorySubcategoryOptionsForCategory(category, items = []) {
  const trimmedCategory = `${category ?? ''}`.trim()
  if (!trimmedCategory) return []

  const presets = getInventorySubcategories(trimmedCategory)
  const fromItems = new Set()
  let hasUncategorized = false

  items
    .filter((item) => item.category === trimmedCategory)
    .forEach((item) => {
      const raw = `${item?.subcategory ?? ''}`.trim()
      if (!raw) {
        hasUncategorized = true
        return
      }
      fromItems.add(raw)
    })

  const options = sortWithPresetsFirst([...presets, ...fromItems], presets)

  if (hasUncategorized && !options.includes(INVENTORY_UNCATEGORIZED_SUBCATEGORY)) {
    options.push(INVENTORY_UNCATEGORIZED_SUBCATEGORY)
  }

  return options
}

export function getInventorySubcategoryFilters(items = [], category = 'All') {
  if (category === 'All') return []

  const presets = getInventorySubcategories(category)
  const fromItems = new Set()
  let hasUncategorized = false

  items.forEach((item) => {
    if (item.category !== category) return

    const raw = `${item?.subcategory ?? ''}`.trim()
    if (!raw) {
      hasUncategorized = true
      return
    }

    fromItems.add(raw)
  })

  const filters = sortWithPresetsFirst([...presets, ...fromItems], presets)

  if (hasUncategorized && !filters.includes(INVENTORY_UNCATEGORIZED_SUBCATEGORY)) {
    filters.push(INVENTORY_UNCATEGORIZED_SUBCATEGORY)
  }

  return filters
}

export function filterInventoryItemsBySubcategory(items = [], subcategoryFilter = 'All') {
  if (subcategoryFilter === 'All') return items

  return items.filter((item) => getInventorySubcategoryLabel(item) === subcategoryFilter)
}

export function groupInventoryItemsBySubcategory(items = []) {
  const groups = new Map()

  items.forEach((item) => {
    const subcategory = getInventorySubcategoryLabel(item)
    if (!groups.has(subcategory)) {
      groups.set(subcategory, [])
    }
    groups.get(subcategory).push(item)
  })

  const presetSubcategories = getInventorySubcategories(items[0]?.category ?? '')
  const subcategoryOrder = sortWithPresetsFirst(Array.from(groups.keys()), presetSubcategories)

  return subcategoryOrder.map((subcategory) => ({
    subcategory,
    items: sortItemsByName(groups.get(subcategory) ?? []),
  }))
}

export function groupInventoryItemsByCategoryAndSubcategory(items = []) {
  const categories = getInventoryCategoryFilters(items)
  const visibleCategories = categories.filter((category) => (
    items.some((item) => item.category === category)
  ))

  return visibleCategories.map((category) => {
    const categoryItems = items.filter((item) => item.category === category)
    const presetSubcategories = getInventorySubcategories(category)
    const subcategoryGroups = new Map()

    categoryItems.forEach((item) => {
      const subcategory = getInventorySubcategoryLabel(item)
      if (!subcategoryGroups.has(subcategory)) {
        subcategoryGroups.set(subcategory, [])
      }
      subcategoryGroups.get(subcategory).push(item)
    })

    const subcategoryOrder = sortWithPresetsFirst(
      Array.from(subcategoryGroups.keys()),
      presetSubcategories,
    )

    return {
      category,
      subcategories: subcategoryOrder.map((subcategory) => ({
        subcategory,
        items: sortItemsByName(subcategoryGroups.get(subcategory) ?? []),
      })),
    }
  })
}

export function filterInventoryItemsForBarRefill(items = [], category = '', subcategory = '') {
  const trimmedCategory = `${category ?? ''}`.trim()
  const trimmedSubcategory = `${subcategory ?? ''}`.trim()

  if (!trimmedCategory || !trimmedSubcategory) return []

  return sortItemsByName(
    items.filter((item) => (
      item.category === trimmedCategory
      && getInventorySubcategoryLabel(item) === trimmedSubcategory
    )),
  )
}

export function sortInventoryItemsForBarRefill(items = []) {
  return [...items].sort((left, right) => {
    const categoryCompare = compareLabels(left?.category, right?.category)
    if (categoryCompare !== 0) return categoryCompare

    const subcategoryCompare = compareLabels(
      getInventorySubcategoryLabel(left),
      getInventorySubcategoryLabel(right),
    )
    if (subcategoryCompare !== 0) return subcategoryCompare

    return compareLabels(left?.itemName, right?.itemName)
  })
}

export function getInventoryBarRefillCategoryOptions(items = []) {
  return getInventoryCategoryFilters(items)
}
