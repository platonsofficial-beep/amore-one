import { supabase } from '../lib/supabaseClient'

function resolveInventoryStatus(quantity, minimumQuantity, fallbackStatus = 'In Stock') {
  const qty = Number(quantity) || 0
  const minQty = Number(minimumQuantity) || 0

  if (qty <= 0) return 'Out of Stock'
  if (qty <= minQty) return 'Low Stock'

  const normalized = `${fallbackStatus}`.trim()
  return normalized || 'In Stock'
}

function mapInventoryItem(record) {
  const quantity = Number(record.quantity ?? 0)
  const minimumQuantity = Number(record.minimum_quantity ?? record.minimumQuantity ?? 0)

  return {
    id: record.id,
    itemName: record.item_name ?? record.itemName ?? '',
    category: record.category ?? 'Other',
    supplier: record.supplier ?? '',
    unit: record.unit ?? '',
    quantity,
    minimumQuantity,
    cost: Number(record.cost ?? 0),
    status: resolveInventoryStatus(quantity, minimumQuantity, record.status),
    notes: record.notes ?? '',
  }
}

function serializeInventoryItem(item) {
  const quantity = Number(item.quantity ?? 0)
  const minimumQuantity = Number(item.minimumQuantity ?? item.minimum_quantity ?? 0)
  const cost = Number(item.cost ?? 0)

  return {
    item_name: item.itemName ?? item.item_name ?? '',
    category: item.category ?? 'Other',
    supplier: item.supplier ?? '',
    unit: item.unit ?? '',
    quantity,
    minimum_quantity: minimumQuantity,
    cost,
    status: resolveInventoryStatus(quantity, minimumQuantity, item.status),
    notes: item.notes ?? '',
  }
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

export async function getInventoryItems() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('item_name', { ascending: true })

  if (error) {
    console.error('[inventoryService] getInventoryItems error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Inventory table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load inventory right now.')
  }

  return (data ?? []).map(mapInventoryItem)
}

export async function createInventoryItem(item) {
  const payload = serializeInventoryItem(item)

  const { data, error } = await supabase
    .from('inventory_items')
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[inventoryService] createInventoryItem error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Inventory table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create inventory item right now.')
  }

  return mapInventoryItem(data)
}

export async function updateInventoryItem(id, item) {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(serializeInventoryItem(item))
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[inventoryService] updateInventoryItem error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Inventory table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to update inventory item right now.')
  }

  return mapInventoryItem(data)
}

export async function deleteInventoryItem(id) {
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[inventoryService] deleteInventoryItem error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Inventory table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete inventory item right now.')
  }
}
