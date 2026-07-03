import { memo } from 'react'
import { CanvasObjectNode } from './CanvasObjectNode'

function CanvasObjectsLayerComponent({
  objects,
  selectedObjectIds,
  draggingObjectId,
  transformingObjectId,
  activeTool,
  isEditable = true,
  onObjectPointerDown,
  onObjectPointerMove,
  onObjectPointerUp,
  onResizePointerDown,
  onRotatePointerDown,
}) {
  return objects.map((object) => (
    <CanvasObjectNode
      key={object.id}
      object={object}
      isSelected={selectedObjectIds.includes(object.id)}
      isDragging={draggingObjectId === object.id}
      isTransforming={transformingObjectId === object.id}
      activeTool={activeTool}
      isEditable={isEditable}
      onPointerDown={onObjectPointerDown}
      onPointerMove={onObjectPointerMove}
      onPointerUp={onObjectPointerUp}
      onResizePointerDown={onResizePointerDown}
      onRotatePointerDown={onRotatePointerDown}
    />
  ))
}

function areLayerPropsEqual(previous, next) {
  if (previous.draggingObjectId !== next.draggingObjectId) return false
  if (previous.transformingObjectId !== next.transformingObjectId) return false
  if (previous.isEditable !== next.isEditable) return false
  if (previous.activeTool !== next.activeTool) return false
  if (previous.objects !== next.objects) return false
  if (previous.selectedObjectIds !== next.selectedObjectIds) return false
  return true
}

export const CanvasObjectsLayer = memo(CanvasObjectsLayerComponent, areLayerPropsEqual)
