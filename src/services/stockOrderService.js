import {
  computeOrderTotalCost,
  getOrderLineReceivedQuantity,
  isOrderFullyReceived,
  normalizeStockOrderStatus,
  serializeDraftOrderItems,
} from '../lib/stockOrderUtils'
import { resolveSupplierIdForWrite } from '../lib/stockSupplierUtils'
import { supabase } from '../lib/supabaseClient'
import { getMemberDisplayNamesByAuthUserIds } from './membershipService'
import { getStockItems } from './stockItemService'
import { recordStockMovement } from './stockMovementService'
import { getSuppliers } from './supplierService'

const STOCK_ORDERS_TABLE = 'stock_orders'
const STOCK_ORDER_ITEMS_TABLE = 'stock_order_items'
const VALID_STATUSES = new Set(['draft', 'sent', 'received', 'cancelled'])

function isTableUnavailableError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('could not find the table')
}

function mapStockOrderItem(record) {
  return {
    id: record.id,
    orderId: record.order_id ?? record.orderId ?? '',
    stockItemId: record.stock_item_id ?? record.stockItemId ?? null,
    itemName: record.item_name ?? record.itemName ?? '',
    quantity: Number(record.quantity ?? 0),
    receivedQuantity: Number(record.received_quantity ?? record.receivedQuantity ?? 0),
    unit: record.unit ?? '',
    costPrice: Number(record.cost_price ?? record.costPrice ?? 0),
    totalPrice: Number(record.total_price ?? record.totalPrice ?? 0),
  }
}

function mapStockOrder(record, items = []) {
  const rawDeliveryDate = record.expected_delivery_date ?? record.expectedDeliveryDate ?? null
  const expectedDeliveryDate = rawDeliveryDate
    ? `${rawDeliveryDate}`.slice(0, 10)
    : null

  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    supplier: record.supplier ?? '',
    status: normalizeStockOrderStatus(record.status),
    totalCost: Number(record.total_cost ?? record.totalCost ?? 0),
    notes: record.notes ?? '',
    expectedDeliveryDate,
    sentAt: record.sent_at ?? record.sentAt ?? null,
    sentBy: record.sent_by ?? record.sentBy ?? null,
    partialReceivedAt: record.partial_received_at ?? record.partialReceivedAt ?? null,
    partialReceivedBy: record.partial_received_by ?? record.partialReceivedBy ?? null,
    receivedAt: record.received_at ?? record.receivedAt ?? null,
    receivedBy: record.received_by ?? record.receivedBy ?? null,
    createdBy: record.created_by ?? record.createdBy ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    items: items.map(mapStockOrderItem),
  }
}

export function serializeStockOrder(order, workspaceId, { supplierId = null } = {}) {
  const items = serializeDraftOrderItems(order.items)
  const totalCost = computeOrderTotalCost(items.map((item) => ({
    quantity: item.quantity,
    costPrice: item.cost_price,
    totalPrice: item.total_price,
  })))

  const supplier = `${order.supplier ?? ''}`.trim()
  const payload = {
    workspace_id: workspaceId,
    supplier,
    supplier_id: supplierId,
    status: normalizeStockOrderStatus(order.status ?? 'draft'),
    total_cost: totalCost,
    notes: `${order.notes ?? ''}`.trim(),
    created_by: order.createdBy ?? null,
  }

  const expectedDeliveryDate = order.expectedDeliveryDate ?? order.expected_delivery_date
  if (expectedDeliveryDate) {
    payload.expected_delivery_date = expectedDeliveryDate
  }

  return payload
}

async function resolveStockOrderSupplierId(workspaceId, {
  supplier = '',
  supplierId = null,
  supplier_id = null,
} = {}) {
  const supplierName = `${supplier ?? ''}`.trim()
  const explicitId = supplierId ?? supplier_id ?? null
  const fromExplicit = resolveSupplierIdForWrite({
    supplierName,
    supplierId: explicitId,
  })
  if (fromExplicit != null) return fromExplicit
  if (!supplierName) return null

  try {
    const suppliers = await getSuppliers(workspaceId)
    return resolveSupplierIdForWrite({
      supplierName,
      suppliers,
    })
  } catch (error) {
    console.warn('[stockOrderService] supplier_id resolve skipped:', error)
    return null
  }
}

