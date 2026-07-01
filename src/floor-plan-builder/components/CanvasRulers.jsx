import { useMemo } from 'react'
import { getRulerTicks } from '../lib/camera'

const RULER_SIZE = 24
const HORIZONTAL_LABEL_RESERVE = 28
const VERTICAL_LABEL_RESERVE = 24

function isHorizontalTickVisible(screenPos, viewportWidth) {
  return screenPos >= 0 && screenPos <= viewportWidth - HORIZONTAL_LABEL_RESERVE
}

function isVerticalTickVisible(screenPos, viewportHeight) {
  return screenPos >= 0 && screenPos <= viewportHeight - VERTICAL_LABEL_RESERVE
}

export function CanvasRulers({ camera, viewportWidth, viewportHeight }) {
  const horizontalTicks = useMemo(() => (
    getRulerTicks(camera.x, camera.zoom, viewportWidth)
      .filter((tick) => isHorizontalTickVisible(tick.screenPos, viewportWidth))
  ), [camera.x, camera.zoom, viewportWidth])

  const verticalTicks = useMemo(() => (
    getRulerTicks(camera.y, camera.zoom, viewportHeight)
      .filter((tick) => isVerticalTickVisible(tick.screenPos, viewportHeight))
  ), [camera.y, camera.zoom, viewportHeight])

  return (
    <>
      <div className="fpb-ruler-corner" aria-hidden="true" />
      <div className="fpb-ruler fpb-ruler-horizontal" aria-hidden="true">
        {horizontalTicks.map((tick) => (
          <span
            key={`h-${tick.value}`}
            className="fpb-ruler-tick"
            style={{ left: tick.screenPos }}
          >
            <span className="fpb-ruler-tick-mark" />
            <span className="fpb-ruler-tick-label">{tick.value}</span>
          </span>
        ))}
      </div>
      <div className="fpb-ruler fpb-ruler-vertical" aria-hidden="true">
        {verticalTicks.map((tick) => (
          <span
            key={`v-${tick.value}`}
            className="fpb-ruler-tick"
            style={{ top: tick.screenPos }}
          >
            <span className="fpb-ruler-tick-mark" />
            <span className="fpb-ruler-tick-label">{tick.value}</span>
          </span>
        ))}
      </div>
    </>
  )
}

export const CANVAS_RULER_SIZE = RULER_SIZE
