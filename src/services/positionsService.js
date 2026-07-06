import { supabase } from '../lib/supabaseClient'

const POSITIONS_TABLE = 'positions'

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function mapPosition(record) {
  return {
    id: record.id,
    name: record.name ?? record.position_name ?? '',
    department: record.department ?? 'Other',
    sortOrder: record.sort_order ?? record.sortOrder ?? 0,
  }
}

function serializePosition(position) {
  return {
    name: position.name ?? position.position_name ?? '',
    department: position.department ?? 'Other',
    sort_order: position.sortOrder ?? position.sort_order ?? 0,
  }
}

export async function getPositions() {
  const { data, error } = await supabase
    .from(POSITIONS_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.warn('[positionsService] getPositions error:', error)

    if (isTableUnavailableError(error)) {
      return []
    }

    return []
  }

  return (data ?? [])
    .map(mapPosition)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
}

export async function createPosition(position) {
  const { data, error } = await supabase
    .from(POSITIONS_TABLE)
    .insert([serializePosition(position)])
    .select('*')
    .single()

  if (error) {
    console.error('[positionsService] createPosition error:', error)
    throw new Error(error.message || 'Unable to create position right now.')
  }

  return mapPosition(data)
}

export async function updatePosition(id, position) {
  const { data, error } = await supabase
    .from(POSITIONS_TABLE)
    .update(serializePosition(position))
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[positionsService] updatePosition error:', error)
    throw new Error(error.message || 'Unable to update position right now.')
  }

  return mapPosition(data)
}

export async function deletePosition(id) {
  const { error } = await supabase
    .from(POSITIONS_TABLE)
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[positionsService] deletePosition error:', error)
    throw new Error(error.message || 'Unable to delete position right now.')
  }
}

export async function reorderPositions(orderedPositions) {
  const updates = orderedPositions.map((position, index) => ({
    id: position.id,
    sort_order: index + 1,
  }))

  for (const item of updates) {
    const { error } = await supabase
      .from(POSITIONS_TABLE)
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)

    if (error) {
      console.error('[positionsService] reorderPositions error:', error)
      throw new Error(error.message || 'Unable to reorder positions right now.')
    }
  }
}

export async function ensurePositionByName(name, department = 'Other', sortOrder = 0) {
  const trimmedName = `${name ?? ''}`.trim()
  if (!trimmedName) {
    throw new Error('Position name is required.')
  }

  const catalog = await getPositions()
  const existing = catalog.find(
    (row) => `${row.name ?? ''}`.trim().toLowerCase() === trimmedName.toLowerCase(),
  )

  if (existing) {
    return existing
  }

  return createPosition({
    name: trimmedName,
    department,
    sortOrder,
  })
}
