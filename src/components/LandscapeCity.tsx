import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadModelCatalog, modelForBuilding, type ModelCatalog } from '../assets/modelCatalog'
import { loadTileCatalog, type TileCatalog } from '../assets/tileCatalog'
import { createTiles, tileWorldPosition, TILE_COLUMNS, type Tile, type TileKind } from '../domain/tiles'
import type { Building, CityState } from '../domain/types'
import { kindColors } from '../domain/types'

type Props = { city: CityState; onSelectBuilding: (building: Building | null) => void }
const TERRAIN_TEXTURE_SIZE = 48
const TERRAIN_CANVAS_SIZE = 512
export const sceneIdentity = (city: CityState): string => JSON.stringify([city.seed, city.buildings])
const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
const materials = {
  stone: mat(0xd9c5a0), wall: mat(0xf4dfb7), roof: mat(0xb66d48), roofDark: mat(0x8e4c38),
  timber: mat(0x866247), window: new THREE.MeshStandardMaterial({ color: 0x7cb9c3, metalness: 0.15, roughness: 0.3 }),
  leaves: [mat(0x3f7457), mat(0x558b5d), mat(0x72a16a)], trunk: mat(0x73523a),
}
// Keep decoded catalog assets across day changes. A new page load picks up edited files.
let buildingCatalogPromise: Promise<ModelCatalog> | null = null
let tileCatalogPromise: Promise<TileCatalog> | null = null
const modelPromises = new Map<string, Promise<THREE.Group>>()
const imagePromises = new Map<string, Promise<HTMLImageElement | null>>()
const sharedGeometries = new Set<THREE.BufferGeometry>()
const sharedMaterials = new Set<THREE.Material>()

function buildingCatalog() {
  return buildingCatalogPromise ??= loadModelCatalog().catch((error) => { buildingCatalogPromise = null; throw error })
}

function tileCatalog() {
  return tileCatalogPromise ??= loadTileCatalog().catch((error) => { tileCatalogPromise = null; throw error })
}

function modelSource(url: string): Promise<THREE.Group> {
  let promise = modelPromises.get(url)
  if (!promise) {
    promise = new GLTFLoader().loadAsync(url).then(({ scene }) => {
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        sharedGeometries.add(object.geometry)
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) sharedMaterials.add(material)
      })
      return scene
    }).catch((error) => { modelPromises.delete(url); throw error })
    modelPromises.set(url, promise)
  }
  return promise
}

