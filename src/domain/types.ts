export const activityKinds = [
  'development',
  'gaming',
  'office',
  'learning',
  'media',
  'creative',
  'other',
  'idle',
] as const

export type ActivityKind = (typeof activityKinds)[number]

export type ActivitySlice = {
  id: string
  source: 'native' | 'demo'
  app: string
  startedAt: string
  durationSeconds: number
  kind: ActivityKind
}

export type DistrictStats = Record<ActivityKind, number>

export type BuildingKind = Exclude<ActivityKind, 'other' | 'idle'> | 'residential'

export type Building = {
  id: string
  kind: BuildingKind
  level: number
  x: number
  y: number
  name: string
  bornAt: string
}

export type CityEvent = {
  id: string
  at: string
  title: string
  description: string
  kind: ActivityKind
}

export type CityState = {
  version: 1
  seed: number
  day: number
  population: number
  development: DistrictStats
  growthBank: DistrictStats
  buildings: Building[]
  processedActivityIds: string[]
  /** Highest duration already consumed for each mutable activity segment. */
  processedActivityDurations?: Record<string, number>
  events: CityEvent[]
  lastActivityAt: string | null
}

export const kindLabels: Record<ActivityKind, string> = {
  development: '科技',
  gaming: '娱乐',
  office: '商务',
  learning: '学术',
  media: '文化',
  creative: '艺术',
  other: '城市生活',
  idle: '休息',
}

export const kindColors: Record<ActivityKind, number> = {
  development: 0x67d8ff,
  gaming: 0xff72ae,
  office: 0xffc45d,
  learning: 0x8b9dff,
  media: 0xc38cff,
  creative: 0xff8f71,
  other: 0x93a4b7,
  idle: 0x86d69a,
}
