import type { FileChange, FileStatus } from '../../types'

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
export function changeFromHunks(path: string, hunks: readonly Hunk[], status: FileStatus): FileChange {
  const body = hunks.flatMap(hunk => [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines,
  ])

  return {
    path,
    ...countLines(body),
    status,
    isBinary: false,
    patch: hunks.length > 0 ? [`--- a/${path}`, `+++ b/${path}`, ...body].join('\n') : '',
  }
}

/**
 * Splits a unified diff, as git prints it, into one change per file, with
 * paths made absolute against `root`. A binary file has no `---`/`+++` lines,
 * only a `Binary files … differ` line: it is listed with no lines.
 */
export function changesFromDiff(diff: string, root: string): FileChange[] {
  return diff
    .split(/^diff --git /m)
    .slice(1)
    .flatMap(section => {
      const lines = section.split('\n')
      const start = lines.findIndex(line => line.startsWith('--- '))
      if (start < 0) return binaryChange(lines, root)

      const from = lines[start]?.slice(4)
      const plus = lines[start + 1]
      const to = plus?.startsWith('+++ ') ? plus.slice(4) : undefined
      if (from === undefined || to === undefined) return []

      const patch = lines.slice(start).filter(line => line !== '')

      return [
        {
          path: absolute(to === '/dev/null' ? from : to, root),
          ...countLines(patch.slice(HEADER_LINES)),
          status: statusOf(from, to),
          isBinary: false,
          patch: patch.join('\n'),
        },
      ]
    })
}

/** The change a `Binary files <from> and <to> differ` line describes, if the section has one. */
function binaryChange(lines: readonly string[], root: string): FileChange[] {
  const line = lines.find(text => text.startsWith('Binary files ') && text.endsWith(' differ'))
  if (line === undefined) return []

  const { from, to } = binaryPaths(line.slice('Binary files '.length, -' differ'.length))

  return [
    {
      path: absolute(to === '/dev/null' ? from : to, root),
      added: 0,
      removed: 0,
      status: statusOf(from, to),
      isBinary: true,
      patch: '',
    },
  ]
}

/**
 * Splits `<from> and <to>`. A path may hold " and " itself, so the split
 * does not search for it: either side is `/dev/null`, or both sides are the
 * same path, `a/<path> and b/<path>`, and each takes half of the text.
 */
function binaryPaths(text: string): { from: string; to: string } {
  if (text.startsWith('/dev/null and ')) return { from: '/dev/null', to: text.slice('/dev/null and '.length) }
  if (text.endsWith(' and /dev/null')) return { from: text.slice(0, -' and /dev/null'.length), to: '/dev/null' }

  const half = (text.length - ' and '.length) / 2

  return { from: text.slice(0, half), to: text.slice(-half) }
}

function statusOf(from: string, to: string): FileStatus {
  if (from === '/dev/null') return 'added'
  if (to === '/dev/null') return 'deleted'

  return 'modified'
}

/** A path from a git diff (`a/src/x.ts`) made absolute against the repository's top folder. */
function absolute(path: string, root: string): string {
  return `${root}/${path.replace(/^[ab]\//, '')}`
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
