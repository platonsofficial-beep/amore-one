import { buildProductDisplayName } from './stockProductIdentity'

/**
 * Count-list title: Brand + product name + size.
 * Falls back to the frozen session item name when identity parts are missing.
 *
 * @param {{ itemName?: unknown, productName?: unknown, brand?: unknown, size?: unknown }} item
 */
export function formatInventoryCountItemLabel(item) {
  const storedName = `${item?.itemName ?? ''}`.trim()
  const productName = `${item?.productName ?? ''}`.trim() || storedName
  const display = buildProductDisplayName({
    brand: item?.brand,
    name: productName,
    size: item?.size,
  })
  return display || storedName || 'Untitled item'
}
