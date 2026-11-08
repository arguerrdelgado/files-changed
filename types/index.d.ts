export type FileChange = {
  path: string
  added: number
  removed: number
  isNew: boolean
  patch: string
}

export type TurnChanges = { files: FileChange[]; isRunning: boolean }

declare module 'claude-code' {
  interface PluginState {
    'files-changed': {
      turn: Shaped<TurnChanges>
      expanded: string | null
    }
  }
}
