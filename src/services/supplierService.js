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

/**
 * Workspace-aware supplier load with transparent legacy fallback.
 * - If workspace rows exist → return only those.
 * - Else → return suppliers with workspace_id IS NULL.
 * - If workspace_id column is missing → global select (pre-migration).
 * - If workspaceId is empty → global select (boot / no workspace yet).
 */
export async function getSuppliers(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  if (!normalizedWorkspaceId) {
    try {
      return await fetchAllSuppliers()
    } catch (error) {
      if (isTableUnavailableError(error)) {
        throw new Error('Suppliers table is not ready yet.')
      }
      console.error('[supplierService] getSuppliers error:', error)
      throw new Error(error.message || 'Unable to load suppliers right now.')
    }
  }

  try {
    const workspaceSuppliers = await fetchSuppliersOrdered(
      supabase
        .from('suppliers')
        .select('*')
        .eq('workspace_id', normalizedWorkspaceId),
    )

    if (workspaceSuppliers.length > 0) {
      return resolveSupplierDualRead(workspaceSuppliers, [])
    }

    const legacySuppliers = await fetchSuppliersOrdered(
      supabase
        .from('suppliers')
        .select('*')
        .is('workspace_id', null),
    )

    return resolveSupplierDualRead(workspaceSuppliers, legacySuppliers)
  } catch (error) {
    if (isMissingWorkspaceIdColumnError(error)) {
      try {
        return await fetchAllSuppliers()
      } catch (fallbackError) {
        if (isTableUnavailableError(fallbackError)) {
          throw new Error('Suppliers table is not ready yet.')
        }
        console.error('[supplierService] getSuppliers fallback error:', fallbackError)
        throw new Error(fallbackError.message || 'Unable to load suppliers right now.')
      }
    }

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    console.error('[supplierService] getSuppliers error:', error)
    throw new Error(error.message || 'Unable to load suppliers right now.')
  }
}

export async function createSupplier(supplier) {
  const payload = serializeSupplierForCreate(supplier)

  const { data, error } = await supabase
    .from('suppliers')
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[supplierService] createSupplier error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create supplier right now.')
  }

  return mapSupplier(data)
}

export async function updateSupplier(id, supplier, options = {}) {
  const existingWorkspaceId = options.existingWorkspaceId
    ?? supplier?.workspaceId
    ?? supplier?.workspace_id
  const payload = serializeSupplierForUpdate(supplier, existingWorkspaceId)

  const { data, error } = await supabase
    .from('suppliers')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[supplierService] updateSupplier error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to update supplier right now.')
  }

  return mapSupplier(data)
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
