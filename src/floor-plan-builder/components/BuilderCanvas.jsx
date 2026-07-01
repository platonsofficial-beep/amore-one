import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { BUILDER_ARTBOARD } from '../models/floorPlanObject'
import { CanvasObjectNode } from './CanvasObjectNode'

export function BuilderCanvas({ containerRef, viewportControls }) {
  const { state, dispatch, visibleObjects } = useFloorPlanBuilder()

  const handleCanvasBackgroundClick = () => {
    dispatch({ type: 'CLEAR_SELECTION' })
  }

  const handlePointerDownWithCursor = (event) => {
    if (viewportControls.isSpacePressed()) {
      event.currentTarget.classList.add('is-panning')
    }
    viewportControls.handlePointerDown(event)
  }

  const handlePointerUpWithCursor = (event) => {
    event.currentTarget.classList.remove('is-panning')
    viewportControls.handlePointerUp(event)
  }

  return (
    <section
      className="fpb-canvas-shell"
      aria-label="Layout canvas"
      data-grid-enabled={state.settings.gridEnabled ? 'true' : 'false'}
    >
      <div
        ref={containerRef}
        className="fpb-canvas-viewport"
        onPointerDown={handlePointerDownWithCursor}
        onPointerMove={viewportControls.handlePointerMove}
        onPointerUp={handlePointerUpWithCursor}
        onPointerLeave={handlePointerUpWithCursor}
        onClick={handleCanvasBackgroundClick}
      >
        <div
          className="fpb-canvas-stage"
          style={{
            transform: `translate(${state.viewport.panX}px, ${state.viewport.panY}px) scale(${state.viewport.zoom})`,
          }}
        >
          <div
            className="fpb-canvas-artboard"
            style={{
              width: BUILDER_ARTBOARD.width,
              height: BUILDER_ARTBOARD.height,
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                dispatch({ type: 'CLEAR_SELECTION' })
              }
            }}
            role="presentation"
          >
            {visibleObjects.map((object) => (
              <CanvasObjectNode
                key={object.id}
                object={object}
                isSelected={state.selectedObjectIds.includes(object.id)}
                onSelect={(objectId, append) => dispatch({
                  type: 'SELECT_OBJECT',
                  payload: { objectId, append },
                })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="fpb-canvas-hint" aria-hidden="true">
        Space + drag or middle mouse to pan · Scroll to zoom
      </div>
    </section>
  )
}
