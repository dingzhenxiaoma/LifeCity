import { describe, expect, it } from 'vitest'
import { parseTileCatalog } from './tileCatalog'

describe('tile asset catalog', () => {
  it('keeps safe image and model entries and clamps their scale', () => {
    const catalog = parseTileCatalog({ schemaVersion: 1, tiles: {
      farm: { color: '#aabbcc', surface: 'surfaces/农田.png', model: 'features/farm.glb', scale: 4 },
      forest: { surface: '../outside.png', model: 'https://example.com/a.glb' },
    } })
    expect(catalog.tiles.farm).toEqual({ color: '#aabbcc', surface: 'surfaces/农田.png', model: 'features/farm.glb', scale: 1 })
    expect(catalog.tiles.forest).toEqual({})
  })
})
