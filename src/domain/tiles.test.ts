import { describe, expect, it } from 'vitest'
import { createInitialCity } from './simulation'
import { createTiles, isTileInMap, MAP_RADIUS, tileWorldPosition, TILE_COLUMNS, TILE_ROWS } from './tiles'

describe('tile ownership', () => {
  it('assigns one type per hex and reserves building hexes', () => {
    const city = createInitialCity()
    city.buildings.push({ ...city.buildings[0], id: 'farm-site', x: 8, y: 10 })
    const tiles = createTiles(city)
    expect(tiles.length).toBeLessThan(TILE_COLUMNS * TILE_ROWS)
    expect(tiles.length).toBeGreaterThan(400)
    expect(new Set(tiles.map((tile) => `${tile.column}:${tile.row}`)).size).toBe(tiles.length)
    for (const tile of tiles) {
      const { x, z } = tileWorldPosition(tile.column, tile.row)
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(MAP_RADIUS)
      expect(isTileInMap(tile.column, tile.row)).toBe(true)
    }
    for (const building of city.buildings) {
      expect(tiles.find((tile) => tile.column === building.x && tile.row === building.y)?.kind).toBe('settlement')
    }
    expect(tiles.some((tile) => tile.kind === 'farm')).toBe(true)
  })
})
