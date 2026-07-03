import { createDefaultFloor } from '../models/floorWorkspace'

export function CanvasWorkspace({ workspace, title, onBackgroundPointerUp }) {
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
        onPointerUp={(event) => {
          if (event.button !== 0) return
          if (event.target !== event.currentTarget) return
          onBackgroundPointerUp?.(event)
        }}
      >
        <span className="fpb-canvas-workspace-label">{title}</span>
      </div>
    </div>
  )
}
