import { describe, expect, it } from 'vitest'
import { hexCorners, hexToScreen, interpolateHexColumns, projectedHexHeight } from './hexGrid'

const metrics = { tileWidth: 64, tileHeight: 28 }

describe('hex grid geometry', () => {
  it('stacks rows and staggers odd columns', () => {
    expect(hexToScreen(0, 1, metrics)).toEqual({ x: 0, y: 28 })
    expect(hexToScreen(1, 0, metrics)).toEqual({ x: 48, y: 14 })
    expect(hexToScreen(2, 0, metrics)).toEqual({ x: 96, y: 0 })
  })

  it('creates a six-corner flat-top tile', () => {
    expect(hexCorners({ x: 0, y: 0 }, metrics)).toEqual([
      -32, 0, -16, -14, 16, -14, 32, 0, 16, 14, -16, 14,
    ])
  })

  it('interpolates smoothly between neighboring columns', () => {
    expect(interpolateHexColumns(0, 0, 0.5, metrics)).toEqual({ x: 24, y: 7 })
  })

  it('projects a regular hex according to camera pitch', () => {
    expect(projectedHexHeight(64, 30)).toBeCloseTo(27.713, 3)
    expect(projectedHexHeight(64, 50)).toBeGreaterThan(projectedHexHeight(64, 25))
  })
})
