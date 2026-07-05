import { supabase } from '../lib/supabaseClient'

function mapSupplier(record) {
  return {
    id: record.id,
    companyName: record.company_name ?? record.companyName ?? '',
    contactPerson: record.contact_person ?? record.contactPerson ?? '',
    phone: record.phone ?? '',
    email: record.email ?? '',
    address: record.address ?? '',
    paymentTerms: record.payment_terms ?? record.paymentTerms ?? '',
    deliveryDays: record.delivery_days ?? record.deliveryDays ?? '',
    notes: record.notes ?? '',
    taxId: record.tax_id ?? record.taxId ?? '',
    createdAt: record.created_at ?? record.createdAt ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
  }
}

function serializeSupplier(supplier) {
  return {
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
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

export async function getSuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('company_name', { ascending: true })

  if (error) {
    console.error('[supplierService] getSuppliers error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Suppliers table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load suppliers right now.')
  }

  return (data ?? []).map(mapSupplier)
}

export async function createSupplier(supplier) {
  const payload = serializeSupplier(supplier)

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

export async function updateSupplier(id, supplier) {
  const { data, error } = await supabase
    .from('suppliers')
    .update(serializeSupplier(supplier))
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
