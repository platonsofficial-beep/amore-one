/**
 * Shared layout math for published Builder tables.
 * Host reservations render the same center point, size, and rotation
 * that builderToHostLayout derives from Builder object.position/size.
 */
export function getPublishedTableLayoutStyle(table) {
  const x = Number(table?.x)
  const y = Number(table?.y)
  const widthPercent = Number(table?.widthPercent)
  const heightPercent = Number(table?.heightPercent ?? table?.widthPercent)
  const rotation = Number(table?.rotation) || 0
  const hasPublishedSize = Number.isFinite(widthPercent) && widthPercent > 0
    && Number.isFinite(heightPercent) && heightPercent > 0

  const style = {
    left: `${x}%`,
    top: `${y}%`,
  }

  if (hasPublishedSize) {
    style['--floor-table-width'] = `${widthPercent}%`
    style['--floor-table-height'] = `${heightPercent}%`
  }

  if (rotation) {
    style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`
  }

  return {
    style,
    hasPublishedSize,
  }
}

export function getFloorLayoutSpaceStyle(zone) {
  const width = Number(zone?.workspaceWidth) || 2200
  const height = Number(zone?.workspaceHeight) || 1400

  return {
    '--floor-aspect-ratio': `${width} / ${height}`,
  }
}
