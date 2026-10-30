export type HexMetrics = { tileWidth: number; tileHeight: number }
export type ScreenPoint = { x: number; y: number }

/**
 * Converts odd-q offset coordinates to screen coordinates for a flat-top hex grid.
 * Keeping integer column/row coordinates preserves existing LifeCity save files.
 */
export function hexToScreen(column: number, row: number, metrics: HexMetrics): ScreenPoint {
  return {
    x: column * metrics.tileWidth * 0.75,
    y: row * metrics.tileHeight + (Math.abs(column) % 2) * metrics.tileHeight / 2,
  }
}

export function hexCorners(center: ScreenPoint, metrics: HexMetrics): number[] {
  const halfWidth = metrics.tileWidth / 2
  const quarterWidth = metrics.tileWidth / 4
  const halfHeight = metrics.tileHeight / 2
  return [
    center.x - halfWidth, center.y,
    center.x - quarterWidth, center.y - halfHeight,
    center.x + quarterWidth, center.y - halfHeight,
    center.x + halfWidth, center.y,
    center.x + quarterWidth, center.y + halfHeight,
    center.x - quarterWidth, center.y + halfHeight,
  ]
}

export function interpolateHexColumns(column: number, row: number, progress: number, metrics: HexMetrics): ScreenPoint {
  const from = hexToScreen(column, row, metrics)
  const to = hexToScreen(column + 1, row, metrics)
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

export function projectedHexHeight(tileWidth: number, viewAngleDegrees: number): number {
  const angle = viewAngleDegrees * Math.PI / 180
  return tileWidth * Math.sqrt(3) / 2 * Math.sin(angle)
}
