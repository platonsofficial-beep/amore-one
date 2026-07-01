import { FLOOR_PLAN_OBJECT_TYPES } from './floorPlanObject'

export const BUILDER_COMPONENT_CATEGORIES = [
  {
    id: 'tables',
    label: 'Tables',
    items: [
      { id: 'round-table', label: 'Round Table', type: FLOOR_PLAN_OBJECT_TYPES.TABLE, icon: '○' },
      { id: 'square-table', label: 'Square Table', type: FLOOR_PLAN_OBJECT_TYPES.TABLE, icon: '□' },
      { id: 'rectangle-table', label: 'Rectangle Table', type: FLOOR_PLAN_OBJECT_TYPES.TABLE, icon: '▭' },
    ],
  },
  {
    id: 'furniture',
    label: 'Furniture',
    items: [
      { id: 'chair', label: 'Chair', type: FLOOR_PLAN_OBJECT_TYPES.CHAIR, icon: '◦' },
      { id: 'sofa', label: 'Sofa', type: FLOOR_PLAN_OBJECT_TYPES.SOFA, icon: '▬' },
      { id: 'bar-stool', label: 'Bar Stool', type: FLOOR_PLAN_OBJECT_TYPES.BAR_STOOL, icon: '◎' },
    ],
  },
  {
    id: 'structure',
    label: 'Structure',
    items: [
      { id: 'wall', label: 'Wall', type: FLOOR_PLAN_OBJECT_TYPES.WALL, icon: '━' },
      { id: 'divider', label: 'Divider', type: FLOOR_PLAN_OBJECT_TYPES.DIVIDER, icon: '─' },
      { id: 'door', label: 'Door', type: FLOOR_PLAN_OBJECT_TYPES.DOOR, icon: '⌁' },
      { id: 'window', label: 'Window', type: FLOOR_PLAN_OBJECT_TYPES.WINDOW, icon: '▭' },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities',
    items: [
      { id: 'bar', label: 'Bar', type: FLOOR_PLAN_OBJECT_TYPES.BAR, icon: '▣' },
      { id: 'kitchen', label: 'Kitchen', type: FLOOR_PLAN_OBJECT_TYPES.KITCHEN, icon: '▦' },
      { id: 'host-desk', label: 'Host Desk', type: FLOOR_PLAN_OBJECT_TYPES.HOST_DESK, icon: '▤' },
      { id: 'waiting-area', label: 'Waiting Area', type: FLOOR_PLAN_OBJECT_TYPES.WAITING_AREA, icon: '▧' },
    ],
  },
  {
    id: 'decor',
    label: 'Decor',
    items: [
      { id: 'plant', label: 'Plant', type: FLOOR_PLAN_OBJECT_TYPES.PLANT, icon: '❧' },
      { id: 'artwork', label: 'Artwork', type: FLOOR_PLAN_OBJECT_TYPES.ARTWORK, icon: '◈' },
      { id: 'text', label: 'Text', type: FLOOR_PLAN_OBJECT_TYPES.TEXT, icon: 'T' },
    ],
  },
]
