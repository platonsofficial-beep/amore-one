import { createDefaultFloor } from '../models/floorWorkspace'

export function CanvasWorkspace({ workspace, title, onBackgroundClick }) {
  const floor = {
    ...createDefaultFloor(),
    ...workspace,
  }

  return (
    <div
      className="fpb-canvas-workspace"
      style={{
        left: floor.x,
        top: floor.y,
        width: floor.width,
        height: floor.height,
      }}
      role="presentation"
    >
      <div
        className="fpb-canvas-workspace-surface"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onBackgroundClick?.(event)
          }
        }}
      >
        <span className="fpb-canvas-workspace-label">{title}</span>
      </div>
    </div>
  )
}
