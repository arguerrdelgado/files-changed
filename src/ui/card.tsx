import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import type { FileChange, ReplyChanges } from '../../types'
import { fileCount, totals } from '../core/changes'
import { displayPath } from '../core/paths'
import type { Labels } from './labels'

/** Hex colors: VS Code does not draw Claude Code's theme names (`diffAdded`). */
const ADDED_COLOR = '#3fb950'
const REMOVED_COLOR = '#f85149'

/** The elements the card is drawn with, which every surface has. */
export type CardElements = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button' | 'Code'>

export type CardProps = {
  /** The message block the card sits on. */
  blockId: string
  changes: ReplyChanges
  /** The session's folder, which paths are shown relative to. */
  cwd: string
  /** The home folder, shown as `~` in paths outside the session's folder. */
  home: string | undefined
  labels: Labels
  /** The row whose diff is open: `<block id>:<path>`. */
  openRow: string | null
  onToggleRow: (key: string) => void
}

/**
 * The block's own drawing (`row`) with the card under it: a header with the
 * totals, the files in the session's folder, then the files outside it, then
 * how many more files were changed but not listed.
 */
export function renderCard(elements: CardElements, row: RenderElement, props: CardProps): RenderElement {
  const { Box, Text } = elements
  const { changes, labels } = props
  const { added, removed } = totals(changes.files)
  const shown = changes.files.map(change => ({ change, path: displayPath(change.path, props.cwd, props.home) }))
  const inside = shown.filter(file => !file.path.isOutside)
  const outside = shown.filter(file => file.path.isOutside)

  return (
    <Box flexDirection="column">
      {row}
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginTop={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold>{labels.filesChanged(fileCount(changes))}</Text>
          <Text color={ADDED_COLOR}>+{added}</Text>
          <Text color={REMOVED_COLOR}>−{removed}</Text>
        </Box>
        {inside.map(file => renderRow(elements, props, file.change, file.path.name, file.path.folder))}
        {outside.length > 0 && <Text dimColor>{labels.outsideProject(outside.length)}</Text>}
        {outside.map(file => renderRow(elements, props, file.change, file.path.name, file.path.folder))}
        {changes.unlisted > 0 && <Text dimColor>{labels.moreFiles(changes.unlisted)}</Text>}
      </Box>
    </Box>
  )
}

/** One file: `▸ name  +a −r  folder  status`, and its diff under it when open. */
function renderRow(elements: CardElements, props: CardProps, change: FileChange, name: string, folder: string): RenderElement {
  const { Box, Text, Button, Code } = elements
  const { labels } = props
  const key = `${props.blockId}:${change.path}`
  const isOpen = props.openRow === key

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button key={`card:${key}`} label={`${isOpen ? '▾' : '▸'} ${name}`} plain onPress={() => props.onToggleRow(key)} />
        {!change.isBinary && <Text color={ADDED_COLOR}>+{change.added}</Text>}
        {!change.isBinary && <Text color={REMOVED_COLOR}>−{change.removed}</Text>}
        {folder !== '' && <Text dimColor>{folder}</Text>}
        {change.status === 'added' && <Text color={ADDED_COLOR}>{labels.newFile}</Text>}
        {change.status === 'deleted' && <Text color={REMOVED_COLOR}>{labels.deletedFile}</Text>}
        {change.isBinary && <Text dimColor>{labels.binaryFile}</Text>}
      </Box>
      {isOpen && change.patch !== '' && <Code source={change.patch} format="diff" path={change.path} />}
    </Box>
  )
}
