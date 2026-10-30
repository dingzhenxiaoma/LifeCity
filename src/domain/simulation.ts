import type { ActivityKind, ActivitySlice, Building, BuildingKind, CityState, DistrictStats } from './types'
import { activityKinds, kindLabels } from './types'
import { isTileInMap } from './tiles'

const BUILDABLE = ['development', 'gaming', 'office', 'learning', 'media', 'creative'] as const
const BUILDABLE_SET = new Set<ActivityKind>(BUILDABLE)
const LOTS = [
  [4, 4], [7, 4], [10, 4], [13, 4], [16, 4], [20, 5],
  [4, 8], [7, 8], [10, 8], [14, 8], [17, 8], [20, 9],
  [4, 12], [8, 12], [11, 12], [14, 12], [18, 12], [21, 13],
  [5, 16], [8, 16], [12, 16], [15, 16], [18, 16], [21, 17],
  [4, 20], [8, 20], [11, 20], [15, 20], [19, 20], [22, 13],
] as const

function emptyStats(): DistrictStats {
  return Object.fromEntries(activityKinds.map((kind) => [kind, 0])) as DistrictStats
}

function hash(value: string, seed: number): number {
  let result = seed | 0
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619)
  return result >>> 0
}

export function createInitialCity(seed = 20261029): CityState {
  return {
    version: 1,
    seed,
    day: 1,
    population: 18,
    development: emptyStats(),
    growthBank: emptyStats(),
    buildings: [
      { id: 'town-hall', kind: 'residential', level: 1, x: 12, y: 10, name: '初光公寓', bornAt: new Date(0).toISOString() },
    ],
    processedActivityIds: [],
    processedActivityDurations: {},
    events: [],
    lastActivityAt: null,
  }
}

function synergy(kind: ActivityKind, stats: DistrictStats): number {
  const minutes = (target: ActivityKind) => stats[target] / 60
  const pairs: Partial<Record<ActivityKind, ActivityKind[]>> = {
    development: ['learning', 'office'],
    gaming: ['media', 'creative'],
    office: ['development', 'learning'],
    learning: ['development', 'creative'],
    media: ['creative', 'gaming'],
    creative: ['media', 'learning'],
  }
  const neighbors = pairs[kind] ?? []
  const support = neighbors.reduce((sum, item) => sum + Math.log1p(minutes(item) / 45), 0)
  return 1 + Math.min(0.28, support * 0.035)
}

function growthYield(seconds: number, acceleration: number): number {
  const minutes = Math.max(0, seconds) / 60
  return Math.log1p(minutes / 4) * 11 * acceleration
}

function threshold(level: number): number {
  return 24 + level * level * 11
}

function chooseLot(state: CityState, kind: BuildingKind, index: number): readonly [number, number] {
  const occupied = new Set(state.buildings.map((building) => `${building.x}:${building.y}`))
  const start = hash(`${kind}:${index}`, state.seed) % LOTS.length
  for (let offset = 0; offset < LOTS.length; offset += 1) {
    const lot = LOTS[(start + offset) % LOTS.length]
    if (!occupied.has(`${lot[0]}:${lot[1]}`)) return lot
  }
  return [3 + (index * 3) % 20, 23]
}

function buildingName(kind: BuildingKind, ordinal: number): string {
  const names: Record<BuildingKind, string[]> = {
    development: ['云端工坊', '蓝栈研发所', '星环数据塔'],
    gaming: ['霓虹电玩社', '像素乐园', '银河剧场'],
    office: ['晨光商社', '金叶写字楼', '都会中心'],
    learning: ['风铃图书馆', '知行学舍', '群星研究院'],
    media: ['回声影院', '月台音乐厅', '流光文化馆'],
    creative: ['彩屿画室', '造物工坊', '灵感美术馆'],
    residential: ['暖灯公寓', '晴岚社区', '栖木花园'],
  }
  const choices = names[kind]
  return choices[ordinal % choices.length]
}

