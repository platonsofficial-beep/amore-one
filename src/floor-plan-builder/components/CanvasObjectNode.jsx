import { memo } from 'react'
import { FLOOR_PLAN_OBJECT_TYPES, formatBuilderTableLabel } from '../models/floorPlanObject'

const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw']

function CanvasObjectNodeComponent({
  object,
  isSelected,
  showTransformChrome = false,
  isDragging,
  isTransforming,
  activeTool,
  isEditable = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizePointerDown,
  onRotatePointerDown,
}) {
  if (!object?.id) return null

  const properties = object.properties ?? {}
  const position = object.position ?? { x: 0, y: 0 }
  const size = object.size ?? { width: 80, height: 80 }
  const shapeClass = object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
    ? ` shape-${properties.shape ?? 'round'}`
    : ''
  const label = formatBuilderTableLabel(object)
  const isTable = object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
  const capacity = Math.max(0, Number(properties.capacity) || 0)
  const isLocked = properties.locked === true
  const rotation = object.rotation ?? 0
  const minDimension = Math.min(size.width, size.height)
  const labelDensity = minDimension < 96
    ? 'compact'
    : minDimension < 128
      ? 'cozy'
      : 'normal'

  return (
    <div
      className={`fpb-canvas-object type-${object.type}${shapeClass}${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${isTransforming ? ' is-transforming' : ''}${isLocked ? ' is-locked' : ''}${labelDensity !== 'normal' ? ` is-label-${labelDensity}` : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        zIndex: isDragging || isTransforming ? 20 : object.zIndex,
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        onPointerDown(event, object)
      }}
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
        <span className="fpb-canvas-object-label" title={label}>{label}</span>
        {isTable && labelDensity === 'normal' ? (
          <span className="fpb-canvas-object-meta">{capacity} guests</span>
        ) : null}
      </div>

      {showTransformChrome && isTable && isEditable ? (
        <div className="fpb-selection-chrome" aria-hidden="true">
          {CORNER_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`fpb-handle fpb-handle-${handle}`}
              tabIndex={-1}
              aria-label={`Resize ${handle} corner`}
              onPointerDown={(event) => onResizePointerDown?.(event, object, handle)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          ))}
          <span className="fpb-rotate-stem" />
          <button
            type="button"
            className="fpb-handle fpb-handle-rotate"
            tabIndex={-1}
            aria-label="Rotate table"
            onPointerDown={(event) => onRotatePointerDown?.(event, object)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      ) : null}
    </div>
  )
}

function arePropsEqual(previous, next) {
  if (previous.isSelected !== next.isSelected) return false
  if (previous.showTransformChrome !== next.showTransformChrome) return false
  if (previous.isDragging !== next.isDragging) return false
  if (previous.isTransforming !== next.isTransforming) return false
  if (previous.isEditable !== next.isEditable) return false
  if (previous.activeTool !== next.activeTool) return false
  if (previous.object.id !== next.object.id) return false

  const { position } = next.object
  const { position: previousPosition } = previous.object
  const nextSize = next.object.size ?? {}
  const previousSize = previous.object.size ?? {}
  const nextProperties = next.object.properties ?? {}
  const previousProperties = previous.object.properties ?? {}
  if (!previousPosition || !position) return false
  if (previousPosition.x !== position.x || previousPosition.y !== position.y) return false

  return previous.object.rotation === next.object.rotation
    && previousSize.width === nextSize.width
    && previousSize.height === nextSize.height
    && previousProperties.tableNumber === nextProperties.tableNumber
    && previousProperties.capacity === nextProperties.capacity
    && previousProperties.shape === nextProperties.shape
    && previousProperties.locked === nextProperties.locked
}

export const CanvasObjectNode = memo(CanvasObjectNodeComponent, arePropsEqual)
