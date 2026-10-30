import { invoke } from '@tauri-apps/api/core'
import { classifyActivity, type ClassificationRule } from '../domain/classifier'
import type { ActivitySlice } from '../domain/types'

type NativeActivityEvent = {
  id: string
  app: string
  title: string
  startedAtMs: number
  durationSeconds: number
  isAfk: boolean
}

export type NativeActivityStatus = 'collecting' | 'unavailable' | 'checking'

const isTauri = () => '__TAURI_INTERNALS__' in window

export async function checkNativeActivity(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    await invoke<NativeActivityEvent[]>('collect_native_activity', { sinceMs: Date.now() })
    return true
  } catch {
    return false
  }
}

export async function collectNativeActivity(
  start: Date,
  end = new Date(),
  rules?: ClassificationRule[],
): Promise<ActivitySlice[]> {
  if (!isTauri()) throw new Error('Windows 原生活动采集仅在桌面版中可用')
  const events = await invoke<NativeActivityEvent[]>('collect_native_activity', { sinceMs: start.getTime() })
  return events
    .filter((event) => event.startedAtMs < end.getTime())
    .filter((event) => !/^lifecity(?:\.exe)?$/i.test(event.app))
    .map((event) => ({
      id: event.id,
      source: 'native' as const,
      app: event.app,
      startedAt: new Date(event.startedAtMs).toISOString(),
      durationSeconds: event.durationSeconds,
      kind: event.isAfk ? 'idle' : classifyActivity(event.app, event.title, rules),
    }))
}

