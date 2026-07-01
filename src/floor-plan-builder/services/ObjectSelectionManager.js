export class ObjectSelectionManager {
  constructor({ onSelect, onClear }) {
    this.onSelect = onSelect
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

  clearSelection() {
    this.onClear()
  }

  handleObjectPointerDown(object, activeTool) {
    if (!this.canSelectInTool(activeTool) || !this.canSelectObject(object)) {
      return { selected: false, draggable: false }
    }

    this.selectObject(object.id)
    return {
      selected: true,
      draggable: this.canDragObject(object),
    }
  }
}

export function createObjectSelectionManager(options) {
  return new ObjectSelectionManager(options)
}
