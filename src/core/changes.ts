import type { FileChange } from '../../types'

/** Adds a change to the list. A file already listed keeps one row: its counts and patches add up. */
export function addChange(files: readonly FileChange[], change: FileChange): FileChange[] {
  if (!files.some(file => file.path === change.path)) return [...files, change]

  return files.map(file =>
    file.path === change.path
      ? {
          path: file.path,
          added: file.added + change.added,
          removed: file.removed + change.removed,
          isNew: file.isNew || change.isNew,
          patch: [file.patch, change.patch].filter(Boolean).join('\n'),
        }
      : file,
  )
}

/** Adds several changes to the list, in order. */
export function addChanges(files: readonly FileChange[], changes: readonly FileChange[]): FileChange[] {
  return changes.reduce(addChange, [...files])
}

/** Lines added and removed across all the files. */
export function totals(files: readonly FileChange[]): { added: number; removed: number } {
  return files.reduce(
    (sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }),
    { added: 0, removed: 0 },
  )
}
