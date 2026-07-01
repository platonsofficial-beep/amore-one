import { FLOOR_PLAN_OBJECT_TYPES, getObjectDisplayLabel } from '../models/floorPlanObject'

export function CanvasObjectNode({
  object,
  isSelected,
  onSelect,
}) {
  const shapeClass = object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
    ? ` shape-${object.properties.shape ?? 'round'}`
    : ''
  const label = getObjectDisplayLabel(object)

  return (
    <button
      type="button"
      className={`fpb-canvas-object type-${object.type}${shapeClass}${isSelected ? ' is-selected' : ''}`}
      style={{
        left: object.position.x,
        top: object.position.y,
        width: object.size.width,
        height: object.size.height,
        zIndex: object.zIndex,
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(object.id, event.shiftKey)
      }}
      aria-pressed={isSelected}
      aria-label={label}
    >
      <span className="fpb-canvas-object-label">{label}</span>
    </button>
  )
}
