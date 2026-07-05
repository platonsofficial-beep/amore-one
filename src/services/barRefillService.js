import { supabase } from '../lib/supabaseClient'
import { getInventoryItems, updateInventoryItem } from './inventoryService'

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function wrapServiceError(error, fallbackMessage) {
  console.error(fallbackMessage, error)

  if (isTableUnavailableError(error)) {
    throw new Error('Bar refill tables are not ready yet.')
  }

  throw new Error(error?.message || fallbackMessage)
}

function normalizeInventoryItemId(value) {
  if (value === null || value === undefined) return null

  const normalized = `${value}`.trim()
  if (
    !normalized
    || normalized.toLowerCase() === 'null'
    || normalized.toLowerCase() === 'undefined'
    || normalized.toLowerCase() === 'nan'
  ) {
    return null
  }

  return normalized
}

function mapBarRefillItem(record) {
  return {
    id: record.id,
    refillId: record.refill_id ?? record.refillId,
    inventoryItemId: normalizeInventoryItemId(record.inventory_item_id ?? record.inventoryItemId),
    itemName: record.item_name ?? record.itemName ?? '',
    requestedQuantity: Number(record.requested_quantity ?? record.requestedQuantity ?? 0),
    pickedQuantity: Number(record.picked_quantity ?? record.pickedQuantity ?? 0),
    unit: record.unit ?? '',
    isPicked: Boolean(record.is_picked ?? record.isPicked),
    notes: record.notes ?? '',
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function mapBarRefill(record, items = []) {
  const normalizedItems = (items.length > 0 ? items : record.bar_refill_items ?? record.items ?? [])
    .map(mapBarRefillItem)
    .sort((left, right) => `${left.itemName}`.localeCompare(`${right.itemName}`, undefined, { sensitivity: 'base' }))

  return {
    id: record.id,
    refillDate: record.refill_date ?? record.refillDate ?? '',
    status: record.status ?? 'draft',
    createdBy: record.created_by ?? record.createdBy ?? '',
    notes: record.notes ?? '',
    items: normalizedItems,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function serializeBarRefillPatch(patch = {}) {
  const payload = {}

  if (patch.refillDate !== undefined) payload.refill_date = patch.refillDate
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.createdBy !== undefined) payload.created_by = patch.createdBy
  if (patch.notes !== undefined) payload.notes = patch.notes

  return payload
}

function serializeBarRefillItemPatch(patch = {}) {
  const payload = {}

  if (patch.inventoryItemId !== undefined) {
    payload.inventory_item_id = normalizeInventoryItemId(patch.inventoryItemId)
  }
  if (patch.itemName !== undefined) payload.item_name = patch.itemName
  if (patch.requestedQuantity !== undefined) payload.requested_quantity = Number(patch.requestedQuantity) || 0
  if (patch.pickedQuantity !== undefined) payload.picked_quantity = Number(patch.pickedQuantity) || 0
  if (patch.unit !== undefined) payload.unit = patch.unit
  if (patch.isPicked !== undefined) payload.is_picked = Boolean(patch.isPicked)
  if (patch.notes !== undefined) payload.notes = patch.notes

  return payload
}

function serializeBarRefillItemInsert(refillId, item = {}) {
  return {
    refill_id: refillId,
    inventory_item_id: normalizeInventoryItemId(item.inventoryItemId),
    item_name: item.itemName ?? '',
    requested_quantity: Number(item.requestedQuantity) || 0,
    picked_quantity: Number(item.pickedQuantity) || 0,
    unit: item.unit ?? '',
    is_picked: Boolean(item.isPicked),
    notes: item.notes ?? '',
  }
}

const BAR_REFILL_SELECT = `
  *,
  bar_refill_items (*)
`

export async function getBarRefills() {
  const { data, error } = await supabase
    .from('bar_refills')
    .select(BAR_REFILL_SELECT)
    .order('refill_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    wrapServiceError(error, '[barRefillService] getBarRefills error')
  }

  return (data ?? []).map((record) => mapBarRefill(record))
}

export async function getBarRefillById(id) {
  const { data, error } = await supabase
    .from('bar_refills')
    .select(BAR_REFILL_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    wrapServiceError(error, '[barRefillService] getBarRefillById error')
  }

  if (!data) {
    throw new Error('Bar refill not found.')
  }

  return mapBarRefill(data)
}

export async function createBarRefill({ refillDate, createdBy = '', notes = '', items = [] }) {
  const { data: refillRecord, error: refillError } = await supabase
    .from('bar_refills')
    .insert([{
      refill_date: refillDate,
      created_by: createdBy,
      notes,
      status: 'draft',
    }])
    .select('*')
    .single()

  if (refillError) {
    wrapServiceError(refillError, '[barRefillService] createBarRefill error')
  }

  const normalizedItems = (items ?? []).filter((item) => `${item?.itemName ?? ''}`.trim())

  if (normalizedItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('bar_refill_items')
      .insert(normalizedItems.map((item) => serializeBarRefillItemInsert(refillRecord.id, item)))

    if (itemsError) {
      await supabase.from('bar_refills').delete().eq('id', refillRecord.id)
      wrapServiceError(itemsError, '[barRefillService] createBarRefill items error')
    }
  }

  return getBarRefillById(refillRecord.id)
}

export async function updateBarRefill(id, patch = {}) {
  const payload = serializeBarRefillPatch(patch)

  if (Object.keys(payload).length === 0) {
    return getBarRefillById(id)
  }

  const { data, error } = await supabase
    .from('bar_refills')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    wrapServiceError(error, '[barRefillService] updateBarRefill error')
  }

  return getBarRefillById(data.id)
}

export async function deleteBarRefill(id) {
  const { error } = await supabase
    .from('bar_refills')
    .delete()
    .eq('id', id)

  if (error) {
    wrapServiceError(error, '[barRefillService] deleteBarRefill error')
  }
}

export async function updateBarRefillItem(id, patch = {}) {
  const payload = serializeBarRefillItemPatch(patch)

  if (Object.keys(payload).length === 0) {
    throw new Error('No bar refill item changes provided.')
  }

  const { data, error } = await supabase
    .from('bar_refill_items')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    wrapServiceError(error, '[barRefillService] updateBarRefillItem error')
  }

  return mapBarRefillItem(data)
}

export async function completeBarRefill(id) {
  const refill = await getBarRefillById(id)

  if (refill.status !== 'draft') {
    throw new Error('Only draft refills can be completed.')
  }

  const inventoryItems = await getInventoryItems()
  const inventoryById = new Map(
    inventoryItems.map((item) => [normalizeInventoryItemId(item.id), item]),
  )

  for (const item of refill.items) {
    const pickedQuantity = Number(item.pickedQuantity) || 0
    const inventoryItemId = normalizeInventoryItemId(item.inventoryItemId)

    if (pickedQuantity > 0 && inventoryItemId) {
      const inventoryItem = inventoryById.get(inventoryItemId)

      if (inventoryItem) {
        await updateInventoryItem(inventoryItemId, {
          ...inventoryItem,
          quantity: (Number(inventoryItem.quantity) || 0) + pickedQuantity,
        })
      }
    }

    await updateBarRefillItem(item.id, {
      isPicked: pickedQuantity > 0,
      pickedQuantity,
    })
  }

  return updateBarRefill(id, { status: 'picked' })
}
