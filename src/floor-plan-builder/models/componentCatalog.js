import { FLOOR_PLAN_OBJECT_TYPES } from './floorPlanObject'

export const BUILDER_COMPONENT_CATEGORIES = [
  {
    id: 'tables',
    label: 'Tables',
    items: [
      { id: 'round-table', label: 'Round Table', type: FLOOR_PLAN_OBJECT_TYPES.TABLE, icon: '○', preview: 'round' },
      { id: 'square-table', label: 'Square Table', type: FLOOR_PLAN_OBJECT_TYPES.TABLE, icon: '□', preview: 'square' },
      { id: 'rectangle-table', label: 'Rectangle Table', type: FLOOR_PLAN_OBJECT_TYPES.TABLE, icon: '▭', preview: 'rectangle' },
    ],
  },
  {
    id: 'furniture',
    label: 'Furniture',
    items: [
      { id: 'chair', label: 'Chair', type: FLOOR_PLAN_OBJECT_TYPES.CHAIR, icon: '◦', preview: 'chair' },
      { id: 'sofa', label: 'Sofa', type: FLOOR_PLAN_OBJECT_TYPES.SOFA, icon: '▬', preview: 'sofa' },
      { id: 'bar-stool', label: 'Bar Stool', type: FLOOR_PLAN_OBJECT_TYPES.BAR_STOOL, icon: '◎', preview: 'stool' },
    ],
  },
  {
    id: 'structure',
    label: 'Structure',
    items: [
      { id: 'wall', label: 'Wall', type: FLOOR_PLAN_OBJECT_TYPES.WALL, icon: '━', preview: 'wall' },
      { id: 'divider', label: 'Divider', type: FLOOR_PLAN_OBJECT_TYPES.DIVIDER, icon: '─', preview: 'divider' },
      { id: 'door', label: 'Door', type: FLOOR_PLAN_OBJECT_TYPES.DOOR, icon: '⌁', preview: 'door' },
      { id: 'window', label: 'Window', type: FLOOR_PLAN_OBJECT_TYPES.WINDOW, icon: '▭', preview: 'window' },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities',
    items: [
      { id: 'bar', label: 'Bar', type: FLOOR_PLAN_OBJECT_TYPES.BAR, icon: '▣', preview: 'bar' },
      { id: 'kitchen', label: 'Kitchen', type: FLOOR_PLAN_OBJECT_TYPES.KITCHEN, icon: '▦', preview: 'kitchen' },
      { id: 'host-desk', label: 'Host Desk', type: FLOOR_PLAN_OBJECT_TYPES.HOST_DESK, icon: '▤', preview: 'desk' },
      { id: 'waiting-area', label: 'Waiting Area', type: FLOOR_PLAN_OBJECT_TYPES.WAITING_AREA, icon: '▧', preview: 'zone' },
    ],
  },
  {
    id: 'decor',
    label: 'Decor',
    items: [
      { id: 'plant', label: 'Plant', type: FLOOR_PLAN_OBJECT_TYPES.PLANT, icon: '❧', preview: 'plant' },
      { id: 'artwork', label: 'Artwork', type: FLOOR_PLAN_OBJECT_TYPES.ARTWORK, icon: '◈', preview: 'art' },
      { id: 'text', label: 'Text', type: FLOOR_PLAN_OBJECT_TYPES.TEXT, icon: 'T', preview: 'text' },
    ],
  },
]
