import type { CityState } from '../domain/types'

const STORAGE_KEY = 'lifecity.city.v1'
const BACKUP_STORAGE_KEY = 'lifecity.city.v1.backup'
const isTauri = () => '__TAURI_INTERNALS__' in window

type Persistence = {
  kind: 'sqlite' | 'localStorage'
  load(): Promise<CityState | null>
  save(state: CityState): Promise<void>
  reset(): Promise<void>
}

function browserPersistence(): Persistence {
  return {
    kind: 'localStorage',
    async load() {
      const json = localStorage.getItem(STORAGE_KEY)
      return json ? JSON.parse(json) as CityState : null
    },
    async save(state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    },
    async reset() {
      const current = localStorage.getItem(STORAGE_KEY)
      if (current) localStorage.setItem(BACKUP_STORAGE_KEY, current)
      localStorage.removeItem(STORAGE_KEY)
    },
  }
}

type SqlDatabase = Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql').default.load>>

async function ensureSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS city_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS activity_ledger (
      event_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      started_at TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      source TEXT NOT NULL,
      app_name TEXT NOT NULL
    )
  `)
}

export async function createPersistence(): Promise<Persistence> {
  if (!isTauri()) return browserPersistence()
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    const { invoke } = await import('@tauri-apps/api/core')
    let db = await Database.load('sqlite:lifecity.db')
    await ensureSchema(db)
    let operationQueue: Promise<void> = Promise.resolve()
    const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
      const result = operationQueue.then(operation, operation)
      operationQueue = result.then(() => undefined, () => undefined)
      return result
    }
    return {
      kind: 'sqlite',
      async load() {
        const rows = await db.select<Array<{ state_json: string }>>('SELECT state_json FROM city_state WHERE id = 1')
        return rows[0] ? JSON.parse(rows[0].state_json) as CityState : null
      },
      async save(state) {
        await enqueue(() => db.execute(
          `INSERT INTO city_state (id, schema_version, state_json, updated_at)
             VALUES (1, 1, $1, $2)
             ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
          [JSON.stringify(state), new Date().toISOString()],
        ))
      },
      async reset() {
        await enqueue(async () => {
          await db.close()
          try {
            await invoke<string>('backup_city_database')
          } catch (error) {
            db = await Database.load('sqlite:lifecity.db')
            await ensureSchema(db)
            throw error
          }
          db = await Database.load('sqlite:lifecity.db')
          await ensureSchema(db)
          await db.execute('DELETE FROM city_state')
          await db.execute('DELETE FROM activity_ledger')
        })
      },
    }
  } catch (error) {
    console.warn('SQLite 不可用，回退到 localStorage', error)
    return browserPersistence()
  }
}
