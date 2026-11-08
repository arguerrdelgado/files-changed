import type { FileChange } from '../../types'

/** The `---` and `+++` lines a file's patch starts with. */
const HEADER_LINES = 2

/** One hunk of a structured patch, the form the Edit and Write tools report. */
export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: readonly string[]
}

/** Builds the change a structured patch describes. */
export function changeFromHunks(path: string, hunks: readonly Hunk[], isNew: boolean): FileChange {
  const body = hunks.flatMap(hunk => [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines,
  ])

  return {
    path,
    ...countLines(body),
    isNew,
    patch: hunks.length > 0 ? [`--- a/${path}`, `+++ b/${path}`, ...body].join('\n') : '',
  }
}

/**
 * Splits a unified diff, as git prints it, into one change per file, with
 * paths made absolute against `root`. A file with no `---`/`+++` lines (a
 * binary file) is left out.
 */
export function changesFromDiff(diff: string, root: string): FileChange[] {
  return diff
    .split(/^diff --git /m)
    .slice(1)
    .flatMap(section => {
      const lines = section.split('\n')
      const start = lines.findIndex(line => line.startsWith('--- '))
      if (start < 0) return []

      const from = lines[start]?.slice(4)
      const plus = lines[start + 1]
      const to = plus?.startsWith('+++ ') ? plus.slice(4) : undefined
      const target = to !== undefined && to !== '/dev/null' ? to : from
      if (target === undefined) return []

      const patch = lines.slice(start).filter(line => line !== '')

      return [
        {
          path: `${root}/${target.replace(/^[ab]\//, '')}`,
          ...countLines(patch.slice(HEADER_LINES)),
          isNew: from === '/dev/null',
          patch: patch.join('\n'),
        },
      ]
    })
}

/** Counts the added (`+`) and removed (`-`) lines of a patch body, headers excluded. */
function countLines(body: readonly string[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of body) {
    if (line.startsWith('+')) added += 1
    else if (line.startsWith('-')) removed += 1
  }

  return { added, removed }
}