function surfaceImage(url: string): Promise<HTMLImageElement | null> {
  let promise = imagePromises.get(url)
  if (!promise) {
    promise = new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => { imagePromises.delete(url); resolve(null) }
      image.src = url
    })
    imagePromises.set(url, promise)
  }
  return promise
}
const random = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}
const pos = (column: number, row: number) => {
  const { x, z } = tileWorldPosition(column, row)
  return new THREE.Vector3(x, 0, z)
}
const elevation = (x: number, z: number) => {
  const hills = [[-14, -13, 1.55, 5], [14, -12, 1.15, 4], [11, 15, 1.35, 5]]
  const rise = hills.reduce((sum, [hx, hz, height, radius]) => {
    const distance = ((x - hx) ** 2 + (z - hz) ** 2) / (radius * radius)
    return sum + height * Math.exp(-distance)
  }, 0)
  return rise + 0.09 * Math.sin(x * 0.47) * Math.cos(z * 0.35) + 0.04 * Math.sin(x * 1.17 + z * 0.76)
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function hexGrid(tiles: Tile[]): THREE.LineSegments {
  const points: number[] = []
  const edges = new Set<string>()
  for (const tile of tiles) {
    const center = pos(tile.column, tile.row)
    for (let side = 0; side < 6; side++) {
      const a = side * Math.PI / 3
      const b = (side + 1) * Math.PI / 3
      const x1 = center.x + Math.cos(a), z1 = center.z + Math.sin(a)
      const x2 = center.x + Math.cos(b), z2 = center.z + Math.sin(b)
      const first = `${x1.toFixed(3)},${z1.toFixed(3)}`
      const second = `${x2.toFixed(3)},${z2.toFixed(3)}`
      const key = first < second ? `${first}|${second}` : `${second}|${first}`
      if (edges.has(key)) continue
      edges.add(key)
      // Follow the height field so the border never disappears beneath a hill.
      for (let step = 0; step < 6; step++) {
        const t1 = step / 6, t2 = (step + 1) / 6
        const ax = x1 + (x2 - x1) * t1, az = z1 + (z2 - z1) * t1
        const bx = x1 + (x2 - x1) * t2, bz = z1 + (z2 - z1) * t2
        points.push(ax, elevation(ax, az) + 0.065, az, bx, elevation(bx, bz) + 0.065, bz)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x31543e, transparent: true, opacity: 0.58, depthWrite: false }))
}

function terrainTexture(tiles: Tile[], catalog?: TileCatalog, images: Partial<Record<TileKind, HTMLImageElement>> = {}): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TERRAIN_CANVAS_SIZE
  canvas.height = TERRAIN_CANVAS_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#819d67'
  ctx.fillRect(0, 0, TERRAIN_CANVAS_SIZE, TERRAIN_CANVAS_SIZE)
  for (let y = 0; y < TERRAIN_CANVAS_SIZE; y += 4) for (let x = 0; x < TERRAIN_CANVAS_SIZE; x += 4) {
    const value = random(x, y)
    ctx.fillStyle = value > 0.55 ? `rgba(222,204,135,${(value - 0.55) * 0.22})` : `rgba(30,91,60,${(0.55 - value) * 0.17})`
    ctx.fillRect(x, y, 4, 4)
  }
  const toPixel = (v: number) => (v / TERRAIN_TEXTURE_SIZE + 0.5) * TERRAIN_CANVAS_SIZE
  const path = (x: number, z: number, radius: number) => {
    ctx.beginPath()
    for (let side = 0; side < 6; side++) {
      const angle = side * Math.PI / 3
      const px = toPixel(x + radius * Math.cos(angle))
      const py = toPixel(z + radius * Math.sin(angle))
      if (side === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }
  const colors: Record<TileKind, string> = {
    grassland: '#8cac70', plains: '#c5bb82', farm: '#bfc47a', forest: '#639469',
    hills: '#aaa282', water: '#6da9ac', settlement: '#b9ad86',
  }
  // Every terrain feature is painted from a tile record, never from a map-wide decal.
  for (const tile of tiles) {
    const center = pos(tile.column, tile.row)
    path(center.x, center.z, 1.005)
    ctx.globalAlpha = tile.kind === 'water' ? 1 : 0.82
    ctx.fillStyle = catalog?.tiles[tile.kind]?.color ?? colors[tile.kind]
    ctx.fill()
    ctx.globalAlpha = 1
    const surface = images[tile.kind]
    if (surface) {
      ctx.save()
      path(center.x, center.z, 0.985)
      ctx.clip()
      const px = toPixel(center.x), py = toPixel(center.z)
      const radius = toPixel(1) - toPixel(0)
      ctx.drawImage(surface, px - radius, py - radius, radius * 2, radius * 2)
      ctx.restore()
    } else if (tile.kind === 'farm') {
      // Keep the planted rows inside this one hex, with a bare margin at its border.
      ctx.save()
      path(center.x, center.z, 0.78)
      ctx.clip()
      const px = toPixel(center.x), py = toPixel(center.z)
      const radius = toPixel(0.78) - toPixel(0)
      ctx.fillStyle = '#d4c783'
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2)
      ctx.translate(px, py)
      ctx.rotate(-0.28)
      ctx.strokeStyle = '#779553'
      ctx.lineWidth = 3
      for (let offset = -radius; offset <= radius; offset += 7) {
        ctx.beginPath()
        ctx.moveTo(-radius, offset)
        ctx.lineTo(radius, offset)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function terrainGeometry(tiles: Tile[]): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let vertexOffset = 0

  for (const tile of tiles) {
    const center = pos(tile.column, tile.row)
    const points: Array<readonly [number, number]> = [[center.x, center.z]]
    for (let side = 0; side < 6; side++) {
      const angle = side * Math.PI / 3
      points.push([center.x + Math.cos(angle), center.z + Math.sin(angle)])
    }

    for (const [x, z] of points) {
      const height = elevation(x, z)
      positions.push(x, height, z)
      uvs.push(x / TERRAIN_TEXTURE_SIZE + 0.5, 0.5 - z / TERRAIN_TEXTURE_SIZE)
      const tint = new THREE.Color(0xffffff).lerp(
        new THREE.Color(0xc9b393),
        Math.min(0.72, Math.max(0, height - 0.35) * 0.48),
      )
      colors.push(tint.r, tint.g, tint.b)
    }

    for (let side = 0; side < 6; side++) {
      indices.push(vertexOffset, vertexOffset + side + 1, vertexOffset + ((side + 1) % 6) + 1)
    }
    vertexOffset += 7
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function makeBuilding(building: Building): THREE.Group {
  const group = new THREE.Group()
  const floors = Math.min(5, Math.max(1, building.level))
  const h = 0.54 + floors * 0.36
  const accent = building.kind === 'residential' ? materials.roof : mat(kindColors[building.kind])
  box(group, 1.4, 0.12, 1.35, materials.stone, 0, 0.06, 0)
  box(group, 1.13, h, 1.05, materials.wall, 0, h / 2 + 0.12, 0)
  for (let floor = 0; floor < floors; floor++) {
    const y = 0.42 + floor * 0.36
    for (const x of [-0.31, 0.31]) for (const z of [-0.54, 0.54]) {
      box(group, 0.18, 0.2, 0.035, materials.timber, x, y, z)
      box(group, 0.14, 0.16, 0.04, materials.window, x, y, z + Math.sign(z) * 0.02)
    }
    for (const x of [-0.58, 0.58]) box(group, 0.035, 0.2, 0.24, materials.window, x, y, 0)
    if (floor > 0) box(group, 1.19, 0.025, 1.11, materials.stone, 0, y - 0.18, 0)
  }
  box(group, 0.23, 0.34, 0.04, materials.timber, 0, 0.29, 0.55)
  const left = box(group, 0.76, 0.07, 1.26, accent, -0.31, h + 0.27, 0)
  const right = box(group, 0.76, 0.07, 1.26, accent, 0.31, h + 0.27, 0)
  left.rotation.z = Math.PI / 6
  right.rotation.z = -Math.PI / 6
  box(group, 0.13, 0.3, 0.14, materials.roofDark, 0.31, h + 0.5, -0.28)
  if (building.kind === 'development') {
    box(group, 0.045, 0.6, 0.045, materials.stone, 0, h + 0.75, 0)
    const beacon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), materials.window)
    beacon.position.set(0, h + 1.1, 0)
    group.add(beacon)
  } else if (building.kind === 'learning') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), accent)
    dome.position.set(0, h + 0.48, 0)
    group.add(dome)
  } else if (building.kind === 'office') {
    box(group, 0.77, 0.16, 0.72, materials.stone, 0, h + 0.55, 0)
  } else if (building.kind === 'gaming' || building.kind === 'media') {
    box(group, 0.65, 0.23, 0.07, accent, 0, h * 0.75, 0.57)
  } else if (building.kind === 'creative') {
    const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(0.18, 0.045, 32, 6), accent)
    sculpture.position.set(0, h + 0.75, 0)
    sculpture.castShadow = true
    group.add(sculpture)
  }
  return group
}