export function evolveCity(
  previous: CityState,
  activities: ActivitySlice[],
  acceleration = 1,
): CityState {
  const state = structuredClone(previous)
  for (const [index, building] of state.buildings.entries()) {
    if (isTileInMap(building.x, building.y)) continue
    const [x, y] = chooseLot(state, building.kind, index)
    building.x = x
    building.y = y
  }
  const processed = new Set(state.processedActivityIds)
  const processedDurations = { ...(state.processedActivityDurations ?? {}) }
  const ordered = activities
    .filter((activity) => activity.durationSeconds > 0)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))

  for (const activity of ordered) {
    const recordedDuration = processedDurations[activity.id]
    // Old saves only know that an event was consumed, not how much of its mutable
    // duration was consumed. Establish a baseline once so upgrading does not
    // double-count historical activity; later polls can then consume the delta.
    if (recordedDuration === undefined && processed.has(activity.id)) {
      processedDurations[activity.id] = activity.durationSeconds
      continue
    }

    const previousDuration = recordedDuration ?? 0
    const currentDuration = Math.max(previousDuration, activity.durationSeconds)
    const addedDuration = currentDuration - previousDuration
    if (addedDuration <= 0) continue

    state.development[activity.kind] += addedDuration
    if (BUILDABLE_SET.has(activity.kind)) {
      const addedGrowth = growthYield(currentDuration, acceleration) - growthYield(previousDuration, acceleration)
      state.growthBank[activity.kind] += addedGrowth
        * synergy(activity.kind, state.development)
    }
    processedDurations[activity.id] = currentDuration
    processed.add(activity.id)
    state.lastActivityAt = activity.startedAt
  }

  for (const kind of BUILDABLE) {
    let buildings = state.buildings.filter((building) => building.kind === kind)
    let strongest = [...buildings].sort((a, b) => b.level - a.level)[0]
    while (state.growthBank[kind] >= threshold(strongest?.level ?? 0)) {
      state.growthBank[kind] -= threshold(strongest?.level ?? 0)
      const shouldUpgrade = strongest && (strongest.level < 3 || state.buildings.length >= LOTS.length)
      if (shouldUpgrade) {
        strongest.level += 1
        state.events.unshift({
          id: `upgrade-${strongest.id}-${strongest.level}`,
          at: state.lastActivityAt ?? new Date().toISOString(),
          title: `${strongest.name}升到 ${strongest.level} 级`,
          description: `${kindLabels[kind]}城区因持续活动焕发了新的光彩。`,
          kind,
        })
      } else {
        const ordinal = buildings.length
        const [x, y] = chooseLot(state, kind, ordinal)
        const building: Building = {
          id: `${kind}-${hash(`${kind}:${ordinal}`, state.seed).toString(36)}`,
          kind,
          level: 1,
          x,
          y,
          name: buildingName(kind, ordinal),
          bornAt: state.lastActivityAt ?? new Date().toISOString(),
        }
        state.buildings.push(building)
        buildings = [...buildings, building]
        strongest = building
        state.events.unshift({
          id: `build-${building.id}`,
          at: building.bornAt,
          title: `${building.name}落成`,
          description: `${kindLabels[kind]}城区迎来了新的地标。`,
          kind,
        })
      }
    }
  }

  state.processedActivityIds = [...processed].slice(-4000)
  const retainedIds = new Set(state.processedActivityIds)
  state.processedActivityDurations = Object.fromEntries(
    Object.entries(processedDurations).filter(([id]) => retainedIds.has(id)),
  )
  state.events = state.events.slice(0, 24)
  state.population = 18 + state.buildings.reduce((sum, building) => sum + 8 + building.level * 7, 0)
  return state
}

export function createDemoActivities(round: number, at = new Date()): ActivitySlice[] {
  const pattern: Array<[ActivityKind, number, string]> = [
    ['development', 42 * 60, 'Code'],
    ['learning', 28 * 60, 'Obsidian'],
    ['creative', 25 * 60, 'Blender'],
    ['gaming', 36 * 60, 'Steam'],
    ['office', 32 * 60, 'Excel'],
    ['media', 30 * 60, 'Spotify'],
  ]
  return pattern.map(([kind, durationSeconds, app], index) => ({
    id: `demo-${round}-${kind}`,
    source: 'demo',
    app,
    startedAt: new Date(at.getTime() + index * 1000).toISOString(),
    durationSeconds,
    kind,
  }))
}
