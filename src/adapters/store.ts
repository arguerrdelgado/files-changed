import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CardsByBlock, ReplyChanges } from '../../types'
import { mergeChanges, NO_CHANGES } from '../core/changes'

/**
 * Everything the mod keeps in the session's state. Claude Code's scanner
 * requires each value to be read and written in the file that declares it,
 * so this is the only file that touches state. The shapes are declared in
 * `types/index.d.ts`.
 */

/** The files changed so far in the reply being written. */
const turnChanges = atom({ plugin: 'files-changed', key: 'turnChanges' } as const, NO_CHANGES as ReplyChanges, {
  shape: 'v2',
})

/** Every card drawn so far in the session. */
const cards = atom({ plugin: 'files-changed', key: 'cards' } as const, {} as CardsByBlock, { shape: 'v2' })

/** The card row whose diff is open (`<block id>:<path>`), or null. */
const openRow = atom({ plugin: 'files-changed', key: 'openRow' } as const, null as string | null)

export async function readTurnChanges($: EngineInterface): Promise<ReplyChanges> {
  return read($, turnChanges)
}

export async function addTurnChanges($: EngineInterface, changes: ReplyChanges): Promise<void> {
  await update($, turnChanges, current => mergeChanges(current, changes))
}

export async function resetTurnChanges($: EngineInterface): Promise<void> {
  await update($, turnChanges, () => NO_CHANGES)
}

/** Read while drawing, so a block is drawn again when its card is saved. */
export async function readCards($: EngineInterface): Promise<CardsByBlock> {
  return read($, cards)
}

export async function saveCards($: EngineInterface, added: CardsByBlock): Promise<void> {
  if (Object.keys(added).length === 0) return
  await update($, cards, saved => ({ ...saved, ...added }))
}

export async function readOpenRow($: EngineInterface): Promise<string | null> {
  return read($, openRow)
}

/** Opens a row's diff, or closes it when it is the open one. */
export async function toggleOpenRow($: EngineInterface, key: string): Promise<void> {
  await update($, openRow, open => (open === key ? null : key))
}
