export type FileChange = {
  path: string
  added: number
  removed: number
  isNew: boolean
  patch: string
}

export type Summaries = Record<string, FileChange[]>

declare module 'claude-code' {
  interface PluginState {
    'files-changed': {
      turnFiles: Shaped<FileChange[]>
      summaries: Shaped<Summaries>
      open: string | null
    }
  }
}
