export class ObjectSelectionManager {
  constructor({ onSelect, onToggle, onClear }) {
    this.onSelect = onSelect
    this.onToggle = onToggle
    this.onClear = onClear
  }

  canSelectInTool(activeTool) {
    return activeTool === 'select'
  }

  canSelectObject(object) {
    return Boolean(object?.id)
  }

  canDragObject(object) {
    return this.canSelectObject(object) && object.properties?.locked !== true
  }

  selectObject(objectId) {
    if (!objectId) {
      this.onClear()
      return
    }

    this.onSelect(objectId)
  }

  toggleObject(objectId) {
    if (!objectId) return
    this.onToggle?.(objectId)
  }

  clearSelection() {
    this.onClear()
  }

  handleObjectPointerDown(object, activeTool, { additiveSelection = false } = {}) {
    if (!this.canSelectInTool(activeTool) || !this.canSelectObject(object)) {
      return { selected: false, draggable: false, toggled: false }
    }

    if (additiveSelection) {
      this.toggleObject(object.id)
      return {
        selected: true,
        draggable: false,
        toggled: true,
      }
    }

    this.selectObject(object.id)
    return {
      selected: true,
      draggable: this.canDragObject(object),
      toggled: false,
    }
  }
}

export function createObjectSelectionManager(options) {
  return new ObjectSelectionManager(options)
}
