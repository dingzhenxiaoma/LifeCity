import type { TileKind } from '../domain/tiles'

export type TileAsset = {
  color?: string
  surface?: string
  model?: string
  scale?: number
  rotationDegrees?: number
}

export type TileCatalog = {
  schemaVersion: 1
  tiles: Partial<Record<TileKind, TileAsset>>
}

const tileKinds: TileKind[] = ['grassland', 'plains', 'farm', 'forest', 'hills', 'water', 'settlement']

export function safeAssetPath(value: unknown, extensions: string[]): value is string {
  return typeof value === 'string'
    && extensions.some((extension) => value.toLowerCase().endsWith(extension))
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !/[\\?#:]/.test(part))
}

export function parseTileCatalog(value: unknown): TileCatalog {
  if (!value || typeof value !== 'object' || (value as TileCatalog).schemaVersion !== 1) {
    throw new Error('地块素材目录需要 schemaVersion: 1')
  }
  const candidate = (value as TileCatalog).tiles
  const raw = candidate && typeof candidate === 'object' ? candidate : {}
  const tiles: TileCatalog['tiles'] = {}
  for (const kind of tileKinds) {
    const entry = raw[kind]
    if (!entry || typeof entry !== 'object') continue
    const asset: TileAsset = {}
    if (typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)) asset.color = entry.color
    if (safeAssetPath(entry.surface, ['.png', '.jpg', '.jpeg', '.webp'])) asset.surface = entry.surface
    if (safeAssetPath(entry.model, ['.glb'])) asset.model = entry.model
    if (typeof entry.scale === 'number' && Number.isFinite(entry.scale) && entry.scale > 0) asset.scale = Math.min(entry.scale, 1)
    if (typeof entry.rotationDegrees === 'number' && Number.isFinite(entry.rotationDegrees)) asset.rotationDegrees = entry.rotationDegrees
    tiles[kind] = asset
  }
  return { schemaVersion: 1, tiles }
}

export async function loadTileCatalog(): Promise<TileCatalog> {
  const response = await fetch('/tiles/catalog.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`地块素材目录读取失败：${response.status}`)
  return parseTileCatalog(await response.json())
}
