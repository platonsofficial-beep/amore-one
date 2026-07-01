import { formatObjectTypeLabel } from './floorPlanObject'

export const INSPECTOR_EMPTY_MESSAGE = 'No object selected'

export function getInspectorFieldsForObject(object) {
  if (!object) return []

  if (object.type === 'table') {
    return [
      {
        id: 'objectType',
        label: 'Object Type',
        value: formatObjectTypeLabel(object.type),
      },
      {
        id: 'tableNumber',
        label: 'Table Number',
        value: object.properties.tableNumber ?? '—',
      },
      {
        id: 'capacity',
        label: 'Capacity',
        value: object.properties.capacity ?? '—',
      },
      {
        id: 'shape',
        label: 'Shape',
        value: formatObjectTypeLabel(object.properties.shape ?? 'round'),
      },
      {
        id: 'positionX',
        label: 'Position X',
        value: Math.round(object.position.x),
      },
      {
        id: 'positionY',
        label: 'Position Y',
        value: Math.round(object.position.y),
      },
      {
        id: 'rotation',
        label: 'Rotation',
        value: `${object.rotation}°`,
        disabled: true,
      },
      {
        id: 'area',
        label: 'Area',
        value: object.properties.area ?? '—',
      },
      {
        id: 'visible',
        label: 'Visible',
        value: object.properties.visible === false ? 'No' : 'Yes',
      },
    ]
  }

  return [
    {
      id: 'objectType',
      label: 'Object Type',
      value: formatObjectTypeLabel(object.type),
    },
    {
      id: 'label',
      label: 'Label',
      value: object.properties.label ?? formatObjectTypeLabel(object.type),
    },
    {
      id: 'positionX',
      label: 'Position X',
      value: Math.round(object.position.x),
    },
    {
      id: 'positionY',
      label: 'Position Y',
      value: Math.round(object.position.y),
    },
    {
      id: 'rotation',
      label: 'Rotation',
      value: `${object.rotation}°`,
      disabled: true,
    },
    {
      id: 'visible',
      label: 'Visible',
      value: object.properties.visible === false ? 'No' : 'Yes',
    },
  ]
}
