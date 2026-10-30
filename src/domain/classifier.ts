import type { ActivityKind } from './types'

export type ClassificationRule = {
  id: string
  kind: ActivityKind
  appPattern: string
  titlePattern?: string
}

export const defaultRules: ClassificationRule[] = [
  { id: 'dev-editors', kind: 'development', appPattern: 'code|cursor|devenv|idea|pycharm|webstorm|rider|android studio|sublime|vim|nvim|zed' },
  { id: 'dev-terminals', kind: 'development', appPattern: 'windows.?terminal|powershell|pwsh|cmd|wezterm|alacritty|github desktop|postman|docker desktop' },
  { id: 'ai-tools', kind: 'development', appPattern: 'chatgpt|codex|claude' },
  { id: 'games', kind: 'gaming', appPattern: 'steam|epicgameslauncher|gog galaxy|battle\.net' },
  { id: 'office', kind: 'office', appPattern: 'winword|excel|powerpnt|outlook|teams|slack|notion|wps|libreoffice' },
  { id: 'creative', kind: 'creative', appPattern: 'photoshop|illustrator|afterfx|premiere|blender|figma|krita|gimp|aseprite|davinci' },
  { id: 'media', kind: 'media', appPattern: 'spotify|vlc|mpv|music|netflix|potplayer|foobar' },
  { id: 'learning', kind: 'learning', appPattern: 'calibre|kindle|zotero|anki|obsidian|acrobat|sumatrapdf' },
  { id: 'browser-learning', kind: 'learning', appPattern: 'chrome|msedge|firefox|brave|arc', titlePattern: 'docs|documentation|tutorial|course|learn|wiki|stack overflow|github' },
  { id: 'browser-media', kind: 'media', appPattern: 'chrome|msedge|firefox|brave|arc', titlePattern: 'youtube|bilibili|netflix|twitch|music' },
]

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

export function classifyActivity(
  app: string,
  title = '',
  rules: ClassificationRule[] = defaultRules,
): ActivityKind {
  for (const rule of rules) {
    const appRegex = safeRegex(rule.appPattern)
    const titleRegex = rule.titlePattern ? safeRegex(rule.titlePattern) : null
    if (!appRegex?.test(app)) continue
    if (rule.titlePattern && !titleRegex?.test(title)) continue
    return rule.kind
  }
  return 'other'
}
