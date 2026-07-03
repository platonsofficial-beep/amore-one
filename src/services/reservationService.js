import { supabase } from '../lib/supabaseClient'
import {
  buildSeatingAssignment,
  encodeSeatingAssignmentInNotes,
  enrichReservationWithSeatingAssignment,
  formatSeatingAssignmentLabels,
  parseSeatingAssignmentFromNotes,
  stripSeatingAssignmentFromNotes,
} from '../lib/seatingAssignment'
import {
  encodeCustomerTypeInNotes,
  parseCustomerTypeFromNotes,
  stripCustomerTypeFromNotes,
} from '../lib/reservationCustomerType'

function mapReservation(record) {
  const mapped = {
    id: record.id,
    guestName: record.guest_name ?? record.guestName ?? '',
    phone: record.phone ?? '',
    date: record.reservation_date ?? record.date ?? '',
    time: record.reservation_time ?? record.time ?? '',
    guests: record.party_size ?? record.guests ?? 0,
    tableNumber: record.table_number ?? record.tableNumber ?? '',
    area: record.area ?? '',
    status: record.status ?? 'Booked',
    notes: record.notes ?? '',
  }

  return enrichReservationWithSeatingAssignment({
    ...mapped,
    customerType: parseCustomerTypeFromNotes(mapped.notes),
    notes: stripCustomerTypeFromNotes(stripSeatingAssignmentFromNotes(mapped.notes)),
  })
}

function serializeReservation(reservation) {
  const seatingAssignment = reservation.seatingAssignment
    ?? parseSeatingAssignmentFromNotes(reservation.notes)
  const tableNumber = seatingAssignment.assignedUnits.length > 0
    ? formatSeatingAssignmentLabels(seatingAssignment)
    : `${reservation.tableNumber ?? ''}`.trim()
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
    guest_name: reservation.guestName ?? reservation.guest_name ?? '',
    phone: reservation.phone ?? '',
    reservation_date: reservation.date ?? reservation.reservation_date ?? '',
    reservation_time: reservation.time ?? reservation.reservation_time ?? '',
    party_size: reservation.guests ?? reservation.party_size ?? 0,
    table_number: tableNumber,
    area: reservation.area ?? '',
    status: reservation.status ?? 'Booked',
    notes,
  }
}

export function createSeatingAssignmentPayload(reservation, assignmentInput) {
  const seatingAssignment = buildSeatingAssignment({
    ...assignmentInput,
    partySize: reservation.guests,
  })

  const userNotes = stripCustomerTypeFromNotes(
    stripSeatingAssignmentFromNotes(reservation.notes),
  )

  return {
    guestName: reservation.guestName,
    phone: reservation.phone,
    date: reservation.date,
    time: reservation.time,
    guests: reservation.guests,
    tableNumber: formatSeatingAssignmentLabels(seatingAssignment),
    area: reservation.area,
    status: 'Seated',
    customerType: reservation.customerType ?? parseCustomerTypeFromNotes(reservation.notes),
    notes: encodeSeatingAssignmentInNotes(
      encodeCustomerTypeInNotes(userNotes, reservation.customerType ?? 'Regular'),
      seatingAssignment,
    ),
    seatingAssignment,
  }
}

export function buildReservationUpdatePayload(reservation, patch) {
  const seatingAssignment = buildSeatingAssignment({
    assignedUnits: patch.assignedUnits ?? reservation.seatingAssignment?.assignedUnits ?? [],
    extraChairs: patch.extraChairs ?? reservation.seatingAssignment?.extraChairs ?? 0,
    standingGuests: patch.standingGuests ?? reservation.seatingAssignment?.standingGuests ?? 0,
    partySize: patch.guests ?? reservation.guests,
  })

  const userNotes = stripCustomerTypeFromNotes(
    stripSeatingAssignmentFromNotes(patch.notes ?? reservation.notes),
  )
  const customerType = patch.customerType ?? reservation.customerType ?? 'Regular'

  return {
    guestName: patch.guestName ?? reservation.guestName,
    phone: patch.phone ?? reservation.phone,
    date: reservation.date,
    time: patch.time ?? reservation.time,
    guests: Number(patch.guests ?? reservation.guests) || reservation.guests,
    tableNumber: seatingAssignment.assignedUnits.length > 0
      ? formatSeatingAssignmentLabels(seatingAssignment)
      : `${patch.tableNumber ?? reservation.tableNumber ?? ''}`.trim(),
    area: reservation.area,
    status: patch.status ?? reservation.status,
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

export async function getReservations() {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
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

export async function createReservation(reservation) {
  const payload = serializeReservation(reservation)

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

export async function updateReservation(id, reservation) {
  const { data, error } = await supabase
    .from('reservations')
    .update(serializeReservation(reservation))
    .eq('id', id)
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

export async function deleteReservation(id) {
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[reservationService] deleteReservation error:', error)

    if (isTableUnavailableError(error)) {
      throw new Error('Reservations table is not ready yet.')
    }

    throw new Error(error.message || 'Unable to delete reservation right now.')
  }
}
