/** What happened to a file. */
export type FileStatus = 'added' | 'modified' | 'deleted'

/** One file a reply changed: one row of its card. */
export type FileChange = {
  /** Absolute path of the file. */
  path: string
  /** Lines added. */
  added: number
  /** Lines removed. */
  removed: number
  status: FileStatus
  /** True for a binary file, which has no lines to count or show. */
  isBinary: boolean
  /** The change as a unified diff, or '' when there is none to show. */
  patch: string
}

/** What a reply changed: the files its card lists, and how many more it changed. */
export type ReplyChanges = {
  files: FileChange[]
  /** Files changed but not listed, when one command created too many to read. */
  unlisted: number
}

/** The changes each card shows, by the id of the message block the card sits on. */
export type CardsByBlock = Record<string, ReplyChanges>

declare module 'claude-code' {
  interface PluginState {
    'files-changed': {
      turnChanges: Shaped<ReplyChanges>
      cards: Shaped<CardsByBlock>
      openRow: string | null
    }
  }
}
