import { normalizeReservationStatus } from '../lib/reservationHostStatus'
import { supabase } from '../lib/supabaseClient'
import {
  buildSeatingAssignment,
  encodeSeatingAssignmentInNotes,
  enrichReservationWithSeatingAssignment,
  formatSeatingAssignmentLabels,
  getReservationSeatingAssignment,
  parseSeatingAssignmentFromNotes,
  stripSeatingAssignmentFromNotes,
} from '../lib/seatingAssignment'
import { ensureWalkInNotesMarker } from '../lib/hostQuickCreateForm'
import {
  encodeCustomerTypeInNotes,
  normalizeStoredCustomerType,
  parseCustomerTypeFromNotes,
  stripCustomerTypeFromNotes,
} from '../lib/reservationCustomerType'
import { getReservationEditableNotesText } from '../lib/hostQueueNoteBadges'

function mapReservation(record) {
  const rawNotes = record.notes ?? ''
  const mapped = {
    id: record.id,
    workspaceId: record.workspace_id ?? record.workspaceId ?? '',
    guestName: record.guest_name ?? record.guestName ?? '',
    phone: record.phone ?? '',
    date: record.reservation_date ?? record.date ?? '',
    time: record.reservation_time ?? record.time ?? '',
    guests: record.party_size ?? record.guests ?? 0,
    tableNumber: record.table_number ?? record.tableNumber ?? '',
    area: record.area ?? '',
    status: normalizeReservationStatus(record.status ?? 'Pending'),
    notes: rawNotes,
    seatingId: record.seating_id ?? record.seatingId ?? null,
    updatedAt: record.updated_at ?? record.updatedAt ?? null,
    createdAt: record.created_at ?? record.createdAt ?? null,
  }

  return enrichReservationWithSeatingAssignment({
    ...mapped,
    customerType: parseCustomerTypeFromNotes(rawNotes),
  })
}

function resolveSeatingAssignmentForSerialize(reservation) {
  if (reservation.seatingAssignment != null) {
    return buildSeatingAssignment({
      assignedUnits: reservation.seatingAssignment.assignedUnits ?? [],
      extraChairs: reservation.seatingAssignment.extraChairs ?? 0,
      standingGuests: reservation.seatingAssignment.standingGuests ?? 0,
      partySize: reservation.guests,
    })
  }

  return parseSeatingAssignmentFromNotes(reservation.notes ?? '')
}

function resolveTableNumberForSerialize(seatingAssignment, reservation) {
  if (seatingAssignment.assignedUnits.length > 0) {
    return formatSeatingAssignmentLabels(seatingAssignment)
  }

  if (reservation.seatingAssignment != null) {
    return ''
  }

  return `${reservation.tableNumber ?? ''}`.trim()
}

function serializeReservation(reservation) {
  const seatingAssignment = resolveSeatingAssignmentForSerialize(reservation)
  const tableNumber = resolveTableNumberForSerialize(seatingAssignment, reservation)
  const userNotes = stripCustomerTypeFromNotes(
    stripSeatingAssignmentFromNotes(reservation.notes),
  )
  const notesWithCustomer = encodeCustomerTypeInNotes(
    userNotes,
    reservation.customerType ?? parseCustomerTypeFromNotes(reservation.notes),
  )
  const notes = encodeSeatingAssignmentInNotes(
    notesWithCustomer,
    seatingAssignment.assignedUnits.length > 0 ? seatingAssignment : null,
  )

  return {
    guest_name: `${reservation.guestName ?? reservation.guest_name ?? ''}`.trim(),
    phone: `${reservation.phone ?? ''}`.trim(),
    reservation_date: reservation.date ?? reservation.reservation_date ?? '',
    reservation_time: reservation.time ?? reservation.reservation_time ?? '',
    party_size: Number(reservation.guests ?? reservation.party_size) || 2,
    table_number: tableNumber,
    area: `${reservation.area ?? ''}`.trim(),
    status: normalizeReservationStatus(reservation.status ?? 'Pending'),
    seating_id: reservation.seatingId ?? reservation.seating_id ?? null,
    notes,
  }
}

export function createSeatingAssignmentPayload(reservation, assignmentInput, { markSeated = false } = {}) {
  const seatingAssignment = buildSeatingAssignment({
    assignedUnits: assignmentInput?.assignedUnits ?? [],
    extraChairs: assignmentInput?.extraChairs ?? 0,
    standingGuests: assignmentInput?.standingGuests ?? 0,
    partySize: reservation.guests,
  })

  const userNotes = stripCustomerTypeFromNotes(
    stripSeatingAssignmentFromNotes(reservation.notes),
  )
  const currentStatus = normalizeReservationStatus(reservation.status ?? 'Pending')

  return {
    guestName: reservation.guestName,
    phone: reservation.phone,
    date: reservation.date,
    time: reservation.time,
    guests: reservation.guests,
    tableNumber: formatSeatingAssignmentLabels(seatingAssignment),
    area: reservation.area,
    status: markSeated ? 'Checked In' : currentStatus,
    customerType: reservation.customerType ?? parseCustomerTypeFromNotes(reservation.notes),
    notes: encodeSeatingAssignmentInNotes(
      encodeCustomerTypeInNotes(userNotes, reservation.customerType ?? 'Regular'),
      seatingAssignment,
    ),
    seatingAssignment,
    seatingId: assignmentInput?.seatingId ?? reservation.seatingId ?? reservation.seating_id ?? null,
  }
}

