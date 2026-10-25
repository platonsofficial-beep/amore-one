import { supabase } from '../lib/supabaseClient'

function mapSupplier(record) {
  return {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? null,
    companyName: record.company_name ?? record.companyName ?? '',
    contactPerson: record.contact_person ?? record.contactPerson ?? '',
    phone: record.phone ?? '',
    email: record.email ?? '',
    address: record.address ?? '',
    paymentTerms: record.payment_terms ?? record.paymentTerms ?? '',
    deliveryDays: record.delivery_days ?? record.deliveryDays ?? '',
    notes: record.notes ?? '',
    taxId: record.tax_id ?? record.taxId ?? '',
    active: record.active !== false,
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function serializeSupplier(supplier) {
  const payload = {
    company_name: supplier.companyName ?? supplier.company_name ?? '',
    contact_person: supplier.contactPerson ?? supplier.contact_person ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    payment_terms: supplier.paymentTerms ?? supplier.payment_terms ?? '',
    delivery_days: supplier.deliveryDays ?? supplier.delivery_days ?? '',
    notes: supplier.notes ?? '',
    tax_id: supplier.taxId ?? supplier.tax_id ?? '',
  }

  if (typeof supplier.active === 'boolean') {
    payload.active = supplier.active
  }

  // Only write workspace_id when non-empty — never send null (preserves legacy / avoids wipe).
  const workspaceId = `${supplier.workspaceId ?? supplier.workspace_id ?? ''}`.trim()
  if (workspaceId) {
    payload.workspace_id = workspaceId
  }

  return payload
}

/** Normalize workspace id for CREATE. Empty/boot → null (omit from payload). */
export function resolveSupplierWorkspaceIdForCreate(workspaceId) {
  const normalized = `${workspaceId ?? ''}`.trim()
  return normalized || null
}

/**
 * Preserve ownership on UPDATE.
 * Returns existing workspace id when set; otherwise null (legacy stays null).
 * Never invents a workspace for legacy rows.
 */
export function resolveSupplierWorkspaceIdForUpdate(existingWorkspaceId) {
  const existing = `${existingWorkspaceId ?? ''}`.trim()
  return existing || null
}

export function serializeSupplierForCreate(supplier) {
  const workspaceId = resolveSupplierWorkspaceIdForCreate(
    supplier?.workspaceId ?? supplier?.workspace_id,
  )
  return serializeSupplier({
    ...supplier,
    workspaceId: workspaceId ?? undefined,
  })
}

export function serializeSupplierForUpdate(supplier, existingWorkspaceId) {
  const workspaceId = resolveSupplierWorkspaceIdForUpdate(
    existingWorkspaceId ?? supplier?.workspaceId ?? supplier?.workspace_id,
  )
  return serializeSupplier({
    ...supplier,
    workspaceId: workspaceId ?? undefined,
  })
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  // A missing workspace_id column also says "does not exist". That is not a missing table.
  if (message.includes('workspace_id')) return false
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function isMissingWorkspaceIdColumnError(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  if (!message.includes('workspace_id')) return false
  return code === '42703'
    || message.includes('schema cache')
    || message.includes('column')
    || message.includes('does not exist')
    || message.includes('could not find')
}

/**
 * Dual-read priority: workspace rows win; otherwise legacy null-workspace rows.
 * Never merges both sets.
 */
export function resolveSupplierDualRead(workspaceSuppliers = [], legacySuppliers = []) {
  if ((workspaceSuppliers ?? []).length > 0) {
    return workspaceSuppliers
  }
  return legacySuppliers ?? []
}

async function fetchSuppliersOrdered(queryBuilder) {
  const { data, error } = await queryBuilder.order('company_name', { ascending: true })

  if (error) {
    if (isMissingWorkspaceIdColumnError(error)) {
      throw error
    }

    console.error('[supplierService] fetchSuppliersOrdered error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    throw error
  }

  return (data ?? []).map(mapSupplier)
}

async function fetchAllSuppliers() {
  return fetchSuppliersOrdered(supabase.from('suppliers').select('*'))
}

const NIL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'

/** @type {'unknown' | 'present' | 'missing'} */
let suppliersWorkspaceColumn = 'unknown'
/** @type {Promise<'present' | 'missing'> | null} */
let suppliersWorkspaceColumnProbe = null

export function resetSupplierWorkspaceColumnCacheForTests() {
  suppliersWorkspaceColumn = 'unknown'
  suppliersWorkspaceColumnProbe = null
}

function rememberSuppliersWorkspaceColumnMissing() {
  suppliersWorkspaceColumn = 'missing'
}

function throwSupplierLoadError(error, fallbackMessage) {
  if (
    error?.message === 'Suppliers table is not ready yet.'
    || isTableUnavailableError(error)
  ) {
    throw new Error('Suppliers table is not ready yet.')
  }
  console.error('[supplierService] getSuppliers error:', error)
  throw new Error(error?.message || fallbackMessage)
}

async function detectSuppliersWorkspaceColumn() {
  const { error } = await supabase
    .from('suppliers')
    .select('id')
    .eq('workspace_id', NIL_WORKSPACE_ID)
    .limit(1)

  if (!error) {
    suppliersWorkspaceColumn = 'present'
    return 'present'
  }

  if (isMissingWorkspaceIdColumnError(error)) {
    rememberSuppliersWorkspaceColumnMissing()
    return 'missing'
  }

  if (isTableUnavailableError(error)) {
    throw new Error('Suppliers table is not ready yet.')
  }

  throw error
}

async function ensureSuppliersWorkspaceColumn() {
  if (suppliersWorkspaceColumn !== 'unknown') return suppliersWorkspaceColumn
  if (!suppliersWorkspaceColumnProbe) {
    suppliersWorkspaceColumnProbe = detectSuppliersWorkspaceColumn().finally(() => {
      suppliersWorkspaceColumnProbe = null
    })
  }
  return suppliersWorkspaceColumnProbe
}

function payloadWithoutWorkspaceId(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'workspace_id')) return payload
  const { workspace_id: _workspaceId, ...rest } = payload
  return rest
}

/**
 * Lists suppliers for one venue.
 * - Column present and workspace id set → only that workspace_id.
 * - Column present and no workspace id → [] (do not leak another venue).
 * - Column missing → unscoped select, and the miss is remembered so later
 *   loads do not filter on workspace_id again.
 * Null-workspace rows are not merged in. After the SQL, those stay hidden by RLS.
 */
export async function getSuppliers(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  let column
  try {
    column = await ensureSuppliersWorkspaceColumn()
  } catch (error) {
    throwSupplierLoadError(error, 'Unable to load suppliers right now.')
  }

  if (column === 'present' && !normalizedWorkspaceId) {
    return []
  }

  try {
    if (column === 'missing') {
      return await fetchAllSuppliers()
    }

    return await fetchSuppliersOrdered(
      supabase
        .from('suppliers')
        .select('*')
        .eq('workspace_id', normalizedWorkspaceId),
    )
  } catch (error) {
    if (isMissingWorkspaceIdColumnError(error)) {
      rememberSuppliersWorkspaceColumnMissing()
      try {
        return await fetchAllSuppliers()
      } catch (fallbackError) {
        throwSupplierLoadError(fallbackError, 'Unable to load suppliers right now.')
      }
    }

    throwSupplierLoadError(error, 'Unable to load suppliers right now.')
  }
}

async function writeSupplier(kind, payload, applyWrite) {
  let column
  try {
    column = await ensureSuppliersWorkspaceColumn()
  } catch (error) {
    if (
      error?.message === 'Suppliers table is not ready yet.'
      || isTableUnavailableError(error)
    ) {
      throw new Error('Suppliers table is not ready yet.')
    }
    throw error
  }

  let nextPayload = column === 'missing' ? payloadWithoutWorkspaceId(payload) : payload
  let { data, error } = await applyWrite(nextPayload)

  if (error && nextPayload.workspace_id && isMissingWorkspaceIdColumnError(error)) {
    rememberSuppliersWorkspaceColumnMissing()
    nextPayload = payloadWithoutWorkspaceId(nextPayload)
    ;({ data, error } = await applyWrite(nextPayload))
  }

  if (error) {
    console.error(`[supplierService] ${kind} error:`, error)

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    const fallback = kind === 'createSupplier'
      ? 'Unable to create supplier right now.'
      : 'Unable to update supplier right now.'
    throw new Error(error.message || fallback)
  }

  return mapSupplier(data)
}

export async function createSupplier(supplier) {
  const payload = serializeSupplierForCreate(supplier)
  return writeSupplier('createSupplier', payload, (nextPayload) => (
    supabase
      .from('suppliers')
      .insert([nextPayload])
      .select('*')
      .single()
  ))
}

export async function updateSupplier(id, supplier, options = {}) {
  const existingWorkspaceId = options.existingWorkspaceId
    ?? supplier?.workspaceId
    ?? supplier?.workspace_id
  const payload = serializeSupplierForUpdate(supplier, existingWorkspaceId)
  return writeSupplier('updateSupplier', payload, (nextPayload) => (
    supabase
      .from('suppliers')
      .update(nextPayload)
      .eq('id', id)
      .select('*')
      .single()
  ))
}

export async function deleteSupplier(id) {
  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[supplierService] deleteSupplier error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete supplier right now.')
  }
}
