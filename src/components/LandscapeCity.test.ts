import { describe, expect, it } from 'vitest'
import { createTiles } from '../domain/tiles'
import { createInitialCity } from '../domain/simulation'
import { sceneIdentity, terrainGeometry } from './LandscapeCity'

describe('LandscapeCity terrain geometry', () => {
  it('keeps the scene through activity updates and rebuilds it for building changes', () => {
    const city = createInitialCity()
    const original = sceneIdentity(city)
    city.development.development += 60
    city.growthBank.development += 5
    expect(sceneIdentity(city)).toBe(original)
    city.buildings[0].level += 1
    expect(sceneIdentity(city)).not.toBe(original)
  })

  it('builds the visible surface exclusively from hex tiles', () => {
    const tiles = createTiles(createInitialCity())
    const geometry = terrainGeometry(tiles)

    expect(tiles.length).toBeLessThan(26 * 26)
    expect(geometry.getAttribute('position').count).toBe(tiles.length * 7)
    expect(geometry.getIndex()?.count).toBe(tiles.length * 6 * 3)

    geometry.dispose()
  })
})
