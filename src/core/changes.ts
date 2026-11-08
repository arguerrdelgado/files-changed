import type { FileChange, FileStatus, ReplyChanges } from '../../types'

/** A reply that changed nothing. */
export const NO_CHANGES: ReplyChanges = { files: [], unlisted: 0 }

/** Adds a change to the list. A file already listed keeps one row: its counts and patches add up. */
export function addChange(files: readonly FileChange[], change: FileChange): FileChange[] {
  if (!files.some(file => file.path === change.path)) return [...files, change]

  return files.map(file =>
    file.path === change.path
      ? {
          path: file.path,
          added: file.added + change.added,
          removed: file.removed + change.removed,
          status: combineStatus(file.status, change.status),
          isBinary: file.isBinary || change.isBinary,
          patch: [file.patch, change.patch].filter(Boolean).join('\n'),
        }
      : file,
  )
}

/** Adds several changes to the list, in order. */
export function addChanges(files: readonly FileChange[], changes: readonly FileChange[]): FileChange[] {
  return changes.reduce(addChange, [...files])
}

/** Joins what two parts of a reply changed. */
export function mergeChanges(first: ReplyChanges, second: ReplyChanges): ReplyChanges {
  return { files: addChanges(first.files, second.files), unlisted: first.unlisted + second.unlisted }
}

/** True when the reply changed any file. */
export function hasChanges(changes: ReplyChanges): boolean {
  return changes.files.length > 0 || changes.unlisted > 0
}

/** How many files the reply changed, listed or not. */
export function fileCount(changes: ReplyChanges): number {
  return changes.files.length + changes.unlisted
}

/** Lines added and removed across all the files. */
export function totals(files: readonly FileChange[]): { added: number; removed: number } {
  return files.reduce(
    (sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }),
    { added: 0, removed: 0 },
  )
}

/**
 * A file's status after two changes in one reply: created then edited is
 * still new, anything then deleted is deleted, and deleted then created
 * again is modified.
 */
function combineStatus(earlier: FileStatus, later: FileStatus): FileStatus {
  if (later === 'deleted') return 'deleted'
  if (earlier === 'added') return 'added'
  if (earlier === 'deleted') return 'modified'

  return later
}