async function fetchOrderItems(orderIds = []) {
  if (orderIds.length === 0) return {}

  const { data, error } = await supabase
    .from(STOCK_ORDER_ITEMS_TABLE)
    .select('*')
    .in('order_id', orderIds)
    .order('item_name', { ascending: true })

  if (error) {
    console.warn('[stockOrderService] fetchOrderItems error:', error)
    if (isTableUnavailableError(error)) return {}
    return {}
  }

  const itemsByOrderId = {}

  ;(data ?? []).forEach((record) => {
    const orderId = record.order_id ?? record.orderId
    if (!itemsByOrderId[orderId]) {
      itemsByOrderId[orderId] = []
    }
    itemsByOrderId[orderId].push(record)
  })

  return itemsByOrderId
}

function collectOrderActorIds(orders = []) {
  const ids = new Set()

  orders.forEach((order) => {
    if (order.createdBy) ids.add(order.createdBy)
    if (order.sentBy) ids.add(order.sentBy)
    if (order.partialReceivedBy) ids.add(order.partialReceivedBy)
    if (order.receivedBy) ids.add(order.receivedBy)
  })

  return Array.from(ids)
}

function enrichOrderWithAuthors(order, authorNames = {}) {
  return {
    ...order,
    createdByName: order.createdBy
      ? (authorNames[order.createdBy] ?? 'Unknown')
      : 'System',
    sentByName: order.sentBy ? (authorNames[order.sentBy] ?? 'Unknown') : null,
    partialReceivedByName: order.partialReceivedBy
      ? (authorNames[order.partialReceivedBy] ?? 'Unknown')
      : null,
    receivedByName: order.receivedBy ? (authorNames[order.receivedBy] ?? 'Unknown') : null,
  }
}

export async function getStockOrders(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) return []

  const { data, error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn('[stockOrderService] getStockOrders error:', error)
    if (isTableUnavailableError(error)) return []
    return []
  }

  const orders = data ?? []
  const itemsByOrderId = await fetchOrderItems(orders.map((order) => order.id))

  return orders.map((order, index) => ({
    ...mapStockOrder(order, itemsByOrderId[order.id] ?? []),
    orderNumber: index + 1,
  }))
}

export async function getStockOrdersWithAuthors(workspaceId) {
  const orders = await getStockOrders(workspaceId)
  const authorIds = collectOrderActorIds(orders)
  const authorNames = await getMemberDisplayNamesByAuthUserIds(workspaceId, authorIds)

  return orders.map((order) => enrichOrderWithAuthors(order, authorNames))
}

