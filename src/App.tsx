import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { collectNativeActivity, checkNativeActivity, type NativeActivityStatus } from './adapters/nativeActivity'
import { createPersistence } from './adapters/persistence'
import { LandscapeCity } from './components/LandscapeCity'
import { defaultRules, type ClassificationRule } from './domain/classifier'
import { createDemoActivities, createInitialCity, evolveCity } from './domain/simulation'
import type { ActivityKind, Building, CityState } from './domain/types'
import { activityKinds, kindLabels } from './domain/types'

const BUILDABLE = ['development', 'gaming', 'office', 'learning', 'media', 'creative'] as const satisfies readonly ActivityKind[]
const RULES_KEY = 'lifecity.rules.v1'
const WINDOW_POSITION_KEY = 'lifecity.window-position.v1'
const IS_TAURI = '__TAURI_INTERNALS__' in window

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`
}

function loadRules(): ClassificationRule[] {
  const raw = localStorage.getItem(RULES_KEY)
  if (!raw) return defaultRules
  try {
    const saved = JSON.parse(raw) as ClassificationRule[]
    const savedById = new Map(saved.map((rule) => [rule.id, rule]))
    return defaultRules.map((fallback) => {
      const rule = savedById.get(fallback.id) ?? fallback
      return rule.id === 'games' && rule.titlePattern === 'game|steam|play'
        ? { ...rule, titlePattern: undefined }
        : rule
    })
  } catch { return defaultRules }
}

function formatSyncDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds))
  if (rounded < 60) return `${rounded} 秒`
  const minutes = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`
}

function describeSync(before: CityState, after: CityState, sampledCount: number): string {
  const deltas = activityKinds.map((kind) => ({
    kind,
    seconds: Math.max(0, after.development[kind] - before.development[kind]),
  })).filter((item) => item.seconds >= 0.5)
  const total = deltas.reduce((sum, item) => sum + item.seconds, 0)
  if (total < 0.5) {
    return sampledCount
      ? '已检查采样记录，没有新增时长；可能刚刚自动同步过。'
      : '暂时没有活动记录；启动桌面版后至少使用其他应用 5 秒再同步。'
  }

  const details = deltas.map(({ kind, seconds }) => `${kindLabels[kind]} +${formatSyncDuration(seconds)}`).join('、')
  const beforeLevels = before.buildings.reduce((sum, building) => sum + building.level, 0)
  const afterLevels = after.buildings.reduce((sum, building) => sum + building.level, 0)
  const buildingChanges = after.buildings.length - before.buildings.length + afterLevels - beforeLevels
  if (buildingChanges > 0) return `同步成功：${details}；触发 ${buildingChanges} 次建筑变化。`

  const buildableSeconds = deltas
    .filter(({ kind }) => BUILDABLE.includes(kind as (typeof BUILDABLE)[number]))
    .reduce((sum, item) => sum + item.seconds, 0)
  return buildableSeconds > 0
    ? `同步成功：${details}；成长已累计，尚未达到下一次建设阈值。`
    : `同步成功：${details}；这些活动未匹配建设类别，可在设置中调整分类规则。`
}

function StatusLight({ status }: { status: NativeActivityStatus }) {
  const labels = { collecting: '本机活动采集中', unavailable: '浏览器演示模式', checking: '正在启动本机采集' }
  return <span className={`status status--${status}`}><i />{labels[status]}</span>
}

