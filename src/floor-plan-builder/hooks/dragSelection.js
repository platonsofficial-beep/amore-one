export function resolvePendingDragSelection({
  objectId,
  wasSelected,
  isMultiSelect,
  moved,
}) {
  if (!objectId) return null

  if (moved) {
    if (!isMultiSelect) {
      return { type: 'SELECT_OBJECT', objectId }
    }
    if (!wasSelected) {
      return { type: 'TOGGLE_OBJECT_SELECTION', objectId }
    }
    return null
  }

  if (!isMultiSelect) {
    return { type: 'SELECT_OBJECT', objectId }
  }

  return { type: 'TOGGLE_OBJECT_SELECTION', objectId }
}
