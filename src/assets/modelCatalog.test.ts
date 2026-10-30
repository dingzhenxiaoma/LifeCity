import { describe, expect, it } from 'vitest'
import { modelForBuilding, type ModelCatalog } from './modelCatalog'
import { createInitialCity } from '../domain/simulation'

describe('model catalog', () => {
  it('uses the nearest available lower level and rejects unsafe paths', () => {
    const building = { ...createInitialCity().buildings[0], kind: 'development' as const, level: 3 }
    const catalog: ModelCatalog = { schemaVersion: 1, buildings: { development: { '1': { file: 'buildings/development/lab-1.glb' }, '2': { file: '../escape.glb' } } } }
    expect(modelForBuilding(catalog, building)?.file).toBe('buildings/development/lab-1.glb')
    delete catalog.buildings.development!['2']
    expect(modelForBuilding(catalog, building)?.file).toBe('buildings/development/lab-1.glb')
    catalog.buildings.development!['1'] = { file: '建筑/研究楼.glb' }
    expect(modelForBuilding(catalog, building)?.file).toBe('建筑/研究楼.glb')
  })
})
