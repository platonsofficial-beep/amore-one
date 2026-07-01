import { memo } from 'react'
import { FLOOR_PLAN_OBJECT_TYPES, getObjectDisplayLabel } from '../models/floorPlanObject'

function CanvasObjectNodeComponent({
  object,
  isSelected,
  isDragging,
  activeTool,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) {
  const shapeClass = object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
    ? ` shape-${object.properties.shape ?? 'round'}`
    : ''
  const label = getObjectDisplayLabel(object)
  const isTable = object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
  const capacity = object.properties.capacity
  const isLocked = object.properties.locked === true
  const { position } = object

  return (
    <div
      className={`fpb-canvas-object type-${object.type}${shapeClass}${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${isLocked ? ' is-locked' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: object.size.width,
        height: object.size.height,
        zIndex: isDragging ? 20 : object.zIndex,
      }}
      onPointerDown={(event) => onPointerDown(event, object)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="button"
      tabIndex={-1}
      aria-pressed={isSelected}
      aria-label={label}
      data-tool={activeTool}
      data-object-id={object.id}
    >
      <div className="fpb-canvas-object-surface">
        <span className="fpb-canvas-object-label">{label}</span>
        {isTable && capacity ? (
          <span className="fpb-canvas-object-meta">{capacity} seats</span>
        ) : null}
      </div>

      {isSelected ? (
        <div className="fpb-selection-chrome" aria-hidden="true">
          <span className="fpb-handle fpb-handle-nw" />
          <span className="fpb-handle fpb-handle-n" />
          <span className="fpb-handle fpb-handle-ne" />
          <span className="fpb-handle fpb-handle-e" />
          <span className="fpb-handle fpb-handle-se" />
          <span className="fpb-handle fpb-handle-s" />
          <span className="fpb-handle fpb-handle-sw" />
          <span className="fpb-handle fpb-handle-w" />
          <span className="fpb-handle fpb-handle-rotate" />
        </div>
      ) : null}
    </div>
  )
}

function arePropsEqual(previous, next) {
  if (previous.isSelected !== next.isSelected) return false
  if (previous.isDragging !== next.isDragging) return false
  if (previous.activeTool !== next.activeTool) return false
  if (previous.object.id !== next.object.id) return false

  const { position } = next.object
  const { position: previousPosition } = previous.object
  if (previousPosition.x !== position.x || previousPosition.y !== position.y) return false

  return previous.object.rotation === next.object.rotation
    && previous.object.size.width === next.object.size.width
    && previous.object.size.height === next.object.size.height
    && previous.object.properties.tableNumber === next.object.properties.tableNumber
    && previous.object.properties.locked === next.object.properties.locked
}

export const CanvasObjectNode = memo(CanvasObjectNodeComponent, arePropsEqual)