export async function getStockOrderById(workspaceId, orderId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedOrderId = `${orderId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedOrderId) return null

  const { data, error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedOrderId)
    .maybeSingle()

  if (error) {
    console.warn('[stockOrderService] getStockOrderById error:', error)
    if (isTableUnavailableError(error)) return null
    return null
  }

  if (!data) return null

  const itemsByOrderId = await fetchOrderItems([data.id])
  const allOrders = await getStockOrders(normalizedWorkspaceId)
  const orderNumber = allOrders.find((order) => order.id === data.id)?.orderNumber ?? 1
  const order = mapStockOrder(data, itemsByOrderId[data.id] ?? [])
  const authorNames = await getMemberDisplayNamesByAuthUserIds(
    normalizedWorkspaceId,
    collectOrderActorIds([order]),
  )

  return enrichOrderWithAuthors({
    ...order,
    orderNumber,
  }, authorNames)
}

export async function createStockOrder(workspaceId, order, { createdBy = null } = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required to create a stock order.')
  }

  const items = serializeDraftOrderItems(order.items)
  if (items.length === 0) {
    throw new Error('Add at least one product to create an order.')
  }

  const supplierId = await resolveStockOrderSupplierId(normalizedWorkspaceId, order)
  const payload = serializeStockOrder({ ...order, items }, normalizedWorkspaceId, { supplierId })
  payload.created_by = createdBy

  const { data, error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[stockOrderService] createStockOrder error:', error)
    if (isTableUnavailableError(error)) {
      throw new Error('Stock order tables are not ready yet. Run stock_orders_schema.sql in Supabase.')
    }
    throw new Error(error.message || 'Unable to create stock order right now.')
  }

  const { error: itemsError } = await supabase
    .from(STOCK_ORDER_ITEMS_TABLE)
    .insert(items.map((item) => ({
      ...item,
      order_id: data.id,
      received_quantity: 0,
    })))

  if (itemsError) {
    console.error('[stockOrderService] createStockOrder items error:', itemsError)
    await supabase.from(STOCK_ORDERS_TABLE).delete().eq('id', data.id)
    throw new Error(itemsError.message || 'Unable to save order items right now.')
  }

  return getStockOrderById(normalizedWorkspaceId, data.id)
}

export async function createStockOrdersFromGroups(workspaceId, groups = [], { createdBy = null } = {}) {
  const createdOrders = []

  for (const group of groups) {
    const order = await createStockOrder(workspaceId, {
      supplier: group.supplier,
      notes: group.notes ?? '',
      expectedDeliveryDate: group.expectedDeliveryDate ?? null,
      status: 'draft',
      items: group.items,
    }, { createdBy })

    createdOrders.push(order)
  }

  return createdOrders
}

export async function updateStockOrderDraft(workspaceId, orderId, {
  supplier,
  notes,
  expectedDeliveryDate,
  items,
}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedOrderId = `${orderId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedOrderId) {
    throw new Error('Workspace and order are required.')
  }

  const existing = await getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
  if (!existing) {
    throw new Error('Order not found.')
  }

  if (existing.status !== 'draft') {
    throw new Error('Only draft orders can be edited.')
  }

  const serializedItems = serializeDraftOrderItems(items ?? existing.items)
  if (serializedItems.length === 0) {
    throw new Error('Add at least one product to keep this order.')
  }

  const totalCost = computeOrderTotalCost(serializedItems.map((item) => ({
    quantity: item.quantity,
    costPrice: item.cost_price,
    totalPrice: item.total_price,
  })))

  const nextSupplier = supplier !== undefined ? `${supplier}`.trim() : existing.supplier
  const supplierId = await resolveStockOrderSupplierId(normalizedWorkspaceId, {
    supplier: nextSupplier,
  })

  const updatePayload = {
    supplier: nextSupplier,
    supplier_id: supplierId,
    notes: notes !== undefined ? `${notes}`.trim() : existing.notes,
    total_cost: totalCost,
  }

  if (expectedDeliveryDate !== undefined) {
    updatePayload.expected_delivery_date = expectedDeliveryDate || null
  }

  const { error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .update(updatePayload)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedOrderId)

  if (error) {
    console.error('[stockOrderService] updateStockOrderDraft error:', error)
    throw new Error(error.message || 'Unable to update order right now.')
  }

  await supabase
    .from(STOCK_ORDER_ITEMS_TABLE)
    .delete()
    .eq('order_id', normalizedOrderId)

  const { error: itemsError } = await supabase
    .from(STOCK_ORDER_ITEMS_TABLE)
    .insert(serializedItems.map((item) => ({
      ...item,
      order_id: normalizedOrderId,
      received_quantity: 0,
    })))

  if (itemsError) {
    console.error('[stockOrderService] updateStockOrderDraft items error:', itemsError)
    throw new Error(itemsError.message || 'Unable to update order items right now.')
  }

  return getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
}

