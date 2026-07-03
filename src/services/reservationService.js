import { supabase } from '../lib/supabaseClient'
import {
  buildSeatingAssignment,
  encodeSeatingAssignmentInNotes,
  enrichReservationWithSeatingAssignment,
  formatSeatingAssignmentLabels,
  parseSeatingAssignmentFromNotes,
  stripSeatingAssignmentFromNotes,
} from '../lib/seatingAssignment'

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

  return enrichReservationWithSeatingAssignment(mapped)
}

function serializeReservation(reservation) {
  const seatingAssignment = reservation.seatingAssignment
    ?? parseSeatingAssignmentFromNotes(reservation.notes)
  const tableNumber = seatingAssignment.assignedUnits.length > 0
    ? formatSeatingAssignmentLabels(seatingAssignment)
    : `${reservation.tableNumber ?? ''}`.trim()
  const notes = encodeSeatingAssignmentInNotes(
    stripSeatingAssignmentFromNotes(reservation.notes),
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

  return {
    guestName: reservation.guestName,
    phone: reservation.phone,
    date: reservation.date,
    time: reservation.time,
    guests: reservation.guests,
    tableNumber: formatSeatingAssignmentLabels(seatingAssignment),
    area: reservation.area,
    status: 'Seated',
    notes: encodeSeatingAssignmentInNotes(
      stripSeatingAssignmentFromNotes(reservation.notes),
      seatingAssignment,
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
