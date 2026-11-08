import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import type { FileChange } from '../../types'
import { totals } from '../core/changes'
import { displayPath } from '../core/paths'
import { labels } from './labels'

/** Hex colors: VS Code does not draw Claude Code's theme names (`diffAdded`). */
const ADDED_COLOR = '#3fb950'
const REMOVED_COLOR = '#f85149'

/** The elements the card is drawn with, which every surface has. */
export type CardElements = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button' | 'Code'>

export type CardProps = {
  /** The message block the card sits on. */
  blockId: string
  changes: readonly FileChange[]
  /** The session's folder, which paths are shown relative to. */
  cwd: string
  /** The row whose diff is open: `<block id>:<path>`. */
  openRow: string | null
  onToggleRow: (key: string) => void
}

/** The block's own drawing (`row`) with the card under it. */
export function renderCard(elements: CardElements, row: RenderElement, props: CardProps): RenderElement {
  const { Box, Text, Button, Code } = elements
  const { blockId, changes, cwd, openRow, onToggleRow } = props
  const { added, removed } = totals(changes)

  return (
    <Box flexDirection="column">
      {row}
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginTop={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold>{labels.filesChanged(changes.length)}</Text>
          <Text color={ADDED_COLOR}>+{added}</Text>
          <Text color={REMOVED_COLOR}>−{removed}</Text>
        </Box>
        {changes.map(change => {
          const { name, folder } = displayPath(change.path, cwd)
          const key = `${blockId}:${change.path}`
          const isOpen = openRow === key

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Button
                  key={`card:${key}`}
                  label={`${isOpen ? '▾' : '▸'} ${name}`}
                  plain
                  onPress={() => onToggleRow(key)}
                />
                {change.isNew && <Text color={ADDED_COLOR}>{labels.newFile}</Text>}
                <Text color={ADDED_COLOR}>+{change.added}</Text>
                <Text color={REMOVED_COLOR}>−{change.removed}</Text>
                {folder !== '' && <Text dimColor>{folder}</Text>}
              </Box>
              {isOpen && change.patch !== '' && <Code source={change.patch} format="diff" path={change.path} />}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