export async function updateStockOrderStatus(workspaceId, orderId, nextStatus, {
  createdBy = null,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedOrderId = `${orderId ?? ''}`.trim()
  const normalizedStatus = normalizeStockOrderStatus(nextStatus)

  if (!normalizedWorkspaceId || !normalizedOrderId) {
    throw new Error('Workspace and order are required.')
  }

  if (!VALID_STATUSES.has(normalizedStatus)) {
    throw new Error('Invalid order status.')
  }

  const existing = await getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
  if (!existing) {
    throw new Error('Order not found.')
  }

  if (normalizedStatus === 'sent' && existing.status !== 'draft') {
    throw new Error('Only draft orders can be marked as sent.')
  }

  if (normalizedStatus === 'cancelled' && existing.status !== 'draft') {
    throw new Error('Only draft orders can be cancelled.')
  }

  const updatePayload = { status: normalizedStatus }

  if (normalizedStatus === 'sent') {
    updatePayload.sent_at = new Date().toISOString()
    updatePayload.sent_by = createdBy
  }

  const { error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .update(updatePayload)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedOrderId)

  if (error) {
    console.error('[stockOrderService] updateStockOrderStatus error:', error)
    throw new Error(error.message || 'Unable to update order status right now.')
  }

  return getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
}

export async function receiveStockOrderPartial(workspaceId, orderId, {
  receiveItems = [],
  createdBy = null,
  orderNumber = null,
} = {}) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedOrderId = `${orderId ?? ''}`.trim()

  if (!normalizedWorkspaceId || !normalizedOrderId) {
    const message = 'Workspace and order are required.'
    console.error('[stockOrderService] receiveStockOrderPartial error:', message)
    throw new Error(message)
  }

  const existing = await getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
  if (!existing) {
    const message = 'Order not found.'
    console.error('[stockOrderService] receiveStockOrderPartial error:', message)
    throw new Error(message)
  }

  if (existing.status !== 'sent') {
    const message = 'Only sent orders can be received.'
    console.error('[stockOrderService] receiveStockOrderPartial error:', message)
    throw new Error(message)
  }

  const receiveByItemId = Object.fromEntries(
    receiveItems.map((entry) => [entry.id, Math.max(0, Number(entry.receiveNow) || 0)]),
  )

  const hasReceiveNow = Object.values(receiveByItemId).some((value) => value > 0)
  if (!hasReceiveNow) {
    throw new Error('Enter at least one quantity to receive.')
  }

  const stockItems = await getStockItems(normalizedWorkspaceId)
  const stockItemsById = Object.fromEntries(stockItems.map((item) => [item.id, item]))
  const runningQuantities = Object.fromEntries(
    stockItems.map((item) => [item.id, item.currentQuantity]),
  )
  const orderLabel = orderNumber
    ? `order #${String(orderNumber).padStart(4, '0')}`
    : 'supplier order'

  const updatedItems = []

  for (const line of existing.items ?? []) {
    const receiveNow = receiveByItemId[line.id] ?? 0
    const currentReceived = getOrderLineReceivedQuantity(line)
    const remaining = Math.max(0, line.quantity - currentReceived)

    if (receiveNow > remaining) {
      throw new Error(`Cannot receive more than remaining quantity for ${line.itemName}.`)
    }

    const nextReceived = currentReceived + receiveNow

    if (receiveNow > 0 && line.stockItemId) {
      const stockItem = stockItemsById[line.stockItemId]
      if (!stockItem) {
        throw new Error(`Cannot receive ${line.itemName}: linked product is missing.`)
      }

      const currentQuantity = runningQuantities[line.stockItemId] ?? stockItem.currentQuantity

      await recordStockMovement({
        workspaceId: normalizedWorkspaceId,
        itemId: line.stockItemId,
        type: 'receive',
        quantity: receiveNow,
        note: `Received from ${orderLabel}`,
        createdBy,
        currentQuantity,
      })

      runningQuantities[line.stockItemId] = currentQuantity + receiveNow
    } else if (receiveNow > 0) {
      throw new Error(`Cannot receive ${line.itemName}: order line is not linked to a product.`)
    }

    if (receiveNow > 0) {
      const { error: lineError } = await supabase
        .from(STOCK_ORDER_ITEMS_TABLE)
        .update({ received_quantity: nextReceived })
        .eq('id', line.id)

      if (lineError) {
        console.error('[stockOrderService] receiveStockOrderPartial item error:', lineError)
        throw new Error(lineError.message || 'Unable to update received quantities right now.')
      }
    }

    updatedItems.push({
      ...line,
      receivedQuantity: nextReceived,
    })
  }

  const orderAfterReceive = {
    ...existing,
    items: updatedItems,
  }

  const fullyReceived = isOrderFullyReceived(orderAfterReceive)
  const now = new Date().toISOString()
  const orderUpdate = fullyReceived
    ? {
      status: 'received',
      received_at: now,
      received_by: createdBy,
    }
    : {
      partial_received_at: now,
      partial_received_by: createdBy,
    }

  const { error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .update(orderUpdate)
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedOrderId)

  if (error) {
    console.error('[stockOrderService] receiveStockOrderPartial order error:', error)
    throw new Error(error.message || 'Unable to update order receiving status right now.')
  }

  const result = await getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
  return result
}

export async function deleteStockOrder(workspaceId, orderId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedOrderId = `${orderId ?? ''}`.trim()
  if (!normalizedWorkspaceId || !normalizedOrderId) {
    throw new Error('Workspace and order are required.')
  }

  const existing = await getStockOrderById(normalizedWorkspaceId, normalizedOrderId)
  if (!existing) return

  if (existing.status !== 'draft') {
    throw new Error('Only draft orders can be deleted.')
  }

  const { error } = await supabase
    .from(STOCK_ORDERS_TABLE)
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedOrderId)

  if (error) {
    console.error('[stockOrderService] deleteStockOrder error:', error)
    throw new Error(error.message || 'Unable to delete order right now.')
  }
}
