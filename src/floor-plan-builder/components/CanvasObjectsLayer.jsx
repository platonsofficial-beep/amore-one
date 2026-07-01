import { memo } from 'react'
import { CanvasObjectNode } from './CanvasObjectNode'

function CanvasObjectsLayerComponent({
  objects,
  selectedObjectIds,
  draggingObjectId,
  activeTool,
  onObjectPointerDown,
  onObjectPointerMove,
  onObjectPointerUp,
}) {
  return objects.map((object) => (
    <CanvasObjectNode
      key={object.id}
      object={object}
      isSelected={selectedObjectIds.includes(object.id)}
      isDragging={draggingObjectId === object.id}
      activeTool={activeTool}
      onPointerDown={onObjectPointerDown}
      onPointerMove={onObjectPointerMove}
      onPointerUp={onObjectPointerUp}
    />
  ))
}

function areLayerPropsEqual(previous, next) {
  if (previous.draggingObjectId !== next.draggingObjectId) return false
  if (previous.activeTool !== next.activeTool) return false
  if (previous.objects !== next.objects) return false
  if (previous.selectedObjectIds !== next.selectedObjectIds) return false
  return true
}

export const CanvasObjectsLayer = memo(CanvasObjectsLayerComponent, areLayerPropsEqual)
