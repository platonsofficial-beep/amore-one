import { memo } from 'react'
import { FLOOR_PLAN_OBJECT_TYPES, formatBuilderTableLabel, formatTableGuestRangeLabel } from '../models/floorPlanObject'
import { getTableHandleMetrics } from '../lib/tableHandleMetrics'

const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw']

function CanvasObjectNodeComponent({
  object,
  isSelected,
  showTransformChrome = false,
  isDragging,
  isTransforming,
  activeTool,
  isEditable = true,
  cameraZoom = 1,
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
  const guestLabel = isTable
    ? formatTableGuestRangeLabel(properties, properties.shape ?? 'round')
    : ''
  const isLocked = properties.locked === true
  const rotation = object.rotation ?? 0
  const minDimension = Math.min(size.width, size.height)
  const labelDensity = minDimension < 96
    ? 'compact'
    : minDimension < 128
      ? 'cozy'
      : 'normal'
  const isDirectManipulation = isDragging || isTransforming
  const { handleSize, chromeInset } = getTableHandleMetrics(minDimension)

  return (
    <div
      className={`fpb-canvas-object type-${object.type}${shapeClass}${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${isTransforming ? ' is-transforming' : ''}${isLocked ? ' is-locked' : ''}${labelDensity !== 'normal' ? ` is-label-${labelDensity}` : ''}${isEditable ? ' is-editable' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: isDragging || isTransforming ? 20 : object.zIndex,
        touchAction: isEditable ? 'none' : 'auto',
        '--fpb-handle-size': `${handleSize}px`,
        '--fpb-selection-chrome-inset': `-${chromeInset}px`,
      }}
      data-camera-zoom={cameraZoom}
      onPointerDown={(event) => {
        if (event.target.closest('.fpb-handle')) return
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
      <div
        data-fpb-object-body
        className="fpb-canvas-object-body"
        style={{
          transform: isDirectManipulation ? undefined : `rotate(${rotation}deg)`,
        }}
      >
        <div className="fpb-canvas-object-surface">
          <span className="fpb-canvas-object-label" title={label}>{label}</span>
          {isTable && labelDensity === 'normal' ? (
            <span className="fpb-canvas-object-meta">{guestLabel}</span>
          ) : null}
        </div>

        {showTransformChrome && isTable && isEditable ? (
          <div
            className="fpb-selection-chrome"
            aria-hidden="true"
            style={{ pointerEvents: isDragging ? 'none' : undefined }}
          >
            {CORNER_HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                className={`fpb-handle fpb-handle-${handle}`}
                tabIndex={-1}
                aria-label={`Resize ${handle} corner`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onResizePointerDown?.(event, object, handle)
                }}
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
              onPointerDown={(event) => {
                event.stopPropagation()
                onRotatePointerDown?.(event, object)
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
        ) : null}
      </div>
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
  if (previous.cameraZoom !== next.cameraZoom) return false
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
    && previousProperties.minGuests === nextProperties.minGuests
    && previousProperties.maxGuests === nextProperties.maxGuests
    && previousProperties.capacity === nextProperties.capacity
    && previousProperties.shape === nextProperties.shape
    && previousProperties.locked === nextProperties.locked
}

export const CanvasObjectNode = memo(CanvasObjectNodeComponent, arePropsEqual)
