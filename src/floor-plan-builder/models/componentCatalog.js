import { FLOOR_PLAN_OBJECT_TYPES } from './floorPlanObject'
import { t } from '../../i18n/i18n'

export const TABLE_TYPES = [
  {
    id: 'round-table',
    label: t("Round Table"),
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'round',
    icon: '○',
    preview: 'round',
  },
  {
    id: 'square-table',
    label: t("Square Table"),
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'square',
    icon: '□',
    preview: 'square',
  },
  {
    id: 'rectangle-table',
    label: t("Rectangle Table"),
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'rectangle',
    icon: '▭',
    preview: 'rectangle',
  },
  {
    id: 'island-table',
    label: t("Island / Lounge"),
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    shape: 'island',
    icon: '⬭',
    preview: 'island',
  },
]
