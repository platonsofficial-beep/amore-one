import { supabase } from '../lib/supabaseClient'
import { STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE } from '../lib/staffShelfCount'

const SUBMIT_STAFF_SHELF_COUNT_RPC = 'submit_staff_shelf_count'

const STAFF_SHELF_COUNT_ERROR_MESSAGES = Object.freeze({
  staff_shelf_count_unauthenticated: 'Sign in to count this shelf.',
  staff_shelf_count_workspace_required: 'Workspace is required to count this shelf.',
  staff_shelf_count_workspace_not_found: 'Workspace was not found.',
  staff_shelf_count_forbidden: 'Only staff can submit a shelf count.',
  staff_shelf_count_storage_required: 'Choose a shelf to count.',
  staff_shelf_count_storage_not_found: 'That shelf was not found.',
  staff_shelf_count_storage_inactive: 'Archived shelves cannot be counted.',
  staff_shelf_count_not_a_shelf: 'Count a shelf, not a supply storage.',
  staff_shelf_count_lines_required: 'Enter a quantity for every product on this shelf.',
  staff_shelf_count_line_invalid: 'One of the products on this shelf is not valid.',
  staff_shelf_count_quantity_invalid: 'Enter a quantity with up to 3 decimal places.',
  staff_shelf_count_lines_mismatch: 'Count every product on this shelf, and only those products.',
  staff_shelf_count_empty: 'Nothing on this shelf has a balance to count yet.',
  staff_shelf_count_already_waiting: 'A count for this shelf is already waiting for a manager.',
})

export function isStaffShelfCountRpcMissing(error) {
  const code = `${error?.code ?? ''}`
  const message = `${error?.message ?? ''}`.toLowerCase()
  return code === 'PGRST202'
    || code === '42883'
    || message.includes('could not find the function')
    || message.includes('schema cache')
}

export function mapStaffShelfCountError(error) {
  if (isStaffShelfCountRpcMissing(error)) {
    return new Error(STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE)
  }
  const raw = `${error?.message ?? error?.code ?? ''}`.trim()
  for (const [code, message] of Object.entries(STAFF_SHELF_COUNT_ERROR_MESSAGES)) {
    if (raw.includes(code)) return new Error(message)
  }
  return new Error(raw || 'Unable to submit this shelf count right now.')
}

/**
 * True when submit_staff_shelf_count exists.
 * A missing function leaves the sheet unable to save. Balances stay unchanged.
 */
export async function staffShelfCountAvailable() {
  if (!supabase) return false
  const { error } = await supabase.rpc(SUBMIT_STAFF_SHELF_COUNT_RPC, {
    p_workspace_id: null,
    p_workspace_storage_id: null,
    p_lines: [],
  })
  if (!error) return true
  if (isStaffShelfCountRpcMissing(error)) return false
  const code = `${error.code ?? ''}`
  const message = `${error.message ?? ''}`.toLowerCase()
  if (code === '42501' || message.includes('permission denied')) return false
  return true
}

/**
 * Submit one shelf for manager approval. Does not change balances.
 *
 * @param {{
 *   workspaceId?: string,
 *   workspaceStorageId?: string,
 *   lines?: { stock_item_id: string, counted_quantity: number }[],
 * }} input
 */
export async function submitStaffShelfCount({
  workspaceId = '',
  workspaceStorageId = '',
  lines = [],
} = {}) {
  if (!supabase) {
    throw new Error(STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE)
  }

  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedStorageId = `${workspaceStorageId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error(STAFF_SHELF_COUNT_ERROR_MESSAGES.staff_shelf_count_workspace_required)
  }
  if (!normalizedStorageId) {
    throw new Error(STAFF_SHELF_COUNT_ERROR_MESSAGES.staff_shelf_count_storage_required)
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error(STAFF_SHELF_COUNT_ERROR_MESSAGES.staff_shelf_count_lines_required)
  }

  const { data, error } = await supabase.rpc(SUBMIT_STAFF_SHELF_COUNT_RPC, {
    p_workspace_id: normalizedWorkspaceId,
    p_workspace_storage_id: normalizedStorageId,
    p_lines: lines.map((line) => ({
      stock_item_id: line.stock_item_id,
      counted_quantity: line.counted_quantity,
    })),
  })

  if (error) throw mapStaffShelfCountError(error)

  return {
    sessionId: `${data?.session_id ?? ''}`.trim(),
    storageName: `${data?.storage_name ?? ''}`.trim(),
    lineCount: Number(data?.line_count) || lines.length,
    status: `${data?.status ?? ''}`.trim(),
    submittedAt: data?.submitted_at ?? null,
  }
}
