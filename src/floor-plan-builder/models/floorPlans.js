import { createDefaultWorkspace } from './floorWorkspace'

export const DEFAULT_RESTAURANT_AREAS = [
  { id: 'main-dining', label: 'Main Dining' },
  { id: 'bar', label: 'Bar' },
  { id: 'patio', label: 'Patio' },
  { id: 'rooftop', label: 'Rooftop' },
  { id: 'lounge', label: 'Lounge' },
]

/** @deprecated Use DEFAULT_RESTAURANT_AREAS */
export const RESTAURANT_AREAS = DEFAULT_RESTAURANT_AREAS

export function slugifyAreaLabel(label) {
  const base = `${label ?? ''}`.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return base || 'area'
}

export function createUniqueAreaId(label, floors) {
  let id = slugifyAreaLabel(label)
  let counter = 2

  while (floors.some((floor) => floor.id === id)) {
    id = `${slugifyAreaLabel(label)}-${counter}`
    counter += 1
  }

  return id
}

export function createFloorFromLabel(label) {
  const trimmed = `${label ?? ''}`.trim()
  return {
    id: slugifyAreaLabel(trimmed),
    label: trimmed,
    workspace: { ...createDefaultWorkspace() },
  }
}

export function createInitialFloors() {
  return DEFAULT_RESTAURANT_AREAS.map((area) => ({
    id: area.id,
    label: area.label,
    workspace: { ...createDefaultWorkspace() },
  }))
}

export function getAreaIndex(floors, activeFloorId) {
  const index = floors.findIndex((floor) => floor.id === activeFloorId)
  return index < 0 ? 0 : index
}

export function getAdjacentAreaId(floors, activeFloorId, direction) {
  if (!floors.length) return activeFloorId

  const currentIndex = getAreaIndex(floors, activeFloorId)
  const nextIndex = direction === 'next'
    ? (currentIndex + 1) % floors.length
    : (currentIndex - 1 + floors.length) % floors.length

  return floors[nextIndex]?.id ?? activeFloorId
}
