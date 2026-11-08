import type { BuiltinToolResults } from 'claude-code'

import type { FileChange } from '../../types'
import { changeFromHunks, type Hunk } from '../core/diff'

type EditOrWriteResult = BuiltinToolResults['Edit'] | BuiltinToolResults['Write']

/**
 * The change an Edit or Write call made, or undefined when the file on disk
 * did not change (a write held for review).
 */
export function changeFromEditOrWrite(result: EditOrWriteResult): FileChange | undefined {
  if (result.staged) return undefined

  const isNew = 'type' in result && result.type === 'create'

  return changeFromHunks(result.filePath, hunksOf(result, isNew), isNew)
}

/** The result's patch; a Write that creates a file may report none, and then every line is new. */
function hunksOf(result: EditOrWriteResult, isNew: boolean): readonly Hunk[] {
  const content = 'content' in result ? result.content : ''
  if (result.structuredPatch.length > 0 || !isNew || content === '') return result.structuredPatch

  const lines = content.replace(/\n$/, '').split('\n')

  return [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(line => `+${line}`) }]
}
