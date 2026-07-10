import { worldToScreen } from './camera'
import { getTableHandleMetrics } from './tableHandleMetrics'

/** Handle + chrome geometry in workspace units (same space as object.size). */

export function getSelectionHandleCenters(size = { width: 0, height: 0 }) {
  const minDimension = Math.min(size.width, size.height)
  const { chromeInset, handleSize } = getTableHandleMetrics(minDimension)
  const left = -chromeInset
  const right = size.width + chromeInset
  const top = -chromeInset
  const bottom = size.height + chromeInset

  return {
    chromeInset,
    handleSize,
    nw: { x: left, y: top },
    ne: { x: right, y: top },
    se: { x: right, y: bottom },
    sw: { x: left, y: bottom },
  }
}

export function getHandleScreenOffsetFromTableCorner({
  tablePosition,
  handleCenter,
  camera,
  viewportSize,
}) {
  const tableCornerScreen = worldToScreen(tablePosition, camera, viewportSize)
  const handleScreen = worldToScreen(
    {
      x: tablePosition.x + handleCenter.x,
      y: tablePosition.y + handleCenter.y,
    },
    camera,
    viewportSize,
  )

  return {
    x: handleScreen.x - tableCornerScreen.x,
    y: handleScreen.y - tableCornerScreen.y,
  }
}
