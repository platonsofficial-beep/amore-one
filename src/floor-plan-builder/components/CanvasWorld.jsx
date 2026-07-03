import { CanvasObjectsLayer } from './CanvasObjectsLayer'
import { CanvasWorkspace } from './CanvasWorkspace'

export function CanvasWorld({
  floor,
  floorLabel,
  objects,
  selectedObjectIds,
  draggingObjectId,
  activeTool,
  onFloorBackgroundClick,
  onObjectPointerDown,
  onObjectPointerMove,
  onObjectPointerUp,
}) {
  return (
    <div className="fpb-world-root" role="presentation">
      <CanvasWorkspace
        workspace={floor}
        title={floorLabel}
        onBackgroundClick={onFloorBackgroundClick}
      />

      <CanvasObjectsLayer
        objects={objects}
        selectedObjectIds={selectedObjectIds}
        draggingObjectId={draggingObjectId}
        activeTool={activeTool}
        onObjectPointerDown={onObjectPointerDown}
        onObjectPointerMove={onObjectPointerMove}
        onObjectPointerUp={onObjectPointerUp}
      />
    </div>
  )
}
