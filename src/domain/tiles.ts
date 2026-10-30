import type { CityState } from './types'

export type TileKind = 'grassland' | 'plains' | 'farm' | 'forest' | 'hills' | 'water' | 'settlement'
export type Tile = { column: number; row: number; kind: TileKind }

export const TILE_COLUMNS = 26
export const TILE_ROWS = 26
export const MAP_RADIUS = 19.5

export function tileWorldPosition(column: number, row: number): { x: number; z: number } {
  return {
    x: (column - 12.5) * 1.5,
    z: (row - 12.5 + (column % 2) * 0.5) * Math.sqrt(3),
  }
}

export function isTileInMap(column: number, row: number): boolean {
  if (column < 0 || column >= TILE_COLUMNS || row < 0 || row >= TILE_ROWS) return false
  const { x, z } = tileWorldPosition(column, row)
  return Math.hypot(x, z) <= MAP_RADIUS
}

/** Each improvement belongs to one hex; a building always takes precedence. */
export function createTiles(city: CityState): Tile[] {
  const occupied = new Set(city.buildings.map((building) => `${building.x}:${building.y}`))
  const tiles: Tile[] = []
  for (let row = 0; row < TILE_ROWS; row++) for (let column = 0; column < TILE_COLUMNS; column++) {
    if (!isTileInMap(column, row)) continue
    const { x, z } = tileWorldPosition(column, row)
    const climate = Math.sin(x * 0.37 + city.seed * 0.0001) + Math.cos(z * 0.29 - x * 0.13)
    const farmCluster =
      ((x + 6) / 5.5) ** 2 + ((z + 3) / 4.2) ** 2 < 1 ||
      ((x - 8) / 4.8) ** 2 + ((z - 3) / 4.5) ** 2 < 1 ||
      ((x - 1) / 4.5) ** 2 + ((z - 10) / 3.8) ** 2 < 1
    let kind: TileKind = 'grassland'
    if (z > 14 + 2 * Math.sin(x * 0.25) && x < 7) kind = 'water'
    else if (farmCluster) kind = 'farm'
    else if (climate > 1.05) kind = 'forest'
    else if (climate < -1.05) kind = 'hills'
    else if (climate > 0.1) kind = 'plains'
    if (occupied.has(`${column}:${row}`)) kind = 'settlement'
    tiles.push({ column, row, kind })
  }
  return tiles
}