export default function App() {
  const [city, setCity] = useState<CityState>(() => createInitialCity())
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<NativeActivityStatus>('checking')
  const [storageKind, setStorageKind] = useState('正在准备')
  const [selected, setSelected] = useState<Building | null>(null)
  const [demoRound, setDemoRound] = useState(0)
  const [rules, setRules] = useState<ClassificationRule[]>(loadRules)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState('')
  const [dashboardOpen, setDashboardOpen] = useState(!IS_TAURI)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const persistenceRef = useRef<Awaited<ReturnType<typeof createPersistence>> | null>(null)
  const pendingSyncFeedbackRef = useRef<string | null>(null)

  useEffect(() => {
    if (!IS_TAURI) return
    const appWindow = getCurrentWindow()
    const saved = localStorage.getItem(WINDOW_POSITION_KEY)
    if (saved) {
      try {
        const position = JSON.parse(saved) as { x: number; y: number }
        void appWindow.setPosition(new PhysicalPosition(position.x, position.y))
      } catch { localStorage.removeItem(WINDOW_POSITION_KEY) }
    }
    let stopMoved: (() => void) | undefined
    void appWindow.onMoved(({ payload }) => localStorage.setItem(WINDOW_POSITION_KEY, JSON.stringify(payload))).then((stop) => { stopMoved = stop })
    return () => stopMoved?.()
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const persistence = await createPersistence()
      const saved = await persistence.load()
      if (!active) return
      persistenceRef.current = persistence
      setStorageKind(persistence.kind === 'sqlite' ? '本地 SQLite' : '浏览器本地存储')
      if (saved) setCity(saved)
      setReady(true)
      setStatus(await checkNativeActivity() ? 'collecting' : 'unavailable')
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => void persistenceRef.current?.save(city), 250)
    return () => window.clearTimeout(timer)
  }, [city, ready])

  useEffect(() => {
    if (pendingSyncFeedbackRef.current === null) return
    setSyncFeedback(pendingSyncFeedbackRef.current)
    pendingSyncFeedbackRef.current = null
  }, [city])

  const syncNow = useCallback(async (showFeedback = false) => {
    setSyncing(true)
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 20 * 60 * 1000)
      const activities = await collectNativeActivity(start, end, rules)
      setCity((current) => {
        const next = evolveCity(current, activities, 1.8)
        if (showFeedback) pendingSyncFeedbackRef.current = describeSync(current, next, activities.length)
        return next
      })
      setStatus('collecting')
    } catch (error) {
      console.info('Windows 原生活动采集暂时不可用', error)
      setStatus('unavailable')
      if (showFeedback) setSyncFeedback('同步失败：Windows 原生活动采集器不可用。')
    } finally {
      setSyncing(false)
    }
  }, [rules])

  useEffect(() => {
    if (!ready) return
    void syncNow()
    const timer = window.setInterval(() => void syncNow(), 60_000)
    return () => window.clearInterval(timer)
  }, [ready, syncNow])

  const runDemo = () => {
    const persistedRound = city.processedActivityIds.reduce((max, id) => {
      const match = /^demo-(\d+)-/.exec(id)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0)
    const next = Math.max(demoRound, persistedRound) + 1
    setDemoRound(next)
    setCity((current) => ({ ...evolveCity(current, createDemoActivities(next), 7), day: current.day + 1 }))
  }

  const totalActive = useMemo(
    () => BUILDABLE.reduce((sum, kind) => sum + city.development[kind], 0),
    [city.development],
  )
  const leadingKind = useMemo(
    () => [...BUILDABLE].sort((a, b) => city.development[b] - city.development[a])[0],
    [city.development],
  )

  const updateRule = (id: string, appPattern: string) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, appPattern } : rule))
  }

  const saveRules = () => {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules))
    setSettingsOpen(false)
  }

  const openResetConfirmation = () => {
    setResetError('')
    setSettingsOpen(false)
    setResetConfirmOpen(true)
  }

  const resetCity = async () => {
    const persistence = persistenceRef.current
    if (!persistence) return
    setResetting(true)
    setResetError('')
    try {
      await persistence.reset()
      const initial = createInitialCity()
      await persistence.save(initial)
      setCity(initial)
      setSelected(null)
      setDemoRound(0)
      setSyncFeedback('城市已完全重置；重置前的城市已覆盖保存为唯一备份。')
      setResetConfirmOpen(false)
    } catch (error) {
      console.error('重置城市失败', error)
      setResetError(error instanceof Error ? error.message : String(error))
    } finally {
      setResetting(false)
    }
  }

  const startWindowDrag = (event: React.PointerEvent) => {
    if (IS_TAURI && event.button === 0) void getCurrentWindow().startDragging()
  }

  const lockPet = () => {
    if (!IS_TAURI) return
    setDashboardOpen(false)
    void getCurrentWindow().setIgnoreCursorEvents(true)
  }

  const toggleAlwaysOnTop = () => {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    if (IS_TAURI) void getCurrentWindow().setAlwaysOnTop(next)
  }

  return (
    <main className={`app-shell ${dashboardOpen ? 'app-shell--dashboard' : 'app-shell--pet'}`}>
      <nav className="pet-toolbar" aria-label="桌宠控制">
        <button className="pet-drag" onPointerDown={startWindowDrag} title="拖动 LifeCity">⠿ <span>LifeCity</span></button>
        <button onClick={() => setDashboardOpen((open) => !open)} title={dashboardOpen ? '收起面板' : '展开面板'}>{dashboardOpen ? '◒' : '◐'}</button>
        <button onClick={toggleAlwaysOnTop} className={alwaysOnTop ? 'active' : ''} title="切换置顶">⌖</button>
        {IS_TAURI && <button onClick={lockPet} title="锁定并穿透鼠标；从托盘解除">◇</button>}
        {IS_TAURI && <button onClick={() => void getCurrentWindow().hide()} title="隐藏到托盘">×</button>}
      </nav>

      {dashboardOpen && <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><b /><b /><b /></span>
          <div><h1>LifeCity</h1><p>你的数字生活，正在成为一座城市</p></div>
        </div>
        <div className="topbar-actions">
          <StatusLight status={status} />
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title="活动分类规则">⚙</button>
        </div>
      </header>}

      <section className="city-view">
        <LandscapeCity
          city={city}
          onSelectBuilding={setSelected}
        />
        <div className="sky-glow" />
        {dashboardOpen && <aside className="city-card city-summary">
          <span className="eyebrow">晨湾市 · 第 {city.day} 天</span>
          <h2>{city.buildings.length < 6 ? '初醒的数字小镇' : city.buildings.length < 14 ? '生长中的创意城区' : '灯火璀璨的生活之城'}</h2>
          <div className="summary-grid">
            <div><strong>{city.population}</strong><span>居民</span></div>
            <div><strong>{city.buildings.length}</strong><span>建筑</span></div>
            <div><strong>{formatDuration(totalActive)}</strong><span>成长记忆</span></div>
          </div>
        </aside>}

        {dashboardOpen && <aside className="city-card district-panel">
          <div className="panel-title"><div><span className="eyebrow">城市脉搏</span><h3>城区发展</h3></div><span className="live-dot">LIVE</span></div>
          <div className="district-list">
            {BUILDABLE.map((kind) => {
              const max = Math.max(...BUILDABLE.map((item) => city.development[item]), 1)
              const value = city.development[kind]
              return (
                <div className="district-row" key={kind}>
                  <span className={`district-icon district-icon--${kind}`} />
                  <div><div><b>{kindLabels[kind]}</b><small>{formatDuration(value)}</small></div><i><em style={{ width: `${Math.max(3, value / max * 100)}%` }} /></i></div>
                </div>
              )
            })}
          </div>
          <p className="insight">{totalActive > 0 ? `${kindLabels[leadingKind]}是目前最有活力的城区，互补活动会带来额外成长。` : '保持 LifeCity 在托盘运行，或用演示加速让城市迎来第一批居民。'}</p>
        </aside>}

        {dashboardOpen && <div className="map-hint">左键拖动平移 · 中键环绕 · 滚轮缩放</div>}

        {dashboardOpen && <div className="demo-controls">
          <button className="primary-button" onClick={runDemo}><span>▶</span> 城市快进一天</button>
          <button className="secondary-button" onClick={() => void syncNow(true)} disabled={syncing}>{syncing ? '同步中…' : '同步本机活动'}</button>
          {syncFeedback && <output className="sync-feedback" aria-live="polite">{syncFeedback}</output>}
        </div>}

        {selected && (
          <aside className="building-popover">
            <button onClick={() => setSelected(null)}>×</button>
            <span className="eyebrow">{kindLabels[selected.kind === 'residential' ? 'other' : selected.kind]}城区</span>
            <h3>{selected.name}</h3>
            <p>{selected.level} 级建筑 · 容纳约 {8 + selected.level * 7} 位居民</p>
            <div className="level-pips">{[1, 2, 3, 4, 5].map((level) => <i key={level} className={level <= selected.level ? 'active' : ''} />)}</div>
          </aside>
        )}

        {dashboardOpen && <section className="event-strip">
          <div><span className="eyebrow">最近发生</span><h3>城市纪事</h3></div>
          <div className="event-list">
            {city.events.length ? city.events.slice(0, 4).map((event) => (
              <article key={event.id}><span className={`event-gem event-gem--${event.kind}`} /><div><b>{event.title}</b><p>{event.description}</p></div></article>
            )) : <article className="empty-event"><span className="event-gem" /><div><b>等待第一束成长能量</b><p>活动只在本机处理，窗口标题不会被保存。</p></div></article>}
          </div>
          <small>{storageKind}</small>
        </section>}
      </section>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">隐私优先</span><h2>活动分类规则</h2></div><button onClick={() => setSettingsOpen(false)}>×</button></div>
            <p>规则只匹配本地应用名。标题只在内存中辅助分类，不会写入 LifeCity 数据库。</p>
            <div className="rule-list">
              {rules.map((rule) => (
                <label key={rule.id}><span>{kindLabels[rule.kind]} · {rule.id}</span><input value={rule.appPattern} onChange={(event) => updateRule(rule.id, event.target.value)} spellCheck={false} /></label>
              ))}
            </div>
            <section className="danger-zone">
              <div><b>完全重置城市</b><p>清除建筑、成长、人口、纪事和同步记录。每次重置只保留一份上次城市备份。</p></div>
              <button className="danger-button" onClick={openResetConfirmation}>重置城市</button>
            </section>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setRules(defaultRules)}>恢复默认</button><button className="primary-button" onClick={saveRules}>保存到本机</button></div>
          </section>
        </div>
      )}

      {resetConfirmOpen && (
        <div className="modal-backdrop" onMouseDown={() => !resetting && setResetConfirmOpen(false)}>
          <section className="confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">不可撤销操作</span>
            <h2>确认完全重置城市？</h2>
            <p>当前建筑和成长记录会被清空。执行前会将数据库覆盖备份到固定的 <code>lifecity.db.backup</code>；不会累积多份备份。</p>
            {resetError && <p className="reset-error">{resetError}</p>}
            <div className="modal-actions">
              <button className="secondary-button" disabled={resetting} onClick={() => setResetConfirmOpen(false)}>取消</button>
              <button className="danger-button" disabled={resetting} onClick={() => void resetCity()}>{resetting ? '正在备份并重置…' : '确认重置'}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
