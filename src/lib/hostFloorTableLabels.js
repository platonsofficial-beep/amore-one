export function formatHostFloorPartyLabel(guestCount) {
  const count = Math.max(0, Number(guestCount) || 0)
  if (count <= 0) return ''
  return `${count} pax`
}

export function formatHostFloorCapacityLabel(table) {
  const minGuests = Math.max(0, Number(table?.minGuests ?? table?.min_guests) || 0)
  const maxGuests = Math.max(
    minGuests,
    Number(table?.maxGuestCapacity ?? table?.maxGuests ?? table?.seatedCapacity ?? table?.seats) || 0,
  )

  if (minGuests > 0 && maxGuests > minGuests) {
    return `${minGuests}-${maxGuests} pax`
  }

  if (maxGuests > 0) return `${maxGuests} pax`
  return ''
}
