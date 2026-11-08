/** One file a reply changed: one row of its card. */
export type FileChange = {
  /** Absolute path of the file. */
  path: string
  /** Lines added. */
  added: number
  /** Lines removed. */
  removed: number
  /** True when the reply created the file. */
  isNew: boolean
  /** The change as a unified diff, or '' when there is none to show (a binary file). */
  patch: string
}

/** The changes each card shows, by the id of the message block the card sits on. */
export type CardsByBlock = Record<string, FileChange[]>

declare module 'claude-code' {
  interface PluginState {
    'files-changed': {
      turnChanges: Shaped<FileChange[]>
      cards: Shaped<CardsByBlock>
      openRow: string | null
    }
  }
}