export function LandscapeCity({ city, onSelectBuilding }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef(onSelectBuilding)
  const cameraState = useRef({ azimuth: 225, pitch: 43, zoom: 1.35, panX: 0, panZ: 0 })
  // Syncing activity updates statistics far more often than it changes the map.
  // Keep the WebGL context alive until the terrain or buildings actually change.
  const sceneKey = sceneIdentity(city)
  selectRef.current = onSelectBuilding
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = null
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.domElement.className = 'city-canvas'
    renderer.domElement.style.cursor = 'grab'
    host.appendChild(renderer.domElement)
    scene.add(new THREE.HemisphereLight(0xe7f3ff, 0x6d825c, 1.65))
    const sun = new THREE.DirectionalLight(0xffe4b2, 2.2)
    sun.position.set(-12, 25, 15)
    sun.castShadow = true
    sun.shadow.mapSize.set(512, 512)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -28
    sun.shadow.camera.right = sun.shadow.camera.top = 28
    sun.shadow.normalBias = 0.04
    scene.add(sun)
    const tiles = createTiles(city)
    let texture = terrainTexture(tiles)
    const groundGeometry = terrainGeometry(tiles)
    const groundMaterial = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1, side: THREE.DoubleSide })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.receiveShadow = true
    scene.add(ground)
    const grid = hexGrid(tiles)
    scene.add(grid)

    const trunkGeometry = new THREE.CylinderGeometry(0.045, 0.065, 0.34, 5)
    const crownGeometry = new THREE.IcosahedronGeometry(0.26, 0)
    const trees: THREE.InstancedMesh[] = []
    for (let layer = 0; layer < materials.leaves.length; layer++) {
      const leaf = materials.leaves[layer]
      const positions: THREE.Vector3[] = []
      for (const tile of tiles) {
        if (tile.kind !== 'forest') continue
        const index = tile.row * TILE_COLUMNS + tile.column
        for (let tree = 0; tree < 2; tree++) {
          if ((index + tree) % 3 !== layer) continue
          const center = pos(tile.column, tile.row)
          const x = center.x + (random(index, tree + 8) - 0.5) * 0.55
          const z = center.z + (random(index, tree + 31) - 0.5) * 0.55
          positions.push(new THREE.Vector3(x, elevation(x, z), z))
        }
      }
      const foliage = new THREE.InstancedMesh(crownGeometry, leaf, positions.length)
      const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, positions.length)
      const dummy = new THREE.Object3D()
      positions.forEach((p, i) => {
        dummy.position.set(p.x, p.y + 0.53, p.z)
        dummy.scale.setScalar(0.8 + random(i, p.x) * 0.5)
        dummy.updateMatrix()
        foliage.setMatrixAt(i, dummy.matrix)
        dummy.position.y = p.y + 0.19
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        trunks.setMatrixAt(i, dummy.matrix)
      })
      foliage.castShadow = true
      trees.push(foliage, trunks)
      scene.add(foliage, trunks)
    }
    const rockGeometry = new THREE.DodecahedronGeometry(0.19, 0)
    const rockMaterial = mat(0xa69f88)
    const hillTiles = tiles.filter((tile) => tile.kind === 'hills')
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, hillTiles.length)
    const rockDummy = new THREE.Object3D()
    for (let i = 0; i < hillTiles.length; i++) {
      const center = pos(hillTiles[i].column, hillTiles[i].row)
      const x = center.x + (random(i, 114) - 0.5) * 0.4
      const z = center.z + (random(i, 212) - 0.5) * 0.4
      rockDummy.position.set(x, elevation(x, z) + 0.07, z)
      rockDummy.rotation.y = random(i, 87) * Math.PI
      rockDummy.scale.set(0.6 + random(i, 38), 0.3 + random(i, 56) * 0.8, 0.6 + random(i, 11))
      rockDummy.updateMatrix()
      rocks.setMatrixAt(i, rockDummy.matrix)
    }
    rocks.castShadow = true
    scene.add(rocks)
    const selectable: THREE.Object3D[] = []
    const objectBuilding = new Map<THREE.Object3D, Building>()
    const placedBuildings: Array<{ building: Building; group: THREE.Group }> = []
    for (const building of city.buildings) {
      const group = makeBuilding(building)
      const p = pos(building.x, building.y)
      group.position.set(p.x, elevation(p.x, p.z), p.z)
      group.scale.setScalar(0.75)
      scene.add(group)
      selectable.push(group)
      placedBuildings.push({ building, group })
      group.traverse((object) => objectBuilding.set(object, building))
    }
    let active = true
    void buildingCatalog().then((catalog) => {
      for (const { building, group } of placedBuildings) {
        const entry = modelForBuilding(catalog, building)
        if (!entry) continue
        const url = `/models/${entry.file}`
        void modelSource(url).then((source) => {
          if (!active) return
          const model = source.clone(true)
          const bounds = new THREE.Box3().setFromObject(model)
          const size = bounds.getSize(new THREE.Vector3())
          if (!Number.isFinite(size.x) || Math.max(size.x, size.y, size.z) <= 0) return
          const fit = 1.2 / Math.max(size.x, size.z)
          const scale = fit * (typeof entry.scale === 'number' && entry.scale > 0 ? Math.min(entry.scale, 1) : 1)
          model.scale.setScalar(scale)
          model.position.set(-(bounds.min.x + bounds.max.x) * 0.5 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * 0.5 * scale)
          const pivot = new THREE.Group()
          pivot.rotation.y = (entry.rotationDegrees ?? 0) * Math.PI / 180
          pivot.add(model)
          group.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
          group.clear()
          group.add(pivot)
          model.traverse((object) => { objectBuilding.set(object, building); if (object instanceof THREE.Mesh) object.castShadow = true })
          invalidate()
        }).catch((error) => console.warn(`建筑模型加载失败：${url}`, error))
      }
    }).catch((error) => console.warn('使用内置建筑模型：', error))
    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200)
    let pending = false
    let frameId = 0
    const draw = () => { pending = false; if (active) renderer.render(scene, camera) }
    const invalidate = () => { if (active && !pending) { pending = true; frameId = requestAnimationFrame(draw) } }
    void tileCatalog().then(async (catalog) => {
      const images: Partial<Record<TileKind, HTMLImageElement>> = {}
      await Promise.all(Object.entries(catalog.tiles).map(async ([kind, entry]) => {
        if (!entry.surface) return
        const image = await surfaceImage(`/tiles/${entry.surface}`)
        if (image) images[kind as TileKind] = image
        else console.warn(`地块图片加载失败：${entry.surface}`)
      }))
      if (!active) return
      const replacement = terrainTexture(tiles, catalog, images)
      groundMaterial.map = replacement
      groundMaterial.needsUpdate = true
      texture.dispose()
      texture = replacement
      invalidate()

      for (const [kind, entry] of Object.entries(catalog.tiles)) {
        if (!entry.model || kind === 'settlement') continue
        const url = `/tiles/${entry.model}`
        void modelSource(url).then((source) => {
          if (!active) return
          const bounds = new THREE.Box3().setFromObject(source)
          const size = bounds.getSize(new THREE.Vector3())
          if (!Number.isFinite(size.x) || !Number.isFinite(size.z) || Math.max(size.x, size.z) <= 0) return
          const scale = 1.2 / Math.max(size.x, size.z) * (entry.scale ?? 1)
          for (const tile of tiles) {
            if (tile.kind !== kind) continue
            const model = source.clone(true)
            model.scale.setScalar(scale)
            model.position.set(-(bounds.min.x + bounds.max.x) * 0.5 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * 0.5 * scale)
            const group = new THREE.Group()
            const center = pos(tile.column, tile.row)
            group.position.set(center.x, elevation(center.x, center.z), center.z)
            group.scale.setScalar(0.75)
            group.rotation.y = (entry.rotationDegrees ?? 0) * Math.PI / 180
            group.add(model)
            model.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true })
            scene.add(group)
          }
          if (kind === 'forest') trees.forEach((mesh) => { mesh.visible = false })
          if (kind === 'hills') rocks.visible = false
          invalidate()
        }).catch((error) => console.warn(`地块模型加载失败：${url}`, error))
      }
    }).catch((error) => console.warn('使用内置地块素材：', error))
    const updateCamera = () => {
      const state = cameraState.current
      const yaw = state.azimuth * Math.PI / 180
      const pitch = state.pitch * Math.PI / 180
      const target = new THREE.Vector3(state.panX, 0, state.panZ)
      camera.position.set(target.x + 60 * Math.sin(yaw) * Math.cos(pitch), 60 * Math.sin(pitch), target.z + 60 * Math.cos(yaw) * Math.cos(pitch))
      camera.lookAt(target)
      camera.updateProjectionMatrix()
      invalidate()
    }
    const resize = () => {
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight)
      renderer.setSize(w, h)
      const extent = 26 / cameraState.current.zoom
      camera.left = -extent * w / h; camera.right = extent * w / h
      camera.top = extent; camera.bottom = -extent
      updateCamera()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
    let drag: 'pan' | 'orbit' | null = null, moved = false, lastX = 0, lastY = 0
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return
      event.preventDefault()
      renderer.domElement.setPointerCapture(event.pointerId)
      drag = event.button === 1 ? 'orbit' : 'pan'; moved = false
      lastX = event.clientX; lastY = event.clientY
      renderer.domElement.style.cursor = 'grabbing'
    }
    const move = (event: PointerEvent) => {
      if (!drag) return
      const dx = event.clientX - lastX, dy = event.clientY - lastY
      moved ||= Math.abs(dx) + Math.abs(dy) > 2
      if (drag === 'orbit') {
        cameraState.current.azimuth -= dx * 0.45
        cameraState.current.pitch = THREE.MathUtils.clamp(cameraState.current.pitch + dy * 0.3, 25, 70)
      } else {
        const scale = (camera.top - camera.bottom) / Math.max(1, host.clientHeight)
        const yaw = cameraState.current.azimuth * Math.PI / 180
        cameraState.current.panX -= (dx * Math.cos(yaw) + dy * Math.sin(yaw)) * scale
        cameraState.current.panZ += (dx * Math.sin(yaw) - dy * Math.cos(yaw)) * scale
      }
      lastX = event.clientX; lastY = event.clientY; updateCamera()
    }
    const up = (event: PointerEvent) => {
      if (drag === 'pan' && !moved) {
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(selectable, true).find((entry) => objectBuilding.has(entry.object))
        selectRef.current(hit ? objectBuilding.get(hit.object)! : null)
      }
      drag = null; renderer.domElement.style.cursor = 'grab'
    }
    const wheel = (event: WheelEvent) => { event.preventDefault(); cameraState.current.zoom = THREE.MathUtils.clamp(cameraState.current.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.6, 4); resize() }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointermove', move)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('pointercancel', up)
    renderer.domElement.addEventListener('wheel', wheel, { passive: false })
    const context = (event: MouseEvent) => event.preventDefault()
    renderer.domElement.addEventListener('contextmenu', context)
    return () => {
      active = false
      cancelAnimationFrame(frameId)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointermove', move)
      renderer.domElement.removeEventListener('pointerup', up)
      renderer.domElement.removeEventListener('pointercancel', up)
      renderer.domElement.removeEventListener('wheel', wheel)
      renderer.domElement.removeEventListener('contextmenu', context)
      const geometries = new Set<THREE.BufferGeometry>()
      const modelMaterials = new Set<THREE.Material>()
      const modelTextures = new Set<THREE.Texture>()
      const collect = (root: THREE.Object3D) => root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        geometries.add(object.geometry)
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (sharedMaterials.has(material)) continue
          if (!Object.values(materials).flat().includes(material)) modelMaterials.add(material)
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) modelTextures.add(value)
        }
      })
      collect(scene)
      geometries.forEach((geometry) => { if (!sharedGeometries.has(geometry)) geometry.dispose() })
      modelTextures.forEach((modelTexture) => modelTexture.dispose())
      modelMaterials.forEach((material) => material.dispose())
      trees.forEach((mesh) => mesh.dispose())
      rocks.dispose()
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose()
      texture.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  // sceneKey is the deliberate scene lifetime boundary; statistics are not visual geometry.
  }, [sceneKey])
  return <div ref={hostRef} className="city-stage" aria-label="三维城市：左键平移，中键环绕，滚轮缩放" />
}
