export function createDefaultSections(shape, floorId) {
  if (floorId === 'bar') {
    return [
      { id: '1-1', label: '1.1', stools: 2, maxGuests: 3 },
      { id: '1-2', label: '1.2', stools: 2, maxGuests: 3 },
      { id: '1-3', label: '1.3', stools: 2, maxGuests: 4 },
      { id: '2-1', label: '2.1', stools: 2, maxGuests: 4 },
      { id: '2-2', label: '2.2', stools: 2, maxGuests: 4 },
      { id: '2-3', label: '2.3', stools: 2, maxGuests: 4 },
    ]
  }

  if (shape === 'island' || floorId === 'lounge') {
    return [
      { id: '101', label: '101', stools: 2, maxGuests: 4 },
      { id: '102', label: '102', stools: 2, maxGuests: 4 },
      { id: '103', label: '103', stools: 2, maxGuests: 4 },
      { id: '104', label: '104', stools: 2, maxGuests: 4 },
    ]
  }

  return []
}

export function supportsTableSections(shape, floorId) {
  return shape === 'island' || floorId === 'bar' || floorId === 'lounge'
}

export function normalizeTableSection(section) {
  const stools = Math.max(1, Number(section.stools) || 1)
  const maxGuests = Math.max(stools, Number(section.maxGuests) || stools)

  return {
    id: `${section.id ?? section.label ?? ''}`.trim(),
    label: `${section.label ?? section.id ?? ''}`.trim(),
    stools,
    maxGuests,
  }
}

export function getTableSectionTotals(sections = []) {
  return sections.reduce((totals, section) => {
    const normalized = normalizeTableSection(section)
    return {
      stools: totals.stools + normalized.stools,
      maxGuests: totals.maxGuests + normalized.maxGuests,
    }
  }, { stools: 0, maxGuests: 0 })
}
