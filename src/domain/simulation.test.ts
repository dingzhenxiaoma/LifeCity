import { describe, expect, it } from 'vitest'
import { createDemoActivities, createInitialCity, evolveCity } from './simulation'
import { classifyActivity } from './classifier'
import { isTileInMap } from './tiles'

describe('city simulation', () => {
  it('is deterministic for the same state and events', () => {
    const initial = createInitialCity(42)
    const events = createDemoActivities(1, new Date('2026-01-01T00:00:00Z'))
    expect(evolveCity(initial, events, 5)).toEqual(evolveCity(initial, events, 5))
  })

  it('does not count the same activity twice', () => {
    const events = createDemoActivities(1, new Date('2026-01-01T00:00:00Z'))
    const once = evolveCity(createInitialCity(), events, 2)
    const twice = evolveCity(once, events, 2)
    expect(twice.development).toEqual(once.development)
    expect(twice.buildings).toEqual(once.buildings)
  })

  it('consumes only the added duration when a native activity segment grows', () => {
    const initial = createInitialCity()
    const activity = {
      id: 'native-growing-event', source: 'native' as const, app: 'Code.exe',
      startedAt: '2026-01-01T00:00:00Z', durationSeconds: 60, kind: 'development' as const,
    }
    const first = evolveCity(initial, [activity])
    const second = evolveCity(first, [{ ...activity, durationSeconds: 180 }])
    const third = evolveCity(second, [{ ...activity, durationSeconds: 180 }])

    expect(first.development.development).toBe(60)
    expect(second.development.development).toBe(180)
    expect(third.development.development).toBe(180)
  })

  it('establishes a safe duration baseline when loading an old save', () => {
    const legacy = createInitialCity()
    legacy.processedActivityIds = ['legacy-event']
    delete legacy.processedActivityDurations
    const activity = {
      id: 'legacy-event', source: 'native' as const, app: 'Code.exe',
      startedAt: '2026-01-01T00:00:00Z', durationSeconds: 120, kind: 'development' as const,
    }

    const migrated = evolveCity(legacy, [activity])
    const next = evolveCity(migrated, [{ ...activity, durationSeconds: 180 }])

    expect(migrated.development.development).toBe(0)
    expect(next.development.development).toBe(60)
  })

  it('treats idle as rest rather than negative growth', () => {
    const initial = createInitialCity()
    const result = evolveCity(initial, [{
      id: 'idle-1', source: 'demo', app: 'AFK', startedAt: '2026-01-01T00:00:00Z', durationSeconds: 7200, kind: 'idle',
    }], 1)
    expect(result.buildings).toHaveLength(initial.buildings.length)
    expect(result.development.idle).toBe(7200)
  })

  it('moves legacy buildings from the old square corners into the circular map', () => {
    const city = createInitialCity()
    city.buildings.push({
      id: 'legacy-corner', kind: 'office', level: 1, x: 22, y: 21,
      name: '旧边角建筑', bornAt: '2026-01-01T00:00:00Z',
    })

    const next = evolveCity(city, [])

    expect(next.buildings.every((building) => isTileInMap(building.x, building.y))).toBe(true)
    expect(new Set(next.buildings.map((building) => `${building.x}:${building.y}`)).size).toBe(next.buildings.length)
  })

  it('can advance a distinct demo round after persisted events are restored', () => {
    const first = evolveCity(createInitialCity(), createDemoActivities(1), 4)
    const second = evolveCity(first, createDemoActivities(2), 4)
    expect(second.development.development).toBeGreaterThan(first.development.development)
    expect(second.processedActivityIds).toContain('demo-2-development')
  })

  it('grows different districts from coding and entertainment activity', () => {
    const at = '2026-01-01T00:00:00Z'
    const activities = [
      { id: 'vscode-session', source: 'demo' as const, app: 'Code.exe', startedAt: at, durationSeconds: 7200, kind: classifyActivity('Code.exe') },
      { id: 'steam-session', source: 'demo' as const, app: 'Steam.exe', startedAt: at, durationSeconds: 7200, kind: classifyActivity('Steam.exe') },
    ]
    const next = evolveCity(createInitialCity(), activities, 7)
    expect(next.buildings.some((building) => building.kind === 'development')).toBe(true)
    expect(next.buildings.some((building) => building.kind === 'gaming')).toBe(true)
  })
})
