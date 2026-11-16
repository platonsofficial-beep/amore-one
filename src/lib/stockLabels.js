import { t } from '../i18n/i18n'

/**
 * Seeded / default storage names. Custom names stay as stored.
 * Display only — the saved location key is still the English catalog name.
 */
const STOCK_DEFAULT_PLACES = new Set([
  'Bar',
  'Cellar',
  'Storage',
  'Kitchen',
  'Main Storage',
  'Fridge',
  'Freezer',
  'Wine Storage',
  'Coffee Station',
])

const STOCK_CATALOG_TERMS = new Set([
  'Spirits',
  'Syrups & Purées',
  'Beverages',
  'Wine',
  'Fresh',
  'Vegetables',
  'Meat and Seafood',
  'Consumables',
  'Other',
  'Vodka',
  'Gin',
  'Tequila',
  'Whiskey',
  'Rum',
  'Cognac',
  'Vermouth & Liqueur',
  'Aperitif',
  'Syrup',
  'Purée',
  'Cordial',
  'Shrub',
  'Beer',
  'Soft Drink',
  'Water',
  'Juice',
  'Energy Drink',
  'Soda / Tonic',
  'White Wine',
  'Rosé Wine',
  'Red Wine',
  'Sparkling Wine',
  'Champagne',
  'Dessert Wine',
  'Citrus',
  'Fruit',
  'Herbs',
  'Dairy',
  'Garnish',
  'Leafy greens',
  'Root vegetables',
  'Tomatoes',
  'Onions and garlic',
  'Beef',
  'Poultry',
  'Pork',
  'Fish',
  'Shellfish',
  'Napkins',
  'Straws',
  'Cleaning',
  'Packaging',
  'Bottle',
  'Can',
  'Piece',
  'Kilogram',
  'Gram',
  'Liter',
  'Milliliter',
  'Keg',
  'Roll',
])

export function translateStockPlaceName(value) {
  const text = `${value ?? ''}`.trim()
  if (!text || !STOCK_DEFAULT_PLACES.has(text)) return text
  return t(text)
}

export function translateStockCatalogTerm(value) {
  const text = `${value ?? ''}`.trim()
  if (!text || !STOCK_CATALOG_TERMS.has(text)) return text
  return t(text)
}

/** "Spirits · Vodka" — each catalog word translates, custom text stays. */
export function translateStockCatalogLine(value) {
  const text = `${value ?? ''}`
  if (!text.trim()) return text
  return text.split(' · ').map((part) => translateStockCatalogTerm(part)).join(' · ')
}
