import { WORLD_GRID_EXTENT, WORLD_GRID_ORIGIN } from '../lib/world'
import { CanvasObjectsLayer } from './CanvasObjectsLayer'
import { CanvasWorkspace } from './CanvasWorkspace'

export function CanvasWorld({
  floor,
  floorLabel,
  objects,
  selectedObjectIds,
  draggingObjectId,
  activeTool,
  gridEnabled,
  onFloorBackgroundClick,
  onObjectPointerDown,
  onObjectPointerMove,
  onObjectPointerUp,
}) {
  return (
    <div className="fpb-world-root" role="presentation">
      {gridEnabled ? (
        <div
          className="fpb-world-grid"
          style={{
            left: WORLD_GRID_ORIGIN,
            top: WORLD_GRID_ORIGIN,
            width: WORLD_GRID_EXTENT,
            height: WORLD_GRID_EXTENT,
          }}
          aria-hidden="true"
        />
      ) : null}

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
