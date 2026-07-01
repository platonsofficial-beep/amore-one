import { formatObjectTypeLabel } from './floorPlanObject'

export const INSPECTOR_EMPTY_MESSAGE = 'No object selected'

export function getTableInspectorModel(object) {
  return {
    name: object.properties.name ?? `Table ${object.properties.tableNumber ?? ''}`.trim(),
    capacity: object.properties.capacity ?? '—',
    shape: formatObjectTypeLabel(object.properties.shape ?? 'round'),
    width: Math.round(object.size.width),
    height: Math.round(object.size.height),
    rotation: object.rotation ?? 0,
    locked: object.properties.locked === true,
    visible: object.properties.visible !== false,
  }
}
