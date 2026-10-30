import type { Building, BuildingKind } from '../domain/types'

export type ModelEntry = {
  file: string
  scale?: number
  rotationDegrees?: number
}

export type ModelCatalog = {
  schemaVersion: 1
  buildings: Partial<Record<BuildingKind, Record<string, ModelEntry>>>
}

export async function loadModelCatalog(): Promise<ModelCatalog> {
  const response = await fetch('/models/catalog.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`模型目录读取失败：${response.status}`)
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || (value as ModelCatalog).schemaVersion !== 1) {
    throw new Error('模型目录需要 schemaVersion: 1')
  }
  return { schemaVersion: 1, buildings: (value as ModelCatalog).buildings ?? {} }
}

export function modelForBuilding(catalog: ModelCatalog, building: Building): ModelEntry | null {
  const levels = catalog.buildings[building.kind]
  if (!levels) return null
  for (const level of Object.keys(levels).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= building.level).sort((a, b) => b - a)) {
    const entry = levels[String(level)]
    if (entry && typeof entry.file === 'string' && entry.file.toLowerCase().endsWith('.glb')
      && entry.file.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !/[\\?#:]/.test(part))) return entry
  }
  return null
}
