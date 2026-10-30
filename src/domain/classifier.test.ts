import { describe, expect, it } from 'vitest'
import { classifyActivity } from './classifier'

describe('classifyActivity', () => {
  it('classifies known development tools without a title', () => {
    expect(classifyActivity('Code.exe')).toBe('development')
    expect(classifyActivity('WindowsTerminal.exe')).toBe('development')
    expect(classifyActivity('pwsh.exe')).toBe('development')
    expect(classifyActivity('ChatGPT.exe')).toBe('development')
    expect(classifyActivity('Steam.exe')).toBe('gaming')
  })

  it('uses a browser title only for transient classification', () => {
    expect(classifyActivity('msedge.exe', 'PixiJS Documentation')).toBe('learning')
    expect(classifyActivity('msedge.exe', 'Unrecognized private page')).toBe('other')
  })

  it('falls back safely when a custom regex is invalid', () => {
    expect(classifyActivity('anything', '', [{ id: 'bad', kind: 'gaming', appPattern: '[' }])).toBe('other')
  })
})
