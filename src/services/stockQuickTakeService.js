import { supabase } from '../lib/supabaseClient'
import { isTakeFromSupplyRpcMissing } from './stockMutationService'

/**
 * Quick Take: staff take stock out of one storage in one tap.
 * Server side: take_stock_from_storage / undo_quick_take
 * (supabase proposal, MANUAL EXECUTION ONLY, not applied yet).
 * If the functions are missing the UI shows a clear message instead.
 */
export const QUICK_TAKE_RPC = 'take_stock_from_storage'
export const QUICK_TAKE_UNDO_RPC = 'undo_quick_take'
const QUICK_TAKE_TIMEOUT_MS = 15000

export class QuickTakeUnavailableError extends Error {
  constructor() {
    super("Quick Take isn't switched on for this venue yet. Ask a manager.")
    this.name = 'QuickTakeUnavailableError'
  }
}

const ERROR_MESSAGES = Object.freeze({
  quick_take_forbidden: 'You do not have permission to take stock.',
  quick_take_count_open: 'A count is open in this storage. Take after it is posted.',
  quick_take_storage_inactive: 'This storage is not active.',
  quick_take_storage_not_supply: 'Take is only from supply storages.',
  quick_take_item_not_found: 'Product was not found.',
  quick_take_quantity_invalid: 'Enter a quantity above 0.',
  quick_take_undo_expired: 'Undo is only possible for 15 minutes.',
  quick_take_undo_forbidden: 'You can only undo your own take.',
  quick_take_already_undone: 'This take was already undone.',
})

export function mapQuickTakeError(error) {
  if (isTakeFromSupplyRpcMissing(error)) return new QuickTakeUnavailableError()
  const raw = `${error?.message ?? error?.code ?? ''}`
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(code)) return new Error(message)
  }
  const err = new Error(GENERIC_SAVE_ERROR)
  err.reason = shortQuickTakeReason(error)
  return err
}

export const GENERIC_SAVE_ERROR = 'Could not save. Try again or tell a manager.'

/** Short technical reason (code + first line) for managers. Never shown to staff. */
export function shortQuickTakeReason(error) {
  if (!error) return ''
  const code = `${error.code ?? ''}`.trim()
  const msg = `${error.message ?? ''}`.split('\n')[0].trim().slice(0, 120)
  return [code, msg].filter(Boolean).join(' · ')
}

/** Message to show: managers also see the short real reason. */
export function quickTakeErrorText(error, { canManage = false } = {}) {
  const base = error?.message || GENERIC_SAVE_ERROR
  if (canManage && error?.reason) return `${base} (${error.reason})`
  return base
}

function withTimeout(promise) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('This is taking too long. Check your connection and try again.')), QUICK_TAKE_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

function payloadOf(data) {
  if (Array.isArray(data)) return data[0] ?? {}
  return data && typeof data === 'object' ? data : {}
}

export function newQuickTakeKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `qt-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** True unless the server says the function does not exist. */
export async function quickTakeAvailable() {
  if (!supabase) return false
  try {
    const { error } = await withTimeout(supabase.rpc(QUICK_TAKE_RPC, {
      p_workspace_id: null,
      p_workspace_storage_id: null,
      p_stock_item_id: null,
      p_quantity: null,
      p_idempotency_key: null,
    }))
    if (!error) return true
    return !isTakeFromSupplyRpcMissing(error)
  } catch {
    // Offline or slow: show the screen; the take itself reports the problem.
    return true
  }
}

export async function takeStockFromStorage({ workspaceId, storageId, stockItemId, quantity, idempotencyKey, note = '' } = {}) {
  const p_quantity = Number(quantity)
  if (!workspaceId || !storageId || !stockItemId) throw new Error('Choose a storage and a product.')
  if (!Number.isFinite(p_quantity) || p_quantity <= 0) throw new Error(ERROR_MESSAGES.quick_take_quantity_invalid)
  const { data, error } = await withTimeout(supabase.rpc(QUICK_TAKE_RPC, {
    p_workspace_id: workspaceId,
    p_workspace_storage_id: storageId,
    p_stock_item_id: stockItemId,
    p_quantity,
    p_idempotency_key: idempotencyKey || newQuickTakeKey(),
    p_note: `${note ?? ''}`,
  }))
  if (error) {
    console.error('[stockQuickTakeService] take error:', error)
    throw mapQuickTakeError(error)
  }
  const payload = payloadOf(data)
  return {
    movementId: payload.movement_id ?? null,
    quantityAfter: payload.quantity_after == null ? null : Number(payload.quantity_after),
    takenAt: payload.taken_at ?? new Date().toISOString(),
  }
}

export async function undoQuickTake(movementId) {
  if (!movementId) throw new Error('This take cannot be undone.')
  const { data, error } = await withTimeout(supabase.rpc(QUICK_TAKE_UNDO_RPC, { p_movement_id: movementId }))
  if (error) {
    console.error('[stockQuickTakeService] undo error:', error)
    throw mapQuickTakeError(error)
  }
  const payload = payloadOf(data)
  return { quantityAfter: payload.quantity_after == null ? null : Number(payload.quantity_after) }
}
