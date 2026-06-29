import { supabase } from '../lib/supabaseClient'

const POSITIONS_TABLE = 'positions'

const DEFAULT_POSITIONS = [
  { name: 'Bar Manager', department: 'Bar' },
  { name: 'Bartender', department: 'Bar' },
  { name: 'Barback', department: 'Bar' },
  { name: 'Head Waiter', department: 'Service' },
  { name: 'Waiter', department: 'Service' },
  { name: 'Food Runner', department: 'Service' },
  { name: 'Drink Runner', department: 'Service' },
  { name: 'Host', department: 'Service' },
  { name: 'Hostess', department: 'Service' },
  { name: 'Head Chef', department: 'Kitchen' },
  { name: 'Sous Chef', department: 'Kitchen' },
  { name: 'Line Cook', department: 'Kitchen' },
  { name: 'Pastry Chef', department: 'Kitchen' },
  { name: 'Kitchen Porter', department: 'Kitchen' },
  { name: 'General Manager', department: 'Management' },
  { name: 'Assistant Manager', department: 'Management' },
  { name: 'Supervisor', department: 'Management' },
  { name: 'Cashier', department: 'Other' },
  { name: 'Reception', department: 'Other' },
  { name: 'Security', department: 'Other' },
  { name: 'Cleaner', department: 'Other' },
]

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

async function ensureDefaultPositions(positions) {
  if ((positions ?? []).length > 0) return positions

  const payload = DEFAULT_POSITIONS.map((position, index) => ({
    ...serializePosition({ ...position, sortOrder: index + 1 }),
  }))

  const { data, error } = await supabase
    .from(POSITIONS_TABLE)
    .insert(payload)
    .select('*')

  if (error) {
    console.error('[positionsService] ensureDefaultPositions error:', error)
    throw new Error(error.message || 'Unable to initialize default positions right now.')
  }

  return (data ?? []).map(mapPosition)
}

export async function getPositions() {
  const { data, error } = await supabase
    .from(POSITIONS_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[positionsService] getPositions error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Positions table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load positions right now.')
  }

  const normalized = (data ?? []).map(mapPosition)
  const seeded = await ensureDefaultPositions(normalized)
  return seeded.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
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