/** Host/table assignment that preserves the reservation's current status. */
export function assignReservationTablesPayload(reservation, assignmentInput) {
  return createSeatingAssignmentPayload(reservation, assignmentInput, { markSeated: false })
}

export function buildReservationUpdatePayload(reservation, patch) {
  const existingAssignment = getReservationSeatingAssignment(reservation)
  const assignedUnits = Object.hasOwn(patch, 'assignedUnits')
    ? (patch.assignedUnits ?? [])
    : (existingAssignment.assignedUnits ?? [])
  const extraChairs = Object.hasOwn(patch, 'extraChairs')
    ? (patch.extraChairs ?? 0)
    : (existingAssignment.extraChairs ?? 0)
  const standingGuests = Object.hasOwn(patch, 'standingGuests')
    ? (patch.standingGuests ?? 0)
    : (existingAssignment.standingGuests ?? 0)
  const seatingAssignment = buildSeatingAssignment({
    assignedUnits,
    extraChairs,
    standingGuests,
    partySize: patch.guests ?? reservation.guests,
  })

  const status = normalizeReservationStatus(patch.status ?? reservation.status ?? 'Pending')
  let userNotes = getReservationEditableNotesText(patch.notes ?? reservation.notes)
  if (status === 'Walk In') {
    userNotes = ensureWalkInNotesMarker(userNotes)
  }
  const customerType = normalizeStoredCustomerType(
    patch.customerType ?? reservation.customerType ?? parseCustomerTypeFromNotes(reservation.notes),
  )
  const tableNumber = seatingAssignment.assignedUnits.length > 0
    ? formatSeatingAssignmentLabels(seatingAssignment)
    : Object.hasOwn(patch, 'assignedUnits') || Object.hasOwn(patch, 'tableNumber')
      ? `${patch.tableNumber ?? ''}`.trim()
      : `${reservation.tableNumber ?? ''}`.trim()

  return {
    guestName: patch.guestName ?? reservation.guestName,
    phone: patch.phone ?? reservation.phone,
    date: patch.date ?? reservation.date,
    time: patch.time ?? reservation.time,
    guests: Number(patch.guests ?? reservation.guests) || reservation.guests,
    tableNumber,
    area: patch.area ?? reservation.area,
    status: normalizeReservationStatus(patch.status ?? reservation.status ?? 'Pending'),
    seatingId: Object.hasOwn(patch, 'seatingId')
      ? (patch.seatingId ?? null)
      : (reservation.seatingId ?? reservation.seating_id ?? null),
    customerType,
    notes: encodeSeatingAssignmentInNotes(
      encodeCustomerTypeInNotes(userNotes, customerType),
      seatingAssignment.assignedUnits.length > 0 ? seatingAssignment : null,
    ),
    seatingAssignment,
  }
}

function isTableUnavailableError(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('does not exist') || message.includes('relation') || message.includes('could not find the table')
}

function requireWorkspaceId(workspaceId) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  if (!normalizedWorkspaceId) {
    throw new Error('Workspace is required for reservations.')
  }
  return normalizedWorkspaceId
}

export async function getReservations(workspaceId) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('workspace_id', normalizedWorkspaceId)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true })

  if (error) {
    console.error('[reservationService] getReservations error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Reservations table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to load reservations right now.')
  }

  return (data ?? []).map(mapReservation)
}

export async function createReservation(workspaceId, reservation, createdBy = null) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const payload = {
    ...serializeReservation(reservation),
    workspace_id: normalizedWorkspaceId,
    created_by: createdBy ?? reservation.createdBy ?? reservation.created_by ?? null,
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert([payload])
    .select('*')
    .single()

  if (error) {
    console.error('[reservationService] createReservation error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Reservations table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to create reservation right now.')
  }

  return mapReservation(data)
}

export async function updateReservation(workspaceId, id, reservation) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedId = `${id ?? ''}`.trim()
  if (!normalizedId) {
    throw new Error('Reservation is required.')
  }

  const { data, error } = await supabase
    .from('reservations')
    .update(serializeReservation(reservation))
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedId)
    .select('*')
    .single()

  if (error) {
    console.error('[reservationService] updateReservation error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Reservations table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to update reservation right now.')
  }

  return mapReservation(data)
}

export async function deleteReservation(workspaceId, id) {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId)
  const normalizedId = `${id ?? ''}`.trim()
  if (!normalizedId) {
    throw new Error('Reservation is required.')
  }

  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('id', normalizedId)

  if (error) {
    console.error('[reservationService] deleteReservation error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Reservations table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete reservation right now.')
  }
}
