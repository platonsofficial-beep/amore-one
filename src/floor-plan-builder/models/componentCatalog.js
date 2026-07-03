import { FLOOR_PLAN_OBJECT_TYPES } from './floorPlanObject'

export const TABLE_TYPES = [
  {
    id: 'round-table',
    label: 'Round Table',
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'round',
    icon: '○',
    preview: 'round',
  },
  {
    id: 'square-table',
    label: 'Square Table',
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'square',
    icon: '□',
    preview: 'square',
  },
  {
    id: 'rectangle-table',
    label: 'Rectangle Table',
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'rectangle',
    icon: '▭',
    preview: 'rectangle',
  },
  {
    id: 'island-table',
    label: 'Island / Lounge',
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'island',
    icon: '⬭',
    preview: 'island',
  },
]
