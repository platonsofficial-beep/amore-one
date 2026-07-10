import { CanvasObjectsLayer } from './CanvasObjectsLayer'
import { CanvasWorkspace } from './CanvasWorkspace'

export function CanvasWorld({
  floor,
  floorLabel,
  objects,
  selectedTableIds,
  draggingObjectId,
  transformingObjectId,
  activeTool,
  isEditable = true,
  cameraZoom = 1,
  onFloorBackgroundPointerUp,
  onObjectPointerDown,
  onObjectPointerMove,
  onObjectPointerUp,
  onResizePointerDown,
  onRotatePointerDown,
}) {
  return (
    <div className="fpb-world-root" role="presentation">
      <CanvasWorkspace
        workspace={floor}
        title={floorLabel}
        onBackgroundPointerUp={onFloorBackgroundPointerUp}
      />

      <div className="fpb-objects-layer">
        <CanvasObjectsLayer
          objects={objects}
          selectedTableIds={selectedTableIds}
          draggingObjectId={draggingObjectId}
          transformingObjectId={transformingObjectId}
          activeTool={activeTool}
          isEditable={isEditable}
          cameraZoom={cameraZoom}
          onObjectPointerDown={onObjectPointerDown}
          onObjectPointerMove={onObjectPointerMove}
          onObjectPointerUp={onObjectPointerUp}
          onResizePointerDown={onResizePointerDown}
          onRotatePointerDown={onRotatePointerDown}
        />
      </div>
    </div>
  )
}
